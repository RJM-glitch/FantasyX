// FantasyX community lineups + vice captain controls
(function(){
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let community=[];
 function playerPhoto(p){
   const live=(window.P||[]).find?.(x=>Number(x.id)===Number(p.player_id||p.id));
   return live?.photo||'/player.svg';
 }
 function managerCard(t,i){
   const squad=t.squad||[];
   return `<article class="managerCard"><button class="managerOpen" onclick="openManagerLineup(${i})"><div><strong>${esc(t.team_name||'My XI')}</strong><small>${esc(t.real_name||'Manager')}</small></div><b>${Number(t.total_points||0)} pts ›</b></button></article>`;
 }
 async function loadManagers(){
   const el=document.getElementById('communityTeams'); if(!el)return;
   el.innerHTML='<p>Loading managers…</p>';
   try{
     const r=await fetch('/api/community?t='+Date.now(),{cache:'no-store'}),d=await r.json();
     if(!r.ok)throw Error(d.error||'Could not load managers');
     community=d.teams||[];
     el.innerHTML=community.length?community.map(managerCard).join(''):'<p class="hint">No managers yet.</p>';
   }catch(e){el.innerHTML='<p class="managerError">Managers could not load. Please refresh.</p>'}
 }
 window.openManagerLineup=i=>{
   const t=community[i]; if(!t)return;
   const squad=t.squad||[], starters=squad.filter(p=>!p.is_bench),bench=squad.filter(p=>p.is_bench);
   const rows=pos=>starters.filter(p=>p.position===pos).map(p=>lineupPlayer(p)).join('');
   const html=`<div class="otherLineupHead"><div><small>MANAGER</small><h2>${esc(t.real_name||'Manager')}</h2><b>${esc(t.team_name||'My XI')}</b></div><button onclick="closeManagerLineup()">×</button></div><div class="otherPitch"><div class="otherRow">${rows('GK')}</div><div class="otherRow">${rows('DEF')}</div><div class="otherRow">${rows('MID')}</div><div class="otherRow">${rows('FWD')}</div></div><div class="otherBench"><b>BENCH</b>${bench.map(lineupPlayer).join('')}</div>`;
   let ov=document.getElementById('managerLineupModal');
   if(!ov){ov=document.createElement('div');ov.id='managerLineupModal';ov.className='managerLineupOverlay';document.body.appendChild(ov)}
   ov.innerHTML=`<div class="managerLineupPanel">${html}</div>`;ov.classList.add('open');
 };
 function lineupPlayer(p){return `<div class="otherPlayer"><div class="otherFace"><img src="${playerPhoto(p)}" onerror="this.src='/player.svg'"><span>${esc(p.position||'')}</span>${p.is_captain?'<i>C</i>':p.is_vice?'<i>V</i>':''}</div><strong>${esc(p.player_name||'Player')}</strong></div>`}
 window.closeManagerLineup=()=>document.getElementById('managerLineupModal')?.classList.remove('open');

 // Add vice-captain action to the existing player popup without replacing app.js.
 document.addEventListener('click',e=>{
   const card=e.target.closest?.('.teamPlayerCard'); if(!card)return;
   setTimeout(addViceButton,0);
 });
 function addViceButton(){
   const box=document.querySelector('#playerModalContent .playerActionGrid'); if(!box||box.querySelector('.viceAction'))return;
   const title=document.querySelector('#playerModalContent .playerDetailHead h2')?.textContent?.trim();
   const squad=JSON.parse(localStorage.getItem('fx-squad-v7')||'[]');
   const p=squad.find(x=>title&&(title.includes(x.name)||x.name.includes(title.split(' ').pop()))); if(!p)return;
   const b=document.createElement('button');b.className='detailAction viceAction';b.textContent=p.vice?'Vice captain ✓':'Make vice captain';
   b.onclick=()=>{const s=JSON.parse(localStorage.getItem('fx-squad-v7')||'[]');s.forEach(x=>x.vice=false);const x=s.find(x=>Number(x.id)===Number(p.id));if(x){if(x.cap){alert('Captain and vice captain must be different players.');return}x.vice=true}localStorage.setItem('fx-squad-v7',JSON.stringify(s));if(window.setOnlineSquad)window.setOnlineSquad(s);if(window.saveOnlineSquad)window.saveOnlineSquad(s);document.getElementById('playerModal')?.classList.add('hidden');};
   box.appendChild(b);
 }
 // Display V badges on My Team cards.
 const observer=new MutationObserver(()=>{
   const squad=JSON.parse(localStorage.getItem('fx-squad-v7')||'[]');
   document.querySelectorAll('.teamPlayerCard').forEach(card=>{if(card.querySelector('.viceBadge'))return;const name=card.querySelector('.teamCardName')?.textContent;const p=squad.find(x=>x.name===name&&x.vice);if(p){const top=card.querySelector('.teamCardTop');if(top)top.insertAdjacentHTML('beforeend','<span class="viceBadge">V</span>')}})
 });
 const squadEl=document.getElementById('squad');if(squadEl)observer.observe(squadEl,{childList:true,subtree:true});

 window.loadFantasyXManagers=loadManagers;
 window.addEventListener('load',()=>{loadManagers();document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.view==='community')loadManagers()}))});
})();