import express from 'express';
import {randomBytes,createHash} from 'node:crypto';
import {getBoot,gameweek,standings,warm,teams} from './fpl-data.js';
import {getEventLive,gameweekMeta} from './fpl-live.js';

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

async function pointMapForGameweek(gw, boot) {
  const fixtures = await gameweek(gw);
  const points = new Map((boot.elements || []).map(p => [Number(p.id), 0]));
  const info = new Map((boot.elements || []).map(p => [Number(p.id), {
    minutes: 0, starter: false, subOn: null, subOff: null, played: false
  }]));
  const eventStats = new Map();
  const started = fixtures.some(f => f.status !== 'Upcoming');
  const complete = fixtures.length > 0 && fixtures.every(f => f.status === 'FT');

  if (started) {
    const live = await getEventLive(gw, { finished: complete });
    for (const row of live.elements || []) {
      const id = Number(row.id);
      const stats = row.stats || {};
      if (!points.has(id)) continue;
      points.set(id, Number(stats.total_points) || 0);
      eventStats.set(id, stats);
      info.set(id, {
        minutes: Number(stats.minutes) || 0,
        starter: Number(stats.starts) > 0,
        subOn: null,
        subOff: null,
        played: Number(stats.minutes) > 0
      });
    }
  }

  return { fixtures, points, info, eventStats, complete };
}

async function fantasyPoints() {
  const boot = await getBoot();
  return new Map((boot.elements || []).map(p => [Number(p.id), Number(p.total_points) || 0]));
}

async function enrichFixtures(fixtures) {
  // The official FPL public feed does not provide full starting XIs or exact substitution times.
  // Do not fabricate lineups or events when that information is unavailable.
  return fixtures.map(f => ({ ...f, lineups: null, lineupsAvailable: false, substitutionEvents: [] }));
}

async function fantasySeasonStats() {
  const boot = await getBoot();
  const teamInfo = new Map((boot.teams || []).map(t => [Number(t.id), t]));
  const badgeInfo = teams(boot);
  const playerById = new Map((boot.elements || []).map(p => [Number(p.id), p]));
  const playerRows = new Map();
  for (const p of boot.elements || []) {
    const team = teamInfo.get(Number(p.team));
    const photoId = String(p.photo || '').replace(/\.jpg$/i, '');
    playerRows.set(Number(p.id), {
      id: Number(p.id),
      name: p.web_name,
      club: team?.name || '',
      clubShort: team?.short_name || '',
      clubBadge: badgeInfo.get(Number(p.team))?.badge || '',
      photo: photoId ? 'https://resources.premierleague.com/premierleague/photos/players/250x250/p' + photoId + '.png' : '/player.svg',
      goals: 0, assists: 0, yellowCards: 0, redCards: 0, minutes: 0, points: 0
    });
  }
  const clubRows = new Map((boot.teams || []).map(t => [Number(t.id), {
    team: t.name, short: t.short_name,
    badge: badgeInfo.get(Number(t.id))?.badge || '', badgeFallback: badgeInfo.get(Number(t.id))?.badgeFallback || '',
    played: 0, wins: 0, draws: 0, losses: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0
  }]));

  for (let gw = 1; gw <= 38; gw++) {
    const fixtures = await gameweek(gw);
    if (!fixtures.length || fixtures.every(f => f.status === 'Upcoming')) break;
    const complete = fixtures.every(f => f.status === 'FT');
    const live = await getEventLive(gw, { finished: complete });

    for (const row of live.elements || []) {
      const id = Number(row.id);
      const stats = row.stats || {};
      const player = playerRows.get(id);
      const sourcePlayer = playerById.get(id);
      if (!player || !sourcePlayer) continue;
      const goals = Number(stats.goals_scored) || 0;
      const assists = Number(stats.assists) || 0;
      const yellow = Number(stats.yellow_cards) || 0;
      const red = Number(stats.red_cards) || 0;
      player.goals += goals;
      player.assists += assists;
      player.yellowCards += yellow;
      player.redCards += red;
      player.minutes += Number(stats.minutes) || 0;
      player.points += Number(stats.total_points) || 0;
      const club = clubRows.get(Number(sourcePlayer.team));
      if (club) {
        club.assists += assists;
        club.yellowCards += yellow;
        club.redCards += red;
      }
    }

    for (const fixture of fixtures) {
      if (fixture.status !== 'FT' || fixture.homeScore === null || fixture.awayScore === null) continue;
      const home = clubRows.get(Number(fixture.home.id));
      const away = clubRows.get(Number(fixture.away.id));
      if (!home || !away) continue;
      const homeGoals = Number(fixture.homeScore);
      const awayGoals = Number(fixture.awayScore);
      home.played++; away.played++;
      home.goals += homeGoals; away.goals += awayGoals;
      if (homeGoals > awayGoals) { home.wins++; away.losses++; }
      else if (homeGoals < awayGoals) { away.wins++; home.losses++; }
      else { home.draws++; away.draws++; }
    }
  }

  return {
    clubs: [...clubRows.values()].sort((a, b) => a.team.localeCompare(b.team)),
    players: [...playerRows.values()]
      .filter(p => p.goals || p.assists || p.yellowCards || p.redCards || p.points)
      .sort((a, b) => a.club.localeCompare(b.club) || a.name.localeCompare(b.name))
  };
}

