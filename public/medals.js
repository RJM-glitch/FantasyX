// FantasyX gameweek medals: awards 🥇🥈🥉 from completed FantasyX gameweeks.
(function(){
  const SUPA='https://gjkivetatcnskoszsdzf.supabase.co';
  const KEY='sb_publishable_x-etGDngNtgDlY4d4gJsXg_FrbplfY2';
  const MEDALS=['🥇','🥈','🥉'];
  const POS={GK:1,DEF:2,MID:3,FWD:4};
  let history=new Map(),winnersByGw=[],community=[];
  const norm=s=>String(s||'').trim().toLowerCase();
  function h32(...xs){let h=2166136261;for(const x of xs)for(const c of String(x)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
  function pointsForSnapshot(p,f){if(!f||f.status==='Upcoming')return 0;const min=f.status==='FT'?90:Number(f.minute||0),id=Number(p.player_id??p.id),pos=POS[String(p.position||p.pos||'').toUpperCase()]||3,seed=h32('FXPTS',id,f.id),club=String(p.club||'').toUpperCase();let pts=min>=1?1:0;if(min>=60)pts++;if(min>=25&&seed%11===0)pts+=pos===4?4:pos===3?5:6;if(min>=40&&seed%13===0)pts+=3;const home=String(f.home?.short||'').toUpperCase()===club,conceded=home?Number(f.awayScore||0):Number(f.homeScore||0);if(min>=60&&(pos===1||pos===2)&&conceded===0)pts+=4;if(min>=70&&seed%7===0)pts++;if(min>=85&&seed%17===0)pts+=2;return pts}
  function pickSnapshot(rows,gw){return rows.filter(x=>Number(x.gameweek)<=gw).sort((a,b)=>Number(b.gameweek)-Number(a.gameweek))[0]||null}
  function scoreSquad(squad,fixtureByClub){let total=0;for(const x of (Array.isArray(squad)?squad:[])){const f=fixtureByClub.get(String(x.club||'').toUpperCase());const base=pointsForSnapshot(x,f),bench=Boolean(x.is_bench??x.bench),cap=Boolean(x.is_captain??x.cap);total+=bench?0:base*(cap?2:1)}return total}
  async function load(){
    try{
      const [cr,sr]=await Promise.all([
        fetch('/api/community?t='+Date.now(),{cache:'no-store'}),
        fetch(SUPA+'/rest/v1/rpc/fx_public_gameweek_squads',{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+KEY,'Content-Type':'application/json'},body:'{}',cache:'no-store'})
      ]);
      if(!cr.ok||!sr.ok)throw Error('Medal data request failed');
      community=(await cr.json()).teams||[];
      const snaps=await sr.json(),byUser=new Map();
      for(const s of (snaps||[])){if(!byUser.has(s.user_id))byUser.set(s.user_id,[]);byUser.get(s.user_id).push(s)}
      history=new Map();winnersByGw=[];
      for(let gw=1;gw<=38;gw++){
        const fr=await fetch('/api/fixtures?gw='+gw+'&t='+Date.now(),{cache:'no-store'});if(!fr.ok)break;const fixtures=(await fr.json()).fixtures||[];if(!fixtures.length||fixtures.some(f=>f.status!=='FT'))break;
        const fixtureByClub=new Map();for(const f of fixtures){fixtureByClub.set(String(f.home?.short||'').toUpperCase(),f);fixtureByClub.set(String(f.away?.short||'').toUpperCase(),f)}
        const rows=community.map(t=>{const snap=pickSnapshot(byUser.get(t.user_id)||[],gw);return{...t,gwPoints:snap?scoreSquad(snap.squad,fixtureByClub):0}}).filter(x=>norm(x.team_name)!=='my xi'||String(x.real_name||'').trim());
        rows.sort((a,b)=>b.gwPoints-a.gwPoints||String(a.team_name||'').localeCompare(String(b.team_name||'')));
        const top=rows.filter(x=>x.gwPoints>0).slice(0,3).map((x,i)=>({...x,place:i+1,medal:MEDALS[i],gameweek:gw}));
        if(top.length){winnersByGw.push({gameweek:gw,winners:top});for(const w of top){if(!history.has(w.user_id))history.set(w.user_id,[]);history.get(w.user_id).push({gameweek:gw,place:w.place,medal:w.medal,points:w.gwPoints})}}
      }
      apply();
    }catch(e){console.warn('FantasyX medals unavailable',e)}
  }
  function medalsHTML(userId){const m=history.get(userId)||[];return m.length?`<span class="fxMedals" title="Gameweek medals">${m.map(x=>`<span title="GW${x.gameweek}: ${x.points} pts">${x.medal}<small>GW${x.gameweek}</small></span>`).join('')}</span>`:''}
  function apply(){
    document.querySelectorAll('.managerCard').forEach((card,i)=>{const t=community[i];if(!t)return;card.querySelector('.fxMedals')?.remove();const host=card.querySelector('.managerIdentityText');if(host)host.insertAdjacentHTML('beforeend',medalsHTML(t.user_id))});
    const rows=[...document.querySelectorAll('.leagueManagerRow')];for(const row of rows){const team=norm(row.querySelector('strong')?.textContent),t=community.find(x=>norm(x.team_name)===team);if(!t)continue;row.querySelector('.fxLeagueMedals')?.remove();const html=medalsHTML(t.user_id).replace('class="fxMedals"','class="fxMedals fxLeagueMedals"');if(html)row.querySelector('strong')?.insertAdjacentHTML('afterend',html)}
    const table=document.getElementById('ballerTable');if(table&&winnersByGw.length){let box=document.getElementById('gwMedalHistory');if(!box){box=document.createElement('div');box.id='gwMedalHistory';table.parentElement?.insertBefore(box,table)}box.innerHTML='<div class="gwMedalTitle"><b>🏅 Gameweek medals</b><small>Top 3 each completed gameweek</small></div>'+winnersByGw.map(g=>`<div class="gwPodium"><b>GW${g.gameweek}</b>${g.winners.map(w=>`<span>${w.medal} ${String(w.team_name||'Team')} <small>${w.gwPoints} pts</small></span>`).join('')}</div>`).join('')}
  }
  const style=document.createElement('style');style.textContent='.fxMedals{display:flex;gap:5px;align-items:center;flex-wrap:wrap;margin-top:5px}.fxMedals>span{display:inline-flex;align-items:center;gap:2px;font-size:16px}.fxMedals small{font-size:9px;color:#777}.fxLeagueMedals{display:inline-flex;margin:0 6px}.gwMedalTitle{display:flex;justify-content:space-between;align-items:center;gap:10px;margin:10px 0;padding:10px 12px;border-radius:12px;background:#fff8dc}.gwMedalTitle small{color:#777}.gwPodium{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:8px 10px;border-bottom:1px solid #eee}.gwPodium>b{min-width:44px}.gwPodium span{display:inline-flex;gap:5px;align-items:center}.gwPodium small{color:#777}';document.head.appendChild(style);
  window.addEventListener('load',()=>{setTimeout(load,700);setInterval(apply,3000);setInterval(load,60000)});
})();