const STRATEGIES=[["The Safe One","Balanced picks, low-risk captain choices."],["Haaland Banker","Builds around premium forwards and a trusted captain."],["Fixture Hunter","Targets teams with the best upcoming fixtures."],["Form Merchant","Chases recent points and hot streaks."],["Differential Hunter","Avoids obvious picks to climb the rankings."],["Budget Master","Finds value players and protects the budget."],["Defender","Prioritises defenders and clean-sheet potential."],["Midfield FC","Loads up on creative midfielders."],["Captain Chaos","Makes aggressive captain calls."],["Early Adopter","Moves early when players rise."],["Template Breaker","Deliberately avoids template combinations."],["Data Nerd","Uses points, price and availability signals."],["Fixture Gambler","Takes big swings on fixture runs."],["Premium Stack","Spends heavily on elite players."],["Bench Boss","Keeps a deep bench."],["Wildcard Brain","Reshapes the squad aggressively."],["Set Piece FC","Targets dead-ball threats."],["Differential King","Hunts low-owned upside."],["Momentum","Follows the strongest scorers."],["Chaos United","Unpredictable but budget legal."]];const NAMES=["Alex FC","Tactical Tim","Goal Machine","The Professor","Captain Chaos","North Londoner","FPL Shark","The Analyst","Wildcard FC","Box-to-Box","Clean Sheet Co","Stat Padder","Bench Boost","Deadline Dave","The Scout","Value Hunters","Top Bin","Pressing FC","Late Bloomer","Fantasy King"];let players=[],userSquad=[],bots=[],gameweek=1,latestCompletedGw=0,started=false;const $=s=>document.querySelector(s);function hash(s){let h=2166136261;for(const c of String(s)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}function makeBot(i){const [strategy,desc]=STRATEGIES[i],seed=i+17;return{name:NAMES[i],strategy,desc,seed,total:0,gw:0,squad:[],captain:null,score:p=>{let v=Number(p.totalPoints||0)*1.5-Number(p.price||0)*.15;if(strategy.includes("Differential"))v+=hash(p.name+seed)%80;if(strategy.includes("Premium"))v+=Number(p.price||0)*1.2;if(strategy.includes("Budget"))v-=Number(p.price||0)*.45;if(strategy.includes("Defender")&&p.pos==="DEF")v+=25;if(strategy.includes("Midfield")&&p.pos==="MID")v+=25;if(strategy.includes("Haaland")&&p.pos==="FWD")v+=20;if(strategy.includes("Form")||strategy.includes("Momentum"))v+=Number(p.totalPoints||0)*.8;return v+hash(p.id+":"+seed)%35}}}function startingXI(squad){
 return [...squad.filter(p=>p.pos==="GK").slice(0,1),...squad.filter(p=>p.pos==="DEF").slice(0,3),...squad.filter(p=>p.pos==="MID").slice(0,4),...squad.filter(p=>p.pos==="FWD").slice(0,3)];
}
function minCostCompletion(remaining,chosen,clubCounts){
 const ids=new Set(chosen.map(p=>Number(p.id))),clubs={...clubCounts};let cost=0;
 for(const pos of remaining){
  const p=[...players].filter(x=>x.pos===pos&&!ids.has(Number(x.id))&&(clubs[x.club]||0)<3)
   .sort((a,b)=>Number(a.price)-Number(b.price))[0];
  if(!p)return Infinity;
  ids.add(Number(p.id));clubs[p.club]=(clubs[p.club]||0)+1;cost+=Number(p.price)||0;
 }
 return cost;
}
function draft(bot){
 const slots=["GK","GK",..."DEF DEF DEF DEF DEF".split(" "),..."MID MID MID MID MID".split(" "),..."FWD FWD FWD".split(" ")];
 const chosen=[],used={},ids=new Set();let budget=100;
 for(let i=0;i<slots.length;i++){
  const pos=slots[i],remaining=slots.slice(i+1);
  const candidates=players.filter(p=>p.pos===pos&&!ids.has(Number(p.id))&&Number(p.price)<=budget&&(used[p.club]||0)<3);
  candidates.sort((a,b)=>bot.score(b)-bot.score(a));
  const feasible=candidates.filter(p=>{
   const nextUsed={...used,[p.club]:(used[p.club]||0)+1};
   return budget-Number(p.price)>=minCostCompletion(remaining,[...chosen,p],nextUsed);
  });
  const pool=feasible.length?feasible:candidates.sort((a,b)=>Number(a.price)-Number(b.price));
  if(!pool.length)continue;
  const top=pool.slice(0,Math.min(3,pool.length));
  const p=top[hash(bot.seed+":"+pos+":"+i)%top.length];
  chosen.push(p);ids.add(Number(p.id));budget-=Number(p.price);used[p.club]=(used[p.club]||0)+1;
 }
 bot.squad=chosen;
 const xi=startingXI(chosen);
 bot.captain=[...xi.filter(p=>p.pos!=="GK")].sort((a,b)=>bot.score(b)-bot.score(a))[0]||null;
 bot.vice=[...xi.filter(p=>p.pos!=="GK"&&p.id!==bot.captain?.id)].sort((a,b)=>bot.score(b)-bot.score(a))[0]||null;
 return bot;
}
async function ensureUser(){
 try{
  const r=await fetch("/api/account/squad");
  if(!r.ok)throw Error("Sign in to load your saved squad.");
  const data=await r.json(),names=new Map(players.map(p=>[Number(p.id),p]));
  userSquad=(data.squad||[]).map(row=>{
   const id=Number(row.player_id??row.id),p=names.get(id);
   return p?{...p,player_id:id,is_captain:Boolean(row.is_captain??row.cap),is_vice:Boolean(row.is_vice??row.vice),is_bench:(row.is_bench??row.bench)}:null;
  }).filter(Boolean);
 }catch{userSquad=[]}
 $("#userName").textContent=userSquad.length?"Your FantasyX team":"No saved squad yet";
 $("#userTeam").textContent=userSquad.length?userSquad.slice(0,3).map(x=>x.name).join(", ")+(userSquad.length>3?"…":""):"Sign in and create a squad on FantasyX first";
 return userSquad;
}
function scoreManager(squad,data,bot=null){
 const playersById=new Map((data.players||[]).map(p=>[Number(p.id),p]));
 let rows=(Array.isArray(squad)?squad:[]).map(p=>({...p,id:Number(p.id??p.player_id),pos:p.pos??p.position}));
 if(bot){
  const xi=startingXI(rows),starterIds=new Set(xi.map(p=>Number(p.id)));
  rows=rows.map(p=>({...p,is_bench:!starterIds.has(Number(p.id)),is_captain:Number(p.id)===Number(bot.captain?.id),is_vice:Number(p.id)===Number(bot.vice?.id)}));
 }else if(rows.length===15&&!rows.some(p=>p.is_bench!==undefined||p.bench!==undefined)){
  const xi=startingXI(rows),starterIds=new Set(xi.map(p=>Number(p.id)));
  rows=rows.map(p=>({...p,is_bench:!starterIds.has(Number(p.id))}));
 }
 const starters=rows.filter(p=>!Boolean(p.is_bench??p.bench)),bench=rows.filter(p=>Boolean(p.is_bench??p.bench));
 if(starters.length!==11||bench.length!==4)return 0;
 const active=new Set(starters.map(p=>Number(p.id))),used=new Set(),counts={GK:0,DEF:0,MID:0,FWD:0};
 for(const p of starters)if(counts[p.pos]!==undefined)counts[p.pos]++;
 for(const out of starters){
  const id=Number(out.id),stat=playersById.get(id)||{};
  if(Number(stat.minutes||0)>0)continue;
  const pos=out.pos;let replacement=null;
  for(const candidate of bench){
   const cid=Number(candidate.id),cp=candidate.pos,cs=playersById.get(cid)||{};
   if(used.has(cid)||Number(cs.minutes||0)<=0)continue;
   if(pos==="GK"&&cp!=="GK")continue;
   if(pos!=="GK"&&cp==="GK")continue;
   if(pos!=="GK"){
    const next={...counts};next[pos]=Math.max(0,(next[pos]||0)-1);next[cp]=(next[cp]||0)+1;
    if(next.DEF<3||next.MID<2||next.FWD<1)continue;
   }
   replacement=candidate;break;
  }
  if(replacement){
   const rid=Number(replacement.id),rp=replacement.pos;
   active.delete(id);active.add(rid);used.add(rid);
   counts[pos]=Math.max(0,(counts[pos]||0)-1);counts[rp]=(counts[rp]||0)+1;
  }
 }
 const captain=rows.find(p=>Boolean(p.is_captain??p.cap)),vice=rows.find(p=>Boolean(p.is_vice??p.vice));
 const played=id=>Number(playersById.get(Number(id))?.minutes||0)>0;
 const captainId=captain&&active.has(Number(captain.id))&&played(captain.id)?Number(captain.id)
  :vice&&active.has(Number(vice.id))&&played(vice.id)?Number(vice.id):null;
 let total=0;
 for(const p of rows){const id=Number(p.id);if(!active.has(id))continue;const points=Number(playersById.get(id)?.points||0);total+=points*(id===captainId?2:1)}
 return total;
}
function render(){
 const rows=[{name:"You",strategy:"Human manager",total:window.userTotal||0,gw:window.userGw||0,captain:userSquad.find(x=>x.is_captain)||null,you:true},...bots]
  .sort((a,b)=>b.total-a.total);
 $("#standings").innerHTML=rows.map((x,i)=>'<tr class="'+(x.you?"you":"")+'"><td class="rank">'+(i<3?["🥇","🥈","🥉"][i]:i+1)+'</td><td class="manager">'+x.name+'</td><td class="strategy">'+x.strategy+'</td><td class="points">'+(x.gw||0)+'</td><td class="points">'+(x.total||0)+'</td><td class="captain">'+(x.captain?.name||"—")+'</td></tr>').join("");
 $("#gw").textContent=gameweek<=38?gameweek:"—";
 $("#gwState").textContent=gameweek>38?"Season complete":started?"Waiting for official results":"Pre-season";
 $("#bots").innerHTML=bots.map(b=>'<div class="bot"><div class="bot-top"><b>🤖 '+b.name+'</b><span class="badge">'+b.strategy+'</span></div><p>'+b.desc+'</p></div>').join("");
 $("#nextGw").disabled=gameweek>38;
}
async function start(){
 if(started)return;
 started=true;$("#startBtn").disabled=true;$("#message").textContent="Drafting 20 AI squads…";
 bots=STRATEGIES.map((_,i)=>draft(makeBot(i)));
 window.userTotal=0;window.userGw=0;gameweek=Math.min(39,latestCompletedGw+1);
 $("#league").classList.remove("hidden");$("#details").classList.remove("hidden");render();
 $("#message").textContent=gameweek>38?"The current FPL season is complete.":"League created. Scores will use official FPL results once each gameweek is complete.";
}
async function nextGameweek(){
 if(!started||gameweek>38)return;
 $("#nextGw").disabled=true;$("#nextGw").textContent="Checking official results…";
 try{
  const response=await fetch("/api/gameweek-player-points?gw="+gameweek);
  if(!response.ok)throw Error("Official FPL points are unavailable.");
  const data=await response.json();
  if(!data.complete){$("#message").textContent="Gameweek "+gameweek+" is not officially complete yet. No scores have been changed.";return}
  for(const bot of bots){bot.gw=scoreManager(bot.squad,data,bot);bot.total+=bot.gw}
  window.userGw=scoreManager(userSquad,data);window.userTotal+=window.userGw;
  const scored=gameweek;gameweek=Math.min(39,gameweek+1);render();
  $("#message").textContent="Gameweek "+scored+" scored from official FPL points.";
 }catch(e){$("#message").textContent=e.message||"Could not load official FPL points."}
 finally{$("#nextGw").disabled=gameweek>38;$("#nextGw").textContent=gameweek>38?"Season complete":"Simulate next GW"}
}
async function boot(){
 try{
  const [playersResponse,metaResponse]=await Promise.all([fetch("/api/players"),fetch("/api/gameweek")]);
  if(!playersResponse.ok)throw Error("Could not load official player data.");
  const data=await playersResponse.json();players=data.players||[];
  if(metaResponse.ok){const meta=await metaResponse.json();latestCompletedGw=Number(meta.latestCompletedGameweek)||0}
  gameweek=Math.min(39,latestCompletedGw+1);
  await ensureUser();$("#status").textContent="DATA READY";
  $("#message").textContent=players.length?"Official player data loaded.":"Could not load player data.";
 }catch{$("#status").textContent="ERROR";$("#message").textContent="Could not load official FPL data. Try refreshing."}
}
$("#startBtn").onclick=start;$("#nextGw").onclick=nextGameweek;boot();