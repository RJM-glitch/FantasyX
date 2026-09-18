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
function playChance(p){const raw=p?.chance_of_playing_next_round;if(raw!==null&&raw!==undefined&&Number.isFinite(Number(raw)))return Math.max(0,Math.min(100,Number(raw)));return String(p?.status||'a')==='a'?100:0}
function availableForFixture(p,f){const c=playChance(p);if(c<=0)return false;if(c>=100)return true;return h32('FXAVAIL',f.id,p.id)%100<c}
function ordered(pool,...seed){return [...pool].sort((a,b)=>h32(...seed,a.id)-h32(...seed,b.id)||Number(a.id)-Number(b.id))}
function fixtureParticipation(boot,f,legacy=false){
  const map=new Map(),matchMin=f.status==='FT'?90:f.status==='LIVE'?Math.max(0,Math.min(90,Number(f.minute||0))):0;
  for(const p of boot.elements||[])if(Number(p.team)===Number(f.home.id)||Number(p.team)===Number(f.away.id))map.set(Number(p.id),{minutes:0,starter:false,subOn:null,subOff:null,played:false});
  if(matchMin<=0)return map;
  if(legacy){for(const p of boot.elements||[])if(Number(p.team)===Number(f.home.id)||Number(p.team)===Number(f.away.id))map.set(Number(p.id),{minutes:matchMin,starter:true,subOn:null,subOff:null,played:true});return map}
  for(const teamId of [f.home.id,f.away.id]){
    const all=(boot.elements||[]).filter(p=>Number(p.team)===Number(teamId)),eligible=ordered(all.filter(p=>availableForFixture(p,f)),'FXLINEUP',f.id,teamId),chosen=[],chosenIds=new Set(),targets={1:1,2:4,3:4,4:2};
    for(const pos of [1,2,3,4])for(const p of eligible.filter(x=>Number(x.element_type)===pos).slice(0,targets[pos])){chosen.push(p);chosenIds.add(Number(p.id))}
    for(const p of eligible)if(chosen.length<11&&!chosenIds.has(Number(p.id))){chosen.push(p);chosenIds.add(Number(p.id))}
    const bench=eligible.filter(p=>!chosenIds.has(Number(p.id))),subIns=ordered(bench.filter(p=>Number(p.element_type)!==1),'FXSUBIN',f.id,teamId).slice(0,5),outPool=ordered(chosen.filter(p=>Number(p.element_type)!==1),'FXSUBOUT',f.id,teamId),usedOut=new Set(),subMinutes=[55,62,68,74,80];
    const pairs=[];
    for(let i=0;i<subIns.length;i++){
      const incoming=subIns[i];let outgoing=outPool.find(p=>!usedOut.has(Number(p.id))&&Number(p.element_type)===Number(incoming.element_type));
      if(!outgoing)outgoing=outPool.find(p=>!usedOut.has(Number(p.id)));if(!outgoing)break;usedOut.add(Number(outgoing.id));pairs.push({incoming,outgoing,minute:subMinutes[i]});
    }
    for(const p of chosen)map.set(Number(p.id),{minutes:matchMin,starter:true,subOn:null,subOff:null,played:matchMin>0});
    for(const pair of pairs){
      const {incoming,outgoing,minute}=pair;
      if(matchMin>=minute){map.set(Number(outgoing.id),{minutes:minute,starter:true,subOn:null,subOff:minute,played:true});map.set(Number(incoming.id),{minutes:Math.max(1,matchMin-minute),starter:false,subOn:minute,subOff:null,played:true})}
    }
  }
  return map;
}
function pointsForPlayer(p,f,minutes){if(!f||f.status==='Upcoming')return 0;const min=Math.max(0,Number(minutes||0));if(min<=0)return 0;const seed=h32('FXPTS',p.id,f.id),pos=p.element_type;let pts=1;if(min>=60)pts++;if(min>=25&&seed%11===0)pts+=pos===4?4:pos===3?5:6;if(min>=40&&seed%13===0)pts+=3;if(min>=60&&(pos===1||pos===2)&&((p.team===f.home.id?Number(f.awayScore||0):Number(f.homeScore||0))===0))pts+=4;if(min>=70&&seed%7===0)pts++;if(min>=85&&seed%17===0)pts+=2;return pts}
async function pointMapForGameweek(gw,boot){
  const fixtures=await gameweek(gw),points=new Map(),info=new Map();
  for(const p of boot.elements||[]){points.set(Number(p.id),0);info.set(Number(p.id),{minutes:0,starter:false,subOn:null,subOff:null,played:false})}
  for(const f of fixtures){const part=fixtureParticipation(boot,f,Number(gw)===1);for(const p of boot.elements||[]){if(Number(p.team)!==Number(f.home.id)&&Number(p.team)!==Number(f.away.id))continue;const pi=part.get(Number(p.id))||{minutes:0,starter:false,played:false};info.set(Number(p.id),pi);points.set(Number(p.id),pointsForPlayer(p,f,pi.minutes))}}
  return{fixtures,points,info,complete:fixtures.length>0&&fixtures.every(f=>f.status==='FT')};
}
async function fantasyPoints(){const boot=await getBoot(),out=new Map((boot.elements||[]).map(p=>[Number(p.id),0]));for(let gw=1;gw<=38;gw++){const g=await pointMapForGameweek(gw,boot);if(g.fixtures.every(f=>f.status==='Upcoming'))break;for(const [id,pts] of g.points)out.set(id,(out.get(id)||0)+Number(pts||0))}return out}
function pick(pool,...seed){return pool.length?pool[h32(...seed)%pool.length]:null}
function lineupPayload(boot,f){
  const part=fixtureParticipation(boot,f,Number(f.gameweek)===1),teamRows={};
  for(const team of [f.home,f.away]){
    const pool=(boot.elements||[]).filter(p=>Number(p.team)===Number(team.id)),rows=pool.map(p=>({id:Number(p.id),name:p.web_name,pos:Number(p.element_type),...(part.get(Number(p.id))||{minutes:0,starter:false,subOn:null,subOff:null,played:false})})),starters=rows.filter(x=>x.starter).sort((a,b)=>a.pos-b.pos||a.name.localeCompare(b.name)),usedSubs=rows.filter(x=>x.subOn!==null).sort((a,b)=>a.subOn-b.subOn),bench=rows.filter(x=>!x.starter&&x.subOn===null);
    teamRows[team.short]={starters,usedSubs,bench};
  }
  const events=[];for(const team of [f.home,f.away]){const rows=teamRows[team.short]?.usedSubs||[];for(const on of rows){const off=(teamRows[team.short]?.starters||[]).find(x=>Number(x.subOff)===Number(on.subOn));events.push({minute:on.subOn,teamShort:team.short,teamName:team.name,on:{id:on.id,name:on.name},off:off?{id:off.id,name:off.name}:null})}}
  events.sort((a,b)=>Number(a.minute)-Number(b.minute));return{home:teamRows[f.home.short],away:teamRows[f.away.short],events};
}
async function enrichFixtures(fixtures,boot){return fixtures.map(f=>{const l=lineupPayload(boot,f);return{...f,lineups:{home:l.home,away:l.away},substitutionEvents:l.events}})}

