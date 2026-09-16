import express from 'express';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import {randomBytes,createHash} from 'node:crypto';
import {getBoot,gameweek,standings,warm} from './fpl-data.js';
const {Pool}=pg;

const app=express();
app.use(express.json({limit:'1mb'}));
app.use(express.static('public'));

const pool=process.env.DATABASE_URL?new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}}):null;
const ROUTE_CACHE=new Map();

async function initDb(){
 if(!pool)return;
 const sql=[
  `CREATE TABLE IF NOT EXISTS fantasy_users(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS fantasy_sessions(
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS fantasy_sessions_user_idx ON fantasy_sessions(user_id)`,
  `CREATE INDEX IF NOT EXISTS fantasy_sessions_exp_idx ON fantasy_sessions(expires_at)`,
  `CREATE TABLE IF NOT EXISTS fantasy_profiles(
    user_id TEXT PRIMARY KEY,
    team_name TEXT NOT NULL DEFAULT 'My XI',
    budget NUMERIC(6,1) NOT NULL DEFAULT 100.0,
    total_points INTEGER NOT NULL DEFAULT 0,
    real_name TEXT NOT NULL DEFAULT '',
    wildcard_used BOOLEAN NOT NULL DEFAULT false,
    free_hit_used BOOLEAN NOT NULL DEFAULT false,
    bench_boost_used BOOLEAN NOT NULL DEFAULT false,
    triple_captain_used BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS fantasy_squads(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    player_id INTEGER,
    player_name TEXT NOT NULL,
    club TEXT NOT NULL,
    position TEXT NOT NULL,
    price NUMERIC(5,1) NOT NULL,
    is_captain BOOLEAN NOT NULL DEFAULT false,
    is_vice BOOLEAN NOT NULL DEFAULT false,
    is_bench BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE fantasy_squads ADD COLUMN IF NOT EXISTS player_id INTEGER`,
  `CREATE INDEX IF NOT EXISTS fantasy_squads_user_idx ON fantasy_squads(user_id)`,
  `CREATE TABLE IF NOT EXISTS fantasy_leagues(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    owner_user_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS fantasy_league_members(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    league_id UUID NOT NULL,
    user_id TEXT NOT NULL,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(league_id,user_id)
  )`
 ];
 for(const q of sql)await pool.query(q);
 await pool.query(`INSERT INTO fantasy_leagues(name,code,owner_user_id) VALUES('UEFA Baller League','BALLER','system') ON CONFLICT(code) DO NOTHING`);
}

async function cachedRoute(key,ttl,fn){
 const now=Date.now(),old=ROUTE_CACHE.get(key);
 if(old&&now-old.at<ttl)return old.data;
 const data=await fn();
 ROUTE_CACHE.set(key,{data,at:now});
 return data;
}

function readCookies(req){
 const out={};
 for(const part of String(req.headers.cookie||'').split(';')){
  const i=part.indexOf('=');
  if(i<0)continue;
  const k=part.slice(0,i).trim(),v=part.slice(i+1).trim();
  if(k)out[k]=decodeURIComponent(v);
 }
 return out;
}
const hashToken=t=>createHash('sha256').update(t).digest('hex');

async function currentUser(req){
 if(!pool)return null;
 const token=readCookies(req).fx_session;
 if(!token)return null;
 const h=hashToken(token);
 const {rows}=await pool.query(
  `SELECT u.id,u.username FROM fantasy_sessions s
   JOIN fantasy_users u ON u.id::text=s.user_id
   WHERE s.token_hash=$1 AND s.expires_at>now() LIMIT 1`,[h]
 );
 return rows[0]||null;
}
async function requireUser(req,res){
 const user=await currentUser(req);
 if(!user){res.status(401).json({error:'Not signed in.'});return null}
 return user;
}
async function issueSession(res,userId){
 const token=randomBytes(32).toString('hex'),h=hashToken(token);
 await pool.query('DELETE FROM fantasy_sessions WHERE expires_at<=now()');
 await pool.query(`INSERT INTO fantasy_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '30 days')`,[h,String(userId)]);
 res.setHeader('Set-Cookie',`fx_session=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=2592000`);
}
async function destroySession(req,res){
 const token=readCookies(req).fx_session;
 if(token&&pool)await pool.query('DELETE FROM fantasy_sessions WHERE token_hash=$1',[hashToken(token)]);
 res.setHeader('Set-Cookie','fx_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');
}

app.get('/api/health',async(req,res)=>{
 let renderDb='not-connected';
 try{if(pool){await pool.query('SELECT 1');renderDb='connected'}}catch{renderDb='error'}
 res.json({ok:true,app:'FantasyX',renderDb,auth:'username-password'});
});

