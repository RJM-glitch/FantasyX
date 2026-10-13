const BOOT='https://fantasy.premierleague.com/api/bootstrap-static/';
const FIXTURES_URL='https://fantasy.premierleague.com/api/fixtures/';
const MEM=new Map();
const USER_AGENT='FantasyX/1.0 (+https://fantasyx.onrender.com)';

async function cached(key,url,ttl=300000){
  const now=Date.now(),old=MEM.get(key);
  if(old?.data&&now-old.at<ttl)return old.data;
  if(old?.promise)return old.promise;
  if(old?.data&&old.retryAt&&now<old.retryAt)return old.data;

  const previous=old?.data,previousAt=old?.at||0;
  const promise=(async()=>{
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),15000);
    try{
      const response=await fetch(url,{
        headers:{Accept:'application/json','User-Agent':USER_AGENT},
        signal:controller.signal
      });
      if(!response.ok)throw Error('Premier League feed unavailable ('+response.status+').');
      const data=await response.json();
      MEM.set(key,{data,at:Date.now(),retryAt:0});
      return data;
    }catch(error){
      if(previous!==undefined){
        MEM.set(key,{data:previous,at:previousAt,retryAt:Date.now()+30000});
        return previous;
      }
      throw error;
    }finally{
      clearTimeout(timeout);
      const current=MEM.get(key);
      if(current?.promise)MEM.set(key,{data:current.data,at:current.at,retryAt:current.retryAt||0});
    }
  })();
  MEM.set(key,{data:previous,at:previousAt,promise,retryAt:old?.retryAt||0});
  try{return await promise}finally{
    const current=MEM.get(key);
    if(current?.promise)MEM.set(key,{data:current.data,at:current.at,retryAt:current.retryAt||0});
  }
}

export const getBoot=()=>cached('boot',BOOT,300000);
const getFixtures=()=>cached('fixtures',FIXTURES_URL,60000);

function badgeFallback(team){
  const short=String(team.short_name||team.name||'FC').slice(0,3).toUpperCase().replace(/[^A-Z0-9]/g,'')||'FC';
  const hue=(Number(team.code)||Number(team.id)||1)*47%360;
  const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><path d="M40 3 72 15v25c0 18-13 30-32 37C21 70 8 58 8 40V15z" fill="hsl('+hue+',55%,35%)" stroke="#ffffff" stroke-width="3"/><text x="40" y="45" text-anchor="middle" font-family="Arial,sans-serif" font-size="'+(short.length>2?21:26)+'" font-weight="700" fill="#fff">'+short+'</text></svg>';
  return 'data:image/svg+xml;charset=UTF-8,'+encodeURIComponent(svg);
}

export function teams(data){
  return new Map((data.teams||[]).map(team=>[team.id,{
    id:team.id,name:team.name,short:team.short_name,code:team.code,
    badge:team.code?('https://resources.premierleague.com/premierleague/badges/70/t'+team.code+'.png'):badgeFallback(team),
    badgeFallback:badgeFallback(team)
  }]));
}

function formatKickoff(value){
  if(!value)return{date:'TBD',time:'Kick-off to be confirmed',dateISO:null,slotStart:null,slotEnd:null};
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))return{date:'TBD',time:'Kick-off to be confirmed',dateISO:null,slotStart:null,slotEnd:null};
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
  const stats={shots:null,shotsOnTarget:null,possession:null,fouls:null,yellowCards:null,redCards:null,offsides:null,corners:null};
  for(const group of f.stats||[]){
    const key=({yellow_cards:'yellowCards',red_cards:'redCards'})[group.identifier];
    if(!key)continue;
    if(stats[key]===null)stats[key]=[0,0];
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
  const stats=actualStats(f);
  return{
    id:f.id,gameweek:Number(f.event)||null,home,away,...kickoff,
    kickoff:f.kickoff_time||null,status:live.status,minute:live.minute,
    homeScore,awayScore,finalHomeScore:f.finished?homeScore:null,finalAwayScore:f.finished?awayScore:null,
    stats,statsAvailable:stats.yellowCards!==null||stats.redCards!==null,
    events:[],playerPoints:[],started:Boolean(f.started),finished:Boolean(f.finished)
  };
}

export async function gameweek(gw=1){
  const [boot,allFixtures]=await Promise.all([getBoot(),getFixtures()]);
  const teamMap=teams(boot);
  return allFixtures
    .filter(f=>f.event!==null&&f.event!==undefined&&Number(f.event)===Number(gw))
    .map(f=>mapFixture(f,teamMap))
    .filter(Boolean)
    .sort((a,b)=>String(a.kickoff||'').localeCompare(String(b.kickoff||''))||Number(a.id)-Number(b.id));
}

export async function standings(){
  const [boot,fixtures]=await Promise.all([getBoot(),getFixtures()]);
  const teamMap=teams(boot),rows=new Map();
  for(const team of teamMap.values())rows.set(team.id,{
    team:team.name,short:team.short,logo:team.badge,badgeFallback:team.badgeFallback,
    played:0,wins:0,draws:0,losses:0,gf:0,ga:0,points:0
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