async function fantasySeasonStats(){
  const boot=await getBoot(),teamInfo=new Map((boot.teams||[]).map(t=>[t.id,t])),pools=new Map(),playerRows=new Map();
  for(const p of boot.elements||[]){if(!pools.has(p.team))pools.set(p.team,[]);pools.get(p.team).push(p);const t=teamInfo.get(p.team),photoId=String(p.photo||'').replace(/\.jpg$/i,'');playerRows.set(p.id,{id:p.id,name:p.web_name,club:t?.name||'',clubShort:t?.short_name||'',clubBadge:t?`https://resources.premierleague.com/premierleague/badges/70/t${t.code}.png`:'',photo:`https://resources.premierleague.com/premierleague/photos/players/250x250/p${photoId}.png`,goals:0,assists:0,yellowCards:0,redCards:0,minutes:0})}
  const clubRows=new Map((boot.teams||[]).map(t=>[t.id,{team:t.name,short:t.short_name,badge:`https://resources.premierleague.com/premierleague/badges/70/t${t.code}.png`,played:0,wins:0,draws:0,losses:0,goals:0,assists:0,yellowCards:0,redCards:0}]));
  for(let gw=1;gw<=38;gw++){
    const fixtures=await gameweek(gw);if(fixtures.every(f=>f.status==='Upcoming'))break;
    for(const f of fixtures){if(f.status==='Upcoming')continue;const part=fixtureParticipation(boot,f,gw===1);for(const [pid,pi] of part)if(pi.minutes>0&&playerRows.has(pid))playerRows.get(pid).minutes+=pi.minutes;
      for(const side of [0,1]){const team=side===0?f.home:f.away,score=side===0?f.homeScore:f.awayScore,allPool=pools.get(team.id)||[],pool=gw===1?allPool:allPool.filter(p=>(part.get(Number(p.id))?.minutes||0)>0),club=clubRows.get(team.id);if(!club)continue;club.played++;
        for(let g=0;g<score;g++){const scorer=pick(pool,'FXGOAL',f.id,team.id,g);if(scorer){playerRows.get(scorer.id).goals++;club.goals++}if(pool.length>1&&h32('FXASSISTED',f.id,team.id,g)%5!==0){let assist=pick(pool,'FXASSIST',f.id,team.id,g);if(assist&&scorer&&assist.id===scorer.id)assist=pool[(pool.indexOf(assist)+1)%pool.length];if(assist){playerRows.get(assist.id).assists++;club.assists++}}}
        const ys=Number(f.stats?.yellowCards?.[side]||0),rs=Number(f.stats?.redCards?.[side]||0);for(let c=0;c<ys;c++){const pl=pick(pool,'FXYELLOW',f.id,team.id,c);if(pl){playerRows.get(pl.id).yellowCards++;club.yellowCards++}}for(let c=0;c<rs;c++){const pl=pick(pool,'FXRED',f.id,team.id,c);if(pl){playerRows.get(pl.id).redCards++;club.redCards++}}
      }
    }
  }
  const pts=await fantasyPoints();for(const [id,row] of playerRows)row.points=pts.get(id)||0;
  return{clubs:[...clubRows.values()].sort((a,b)=>a.team.localeCompare(b.team)),players:[...playerRows.values()].filter(p=>p.goals||p.assists||p.yellowCards||p.redCards||p.points).sort((a,b)=>a.club.localeCompare(b.club)||a.name.localeCompare(b.name))};
}

