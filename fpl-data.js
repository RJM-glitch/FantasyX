const BOOT='https://fantasy.premierleague.com/api/bootstrap-static/';
const FIXTURES_URL='https://fantasy.premierleague.com/api/fixtures/';
const MEM=new Map();

async function cached(key,url,ttl=300000){
  const now=Date.now(),old=MEM.get(key);
  if(old?.data&&now-old.at<ttl)return old.data;
  if(old?.promise)return old.promise;
  const promise=(async()=>{
    const response=await fetch(url,{headers:{Accept:'application/json'}});
    if(!response.ok)throw Error('Premier League feed unavailable ('+response.status+').');
    const data=await response.json();
    MEM.set(key,{data,at:Date.now()});
    return data;
  })();
  MEM.set(key,{data:old?.data,at:old?.at||0,promise});
  try{return await promise}finally{
    const current=MEM.get(key);
    if(current?.promise)MEM.set(key,{data:current.data,at:current.at});
  }
}

export const getBoot=()=>cached('boot',BOOT,300000);
const getFixtures=()=>cached('fixtures',FIXTURES_URL,60000);

export function teams(data){
  return new Map((data.teams||[]).map(team=>[team.id,{
    id:team.id,name:team.name,short:team.short_name,code:team.code,
    badge:`https://resources.premierleague.com/premierleague/badges/70/t${team.code}.png`
  }]));
}

function formatKickoff(value){
  if(!value)return{date:'TBD',time:'Kick-off to be confirmed',dateISO:null,slotStart:null,slotEnd:null};
  const date=new Date(value);
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Johannesburg',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
  const day=new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Johannesburg',weekday:'short',day:'2-digit',month:'short'}).format(date);
  const time=new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Johannesburg',hour:'2-digit',minute:'2-digit',hour12:false}).format(date);
  return{date:day,time,dateISO:parts,slotStart:time,slotEnd:time};
}

function matchStatus(f){
  if(f.finished)return{status:'FT',minute:90};
  if(f.started){
    const elapsed=f.kickoff_time?Math.floor((Date.now()-Date.parse(f.kickoff_time))/60000):0;
    return{status:'LIVE',minute:Math.max(1,Math.min(90,Number(f.minutes)||elapsed))};
  }
  return{status:'Upcoming',minute:0};
}

function actualStats(f){
  const stats={shots:[0,0],shotsOnTarget:[0,0],possession:[0,0],fouls:[0,0],yellowCards:[0,0],redCards:[0,0],offsides:[0,0],corners:[0,0]};
  for(const group of f.stats||[]){
    const key=({yellow_cards:'yellowCards',red_cards:'redCards'})[group.identifier];
    if(!key)continue;
    for(const entry of group.h||[])stats[key][0]+=Number(entry.value)||0;
    for(const entry of group.a||[])stats[key][1]+=Number(entry.value)||0;
  }
  return stats;
}

function mapFixture(f,teamMap){
  const kickoff=formatKickoff(f.kickoff_time);
  const live=matchStatus(f);
  const home=teamMap.get(Number(f.team_h));
  const away=teamMap.get(Number(f.team_a));
  if(!home||!away)return null;
  const homeScore=f.team_h_score===null?null:Number(f.team_h_score);
  const awayScore=f.team_a_score===null?null:Number(f.team_a_score);
  return{
    id:f.id,gameweek:Number(f.event)||null,home,away,...kickoff,
    kickoff:f.kickoff_time||null,status:live.status,minute:live.minute,
    homeScore,awayScore,finalHomeScore:f.finished?homeScore:null,finalAwayScore:f.finished?awayScore:null,
    stats:actualStats(f),events:[],playerPoints:[],started:Boolean(f.started),finished:Boolean(f.finished)
  };
}

export async function gameweek(gw=1){
  const [boot,allFixtures]=await Promise.all([getBoot(),getFixtures()]);
  const teamMap=teams(boot);
  return allFixtures
    .filter(f=>Number(f.event)===Number(gw))
    .map(f=>mapFixture(f,teamMap))
    .filter(Boolean)
    .sort((a,b)=>String(a.kickoff||'').localeCompare(String(b.kickoff||''))||Number(a.id)-Number(b.id));
}

export async function standings(){
  const [boot,fixtures]=await Promise.all([getBoot(),getFixtures()]);
  const teamMap=teams(boot),rows=new Map();
  for(const team of teamMap.values())rows.set(team.id,{
    team:team.name,short:team.short,logo:team.badge,played:0,wins:0,draws:0,losses:0,gf:0,ga:0,points:0
  });
  for(const fixture of fixtures){
    if(!fixture.finished||fixture.team_h_score===null||fixture.team_a_score===null)continue;
    const home=rows.get(Number(fixture.team_h)),away=rows.get(Number(fixture.team_a));
    if(!home||!away)continue;
    const hs=Number(fixture.team_h_score),as=Number(fixture.team_a_score);
    home.played++;away.played++;home.gf+=hs;home.ga+=as;away.gf+=as;away.ga+=hs;
    if(hs>as){home.wins++;away.losses++;home.points+=3}
    else if(hs<as){away.wins++;home.losses++;away.points+=3}
    else{home.draws++;away.draws++;home.points++;away.points++}
  }
  return [...rows.values()]
    .map(team=>({...team,gd:team.gf-team.ga}))
    .sort((a,b)=>b.points-a.points||b.gd-a.gd||b.gf-a.gf||a.team.localeCompare(b.team))
    .map((team,index)=>({...team,rank:index+1}));
}

export function warm(){
  getBoot().catch(()=>{});
  getFixtures().catch(()=>{});
}