app.post('/api/auth/signup',async(req,res)=>{
 try{
  if(!pool)return res.status(503).json({error:'Account database unavailable.'});
  const username=String(req.body?.username||'').trim().toLowerCase(),password=String(req.body?.password||'');
  if(!/^[a-z0-9_]{3,24}$/.test(username))return res.status(400).json({error:'Username must be 3–24 characters using letters, numbers or _.'});
  if(password.length<8||password.length>72)return res.status(400).json({error:'Password must be 8–72 characters.'});
  const exists=await pool.query('SELECT 1 FROM fantasy_users WHERE username=$1',[username]);
  if(exists.rowCount)return res.status(409).json({error:'That username is already taken.'});
  const passwordHash=await bcrypt.hash(password,12);
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   const {rows}=await client.query('INSERT INTO fantasy_users(username,password_hash) VALUES($1,$2) RETURNING id,username',[username,passwordHash]);
   const user=rows[0];
   await client.query('INSERT INTO fantasy_profiles(user_id,team_name,real_name) VALUES($1,$2,$3) ON CONFLICT(user_id) DO NOTHING',[String(user.id),'My XI','']);
   await client.query('COMMIT');
   await issueSession(res,user.id);
   res.status(201).json({user:{id:user.id,username:user.username}});
  }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
 }catch(e){console.error('signup',e);res.status(500).json({error:'Could not create account.'})}
});

app.post('/api/auth/login',async(req,res)=>{
 try{
  if(!pool)return res.status(503).json({error:'Account database unavailable.'});
  const username=String(req.body?.username||'').trim().toLowerCase(),password=String(req.body?.password||'');
  const {rows}=await pool.query('SELECT id,username,password_hash FROM fantasy_users WHERE username=$1 LIMIT 1',[username]);
  const user=rows[0];
  const ok=user?await bcrypt.compare(password,user.password_hash):false;
  if(!ok){await new Promise(r=>setTimeout(r,350));return res.status(401).json({error:'Username or password is incorrect.'})}
  await issueSession(res,user.id);
  res.json({user:{id:user.id,username:user.username}});
 }catch(e){console.error('login',e);res.status(500).json({error:'Could not log in.'})}
});

app.post('/api/auth/logout',async(req,res)=>{try{await destroySession(req,res)}catch{}res.json({ok:true})});
app.get('/api/auth/me',async(req,res)=>{try{const user=await currentUser(req);res.json({user})}catch{res.json({user:null})}});

app.get('/api/account/profile',async(req,res)=>{
 try{const u=await requireUser(req,res);if(!u)return;const {rows}=await pool.query('SELECT * FROM fantasy_profiles WHERE user_id=$1',[String(u.id)]);res.json({profile:rows[0]||null})}
 catch{res.status(500).json({error:'Could not load profile.'})}
});
app.put('/api/account/profile',async(req,res)=>{
 try{
  const u=await requireUser(req,res);if(!u)return;
  const realName=String(req.body?.real_name||'').trim().slice(0,60),teamName=String(req.body?.team_name||'My XI').trim().slice(0,60)||'My XI';
  const {rows}=await pool.query(`INSERT INTO fantasy_profiles(user_id,real_name,team_name) VALUES($1,$2,$3)
   ON CONFLICT(user_id) DO UPDATE SET real_name=EXCLUDED.real_name,team_name=EXCLUDED.team_name RETURNING *`,[String(u.id),realName,teamName]);
  ROUTE_CACHE.delete('baller-table');
  res.json({profile:rows[0]});
 }catch{res.status(500).json({error:'Could not save profile.'})}
});