function trackTransferActivity(rows){
  const grouped=new Map();for(const r of rows||[]){if(!grouped.has(r.user_id))grouped.set(r.user_id,new Set());grouped.get(r.user_id).add(Number(r.player_id))}
  for(const [uid,set] of grouped){const prev=PREV_SQUADS.get(uid);if(prev){for(const id of set)if(!prev.has(id))TRANSFER_IN.set(id,(TRANSFER_IN.get(id)||0)+1);for(const id of prev)if(!set.has(id))TRANSFER_OUT.set(id,(TRANSFER_OUT.get(id)||0)+1)}PREV_SQUADS.set(uid,set)}
  for(const uid of [...PREV_SQUADS.keys()])if(!grouped.has(uid))PREV_SQUADS.delete(uid);
}

const SPECIAL_TRANSFER_UNTIL=Date.parse('2026-09-18T12:56:14+02:00');
function transferWindowState(now=Date.now()){
  const firstKickoff=Date.parse('2026-09-18T08:30:00+02:00'),baseMidnight=Date.parse('2026-09-18T00:00:00+02:00'),day=86400000;
  if(now<firstKickoff)return{open:true,targetGw:2,penalty:false,special:false,message:'Transfers are open until Gameweek 2 kickoff.'};
  if(now<SPECIAL_TRANSFER_UNTIL)return{open:true,targetGw:2,penalty:false,special:true,closes_at:new Date(SPECIAL_TRANSFER_UNTIL).toISOString(),message:'Special 10-minute transfer window is OPEN. GW2 transfers are free. New players do not score Gameweek 2 points.'};
  const dayIndex=Math.max(0,Math.floor((now-baseMidnight)/day)),todayGw=Math.min(38,2+dayIndex),start=baseMidnight+dayIndex*day+(todayGw===2?13:8.5)*3600000,end=baseMidnight+dayIndex*day+(todayGw===2?(17*3600000+35*60000):14.5*3600000);
  if(now>=start&&now<end)return{open:false,targetGw:todayGw,penalty:todayGw>=3,special:false,message:`Transfers are locked while Gameweek ${todayGw} is being played.`};
  const targetGw=now<start?todayGw:Math.min(38,todayGw+1);
  return{open:true,targetGw,penalty:targetGw>=3,special:false,message:targetGw>=3?`Transfers are open for Gameweek ${targetGw}. Each player brought in costs -4 points.`:`Transfers are open for Gameweek ${targetGw}.`};
}

