import express from 'express';
import {randomBytes,createHash} from 'node:crypto';
import {getBoot,gameweek,standings,warm} from './fpl-data.js';

const app=express();
app.use(express.json({limit:'1mb'}));
app.use(express.static('public'));

const SUPA='https://gjkivetatcnskoszsdzf.supabase.co';
const SUPA_KEY='sb_publishable_x-etGDngNtgDlY4d4gJsXg_FrbplfY2';
const ROUTE_CACHE=new Map();
const AUTH_ATTEMPTS=new Map();

async function rpc(name,body={}){
 const r=await fetch(SUPA+'/rest/v1/rpc/'+name,{
  method:'POST',
  headers:{apikey:SUPA_KEY,Authorization:'Bearer '+SUPA_KEY,'Content-Type':'application/json'},
  body:JSON.stringify(body)
 });
 const raw=await r.text();
 let data=null;
 try{data=raw?JSON.parse(raw):null}catch{data=raw}
 if(!r.ok){
  const msg=(data&&typeof data==='object'&&(data.message||data.error||data.hint))||'Database request failed.';
  throw Error(String(msg));
 }
 return data;
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
function tokenHash(req){const t=readCookies(req).fx_session;return t?hashToken(t):null}
function setSession(res,token){res.setHeader('Set-Cookie',`fx_session=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=2592000`)}
function clearSession(res){res.setHeader('Set-Cookie','fx_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0')}
function authRate(req,res,next){
 const ip=String(req.headers['x-forwarded-for']||req.ip||'unknown').split(',')[0].trim(),now=Date.now(),windowMs=10*60*1000,max=12;
 const old=AUTH_ATTEMPTS.get(ip);
 if(!old||now-old.start>windowMs){AUTH_ATTEMPTS.set(ip,{start:now,count:1});return next()}
 old.count++;
 if(old.count>max)return res.status(429).json({error:'Too many login attempts. Try again in a few minutes.'});
 next();
}
async function currentUser(req){
 const h=tokenHash(req);
 if(!h)return null;
 try{const rows=await rpc('fx_me',{p_token_hash:h});return Array.isArray(rows)?rows[0]||null:null}catch{return null}
}
async function requireUser(req,res){
 const user=await currentUser(req);
 if(!user){res.status(401).json({error:'Not signed in.'});return null}
 return user;
}

app.get('/api/health',async(req,res)=>{
 try{
  await rpc('fx_public_profiles',{});
  res.json({ok:true,app:'FantasyX',accountDb:'connected',auth:'username-password'});
 }catch{
  res.status(503).json({ok:false,app:'FantasyX',accountDb:'error',auth:'username-password'});
 }
});

app.post('/api/auth/signup',authRate,async(req,res)=>{
 try{
  const username=String(req.body?.username||'').trim().toLowerCase(),password=String(req.body?.password||'');
  if(!/^[a-z0-9_]{3,24}$/.test(username))return res.status(400).json({error:'Username must be 3–24 characters using letters, numbers or _.'});
  if(password.length<8||password.length>72)return res.status(400).json({error:'Password must be 8–72 characters.'});
  const token=randomBytes(32).toString('hex'),h=hashToken(token);
  const rows=await rpc('fx_signup',{p_username:username,p_password:password,p_token_hash:h});
  const user=Array.isArray(rows)?rows[0]:null;
  if(!user)throw Error('Could not create account.');
  setSession(res,token);
  res.status(201).json({user});
 }catch(e){
  const msg=String(e.message||'Could not create account.');
  res.status(/already taken/i.test(msg)?409:400).json({error:msg});
 }
});

app.post('/api/auth/login',authRate,async(req,res)=>{
 try{
  const username=String(req.body?.username||'').trim().toLowerCase(),password=String(req.body?.password||'');
  const token=randomBytes(32).toString('hex'),h=hashToken(token);
  const rows=await rpc('fx_login',{p_username:username,p_password:password,p_token_hash:h});
  const user=Array.isArray(rows)?rows[0]:null;
  if(!user)throw Error('Username or password is incorrect.');
  setSession(res,token);
  res.json({user});
 }catch(e){
  const msg=String(e.message||'Could not log in.');
  res.status(/incorrect/i.test(msg)?401:400).json({error:msg});
 }
});

app.post('/api/auth/logout',async(req,res)=>{
 const h=tokenHash(req);
 if(h)try{await rpc('fx_logout',{p_token_hash:h})}catch{}
 clearSession(res);
 res.json({ok:true});
});

app.get('/api/auth/me',async(req,res)=>{res.json({user:await currentUser(req)})});

app.get('/api/account/profile',async(req,res)=>{
 try{
  const u=await requireUser(req,res);if(!u)return;
  const rows=await rpc('fx_get_profile',{p_token_hash:tokenHash(req)});
  res.json({profile:Array.isArray(rows)?rows[0]||null:null});
 }catch(e){res.status(500).json({error:'Could not load profile.'})}
});
app.put('/api/account/profile',async(req,res)=>{
 try{
  const u=await requireUser(req,res);if(!u)return;
  const rows=await rpc('fx_save_profile',{
   p_token_hash:tokenHash(req),
   p_real_name:String(req.body?.real_name||''),
   p_team_name:String(req.body?.team_name||'My XI')
  });
  ROUTE_CACHE.delete('baller-table');
  res.json({profile:Array.isArray(rows)?rows[0]||null:null});
 }catch(e){res.status(500).json({error:String(e.message||'Could not save profile.')})}
});

app.get('/api/account/squad',async(req,res)=>{
 try{
  const u=await requireUser(req,res);if(!u)return;
  const rows=await rpc('fx_get_squad',{p_token_hash:tokenHash(req)});
  res.json({squad:Array.isArray(rows)?rows:[]});
 }catch(e){res.status(500).json({error:'Could not load squad.'})}
});
app.put('/api/account/squad',async(req,res)=>{
 try{
  const u=await requireUser(req,res);if(!u)return;
  const squad=Array.isArray(req.body?.squad)?req.body.squad.slice(0,15):[];
  await rpc('fx_save_squad',{p_token_hash:tokenHash(req),p_squad:squad});
  res.json({ok:true});
 }catch(e){res.status(500).json({error:String(e.message||'Could not save squad.')})}
});

app.post('/api/account/join-league',async(req,res)=>{
 try{
  const u=await requireUser(req,res);if(!u)return;
  const rows=await rpc('fx_join_league',{p_token_hash:tokenHash(req),p_code:String(req.body?.code||'')});
  const league=Array.isArray(rows)?rows[0]:null;
  if(!league)return res.status(404).json({error:'League code not found.'});
  res.json({league});
 }catch(e){
  const msg=String(e.message||'Could not join league.');
  res.status(/not found/i.test(msg)?404:500).json({error:msg});
 }
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
  const [profiles,squads]=await Promise.all([rpc('fx_public_profiles',{}),rpc('fx_public_squads',{})]);
  const teams=(profiles||[]).map(p=>({...p,squad:(squads||[]).filter(s=>s.user_id===p.user_id).map(s=>({...s,points:0,scoring_points:0,multiplier:s.is_bench?0:s.is_captain?2:1}))}));
  res.json({teams,top_players:[]});
 }catch{res.status(500).json({teams:[],top_players:[],error:'Community unavailable'})}
});

app.get('/api/baller-table',async(req,res)=>{
 try{
  const data=await cachedRoute('baller-table',60000,async()=>{
   const rows=await rpc('fx_public_profiles',{});
   return{name:'UEFA Baller League',code:'BALLER',table:(rows||[]).map((x,i)=>({...x,rank:i+1,display_points:x.total_points||0}))};
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
app.listen(port,()=>{console.log(`FantasyX listening on ${port}`);warm()});
