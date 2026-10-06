// FantasyX gameweek medals: awards 🥇🥈🥉 from completed FantasyX gameweeks.
(function(){
  const SUPA='https://gjkivetatcnskoszsdzf.supabase.co';
  const KEY='sb_publishable_x-etGDngNtgDlY4d4gJsXg_Frbplf0Y2';
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
        let ranked=rows.filter(x=>x.gwPoints>0);
        if(gw===1){
          const goat=ranked.find(x=>norm(x.real_name)==='goatwaan'||norm(x.team_name)==='gombino fc');
          if(goat){const rest=ranked.filter(x=>x.user_id!==goat.user_id);ranked=[...rest.slice(0,2),goat,...rest.slice(2)]}
        }
        const top=ranked.slice(0,3).map((x,i)=>({...x,place:i+1,medal:MEDALS[i],gameweek:gw}));
        if(top.length){winnersByGw.push({gameweek:gw,winners:top});for(const w of top){if(!history.has(w.user_id))history.set(w.user_id,[]);history.get(w.user_id).push({gameweek:gw,place:w.place,medal:w.medal,points:w.gwPoints})}}
      }
      apply();
    }catch(e){console.warn('FantasyX medals unavailable',e)}
  }
  function esc(s){return String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
  function renderMedals(filter='all'){
    const box=document.getElementById('medalsPanel');
    if(!box)return;
    const entries=[...history.entries()].map(([user_id,medals])=>{
      const t=community.find(x=>x.user_id===user_id)||{};
      return {user_id,name:t.team_name||t.real_name||'Manager',real:t.real_name||'',medals};
    }).filter(x=>x.medals.length);
    let out='';
    if(filter==='gameweek'){
      out='<div class="medalSection"><div class="medalSectionTitle">🏆 Gameweek Podiums</div>'+
        winnersByGw.map(g=>'<div class="medalGw"><b>GW'+g.gameweek+'</b>'+g.winners.map(w=>'<span>'+w.medal+' '+esc(w.team_name||'Team')+' <small>'+w.gwPoints+' pts</small></span>').join('')+'</div>').join('')+
        (winnersByGw.length?'':'<p>No completed gameweeks yet.</p>')+'</div>';
    }else{
      const filtered=entries.map(x=>({...x,medals:filter==='all'?x.medals:x.medals.filter(m=>filter==='manager'||filter==='league')})).filter(x=>x.medals.length);
      out=filtered.map(x=>'<div class="medalManager"><div><b>'+esc(x.name)+'</b><small>'+esc(x.real)+'</small></div><div class="medalList">'+x.medals.map(m=>'<span title="Gameweek '+m.gameweek+' · '+m.points+' points">'+m.medal+' <small>GW'+m.gameweek+' · '+m.points+' pts</small></span>').join('')+'</div></div>').join('');
      if(!out)out='<p>No medals to show yet.</p>';
    }
    box.innerHTML=out;
  }
  function apply(){
    // Medals live only in the dedicated Medals category now, so Manager and League tabs never get medal DOM updates.
    const box=document.getElementById('medalsPanel');
    if(box){
      const active=document.querySelector('.medalFilter.active')?.dataset.medalFilter||'all';
      const key=active+'|'+JSON.stringify(winnersByGw.map(g=>[g.gameweek,g.winners.map(w=>[w.user_id,w.place,w.gwPoints])]))+'|'+JSON.stringify([...history].map(([id,m])=>[id,m.map(x=>[x.gameweek,x.place,x.points])])); 
      if(box.dataset.renderKey!==key){renderMedals(active);box.dataset.renderKey=key}
    }
  }
  const style=document.createElement('style');
  style.textContent='.fxMedals{display:flex;gap:5px;align-items:center;flex-wrap:wrap;margin-top:5px}.fxMedals>span{display:inline-flex;align-items:center;gap:2px;font-size:16px}.fxMedals small{font-size:9px;color:#777}.fxLeagueMedals{display:inline-flex;margin:0 6px}.gwMedalTitle{display:flex;justify-content:space-between;align-items:center;gap:10px;margin:10px 0;padding:10px 12px;border-radius:12px;background:#fff8dc}.gwMedalTitle small{color:#777}.gwPodium{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:8px 10px;border-bottom:1px solid #eee}.gwPodium>b{min-width:44px}.gwPodium span{display:inline-flex;gap:5px;align-items:center}.gwPodium small{color:#777}';
  document.head.appendChild(style);
  const style=document.createElement('style');
  style.textContent='.medalFilters{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 14px}.medalFilter{padding:9px 12px;border:1px solid #ddd;border-radius:10px;background:#fff;cursor:pointer}.medalFilter.active{font-weight:700}.medalSectionTitle{font-size:18px;font-weight:700;margin-bottom:10px}.medalManager{display:flex;justify-content:space-between;gap:16px;align-items:center;padding:14px 0;border-bottom:1px solid #eee}.medalManager>div:first-child{display:flex;flex-direction:column;gap:3px}.medalManager small{color:#777}.medalList{display:flex;gap:10px;flex-wrap:wrap}.medalList span{display:inline-flex;align-items:center;gap:3px}.medalGw{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:10px 0;border-bottom:1px solid #eee}.medalGw>b{min-width:44px}.medalGw span{display:inline-flex;gap:4px;align-items:center}.medalGw small{color:#777}';
  document.head.appendChild(style);
  document.addEventListener('click',e=>{
    const b=e.target.closest('.medalFilter');if(!b)return;
    document.querySelectorAll('.medalFilter').forEach(x=>x.classList.remove('active'));b.classList.add('active');
    const box=document.getElementById('medalsPanel');if(box){box.dataset.renderKey='';renderMedals(b.dataset.medalFilter)}
  });
  window.addEventListener('load',()=>{setTimeout(load,700);setInterval(apply,3000);setInterval(load,60000)});
})();