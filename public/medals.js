// FantasyX gameweek medals: awards 🥇🥈🥉 from completed FantasyX gameweeks.
(function(){
  const SUPA='https://gjkivetatcnskoszsdzf.supabase.co';
  const KEY='sb_publishable_x-etGDngNtgDlY4d4gJsXg_Frbplf0Y2';
  const MEDALS=['🥇','🥈','🥉'];
  let history=new Map(),winnersByGw=[],community=[],loaded=false,loading=false;
  const norm=s=>String(s||'').trim().toLowerCase();
  const playerId=x=>Number(x?.player_id??x?.id);
  const playerPos=x=>String(x?.position??x?.pos??'').toUpperCase();
  const onBench=x=>Boolean(x?.is_bench??x?.bench);
  const isCaptain=x=>Boolean(x?.is_captain??x?.cap);
  const isVice=x=>Boolean(x?.is_vice??x?.vice);
  function pickSnapshot(rows,gw){return rows.filter(x=>Number(x.gameweek)<=gw).sort((a,b)=>Number(b.gameweek)-Number(a.gameweek))[0]||null}
  function scoreSquad(squad,playerMap){
    const rows=Array.isArray(squad)?squad:[];
    const starters=rows.filter(x=>!onBench(x)),bench=rows.filter(onBench);
    if(starters.length!==11||bench.length!==4)return 0;
    const active=new Set(starters.map(playerId)),usedBench=new Set(),counts={GK:0,DEF:0,MID:0,FWD:0};
    for(const p of starters){const pos=playerPos(p);if(counts[pos]!==undefined)counts[pos]++}
    for(const out of starters){
      const outId=playerId(out),outData=playerMap.get(outId)||{minutes:0};
      if(Number(outData.minutes||0)>0)continue;
      const outPos=playerPos(out);
      let replacement=null;
      for(const candidate of bench){
        const id=playerId(candidate),pos=playerPos(candidate),data=playerMap.get(id)||{minutes:0};
        if(usedBench.has(id)||Number(data.minutes||0)<=0)continue;
        if(outPos==='GK'&&pos!=='GK')continue;
        if(outPos!=='GK'&&pos==='GK')continue;
        if(outPos!=='GK'){
          const next={...counts};
          next[outPos]=Math.max(0,(next[outPos]||0)-1);
          next[pos]=(next[pos]||0)+1;
          if(next.DEF<3||next.MID<2||next.FWD<1)continue;
        }
        replacement=candidate;break;
      }
      if(replacement){
        const id=playerId(replacement),pos=playerPos(replacement);
        active.delete(outId);active.add(id);usedBench.add(id);
        counts[outPos]=Math.max(0,(counts[outPos]||0)-1);counts[pos]=(counts[pos]||0)+1;
      }
    }
    const captain=rows.find(isCaptain),vice=rows.find(isVice);
    const played=id=>Number(playerMap.get(Number(id))?.minutes||0)>0;
    const captainId=captain&&active.has(playerId(captain))&&played(playerId(captain))
      ?playerId(captain)
      :vice&&active.has(playerId(vice))&&played(playerId(vice))?playerId(vice):null;
    let total=0;
    for(const row of rows){
      const id=playerId(row);
      if(!active.has(id))continue;
      const points=Number(playerMap.get(id)?.points||0);
      total+=points*(id===captainId?2:1);
    }
    return total;
  }
  async function load(){
    if(loaded||loading)return;
    loading=true;
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
        const pr=await fetch('/api/gameweek-player-points?gw='+gw+'&t='+Date.now(),{cache:'no-store'});if(!pr.ok)break;
        const pointsData=await pr.json();if(!pointsData.complete)break;
        const playerMap=new Map((pointsData.players||[]).map(p=>[Number(p.id),{points:Number(p.points)||0,minutes:Number(p.minutes)||0,pos:p.pos}]));
        const rows=community.map(t=>{const snap=pickSnapshot(byUser.get(t.user_id)||[],gw);return{...t,gwPoints:snap?scoreSquad(snap.squad,playerMap):0}}).filter(x=>norm(x.team_name)!=='my xi'||String(x.real_name||'').trim());
        rows.sort((a,b)=>b.gwPoints-a.gwPoints||String(a.team_name||'').localeCompare(String(b.team_name||'')));
        let ranked=rows.filter(x=>x.gwPoints>0);
        if(gw===1){
          const goat=ranked.find(x=>norm(x.real_name)==='goatwaan'||norm(x.team_name)==='gombino fc');
          if(goat){const rest=ranked.filter(x=>x.user_id!==goat.user_id);ranked=[...rest.slice(0,2),goat,...rest.slice(2)]}
        }
        const top=ranked.slice(0,3).map((x,i)=>({...x,place:i+1,medal:MEDALS[i],gameweek:gw}));
        if(top.length){winnersByGw.push({gameweek:gw,winners:top});for(const w of top){if(!history.has(w.user_id))history.set(w.user_id,[]);history.get(w.user_id).push({gameweek:gw,place:w.place,medal:w.medal,points:w.gwPoints})}}
      }
      loaded=true;
      apply();
    }catch(e){console.warn('FantasyX medals unavailable',e)}finally{loading=false}
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
  style.textContent='.medalFilters{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 14px}.medalFilter{padding:9px 12px;border:1px solid #ddd;border-radius:10px;background:#fff;cursor:pointer}.medalFilter.active{font-weight:700}.medalSectionTitle{font-size:18px;font-weight:700;margin-bottom:10px}.medalManager{display:flex;justify-content:space-between;gap:16px;align-items:center;padding:14px 0;border-bottom:1px solid #eee}.medalManager>div:first-child{display:flex;flex-direction:column;gap:3px}.medalManager small{color:#777}.medalList{display:flex;gap:10px;flex-wrap:wrap}.medalList span{display:inline-flex;align-items:center;gap:3px}.medalGw{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:10px 0;border-bottom:1px solid #eee}.medalGw>b{min-width:44px}.medalGw span{display:inline-flex;gap:4px;align-items:center}.medalGw small{color:#777}';
  document.head.appendChild(style);
  document.addEventListener('click',e=>{
    const b=e.target.closest('.medalFilter');if(!b)return;
    document.querySelectorAll('.medalFilter').forEach(x=>x.classList.remove('active'));b.classList.add('active');
    const box=document.getElementById('medalsPanel');if(box){box.dataset.renderKey='';renderMedals(b.dataset.medalFilter)}
  });
  window.addEventListener('load',()=>{
    const tab=document.querySelector('.tab[data-view="medals"]');
    if(tab)tab.addEventListener('click',()=>setTimeout(load,0));
  });
})();