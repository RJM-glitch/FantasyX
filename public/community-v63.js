// FantasyX community lineups + favorites + top-player stars + vice captain controls
(function(){
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let community=[],players=[],playerMap=new Map(),topPoints=0;
 function playerInfo(p){return playerMap.get(Number(p.player_id||p.id))||null}
 function playerPhoto(p){return playerInfo(p)?.photo||'/player.svg'}
 function isTop(p){const x=playerInfo(p);return !!x&&topPoints>0&&Number(x.totalPoints||0)===topPoints}
 function favBits(t){return `<div class="managerFavs">${t.favorite_team?`<span class="favTeam">⚽ ${esc(t.favorite_team)}</span>`:''}${t.favorite_player?`<span class="favPlayer">★ Favorite player: ${esc(t.favorite_player)}</span>`:''}</div>`}
 function managerCard(t,i){return `<article class="managerCard"><button class="managerOpen" onclick="openManagerLineup(${i})"><div><strong>${esc(t.team_name||'My XI')} ${t.favorite_team?`<span class="teamFavorite">· ${esc(t.favorite_team)}</span>`:''}</strong><small>${esc(t.real_name||'Manager')}</small>${favBits(t)}</div><b>${Number(t.total_points||0)} pts ›</b></button></article>`}
 async function loadManagers(){
   const el=document.getElementById('communityTeams');if(!el)return;
   el.innerHTML='<p>Loading managers…</p>';
   try{
     const [cr,pr]=await Promise.all([fetch('/api/community?t='+Date.now(),{cache:'no-store'}),fetch('/api/players',{cache:'force-cache'})]);
     const d=await cr.json(),pd=await pr.json();if(!cr.ok)throw Error(d.error||'Could not load managers');
     players=Array.isArray(pd.players)?pd.players:[];playerMap=new Map(players.map(p=>[Number(p.id),p]));topPoints=Math.max(0,...players.map(p=>Number(p.totalPoints||0)));
     community=(d.teams||[]).filter(t=>String(t.team_name||'').trim().toLowerCase()!=='my xi'||String(t.real_name||'').trim()||String(t.favorite_team||'').trim());
     el.innerHTML=community.length?community.map(managerCard).join(''):'<p class="hint">No managers yet.</p>';
     decorateTopPlayers();
   }catch(e){el.innerHTML='<p class="managerError">Managers could not load. Please refresh.</p>'}
 }
 window.openManagerLineup=i=>{
   const t=community[i];if(!t)return;
   const squad=t.squad||[],starters=squad.filter(p=>!p.is_bench),bench=squad.filter(p=>p.is_bench);
   const rows=pos=>starters.filter(p=>p.position===pos).map(lineupPlayer).join('');
   const html=`<div class="otherLineupHead"><div><small>MANAGER</small><h2>${esc(t.real_name||'Manager')}</h2><b>${esc(t.team_name||'My XI')} ${t.favorite_team?`· ⚽ ${esc(t.favorite_team)}`:''}</b>${t.favorite_player?`<div class="favoritePlayerTab">★ Favorite player: ${esc(t.favorite_player)}</div>`:''}</div><button onclick="closeManagerLineup()">×</button></div><div class="otherPitch"><div class="otherRow">${rows('GK')}</div><div class="otherRow">${rows('DEF')}</div><div class="otherRow">${rows('MID')}</div><div class="otherRow">${rows('FWD')}</div></div><div class="otherBench"><b>BENCH</b>${bench.map(lineupPlayer).join('')}</div>`;
   let ov=document.getElementById('managerLineupModal');if(!ov){ov=document.createElement('div');ov.id='managerLineupModal';ov.className='managerLineupOverlay';document.body.appendChild(ov)}
   ov.innerHTML=`<div class="managerLineupPanel">${html}</div>`;ov.classList.add('open');
 };
 function lineupPlayer(p){const info=playerInfo(p);return `<div class="otherPlayer"><div class="otherFace"><img src="${playerPhoto(p)}" alt="${esc(p.player_name||'Player')}" onerror="this.onerror=null;this.src='/player.svg'"><span>${esc(p.position||'')}</span>${p.is_captain?'<i>C</i>':p.is_vice?'<i>V</i>':''}${isTop(p)?'<em class="greenStar" title="Top points scorer">★</em>':''}</div><strong>${esc(p.player_name||'Player')}</strong>${info?`<small>${Number(info.totalPoints||0)} pts</small>`:''}</div>`}
 window.closeManagerLineup=()=>document.getElementById('managerLineupModal')?.classList.remove('open');
 function decorateTopPlayers(){if(!topPoints)return;document.querySelectorAll('.player').forEach(row=>{if(row.querySelector('.greenStar'))return;const name=row.querySelector('.marketPlayerInfo b')?.textContent?.trim(),p=players.find(x=>x.name===name);if(p&&Number(p.totalPoints||0)===topPoints)row.querySelector('.marketPlayerInfo b')?.insertAdjacentHTML('beforeend',' <span class="greenStar marketStar" title="Top points scorer">★</span>')})}
 document.addEventListener('click',e=>{const card=e.target.closest?.('.teamPlayerCard');if(!card)return;setTimeout(addViceButton,0)});
 function addViceButton(){const box=document.querySelector('#playerModalContent .playerActionGrid');if(!box||box.querySelector('.viceAction'))return;const title=document.querySelector('#playerModalContent .playerDetailHead h2')?.textContent?.trim();const squad=JSON.parse(localStorage.getItem('fx-squad-v7')||'[]');const p=squad.find(x=>title&&(title.includes(x.name)||x.name.includes(title.split(' ').pop())));if(!p)return;const b=document.createElement('button');b.className='detailAction viceAction';b.textContent=p.vice?'Vice captain ✓':'Make vice captain';b.onclick=()=>{const s=JSON.parse(localStorage.getItem('fx-squad-v7')||'[]');s.forEach(x=>x.vice=false);const x=s.find(x=>Number(x.id)===Number(p.id));if(x){if(x.cap){alert('Captain and vice captain must be different players.');return}x.vice=true}localStorage.setItem('fx-squad-v7',JSON.stringify(s));if(window.setOnlineSquad)window.setOnlineSquad(s);if(window.saveOnlineSquad)window.saveOnlineSquad(s);document.getElementById('playerModal')?.classList.add('hidden')};box.appendChild(b)}
 const observer=new MutationObserver(()=>{const squad=JSON.parse(localStorage.getItem('fx-squad-v7')||'[]');document.querySelectorAll('.teamPlayerCard').forEach(card=>{if(!card.querySelector('.viceBadge')){const name=card.querySelector('.teamCardName')?.textContent,p=squad.find(x=>x.name===name&&x.vice);if(p){const top=card.querySelector('.teamCardTop');if(top)top.insertAdjacentHTML('beforeend','<span class="viceBadge">V</span>')}}});decorateTopPlayers()});
 const squadEl=document.getElementById('squad');if(squadEl)observer.observe(squadEl,{childList:true,subtree:true});
 window.loadFantasyXManagers=loadManagers;window.addEventListener('load',()=>{loadManagers();document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.view==='community')loadManagers()}))});
})();