function entryId(x){return Number(x?.player_id??x?.id)}
function entryPos(x){return String(x?.position??x?.pos??'').toUpperCase()}
function entryBench(x){return Boolean(x?.is_bench??x?.bench)}
function entryCaptain(x){return Boolean(x?.is_captain??x?.cap)}
function entryVice(x){return Boolean(x?.is_vice??x?.vice)}
function scoreStoredSquadDetailed(squad,pointMap,infoMap){
  const rows=Array.isArray(squad)?squad:[],starters=rows.filter(x=>!entryBench(x)),bench=rows.filter(entryBench),active=new Set(starters.map(entryId)),usedBench=new Set(),autosubs=[],counts={GK:0,DEF:0,MID:0,FWD:0};
  for(const x of starters){const p=entryPos(x);if(counts[p]!==undefined)counts[p]++}
  for(const out of starters){const outId=entryId(out),outInfo=infoMap.get(outId)||{minutes:0};if(Number(outInfo.minutes||0)>0)continue;const outPos=entryPos(out);
    let replacement=null;
    for(const cand of bench){const cid=entryId(cand),cp=entryPos(cand),ci=infoMap.get(cid)||{minutes:0};if(usedBench.has(cid)||Number(ci.minutes||0)<=0)continue;if(outPos==='GK'&&cp!=='GK')continue;if(outPos!=='GK'&&cp==='GK')continue;if(outPos!=='GK'){const test={...counts};test[outPos]=Math.max(0,(test[outPos]||0)-1);test[cp]=(test[cp]||0)+1;if(test.DEF<3||test.MID<2||test.FWD<1)continue}replacement=cand;break}
    if(replacement){const rid=entryId(replacement),rp=entryPos(replacement);active.delete(outId);active.add(rid);usedBench.add(rid);counts[outPos]=Math.max(0,(counts[outPos]||0)-1);counts[rp]=(counts[rp]||0)+1;autosubs.push({out:outId,in:rid})}
  }
  const captain=rows.find(entryCaptain),vice=rows.find(entryVice),captainId=captain&&active.has(entryId(captain))&&Number(infoMap.get(entryId(captain))?.minutes||0)>0?entryId(captain):vice&&active.has(entryId(vice))&&Number(infoMap.get(entryId(vice))?.minutes||0)>0?entryId(vice):null;
  let total=0;for(const x of rows){const id=entryId(x);if(!active.has(id))continue;const base=Number(pointMap.get(id)||0),mult=id===captainId?2:1;total+=base*mult}
  return{total,activeIds:active,captainId,autosubs};
}
function scoreStoredSquad(squad,pointMap,infoMap){return scoreStoredSquadDetailed(squad,pointMap,infoMap).total}
function exactSnapshot(snaps,userId,gw){return(snaps||[]).find(s=>String(s.user_id)===String(userId)&&Number(s.gameweek)===Number(gw))||null}

