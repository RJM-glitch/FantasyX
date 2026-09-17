const BOOT='https://fantasy.premierleague.com/api/bootstrap-static/';const MEM=new Map();
async function cached(key,url,ttl){const now=Date.now(),old=MEM.get(key);if(old?.data&&now-old.at<ttl)return old.data;if(old?.promise)return old.promise;const p=(async()=>{const r=await fetch(url,{headers:{Accept:'application/json'}});if(!r.ok)throw Error('feed unavailable');const data=await r.json();MEM.set(key,{data,at:Date.now()});return data})();MEM.set(key,{data:old?.data,at:old?.at||0,promise:p});try{return await p}finally{const cur=MEM.get(key);if(cur?.promise)MEM.set(key,{data:cur.data,at:cur.at})}}
export const getBoot=()=>cached('boot',BOOT,300000);
export function teams(d){return new Map(d.teams.map(t=>[t.id,{id:t.id,name:t.name,short:t.short_name,code:t.code,badge:`https://resources.premierleague.com/premierleague/badges/70/t${t.code}.png`}]))}

const MATCH_SLOTS=[
 {label:'9:30 AM – 10:20 AM',start:'09:30',end:'10:20'},
 {label:'11:10 AM – 12:00 PM',start:'11:10',end:'12:00'},
 {label:'12:00 PM – 12:50 PM',start:'12:00',end:'12:50'},
 {label:'12:50 PM – 1:40 PM',start:'12:50',end:'13:40'},
 {label:'1:40 PM – 2:30 PM',start:'13:40',end:'14:30'}
];

function ymd(d){return d.toISOString().slice(0,10)}
function addDays(date,n){const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return ymd(d)}
function gameweekDates(gw){if(Number(gw)===1)return ['2026-09-17','2026-09-18'];const monday=addDays('2026-09-21',(Number(gw)-2)*7);return [0,1,2,3,4].map(i=>addDays(monday,i))}
function scheduleFor(gw,count){const days=gameweekDates(gw),all=[];for(const date of days)for(const slot of MATCH_SLOTS)all.push({date,...slot});if(count<=1)return all.slice(0,count);return Array.from({length:count},(_,i)=>all[Math.round(i*(all.length-1)/(count-1))])}
function displayDate(date){const d=new Date(date+'T12:00:00+02:00');return new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Johannesburg',weekday:'short',day:'2-digit',month:'short'}).format(d)}
function mulberry32(a){return function(){let t=a+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
function hashSeed(...xs){let h=2166136261;for(const x of xs){for(const c of String(x)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}}return h>>>0}
function randomFixtures(teamList,gw){const rng=mulberry32(hashSeed('FantasyX',gw,'fixtures'));const arr=[...teamList];for(let i=arr.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]]}const out=[];for(let i=0;i<arr.length;i+=2){let home=arr[i],away=arr[i+1];if(rng()<.5)[home,away]=[away,home];out.push({id:`FX-${gw}-${i/2+1}`,team_h:home.id,team_a:away.id})}return out}
function scoreFor(f,gw){const rng=mulberry32(hashSeed('FantasyX',gw,f.team_h,f.team_a,'score'));const goals=()=>{const r=rng();if(r<.24)return 0;if(r<.55)return 1;if(r<.79)return 2;if(r<.93)return 3;if(r<.985)return 4;return 5};return[goals(),goals()]}
function liveStatus(date,start,end){const startMs=Date.parse(`${date}T${start}:00+02:00`),endMs=Date.parse(`${date}T${end}:00+02:00`),now=Date.now();if(now<startMs)return{status:'Upcoming',minute:0};if(now>=endMs)return{status:'FT',minute:90};return{status:'LIVE',minute:Math.max(1,Math.min(90,Math.floor(((now-startMs)/(endMs-startMs))*90)))}}

async function generatedWeek(gw){const d=await getBoot(),tm=teams(d),matches=randomFixtures([...tm.values()],Number(gw)),schedule=scheduleFor(gw,matches.length);return{tm,matches,schedule}}

export async function gameweek(gw=1){const {tm,matches,schedule}=await generatedWeek(gw);return matches.map((f,i)=>{const s=schedule[i],ls=liveStatus(s.date,s.start,s.end),final=scoreFor(f,gw),frac=ls.status==='LIVE'?ls.minute/90:ls.status==='FT'?1:0;return{id:f.id,gameweek:Number(gw),home:tm.get(f.team_h),away:tm.get(f.team_a),date:displayDate(s.date),dateISO:s.date,time:s.label,slotStart:s.start,slotEnd:s.end,kickoff:`${s.date}T${s.start}:00+02:00`,status:ls.status,minute:ls.minute,homeScore:Math.floor(final[0]*frac),awayScore:Math.floor(final[1]*frac),finalHomeScore:final[0],finalAwayScore:final[1],events:[],playerPoints:[],stats:{possession:[0,0],shots:[0,0],shotsOnTarget:[0,0],passes:[0,0],passAccuracy:[0,0],fouls:[0,0],yellowCards:[0,0],redCards:[0,0],offsides:[0,0],corners:[0,0]}}})}

export async function standings(){const d=await getBoot(),tm=teams(d),rows=new Map();for(const t of tm.values())rows.set(t.id,{team:t.name,short:t.short,logo:t.badge,played:0,wins:0,draws:0,losses:0,gf:0,ga:0,points:0});for(let gw=1;gw<=38;gw++){const matches=randomFixtures([...tm.values()],gw),schedule=scheduleFor(gw,matches.length);for(let i=0;i<matches.length;i++){const f=matches[i],s=schedule[i],ls=liveStatus(s.date,s.start,s.end);if(ls.status!=='FT')continue;const h=rows.get(f.team_h),a=rows.get(f.team_a),[hs,as]=scoreFor(f,gw);h.played++;a.played++;h.gf+=hs;h.ga+=as;a.gf+=as;a.ga+=hs;if(hs>as){h.wins++;a.losses++;h.points+=3}else if(hs<as){a.wins++;h.losses++;a.points+=3}else{h.draws++;a.draws++;h.points++;a.points++}}}return[...rows.values()].map(x=>({...x,gd:x.gf-x.ga})).sort((a,b)=>b.points-a.points||b.gd-a.gd||b.gf-a.gf||a.team.localeCompare(b.team)).map((x,i)=>({...x,rank:i+1}))}
export function warm(){getBoot().catch(()=>{})}