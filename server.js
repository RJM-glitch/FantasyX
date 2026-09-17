import express from 'express';
import {randomBytes,createHash} from 'node:crypto';
import {getBoot,gameweek,standings,warm} from './fpl-data.js';

const app=express();
app.use(express.json({limit:'1mb'}));
app.use(express.static('public'));

const SUPA='https://gjkivetatcnskoszsdzf.supabase.co';
const SUPA_KEY='sb_publishable_x-etGDngNtgDlY4d4gJsXg_FrbplfY2';
const AUTH_ATTEMPTS=new Map();
const TRANSFER_IN=new Map(),TRANSFER_OUT=new Map(),PREV_SQUADS=new Map();

async function rpc(name,body={}){
  const r=await fetch(SUPA+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:SUPA_KEY,Authorization:'Bearer '+SUPA_KEY,'Content-Type':'application/json'},body:JSON.stringify(body)}),raw=await r.text();
  let data=null;try{data=raw?JSON.parse(raw):null}catch{data=raw}
  if(!r.ok)throw Error((data&&data.message)||'Database request failed.');
  return data;
}
function readCookies(req){const o={};for(const p of String(req.headers.cookie||'').split(';')){const i=p.indexOf('=');if(i>0)o[p.slice(0,i).trim()]=decodeURIComponent(p.slice(i+1).trim())}return o}
const hashToken=t=>createHash('sha256').update(t).digest('hex');
function tokenHash(req){const t=readCookies(req).fx_session;return t?hashToken(t):null}
function setSession(res,t){res.setHeader('Set-Cookie',`fx_session=${encodeURIComponent(t)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=2592000`)}
function clearSession(res){res.setHeader('Set-Cookie','fx_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0')}
function authRate(req,res,next){const ip=String(req.headers['x-forwarded-for']||req.ip||'x').split(',')[0],n=Date.now(),o=AUTH_ATTEMPTS.get(ip);if(!o||n-o.start>600000){AUTH_ATTEMPTS.set(ip,{start:n,count:1});return next()}if(++o.count>12)return res.status(429).json({error:'Too many login attempts.'});next()}
async function currentUser(req){const h=tokenHash(req);if(!h)return null;try{return(await rpc('fx_me',{p_token_hash:h}))?.[0]||null}catch{return null}}
async function requireUser(req,res){const u=await currentUser(req);if(!u)res.status(401).json({error:'Not signed in.'});return u}