async function managerScoreData(){
  const [profiles,squads,snaps,baselines,penalties,boot]=await Promise.all([rpc('fx_public_profiles',{}),rpc('fx_public_squads',{}),rpc('fx_public_gameweek_squads',{}),rpc('fx_public_gw1_baseline_squads',{}),rpc('fx_public_transfer_penalties',{}),getBoot()]);
  let locks=await rpc('fx_public_locked_squads',{});
  const historical=new Map((profiles||[]).map(p=>[String(p.user_id),0])),gw1=await pointMapForGameweek(1,boot);
  for(const p of profiles||[]){const uid=String(p.user_id),base=(baselines||[]).find(b=>String(b.user_id)===uid),gw1Points=base?scoreStoredSquad(base.squad,gw1.points,gw1.info):Number(p.total_points||0);historical.set(uid,gw1Points)}
  let currentGw=2,currentPoints=new Map(),currentInfo=new Map();
  for(let gw=2;gw<=38;gw++){
    const g=await pointMapForGameweek(gw,boot);
    if(!g.complete){
      currentGw=gw;currentPoints=g.points;currentInfo=g.info;
      if(g.fixtures.some(f=>f.status!=='Upcoming')){try{await rpc('fx_lock_gameweek_squads',{p_gameweek:gw});locks=await rpc('fx_public_locked_squads',{})}catch{}}
      break;
    }
    for(const p of profiles||[]){const locked=exactSnapshot(locks,p.user_id,gw),saved=exactSnapshot(snaps,p.user_id,gw),snap=Array.isArray(locked?.squad)&&locked.squad.length?locked:saved;if(snap)historical.set(String(p.user_id),(historical.get(String(p.user_id))||0)+scoreStoredSquad(snap.squad,g.points,g.info))}
    if(gw===38){currentGw=38;currentPoints=new Map();currentInfo=new Map()}
  }
  const penaltyByUser=new Map();for(const x of penalties||[])penaltyByUser.set(String(x.user_id),(penaltyByUser.get(String(x.user_id))||0)+Number(x.penalty_points||0));
  return{profiles:profiles||[],squads:squads||[],snaps:snaps||[],locks:locks||[],historical,currentGw,currentPoints,currentInfo,penaltyByUser};
}

