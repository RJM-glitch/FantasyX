// FantasyX v68: separate Club Stats and Player Stats tabs and hide departed players.
(function(){
  const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const departed=p=>String(p?.availabilityStatus||'').toLowerCase()==='u'||/\b(transferred|joined|loaned to|left the club|moved to|signed for)\b/i.test(String(p?.injuryNews||''));
  window.fxPlayerDeparted=departed;
  async function separatedStats(){
    const clubEl=document.getElementById('realClubStats'),playerEl=document.getElementById('playerStats');
    if(!clubEl&&!playerEl)return;
    try{
      const [sr,pr]=await Promise.all([fetch('/api/fantasy-stats?t='+Date.now(),{cache:'no-store'}),fetch('/api/players?t='+Date.now(),{cache:'no-store'})]);
      const d=await sr.json(),pd=await pr.json(),clubs=d.clubs||[],activePlayers=(pd.players||[]).filter(p=>!departed(p)),activeIds=new Set(activePlayers.map(p=>Number(p.id))),players=(d.players||[]).filter(p=>activeIds.has(Number(p.id)));
      if(clubEl)clubEl.innerHTML='<div class="realStatsNote"><b>FantasyX club stats</b> · calculated only from FantasyX fixtures already played.</div><table class="clubTable realStatsTable"><thead><tr><th>Club</th><th>Played</th><th>Goals</th><th>Assists</th><th>YC</th><th>RC</th></tr></thead><tbody>'+clubs.map(x=>`<tr><td><span class="clubTableTeam"><img src="${x.badge}" alt=""><span>${safe(x.team)}</span></span></td><td>${Number(x.played||0)}</td><td>${Number(x.goals||0)}</td><td>${Number(x.assists||0)}</td><td>${Number(x.yellowCards||0)}</td><td>${Number(x.redCards||0)}</td></tr>`).join('')+'</tbody></table>';
      if(playerEl)playerEl.innerHTML='<div class="realStatsNote"><b>FantasyX player stats</b> · players who have left their Premier League club are removed.</div>'+(players.length?'<div class="playerStatsWrap"><table class="clubTable realStatsTable"><thead><tr><th>Player</th><th>Club</th><th>Goals</th><th>Assists</th><th>YC</th><th>RC</th><th>Pts</th></tr></thead><tbody>'+players.map(p=>`<tr><td><span class="playerStatName"><img src="${p.photo}" onerror="this.style.display='none'" alt=""><b>${safe(p.name)}</b></span></td><td>${safe(p.clubShort||p.club)}</td><td>${Number(p.goals||0)}</td><td>${Number(p.assists||0)}</td><td>${Number(p.yellowCards||0)}</td><td>${Number(p.redCards||0)}</td><td>${Number(p.points||0)}</td></tr>`).join('')+'</tbody></table></div>':'<p class="hint">No active player events yet.</p>');
    }catch{
      if(clubEl)clubEl.innerHTML='<p class="hint">FantasyX club statistics unavailable.</p>';
      if(playerEl)playerEl.innerHTML='<p class="hint">FantasyX player statistics unavailable.</p>';
    }
  }
  try{loadFantasyStats=separatedStats}catch{}
  window.loadFantasyStatsSeparated=separatedStats;
  window.addEventListener('load',()=>{
    setTimeout(separatedStats,500);
    document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.view==='clubstats'||b.dataset.view==='playerstats')setTimeout(separatedStats,30)}));
    setInterval(()=>{const c=document.getElementById('clubstats'),p=document.getElementById('playerstats');if((c&&!c.classList.contains('hidden'))||(p&&!p.classList.contains('hidden')))separatedStats()},20000);
  });
})();