app.get('/api/account/squad',async(req,res)=>{
 try{const u=await requireUser(req,res);if(!u)return;const {rows}=await pool.query('SELECT * FROM fantasy_squads WHERE user_id=$1 ORDER BY created_at,id',[String(u.id)]);res.json({squad:rows})}
 catch{res.status(500).json({error:'Could not load squad.'})}
});
app.put('/api/account/squad',async(req,res)=>{
 const client=await pool?.connect();
 if(!client)return res.status(503).json({error:'Account database unavailable.'});
 try{
  const u=await requireUser(req,res);if(!u){client.release();return}
  const squad=Array.isArray(req.body?.squad)?req.body.squad.slice(0,15):[];
  await client.query('BEGIN');
  await client.query('DELETE FROM fantasy_squads WHERE user_id=$1',[String(u.id)]);
  for(const p of squad){
   await client.query(`INSERT INTO fantasy_squads(user_id,player_id,player_name,club,position,price,is_captain,is_vice,is_bench)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[
    String(u.id),Number.isFinite(Number(p.id))?Number(p.id):null,String(p.name||'').slice(0,80),String(p.club||'').slice(0,12),
    String(p.pos||'').slice(0,6),Number(p.price)||0,!!p.cap,!!p.vice,!!p.bench
   ]);
  }
  await client.query('COMMIT');res.json({ok:true});
 }catch(e){try{await client.query('ROLLBACK')}catch{}console.error('squad',e);res.status(500).json({error:'Could not save squad.'})}
 finally{try{client.release()}catch{}}
});

app.post('/api/account/join-league',async(req,res)=>{
 try{
  const u=await requireUser(req,res);if(!u)return;
  const code=String(req.body?.code||'').trim().toUpperCase();
  const {rows}=await pool.query('SELECT id,name FROM fantasy_leagues WHERE code=$1 LIMIT 1',[code]);
  const league=rows[0];if(!league)return res.status(404).json({error:'League code not found.'});
  await pool.query('INSERT INTO fantasy_league_members(league_id,user_id) VALUES($1,$2) ON CONFLICT(league_id,user_id) DO NOTHING',[league.id,String(u.id)]);
  res.json({league});
 }catch{res.status(500).json({error:'Could not join league.'})}
});

app.get('/api/players',async(req,res)=>{
 try{
  const d=await getBoot(),teams=d.teams.map(t=>({id:t.id,name:t.name,short:t.short_name,code:t.code,badge:`https://resources.premierleague.com/premierleague/badges/70/t${t.code}.png`})),tm=new Map(teams.map(t=>[t.id,t])),types={1:'GK',2:'DEF',3:'MID',4:'FWD'};
  const players=d.elements.filter(p=>p.status!=='u'&&tm.has(p.team)).map(p=>{const t=tm.get(p.team),photoId=String(p.photo||'').replace(/\.jpg$/i,'');return{id:p.id,name:p.web_name,first:p.first_name,second:p.second_name,team:p.team,club:t.short,clubName:t.name,clubBadge:t.badge,pos:types[p.element_type],price:p.now_cost/10,points:0,totalPoints:p.total_points||0,photo:`https://resources.premierleague.com/premierleague/photos/players/250x250/p${photoId}.png`}});
  res.set('Cache-Control','public,max-age=300');res.json({teams,players});
 }catch{res.status(502).json({error:'Could not refresh player database.'})}
});

app.get('/api/fixtures',async(req,res)=>{
 try{const gw=Math.max(1,Math.min(38,Number(req.query.gw)||1)),fixtures=await gameweek(gw);res.set('Cache-Control','public,max-age=120');res.json({gameweek:gw,gameweeks:Array.from({length:38},(_,i)=>i+1),source:'Randomly generated FantasyX fixtures',fixtures})}
 catch{res.status(502).json({gameweek:1,gameweeks:Array.from({length:38},(_,i)=>i+1),fixtures:[]})}
});
app.get('/api/football-data',async(req,res)=>{
 try{
  const gw=Math.max(1,Math.min(38,Number(req.query.gw)||1)),data=await cachedRoute('football-'+gw,120000,async()=>{const [fixtures,table]=await Promise.all([gameweek(gw),standings()]);return{gameweek:gw,season:'2026/27',fixtures,table,tableSource:'FantasyX completed random fixture results'}});
  res.set('Cache-Control','public,max-age=120,stale-while-revalidate=300');res.json(data);
 }catch{res.status(502).json({gameweek:1,fixtures:[],table:[]})}
});

app.get('/api/community',async(req,res)=>{
 try{
  if(!pool)return res.json({teams:[],top_players:[]});
  const [profiles,squads]=await Promise.all([
   pool.query('SELECT user_id,real_name,team_name,total_points FROM fantasy_profiles ORDER BY total_points DESC,team_name ASC'),
   pool.query('SELECT user_id,player_name,club,position,price,is_captain,is_vice,is_bench FROM fantasy_squads')
  ]);
  const teams=profiles.rows.map(p=>({...p,squad:squads.rows.filter(s=>s.user_id===p.user_id).map(s=>({...s,points:0,scoring_points:0,multiplier:s.is_bench?0:s.is_captain?2:1}))}));
  res.json({teams,top_players:[]});
 }catch{res.status(500).json({teams:[],top_players:[],error:'Community unavailable'})}
});

app.get('/api/baller-table',async(req,res)=>{
 try{
  const data=await cachedRoute('baller-table',60000,async()=>{
   if(!pool)return{name:'UEFA Baller League',code:'BALLER',table:[]};
   const {rows}=await pool.query('SELECT real_name,team_name,total_points FROM fantasy_profiles ORDER BY total_points DESC,team_name ASC');
   return{name:'UEFA Baller League',code:'BALLER',table:rows.map((x,i)=>({...x,rank:i+1,display_points:x.total_points||0}))};
  });
  res.set('Cache-Control','public,max-age=60,stale-while-revalidate=120');res.json(data);
 }catch{res.json({name:'UEFA Baller League',code:'BALLER',table:[]})}
});

app.get('/api/club-table',async(req,res)=>{
 try{const table=await standings();res.set('Cache-Control','public,max-age=120');res.json({season:'2026/27',source:'FantasyX completed random fixture results',table})}
 catch{res.status(502).json({error:'Club standings unavailable',table:[]})}
});

app.use((req,res)=>res.sendFile(process.cwd()+'/public/index.html'));

const port=process.env.PORT||3000;
initDb().then(()=>app.listen(port,()=>{console.log(`FantasyX listening on ${port}`);warm()})).catch(e=>{console.error(e);app.listen(port,()=>warm())});