async function liveManagerRows(){
  const d=await managerScoreData();
  return d.profiles.filter(p=>String(p.real_name||'').trim()||String(p.team_name||'').trim().toLowerCase()!=='my xi').map(p=>{
    const uid=String(p.user_id),baseSquad=d.squads.filter(s=>String(s.user_id)===uid),locked=exactSnapshot(d.locks,p.user_id,d.currentGw),saved=exactSnapshot(d.snaps,p.user_id,d.currentGw),lockedUsable=Array.isArray(locked?.squad)&&locked.squad.length>0,scoringSquad=lockedUsable?locked.squad:(Array.isArray(saved?.squad)&&saved.squad.length?saved.squad:baseSquad),detail=scoreStoredSquadDetailed(scoringSquad,d.currentPoints,d.currentInfo),scoringIds=new Set((Array.isArray(scoringSquad)?scoringSquad:[]).map(entryId)),subIn=new Set(detail.autosubs.map(x=>x.in)),subOut=new Set(detail.autosubs.map(x=>x.out));
    const squad=baseSquad.map(s=>{const id=Number(s.player_id),base=Number(d.currentPoints.get(id)||0),eligible=scoringIds.has(id),active=eligible&&detail.activeIds.has(id),m=active?(id===detail.captainId?2:1):0;return{...s,points:eligible?base:0,minutes:eligible?Number(d.currentInfo.get(id)?.minutes||0):0,scoring_points:eligible?base*m:0,multiplier:m,autosubbed_in:eligible&&subIn.has(id),autosubbed_out:eligible&&subOut.has(id),ineligible_current_gw:!eligible}});
    const historicalPoints=Number(d.historical.get(uid)||0),gameweekPoints=detail.total,transferPenalty=Number(d.penaltyByUser.get(uid)||0),live_points=Math.max(0,historicalPoints+gameweekPoints-transferPenalty);
    return{...p,squad,historical_points:historicalPoints,gameweek_points:gameweekPoints,transfer_penalty:transferPenalty,current_gameweek:d.currentGw,gameweek_squad_locked:lockedUsable,auto_substitutions:detail.autosubs,live_points,total_points:live_points};
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
app.put('/api/account/squad',async(req,res)=>{try{if(!await requireUser(req,res))return;const h=tokenHash(req),next=(req.body?.squad||[]).slice(0,15),old=await rpc('fx_get_squad',{p_token_hash:h})||[],state=transferWindowState(),recovery=old.length===0&&next.length>0;if(!state.open&&!recovery)return res.status(423).json({error:state.message});const oldIds=new Set(old.map(x=>Number(x.player_id))),nextIds=new Set(next.map(x=>Number(x.id))),incoming=[...nextIds].filter(id=>!oldIds.has(id)).length;if(!recovery&&state.penalty&&incoming>0)await rpc('fx_record_transfer_penalty',{p_token_hash:h,p_gameweek:state.targetGw,p_transfers:incoming});await rpc('fx_save_squad',{p_token_hash:h,p_squad:next});try{trackTransferActivity(await rpc('fx_public_squads',{}))}catch{}res.json({ok:true,recovery,gameweek:state.targetGw,transfers_in:recovery?0:incoming,penalty:recovery?0:(state.penalty?incoming*4:0)})}catch(e){res.status(500).json({error:String(e.message)})}});
app.get('/api/account/points',async(req,res)=>{try{const u=await requireUser(req,res);if(!u)return;const uid=String(u.user_id||u.id||''),row=(await liveManagerRows()).find(x=>String(x.user_id)===uid);res.set('Cache-Control','no-store');res.json(row?{points:row.live_points,historical_points:row.historical_points,gameweek_points:row.gameweek_points,transfer_penalty:row.transfer_penalty,current_gameweek:row.current_gameweek,auto_substitutions:row.auto_substitutions}:{points:0,historical_points:0,gameweek_points:0,transfer_penalty:0,current_gameweek:2,auto_substitutions:[]})}catch(e){res.status(500).json({error:String(e.message)})}});
app.get('/api/transfer-window',(req,res)=>{res.set('Cache-Control','no-store');res.json(transferWindowState())});
app.post('/api/account/join-league',async(req,res)=>{try{if(!await requireUser(req,res))return;res.json({league:(await rpc('fx_join_league',{p_token_hash:tokenHash(req),p_code:String(req.body?.code||'')}))?.[0]||null})}catch(e){res.status(500).json({error:String(e.message)})}});

app.get('/api/players',async(req,res)=>{try{const [d,pts]=await Promise.all([getBoot(),fantasyPoints()]),ts=d.teams.map(t=>({id:t.id,name:t.name,short:t.short_name,code:t.code,badge:`https://resources.premierleague.com/premierleague/badges/70/t${t.code}.png`})),tm=new Map(ts.map(t=>[t.id,t])),types={1:'GK',2:'DEF',3:'MID',4:'FWD'},players=d.elements.filter(p=>tm.has(p.team)).map(p=>{const t=tm.get(p.team),photoId=String(p.photo||'').replace(/\.jpg$/i,''),raw=p.chance_of_playing_next_round,chance=raw===null||raw===undefined?(p.status==='a'?100:0):Number(raw);return{id:p.id,name:p.web_name,club:t.short,clubName:t.name,clubBadge:t.badge,pos:types[p.element_type],price:p.now_cost/10,totalPoints:pts.get(Number(p.id))||0,seasonPoints:pts.get(Number(p.id))||0,photo:`https://resources.premierleague.com/premierleague/photos/players/250x250/p${photoId}.png`,availabilityChance:chance,availabilityStatus:String(p.status||'a'),injuryNews:String(p.news||''),officialTransfersIn:Number(p.transfers_in_event||0),officialTransfersOut:Number(p.transfers_out_event||0)}});res.set('Cache-Control','no-store');res.json({teams:ts,players})}catch{res.status(502).json({players:[]})}});
app.get('/api/gameweek-player-points',async(req,res)=>{try{const gw=Math.max(1,Math.min(38,Number(req.query.gw)||1)),boot=await getBoot(),g=await pointMapForGameweek(gw,boot),tm=new Map((boot.teams||[]).map(t=>[Number(t.id),t])),types={1:'GK',2:'DEF',3:'MID',4:'FWD'};const players=(boot.elements||[]).map(p=>{const pi=g.info.get(Number(p.id))||{minutes:0,starter:false,subOn:null,subOff:null,played:false},t=tm.get(Number(p.team)),photoId=String(p.photo||'').replace(/\.jpg$/i,'');return{id:Number(p.id),name:p.web_name,pos:types[p.element_type],club:t?.short_name||'',clubName:t?.name||'',photo:`https://resources.premierleague.com/premierleague/photos/players/250x250/p${photoId}.png`,points:Number(g.points.get(Number(p.id))||0),minutes:Number(pi.minutes||0),played:Boolean(pi.played),starter:Boolean(pi.starter),subOn:pi.subOn,subOff:pi.subOff}});res.set('Cache-Control','no-store');res.json({gameweek:gw,complete:g.complete,legacy:gw===1,players})}catch(e){res.status(500).json({players:[],error:String(e.message)})}});
app.get('/api/fantasy-trends',async(req,res)=>{try{const [squads,boot]=await Promise.all([rpc('fx_public_squads',{}),getBoot()]);trackTransferActivity(squads);const names=new Map((boot.elements||[]).map(p=>[Number(p.id),p.web_name]));const incoming=[...TRANSFER_IN].map(([id,count])=>({id,name:names.get(id)||'Player',count})).sort((a,b)=>b.count-a.count).slice(0,5),outgoing=[...TRANSFER_OUT].map(([id,count])=>({id,name:names.get(id)||'Player',count})).sort((a,b)=>b.count-a.count).slice(0,5);res.set('Cache-Control','no-store');res.json({since:'service start',in:incoming,out:outgoing})}catch(e){res.status(500).json({in:[],out:[],error:String(e.message)})}});
app.get('/api/fixtures',async(req,res)=>{try{const gw=Math.max(1,Math.min(38,Number(req.query.gw)||1)),boot=await getBoot(),fixtures=await gameweek(gw);res.set('Cache-Control','no-store');res.json({gameweek:gw,fixtures:await enrichFixtures(fixtures,boot)})}catch{res.status(502).json({fixtures:[]})}});
app.get('/api/football-data',async(req,res)=>{try{const gw=Math.max(1,Math.min(38,Number(req.query.gw)||1)),boot=await getBoot(),[fixtures,table]=await Promise.all([gameweek(gw),standings()]);res.set('Cache-Control','no-store');res.json({gameweek:gw,season:'2026/27',fixtures:await enrichFixtures(fixtures,boot),table})}catch{res.status(502).json({fixtures:[],table:[]})}});
app.get('/api/fantasy-stats',async(req,res)=>{try{res.set('Cache-Control','no-store');res.json({source:'FantasyX fixtures',...(await fantasySeasonStats())})}catch(e){res.status(502).json({clubs:[],players:[],error:String(e.message)})}});
app.get('/api/real-club-stats',async(req,res)=>{try{res.set('Cache-Control','no-store');res.json({source:'FantasyX fixtures',...(await fantasySeasonStats())})}catch(e){res.status(502).json({clubs:[],players:[],error:String(e.message)})}});
app.get('/api/community',async(req,res)=>{try{res.set('Cache-Control','no-store');res.json({teams:await liveManagerRows()})}catch(e){res.status(500).json({teams:[],error:String(e.message)})}});
app.get('/api/baller-table',async(req,res)=>{try{const table=await liveManagerRows();res.set('Cache-Control','no-store');res.json({name:'UEFA Baller League',code:'BALLER',live:true,updated_at:new Date().toISOString(),table:table.map(x=>({...x,display_points:x.live_points}))})}catch(e){res.status(500).json({table:[],error:String(e.message)})}});
app.get('/api/club-table',async(req,res)=>{try{res.json({table:await standings()})}catch{res.status(502).json({table:[]})}});
app.use((req,res)=>res.sendFile(process.cwd()+'/public/index.html'));
const port=process.env.PORT||3000;
app.listen(port,()=>{console.log('FantasyX listening on '+port);warm();setTimeout(async()=>{try{const g=await gameweek(2);console.log('FXDEBUG_GW2 '+JSON.stringify(g.map(x=>({id:x.id,status:x.status,minute:x.minute,home:x.home?.short,away:x.away?.short,score:[x.homeScore,x.awayScore]}))));const rows=await liveManagerRows();console.log('FXDEBUG_MGR '+JSON.stringify(rows.map(x=>({team:x.team_name,points:x.live_points,gw:x.gameweek_points,squad:x.squad.filter(p=>Number(p.points||0)>0).map(p=>({name:p.player_name,pts:p.points,score:p.scoring_points,mins:p.minutes}))}))));}catch(e){console.log('FXDEBUG_ERR '+String(e.message))}},2000)});
