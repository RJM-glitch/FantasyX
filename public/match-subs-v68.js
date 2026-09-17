// FantasyX v68: show simulated club substitutions in fixture details.
(function(){
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function substitutionsHtml(f){
  const ev=Array.isArray(f?.substitutionEvents)?f.substitutionEvents:[];
  if(f?.status==='Upcoming')return '<p class="fxSubsWaiting">Substitutions appear after they happen.</p>';
  if(!ev.length)return '<p class="fxSubsWaiting">No substitutions yet.</p>';
  return `<div class="fxSubsList">${ev.map(x=>`<div class="fxSubRow"><b>${Number(x.minute||0)}′</b><span class="fxSubTeam">${esc(x.teamShort||'')}</span><span><i>↑</i> ${esc(x.on?.name||'Sub')}</span><span><i>↓</i> ${esc(x.off?.name||'Player')}</span></div>`).join('')}</div>`;
 }
 function lineupSummary(side,title){
  const starters=side?.starters||[],subs=side?.usedSubs||[];
  return `<div class="fxLineupSide"><h4>${esc(title)}</h4><small>Starting XI</small><p>${starters.map(x=>esc(x.name)).join(', ')||'—'}</p>${subs.length?`<small>Subs used</small><p>${subs.map(x=>esc(x.name)+(x.subOn!==null?' '+x.subOn+'′':'')).join(', ')}</p>`:''}</div>`;
 }
 const old=window.openFixtureStats;
 window.openFixtureStats=i=>{
  if(typeof old==='function')old(i);
  setTimeout(()=>{
   try{
    const f=fixtureData?.[i],card=document.querySelector('#fixtureStatsModal .fxStatsCard');if(!f||!card)return;
    card.querySelectorAll('.fxMatchSubsSection,.fxLineupsSection').forEach(x=>x.remove());
    const subs=document.createElement('div');subs.className='fxMatchSubsSection';subs.innerHTML=`<h3>SUBSTITUTIONS</h3>${substitutionsHtml(f)}`;card.appendChild(subs);
    if(f.status!=='Upcoming'&&f.lineups){const line=document.createElement('div');line.className='fxLineupsSection';line.innerHTML=`<h3>PLAYERS USED</h3><div class="fxLineupGrid">${lineupSummary(f.lineups.home,f.home?.name)}${lineupSummary(f.lineups.away,f.away?.name)}</div>`;card.appendChild(line)}
   }catch{}
  },0);
 };
 const style=document.createElement('style');style.textContent=`.fxMatchSubsSection,.fxLineupsSection{margin-top:20px;border-top:1px solid #eee;padding-top:10px}.fxSubsList{display:grid;gap:7px}.fxSubRow{display:grid;grid-template-columns:42px 48px 1fr 1fr;gap:8px;align-items:center;padding:8px 10px;border-radius:10px;background:#f7f7f8;font-size:13px}.fxSubRow i{font-style:normal;font-weight:900}.fxSubRow span:nth-child(3) i{color:#00a65a}.fxSubRow span:nth-child(4) i{color:#d71920}.fxSubTeam{font-weight:900}.fxSubsWaiting{text-align:center;color:#777}.fxLineupGrid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.fxLineupSide{padding:12px;border-radius:12px;background:#fafafa}.fxLineupSide h4{margin:0 0 8px}.fxLineupSide small{font-weight:800;color:#777}.fxLineupSide p{margin:4px 0 10px;line-height:1.45;font-size:12px}@media(max-width:650px){.fxSubRow{grid-template-columns:36px 42px 1fr}.fxSubRow span:last-child{grid-column:3}.fxLineupGrid{grid-template-columns:1fr}}`;document.head.appendChild(style);
})();