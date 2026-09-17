// FantasyX v64: chips, manager favorite team/player, top scorer stars.
(function(){
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const chipKey='fx-active-chip';
 const usedKey='fx-used-chips';
 const chips=['Wildcard','Free Hit','Bench Boost','Triple Captain'];
 function chipState(){try{return {active:localStorage.getItem(chipKey)||'',used:JSON.parse(localStorage.getItem(usedKey)||'[]')}}catch{return{active:'',used:[]}}}
 function syncChips(){
  const state=chipState();document.querySelectorAll('#chips .chip').forEach(btn=>{
   const name=btn.dataset.chip||btn.textContent.trim();btn.dataset.chip=name;
   const used=state.used.includes(name),active=state.active===name;
   btn.disabled=used&&!active;btn.classList.toggle('chipActive',active);btn.classList.toggle('chipUsed',used&&!active);
   btn.textContent=active?name+' ✓ Active':used?name+' · Used':name;
   btn.onclick=()=>useChip(name);
  });
  const s=document.getElementById('chipStatus');if(s)s.textContent=state.active?'Active chip: '+state.active:'No chip active for this gameweek.';
 }
 function useChip(name){
  const state=chipState();if(state.used.includes(name)&&state.active!==name)return alert(name+' has already been used.');
  if(state.active&&state.active!==name)return alert('You already have '+state.active+' active.');
  if(state.active===name){if(confirm('Are you sure you want to cancel '+name+'?'))localStorage.removeItem(chipKey);syncChips();return}
  if(!confirm('Are you sure you want to use '+name+'?'))return;
  localStorage.setItem(chipKey,name);if(!state.used.includes(name)){state.used.push(name);localStorage.setItem(usedKey,JSON.stringify(state.used))}syncChips();
 }
 function decorateMarket(){
  const rows=[...document.querySelectorAll('.player')];let max=-Infinity,points=new Map();
  rows.forEach(row=>{const name=row.querySelector('.marketPlayerInfo b')?.textContent?.replace('★','').trim();const p=(window.P||[]).find?.(x=>x.name===name);if(p){const n=Number(p.totalPoints||0);points.set(name,n);max=Math.max(max,n)}});
  if(!Number.isFinite(max)||max<=0)return;
  rows.forEach(row=>{const b=row.querySelector('.marketPlayerInfo b'),name=b?.textContent?.replace('★','').trim();if(b&&points.get(name)===max&&!b.querySelector('.greenStar'))b.insertAdjacentHTML('beforeend',' <span class="greenStar" title="Highest points scorer">★</span>')});
 }
 const obs=new MutationObserver(()=>decorateMarket());window.addEventListener('load',()=>{syncChips();decorateMarket();const p=document.getElementById('players');if(p)obs.observe(p,{childList:true,subtree:true})});
})();