function trackTransferActivity(rows){
  const grouped=new Map();for(const r of rows||[]){if(!grouped.has(r.user_id))grouped.set(r.user_id,new Set());grouped.get(r.user_id).add(Number(r.player_id))}
  for(const [uid,set] of grouped){const prev=PREV_SQUADS.get(uid);if(prev){for(const id of set)if(!prev.has(id))TRANSFER_IN.set(id,(TRANSFER_IN.get(id)||0)+1);for(const id of prev)if(!set.has(id))TRANSFER_OUT.set(id,(TRANSFER_OUT.get(id)||0)+1)}PREV_SQUADS.set(uid,set)}
  for(const uid of [...PREV_SQUADS.keys()])if(!grouped.has(uid))PREV_SQUADS.delete(uid);
}

async function transferWindowState(now = Date.now()) {
  const boot = await getBoot();
  const meta = gameweekMeta(boot, now);
  const targetGw = meta.deadlineGameweek;
  if (!targetGw || !meta.deadline) {
    return {
      open: false,
      targetGw: meta.currentGameweek,
      penalty: false,
      special: false,
      message: 'No upcoming official FPL deadline is available.'
    };
  }
  const deadline = Date.parse(meta.deadline);
  const deadlineLocal = new Intl.DateTimeFormat('en-ZA', {
    timeZone: 'Africa/Johannesburg',
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(deadline));
  return {
    open: true,
    targetGw,
    penalty: Number(targetGw) >= 3,
    special: false,
    closes_at: new Date(deadline).toISOString(),
    message: 'Transfers are open for Gameweek ' + targetGw + ' until ' + deadlineLocal + ' (South Africa time).'
  };
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
function validateSquadPayload(squad) {
  if (!Array.isArray(squad)) return 'Squad must be a list of players.';
  if (squad.length > 15) return 'A squad cannot contain more than 15 players.';
  const ids = squad.map(p => Number(p?.id ?? p?.player_id));
  if (ids.some(id => !Number.isInteger(id) || id <= 0)) return 'Every player must have a valid player ID.';
  if (new Set(ids).size !== ids.length) return 'Your squad contains duplicate players.';

  const positionLimits = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
  const counts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  const clubs = new Map();
  let budget = 0;
  for (const player of squad) {
    const pos = String(player?.pos ?? player?.position ?? '').toUpperCase();
    if (!(pos in positionLimits)) return 'A player has an invalid position.';
    counts[pos]++;
    if (counts[pos] > positionLimits[pos]) return 'Too many players in position ' + pos + '.';
    const price = Number(player?.price);
    if (!Number.isFinite(price) || price < 0) return 'A player has an invalid price.';
    budget += price;
    const club = String(player?.club ?? '').trim().toUpperCase();
    if (!club) return 'A player is missing a club.';
    clubs.set(club, (clubs.get(club) || 0) + 1);
    if (clubs.get(club) > 3) return 'You cannot select more than three players from one club.';
  }
  if (budget > 100.0001) return 'Your squad exceeds the £100.0m budget.';

  const captain = squad.filter(p => Boolean(p?.is_captain ?? p?.cap));
  const vice = squad.filter(p => Boolean(p?.is_vice ?? p?.vice));
  if (captain.length > 1) return 'Choose only one captain.';
  if (vice.length > 1) return 'Choose only one vice-captain.';
  if (captain.length && vice.length && Number(captain[0]?.id ?? captain[0]?.player_id) === Number(vice[0]?.id ?? vice[0]?.player_id)) {
    return 'Your captain and vice-captain must be different players.';
  }

  if (squad.length === 15) {
    if (counts.GK !== 2 || counts.DEF !== 5 || counts.MID !== 5 || counts.FWD !== 3) {
      return 'A complete squad must contain 2 goalkeepers, 5 defenders, 5 midfielders and 3 forwards.';
    }
    const benchFlags = squad.map(p => p?.is_bench ?? p?.bench);
    if (!benchFlags.every(value => typeof value === 'boolean')) return 'The starting XI and bench could not be identified.';
    const starters = squad.filter(p => !(p?.is_bench ?? p?.bench));
    const bench = squad.filter(p => Boolean(p?.is_bench ?? p?.bench));
    const startCounts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    for (const player of starters) startCounts[String(player?.pos ?? player?.position ?? '').toUpperCase()]++;
    if (starters.length !== 11 || bench.length !== 4 || startCounts.GK !== 1 ||
        startCounts.DEF < 3 || startCounts.DEF > 5 ||
        startCounts.MID < 2 || startCounts.MID > 5 ||
        startCounts.FWD < 1 || startCounts.FWD > 3) {
      return 'Your starting XI, formation or four-player bench is invalid.';
    }
    if (captain.length && Boolean(captain[0]?.is_bench ?? captain[0]?.bench)) return 'Your captain must be in the starting XI.';
    if (vice.length && Boolean(vice[0]?.is_bench ?? vice[0]?.bench)) return 'Your vice-captain must be in the starting XI.';
  }
  return null;
}

app.put('/api/account/squad', async (req, res) => {
  try {
    if (!await requireUser(req, res)) return;
    const next = req.body?.squad;
    const validationError = validateSquadPayload(next);
    if (validationError) return res.status(400).json({ error: validationError });

    const h = tokenHash(req);
    const old = await rpc('fx_get_squad', { p_token_hash: h }) || [];
    const state = await transferWindowState();
    const recovery = old.length === 0 && next.length > 0;
    const buildingSquad = old.length < 15 || next.length < 15;
    if (!state.open && !recovery) return res.status(423).json({ error: state.message });

    const oldIds = new Set(old.map(x => Number(x.player_id)));
    const nextIds = new Set(next.map(x => Number(x.id ?? x.player_id)));
    const incoming = [...nextIds].filter(id => !oldIds.has(id)).length;

    await rpc('fx_save_squad', { p_token_hash: h, p_squad: next });
    if (!recovery && !buildingSquad && state.penalty && incoming > 0) {
      await rpc('fx_record_transfer_penalty', { p_token_hash: h, p_gameweek: state.targetGw, p_transfers: incoming });
    }
    try { trackTransferActivity(await rpc('fx_public_squads', {})); } catch {}
    res.json({
      ok: true,
      recovery,
      building_squad: buildingSquad,
      gameweek: state.targetGw,
      transfers_in: recovery || buildingSquad ? 0 : incoming,
      penalty: recovery || buildingSquad ? 0 : (state.penalty ? incoming * 4 : 0)
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});
app.get('/api/account/points',async(req,res)=>{try{const u=await requireUser(req,res);if(!u)return;const uid=String(u.user_id||u.id||''),row=(await liveManagerRows()).find(x=>String(x.user_id)===uid);res.set('Cache-Control','no-store');res.json(row?{points:row.live_points,historical_points:row.historical_points,gameweek_points:row.gameweek_points,transfer_penalty:row.transfer_penalty,current_gameweek:row.current_gameweek,auto_substitutions:row.auto_substitutions}:{points:0,historical_points:0,gameweek_points:0,transfer_penalty:0,current_gameweek:2,auto_substitutions:[]})}catch(e){res.status(500).json({error:String(e.message)})}});
app.get('/api/transfer-window', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json(await transferWindowState());
  } catch (e) {
    res.status(502).json({ open: false, penalty: false, special: false, message: 'Official FPL deadline unavailable.', error: String(e.message) });
  }
});
app.get('/api/gameweek', async (req, res) => {
  try {
    const boot = await getBoot();
    res.set('Cache-Control', 'no-store');
    res.json({ ...gameweekMeta(boot), transferWindow: await transferWindowState() });
  } catch (e) {
    res.status(502).json({ error: 'Official FPL gameweek data unavailable.', detail: String(e.message) });
  }
});
app.post('/api/account/join-league',async(req,res)=>{try{if(!await requireUser(req,res))return;res.json({league:(await rpc('fx_join_league',{p_token_hash:tokenHash(req),p_code:String(req.body?.code||'')}))?.[0]||null})}catch(e){res.status(500).json({error:String(e.message)})}});

app.get('/api/players', async (req, res) => {
  try {
    const boot = await getBoot();
    const pts = await fantasyPoints();
    const meta = gameweekMeta(boot);
    let eventStats = new Map();
    try {
      const currentFixtures = await gameweek(meta.currentGameweek);
      if (currentFixtures.some(f => f.status !== 'Upcoming')) {
        const live = await getEventLive(meta.currentGameweek, { finished: currentFixtures.every(f => f.status === 'FT') });
        eventStats = new Map((live.elements || []).map(row => [Number(row.id), row.stats || {}]));
      }
    } catch {
      // Keep the player market available if the optional current-event detail endpoint is temporarily down.
    }
    const ts = [...teams(boot).values()];
    const tm = new Map(ts.map(t => [t.id, t]));
    const types = { 1: 'GK', 2: 'DEF', 3: 'MID', 4: 'FWD' };
    const players = (boot.elements || []).filter(p => tm.has(p.team)).map(p => {
      const team = tm.get(p.team);
      const photoId = String(p.photo || '').replace(/\.jpg$/i, '');
      const stats = eventStats.get(Number(p.id)) || null;
      const rawChance = p.chance_of_playing_next_round;
      const chance = rawChance === null || rawChance === undefined ? (p.status === 'a' ? 100 : 0) : Number(rawChance);
      return {
        id: Number(p.id), name: p.web_name, club: team.short, clubName: team.name,
        clubBadge: team.badge, clubBadgeFallback: team.badgeFallback,
        pos: types[p.element_type], price: Number(p.now_cost) / 10,
        totalPoints: Number(pts.get(Number(p.id)) || 0),
        seasonPoints: Number(p.total_points) || 0,
        eventPoints: Number(stats?.total_points ?? p.event_points) || 0,
        eventStats: stats,
        goals: Number(p.goals_scored) || 0,
        assists: Number(p.assists) || 0,
        minutes: Number(p.minutes) || 0,
        cleanSheets: Number(p.clean_sheets) || 0,
        yellowCards: Number(p.yellow_cards) || 0,
        redCards: Number(p.red_cards) || 0,
        photo: photoId ? 'https://resources.premierleague.com/premierleague/photos/players/250x250/p' + photoId + '.png' : '/player.svg',
        availabilityChance: chance, availabilityStatus: String(p.status || 'a'),
        injuryNews: String(p.news || ''),
        officialTransfersIn: Number(p.transfers_in_event || 0),
        officialTransfersOut: Number(p.transfers_out_event || 0)
      };
    });
    res.set('Cache-Control', 'no-store');
    res.json({ gameweek: meta.currentGameweek, teams: ts, players });
  } catch (e) {
    res.status(502).json({ players: [], error: String(e.message) });
  }
});
app.get('/api/gameweek-player-points',async(req,res)=>{try{const gw=Math.max(1,Math.min(38,Number(req.query.gw)||1)),boot=await getBoot(),g=await pointMapForGameweek(gw,boot),tm=new Map((boot.teams||[]).map(t=>[Number(t.id),t])),types={1:'GK',2:'DEF',3:'MID',4:'FWD'};const players=(boot.elements||[]).map(p=>{const id=Number(p.id),pi=g.info.get(id)||{minutes:0,starter:false,subOn:null,subOff:null,played:false},t=tm.get(Number(p.team)),photoId=String(p.photo||'').replace(/\.jpg$/i,'');return{id,name:p.web_name,pos:types[p.element_type],club:t?.short_name||'',clubName:t?.name||'',photo:photoId?`https://resources.premierleague.com/premierleague/photos/players/250x250/p${photoId}.png`:'/player.svg',points:Number(g.points.get(id)||0),minutes:Number(pi.minutes||0),played:Boolean(pi.played),starter:Boolean(pi.starter),subOn:pi.subOn,subOff:pi.subOff,stats:g.eventStats?.get(id)||null}});res.set('Cache-Control','no-store');res.json({gameweek:gw,complete:g.complete,legacy:gw===1,players})}catch(e){res.status(500).json({players:[],error:String(e.message)})}});
app.get('/api/fantasy-trends',async(req,res)=>{try{const [squads,boot]=await Promise.all([rpc('fx_public_squads',{}),getBoot()]);trackTransferActivity(squads);const names=new Map((boot.elements||[]).map(p=>[Number(p.id),p.web_name]));const incoming=[...TRANSFER_IN].map(([id,count])=>({id,name:names.get(id)||'Player',count})).sort((a,b)=>b.count-a.count).slice(0,5),outgoing=[...TRANSFER_OUT].map(([id,count])=>({id,name:names.get(id)||'Player',count})).sort((a,b)=>b.count-a.count).slice(0,5);res.set('Cache-Control','no-store');res.json({since:'service start',in:incoming,out:outgoing})}catch(e){res.status(500).json({in:[],out:[],error:String(e.message)})}});
app.get('/api/fixtures',async(req,res)=>{try{const gw=Math.max(1,Math.min(38,Number(req.query.gw)||1)),boot=await getBoot(),fixtures=await gameweek(gw);res.set('Cache-Control','no-store');res.json({gameweek:gw,fixtures:await enrichFixtures(fixtures)})}catch{res.status(502).json({fixtures:[]})}});
app.get('/api/football-data',async(req,res)=>{try{const gw=Math.max(1,Math.min(38,Number(req.query.gw)||1)),boot=await getBoot(),[fixtures,table]=await Promise.all([gameweek(gw),standings()]);res.set('Cache-Control','no-store');res.json({gameweek:gw,season:'2026/27',fixtures:await enrichFixtures(fixtures,boot),table})}catch{res.status(502).json({fixtures:[],table:[]})}});
app.get('/api/fantasy-stats',async(req,res)=>{try{res.set('Cache-Control','no-store');res.json({source:'FantasyX fixtures',...(await fantasySeasonStats())})}catch(e){res.status(502).json({clubs:[],players:[],error:String(e.message)})}});
app.get('/api/real-club-stats',async(req,res)=>{try{res.set('Cache-Control','no-store');res.json({source:'FantasyX fixtures',...(await fantasySeasonStats())})}catch(e){res.status(502).json({clubs:[],players:[],error:String(e.message)})}});
app.get('/api/community',async(req,res)=>{try{res.set('Cache-Control','no-store');res.json({teams:await liveManagerRows()})}catch(e){res.status(500).json({teams:[],error:String(e.message)})}});
app.get('/api/baller-table',async(req,res)=>{try{const table=await liveManagerRows();res.set('Cache-Control','no-store');res.json({name:'UEFA Baller League',code:'BALLER',live:true,updated_at:new Date().toISOString(),table:table.map(x=>({...x,display_points:x.live_points}))})}catch(e){res.status(500).json({table:[],error:String(e.message)})}});
app.get('/api/club-table',async(req,res)=>{try{res.json({table:await standings()})}catch{res.status(502).json({table:[]})}});
app.use((req,res)=>res.sendFile(process.cwd()+'/public/index.html'));
const port=process.env.PORT||3000;
app.listen(port,()=>{console.log('FantasyX listening on '+port);warm()});