function h32(...xs){let h=2166136261;for(const x of xs)for(const c of String(x)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
function pointsForPlayer(p,f){if(!f||f.status==='Upcoming')return 0;const min=f.status==='FT'?90:Number(f.minute||0),seed=h32('FXPTS',p.id,f.id),pos=p.element_type;let pts=min>=1?1:0;if(min>=60)pts++;if(min>=25&&seed%11===0)pts+=pos===4?4:pos===3?5:6;if(min>=40&&seed%13===0)pts+=3;if(min>=60&&(pos===1||pos===2)&&((p.team===f.home.id?Number(f.awayScore||0):Number(f.homeScore||0))===0))pts+=4;if(min>=70&&seed%7===0)pts++;if(min>=85&&seed%17===0)pts+=2;return pts}
async function fantasyPoints(){const boot=await getBoot(),out=new Map((boot.elements||[]).map(p=>[p.id,0]));for(let gw=1;gw<=38;gw++){const fx=await gameweek(gw);if(fx.every(f=>f.status==='Upcoming'))break;const byTeam=new Map();for(const f of fx){byTeam.set(f.home.id,f);byTeam.set(f.away.id,f)}for(const p of boot.elements||[]){const f=byTeam.get(p.team);if(f&&f.status!=='Upcoming')out.set(p.id,(out.get(p.id)||0)+pointsForPlayer(p,f))}}return out}
function pick(pool,...seed){return pool.length?pool[h32(...seed)%pool.length]:null}

async function fantasySeasonStats(){
  const boot=await getBoot(),teamInfo=new Map((boot.teams||[]).map(t=>[t.id,t])),pools=new Map(),playerRows=new Map();
  for(const p of boot.elements||[]){if(!pools.has(p.team))pools.set(p.team,[]);pools.get(p.team).push(p);const t=teamInfo.get(p.team),photoId=String(p.photo||'').replace(/\.jpg$/i,'');playerRows.set(p.id,{id:p.id,name:p.web_name,club:t?.name||'',clubShort:t?.short_name||'',clubBadge:t?`https://resources.premierleague.com/premierleague/badges/70/t${t.code}.png`:'',photo:`https://resources.premierleague.com/premierleague/photos/players/250x250/p${photoId}.png`,goals:0,assists:0,yellowCards:0,redCards:0})}
  const clubRows=new Map((boot.teams||[]).map(t=>[t.id,{team:t.name,short:t.short_name,badge:`https://resources.premierleague.com/premierleague/badges/70/t${t.code}.png`,played:0,wins:0,draws:0,losses:0,goals:0,assists:0,yellowCards:0,redCards:0}]));
  for(let gw=1;gw<=38;gw++){
    const fixtures=await gameweek(gw);if(fixtures.every(f=>f.status==='Upcoming'))break;
    for(const f of fixtures){if(f.status==='Upcoming')continue;for(const side of [0,1]){const team=side===0?f.home:f.away,score=side===0?f.homeScore:f.awayScore,pool=pools.get(team.id)||[],club=clubRows.get(team.id);if(!club)continue;club.played++;
      for(let g=0;g<score;g++){const scorer=pick(pool,'FXGOAL',f.id,team.id,g);if(scorer){playerRows.get(scorer.id).goals++;club.goals++}if(pool.length>1&&h32('FXASSISTED',f.id,team.id,g)%5!==0){let assist=pick(pool,'FXASSIST',f.id,team.id,g);if(assist&&scorer&&assist.id===scorer.id)assist=pool[(pool.indexOf(assist)+1)%pool.length];if(assist){playerRows.get(assist.id).assists++;club.assists++}}}
      const ys=Number(f.stats?.yellowCards?.[side]||0),rs=Number(f.stats?.redCards?.[side]||0);for(let c=0;c<ys;c++){const pl=pick(pool,'FXYELLOW',f.id,team.id,c);if(pl){playerRows.get(pl.id).yellowCards++;club.yellowCards++}}for(let c=0;c<rs;c++){const pl=pick(pool,'FXRED',f.id,team.id,c);if(pl){playerRows.get(pl.id).redCards++;club.redCards++}}
    }}
  }
  const pts=await fantasyPoints();for(const [id,row] of playerRows)row.points=pts.get(id)||0;
  return{clubs:[...clubRows.values()].sort((a,b)=>a.team.localeCompare(b.team)),players:[...playerRows.values()].filter(p=>p.goals||p.assists||p.yellowCards||p.redCards||p.points).sort((a,b)=>a.club.localeCompare(b.club)||a.name.localeCompare(b.name))};
}

function trackTransferActivity(rows){
  const grouped=new Map();for(const r of rows||[]){if(!grouped.has(r.user_id))grouped.set(r.user_id,new Set());grouped.get(r.user_id).add(Number(r.player_id))}
  for(const [uid,set] of grouped){const prev=PREV_SQUADS.get(uid);if(prev){for(const id of set)if(!prev.has(id))TRANSFER_IN.set(id,(TRANSFER_IN.get(id)||0)+1);for(const id of prev)if(!set.has(id))TRANSFER_OUT.set(id,(TRANSFER_OUT.get(id)||0)+1)}PREV_SQUADS.set(uid,set)}
  for(const uid of [...PREV_SQUADS.keys()])if(!grouped.has(uid))PREV_SQUADS.delete(uid);
}

function transferWindowState(now=Date.now()){
  const firstKickoff=Date.parse('2026-09-18T08:30:00+02:00'),baseMidnight=Date.parse('2026-09-18T00:00:00+02:00'),day=86400000;
  if(now<firstKickoff)return{open:true,targetGw:2,penalty:false,message:'Transfers are open until Gameweek 2 kickoff.'};
  const dayIndex=Math.max(0,Math.floor((now-baseMidnight)/day)),todayGw=Math.min(38,2+dayIndex),start=baseMidnight+dayIndex*day+8.5*3600000,end=baseMidnight+dayIndex*day+14.5*3600000;
  if(now>=start&&now<end)return{open:false,targetGw:todayGw,penalty:todayGw>=3,message:`Transfers are locked while Gameweek ${todayGw} is being played.`};
  const targetGw=now<start?todayGw:Math.min(38,todayGw+1);
  return{open:true,targetGw,penalty:targetGw>=3,message:targetGw>=3?`Transfers are open for Gameweek ${targetGw}. Each player brought in costs -4 points.`:`Transfers are open for Gameweek ${targetGw}.`};
}

async function pointMapForGameweek(gw,boot){
  const fixtures=await gameweek(gw),byTeam=new Map(),out=new Map();
  for(const f of fixtures){byTeam.set(f.home.id,f);byTeam.set(f.away.id,f)}
  for(const p of boot.elements||[]){const f=byTeam.get(p.team);out.set(Number(p.id),f?pointsForPlayer(p,f):0)}
  return{fixtures,points:out,complete:fixtures.length>0&&fixtures.every(f=>f.status==='FT')};
}
function scoreStoredSquad(squad,pointMap){let total=0;for(const x of Array.isArray(squad)?squad:[]){const id=Number(x.player_id??x.id),base=Number(pointMap.get(id)||0),bench=Boolean(x.is_bench??x.bench),cap=Boolean(x.is_captain??x.cap);total+=bench?0:base*(cap?2:1)}return total}
function exactSnapshot(snaps,userId,gw){return(snaps||[]).find(s=>String(s.user_id)===String(userId)&&Number(s.gameweek)===Number(gw))||null}

async function managerScoreData(){
  const [profiles,squads,snaps,baselines,penalties,boot]=await Promise.all([
    rpc('fx_public_profiles',{}),
    rpc('fx_public_squads',{}),
    rpc('fx_public_gameweek_squads',{}),
    rpc('fx_public_gw1_baseline_squads',{}),
    rpc('fx_public_transfer_penalties',{}),
    getBoot()
  ]);

  const historical=new Map((profiles||[]).map(p=>[String(p.user_id),0]));
  const gw1=await pointMapForGameweek(1,boot);
  for(const p of profiles||[]){
    const uid=String(p.user_id),base=(baselines||[]).find(b=>String(b.user_id)===uid);
    const gw1Points=base?scoreStoredSquad(base.squad,gw1.points):Number(p.total_points||0);
    historical.set(uid,gw1Points);
  }

  let currentGw=2,currentPoints=new Map();
  for(let gw=2;gw<=38;gw++){
    const g=await pointMapForGameweek(gw,boot);
    if(!g.complete){currentGw=gw;currentPoints=g.points;break}
    for(const p of profiles||[]){
      const snap=exactSnapshot(snaps,p.user_id,gw);
      if(snap)historical.set(String(p.user_id),(historical.get(String(p.user_id))||0)+scoreStoredSquad(snap.squad,g.points));
    }
    if(gw===38){currentGw=38;currentPoints=new Map()}
  }

  const penaltyByUser=new Map();
  for(const x of penalties||[])penaltyByUser.set(String(x.user_id),(penaltyByUser.get(String(x.user_id))||0)+Number(x.penalty_points||0));
  return{profiles:profiles||[],squads:squads||[],historical,currentGw,currentPoints,penaltyByUser};
}

async function liveManagerRows(){
  const d=await managerScoreData();
  return d.profiles.filter(p=>String(p.real_name||'').trim()||String(p.team_name||'').trim().toLowerCase()!=='my xi').map(p=>{
    const uid=String(p.user_id),squad=d.squads.filter(s=>String(s.user_id)===uid).map(s=>{const base=Number(d.currentPoints.get(Number(s.player_id))||0),m=s.is_bench?0:s.is_captain?2:1;return{...s,points:base,scoring_points:base*m,multiplier:m}});
    const historicalPoints=Number(d.historical.get(uid)||0),gameweekPoints=squad.reduce((n,s)=>n+s.scoring_points,0),transferPenalty=Number(d.penaltyByUser.get(uid)||0),live_points=Math.max(0,historicalPoints+gameweekPoints-transferPenalty);
    return{...p,squad,historical_points:historicalPoints,gameweek_points:gameweekPoints,transfer_penalty:transferPenalty,current_gameweek:d.currentGw,live_points,total_points:live_points};
  }).sort((a,b)=>b.live_points-a.live_points||String(a.team_name||'').localeCompare(String(b.team_name||''))).map((x,i)=>({...x,rank:i+1}));
}

app.get('/api/health',async(req,res)=>{try{await rpc('fx_public_profiles',{});res.json({ok:true})}catch{res.status(503).json({ok:false})}});
app.post('/api/auth/signup',authRate,async(req,res)=>{try{const username=String(req.body?.username||'').trim().toLowerCase(),password=String(req.body?.password||'');if(!/^[a-z0-9_]{3,24}$/.test(username)||password.length<8)return res.status(400).json({error:'Invalid username or password.'});const t=randomBytes(32).toString('hex'),u=(await rpc('fx_signup',{p_username:username,p_password:password,p_token_hash:hashToken(t)}))?.[0];setSession(res,t);res.status(201).json({user:u})}catch(e){res.status(400).json({error:String(e.message)})}});
app.post('/api/auth/login',authRate,async(req,res)=>{try{const t=randomBytes(32).toString('hex'),u=(await rpc('fx_login',{p_username:String(req.body?.username||'').trim().toLowerCase(),p_password:String(req.body?.password||''),p_token_hash:hashToken(t)}))?.[0];if(!u)throw Error('Username or password is incorrect.');setSession(res,t);res.json({user:u})}catch(e){res.status(401).json({error:String(e.message)})}});
app.post('/api/auth/logout',async(req,res)=>{const h=tokenHash(req);if(h)try{await rpc('fx_logout',{p_token_hash:h})}catch{}clearSession(res);res.json({ok:true})});
app.get('/api/auth/me',async(req,res)=>res.json({user:await currentUser(req)}));

app.get('/api/account/profile',async(req,res)=>{try{if(!await requireUser(req,res))return;res.json({profile:(await rpc('fx_get_profile',{p_token_hash:tokenHash(req)}))?.[0]||null})}catch(e){res.status(500).json({error:String(e.message)})}});
app.put('/api/account/profile',async(req,res)=>{try{if(!await requireUser(req,res))return;res.json({profile:(await rpc('fx_save_profile',{p_token_hash:tokenHash(req),p_real_name:String(req.body?.real_name||''),p_team_name:String(req.body?.team_name||'My XI'),p_favorite_team:String(req.body?.favorite_team||''),p_favorite_player:String(req.body?.favorite_player||'')}))?.[0]||null})}catch(e){res.status(500).json({error:String(e.message)})}});
app.get('/api/account/squad',async(req,res)=>{try{if(!await requireUser(req,res))return;res.json({squad:await rpc('fx_get_squad',{p_token_hash:tokenHash(req)})||[]})}catch(e){res.status(500).json({error:String(e.message)})}});
app.put('/api/account/squad',async(req,res)=>{
  try{
    if(!await requireUser(req,res))return;
    const state=transferWindowState();if(!state.open)return res.status(423).json({error:state.message});
    const h=tokenHash(req),next=(req.body?.squad||[]).slice(0,15),old=await rpc('fx_get_squad',{p_token_hash:h})||[],oldIds=new Set(old.map(x=>Number(x.player_id))),nextIds=new Set(next.map(x=>Number(x.id))),incoming=[...nextIds].filter(id=>!oldIds.has(id)).length;
    if(state.penalty&&incoming>0)await rpc('fx_record_transfer_penalty',{p_token_hash:h,p_gameweek:state.targetGw,p_transfers:incoming});
    await rpc('fx_save_squad',{p_token_hash:h,p_squad:next});
    try{trackTransferActivity(await rpc('fx_public_squads',{}))}catch{}
    res.json({ok:true,gameweek:state.targetGw,transfers_in:incoming,penalty:state.penalty?incoming*4:0});
  }catch(e){res.status(500).json({error:String(e.message)})}
});
app.get('/api/account/points',async(req,res)=>{try{const u=await requireUser(req,res);if(!u)return;const uid=String(u.user_id||u.id||''),row=(await liveManagerRows()).find(x=>String(x.user_id)===uid);res.set('Cache-Control','no-store');res.json(row?{points:row.live_points,historical_points:row.historical_points,gameweek_points:row.gameweek_points,transfer_penalty:row.transfer_penalty,current_gameweek:row.current_gameweek}:{points:0,historical_points:0,gameweek_points:0,transfer_penalty:0,current_gameweek:2})}catch(e){res.status(500).json({error:String(e.message)})}});
app.get('/api/transfer-window',(req,res)=>{res.set('Cache-Control','no-store');res.json(transferWindowState())});
app.post('/api/account/join-league',async(req,res)=>{try{if(!await requireUser(req,res))return;res.json({league:(await rpc('fx_join_league',{p_token_hash:tokenHash(req),p_code:String(req.body?.code||'')}))?.[0]||null})}catch(e){res.status(500).json({error:String(e.message)})}});

app.get('/api/players',async(req,res)=>{try{const [d,pts]=await Promise.all([getBoot(),fantasyPoints()]),ts=d.teams.map(t=>({id:t.id,name:t.name,short:t.short_name,code:t.code,badge:`https://resources.premierleague.com/premierleague/badges/70/t${t.code}.png`})),tm=new Map(ts.map(t=>[t.id,t])),types={1:'GK',2:'DEF',3:'MID',4:'FWD'},players=d.elements.filter(p=>tm.has(p.team)).map(p=>{const t=tm.get(p.team),photoId=String(p.photo||'').replace(/\.jpg$/i,''),raw=p.chance_of_playing_next_round,chance=raw===null||raw===undefined?(p.status==='a'?100:0):Number(raw);return{id:p.id,name:p.web_name,club:t.short,clubName:t.name,clubBadge:t.badge,pos:types[p.element_type],price:p.now_cost/10,totalPoints:pts.get(p.id)||0,seasonPoints:pts.get(p.id)||0,photo:`https://resources.premierleague.com/premierleague/photos/players/250x250/p${photoId}.png`,availabilityChance:chance,availabilityStatus:String(p.status||'a'),injuryNews:String(p.news||''),officialTransfersIn:Number(p.transfers_in_event||0),officialTransfersOut:Number(p.transfers_out_event||0)}});res.set('Cache-Control','no-store');res.json({teams:ts,players})}catch{res.status(502).json({players:[]})}});
app.get('/api/fantasy-trends',async(req,res)=>{try{const [squads,boot]=await Promise.all([rpc('fx_public_squads',{}),getBoot()]);trackTransferActivity(squads);const names=new Map((boot.elements||[]).map(p=>[Number(p.id),p.web_name]));const incoming=[...TRANSFER_IN].map(([id,count])=>({id,name:names.get(id)||'Player',count})).sort((a,b)=>b.count-a.count).slice(0,5),outgoing=[...TRANSFER_OUT].map(([id,count])=>({id,name:names.get(id)||'Player',count})).sort((a,b)=>b.count-a.count).slice(0,5);res.set('Cache-Control','no-store');res.json({since:'service start',in:incoming,out:outgoing})}catch(e){res.status(500).json({in:[],out:[],error:String(e.message)})}});
app.get('/api/fixtures',async(req,res)=>{try{const gw=Math.max(1,Math.min(38,Number(req.query.gw)||1));res.set('Cache-Control','no-store');res.json({gameweek:gw,fixtures:await gameweek(gw)})}catch{res.status(502).json({fixtures:[]})}});
app.get('/api/football-data',async(req,res)=>{try{const gw=Math.max(1,Math.min(38,Number(req.query.gw)||1)),[fixtures,table]=await Promise.all([gameweek(gw),standings()]);res.set('Cache-Control','no-store');res.json({gameweek:gw,season:'2026/27',fixtures,table})}catch{res.status(502).json({fixtures:[],table:[]})}});
app.get('/api/fantasy-stats',async(req,res)=>{try{res.set('Cache-Control','no-store');res.json({source:'FantasyX fixtures',...(await fantasySeasonStats())})}catch(e){res.status(502).json({clubs:[],players:[],error:String(e.message)})}});
app.get('/api/real-club-stats',async(req,res)=>{try{res.set('Cache-Control','no-store');res.json({source:'FantasyX fixtures',...(await fantasySeasonStats())})}catch(e){res.status(502).json({clubs:[],players:[],error:String(e.message)})}});
app.get('/api/community',async(req,res)=>{try{res.set('Cache-Control','no-store');res.json({teams:await liveManagerRows()})}catch(e){res.status(500).json({teams:[],error:String(e.message)})}});
app.get('/api/baller-table',async(req,res)=>{try{const table=await liveManagerRows();res.set('Cache-Control','no-store');res.json({name:'UEFA Baller League',code:'BALLER',live:true,updated_at:new Date().toISOString(),table:table.map(x=>({...x,display_points:x.live_points}))})}catch(e){res.status(500).json({table:[],error:String(e.message)})}});
app.get('/api/club-table',async(req,res)=>{try{res.json({table:await standings()})}catch{res.status(502).json({table:[]})}});
app.use((req,res)=>res.sendFile(process.cwd()+'/public/index.html'));
const port=process.env.PORT||3000;
app.listen(port,()=>{console.log('FantasyX listening on '+port);warm()});