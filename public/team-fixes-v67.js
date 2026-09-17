// FantasyX v67: reliable squad removal/reset + visible My Team points.
(function(){
  const $=id=>document.getElementById(id);
  function transfersOpen(){
    const d=Date.parse('2026-09-18T08:30:00+02:00');
    return Date.now()<d;
  }
  function ensureOpen(){
    if(!transfersOpen()){
      alert('The transfer window is closed because Gameweek 2 has started.');
      return false;
    }
    try{TRANSFERS_LOCKED=false;TRANSFER_REASON='';}catch{}
    return true;
  }
  function commit(){
    try{localStorage.setItem('fx-squad-v7',JSON.stringify(S));}catch{}
    try{if(window.saveOnlineSquad)window.saveOnlineSquad(S);}catch{}
    try{if(typeof render==='function')render();else if(typeof pitch==='function')pitch();}catch{}
    setTimeout(decoratePoints,40);
  }
  window.removeById=id=>{
    if(!ensureOpen()||typeof S==='undefined')return;
    const n=Number(id);S=S.filter(x=>Number(x.id)!==n);commit();
  };
  window.removeP=i=>{
    if(!ensureOpen()||typeof S==='undefined')return;
    const n=Number(i);if(Number.isInteger(n)&&n>=0&&n<S.length)S.splice(n,1);commit();
  };
  window.removeFromModal=id=>{
    if(!ensureOpen()||typeof S==='undefined')return;
    const n=Number(id);S=S.filter(x=>Number(x.id)!==n);commit();
    try{closePlayerModal();}catch{}
  };
  window.resetFantasyXSquad=()=>{
    if(!ensureOpen()||typeof S==='undefined')return;
    if(S.length&&!confirm('Reset your whole squad? This removes all 15 players.'))return;
    S.splice(0,S.length);commit();
  };
  function wireReset(){
    const b=$('clear');if(!b||b.dataset.fxResetReady)return;
    b.dataset.fxResetReady='1';b.textContent='Reset squad';
    b.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();window.resetFantasyXSquad()},true);
  }
  function idFromCard(card){
    const m=String(card?.getAttribute('onclick')||'').match(/openPlayerModal\((\d+)\)/);return m?Number(m[1]):null;
  }
  function livePlayer(id){
    try{return (typeof P!=='undefined'?P:[]).find(x=>Number(x.id)===Number(id))||(typeof S!=='undefined'?S:[]).find(x=>Number(x.id)===Number(id));}catch{return null}
  }
  function starters(){
    try{return typeof xi==='function'?xi():[]}catch{return[]}
  }
  function teamPoints(){
    let total=0;for(const p of starters()){
      const q=livePlayer(p.id)||p,base=Number(q.totalPoints||0);
      total+=base*(p.cap?2:1);
    }
    return total;
  }
  function decoratePoints(){
    wireReset();
    const squad=$('squad');if(!squad)return;
    let summary=squad.querySelector('.fxMyPoints');
    if(!summary){summary=document.createElement('div');summary.className='fxMyPoints';squad.prepend(summary)}
    summary.innerHTML=`<div><small>YOUR FANTASYX POINTS</small><strong>${teamPoints()} pts</strong></div><span>Starting XI total · captain included</span>`;
    squad.querySelectorAll('.teamPlayerCard').forEach(card=>{
      const id=idFromCard(card);if(!id)return;const p=livePlayer(id);if(!p)return;
      let el=card.querySelector('.fxPlayerPoints');if(!el){el=document.createElement('div');el.className='fxPlayerPoints';card.appendChild(el)}
      const s=(typeof S!=='undefined'?S:[]).find(x=>Number(x.id)===id),pts=Number(p.totalPoints||0);
      el.textContent=`${pts} pts${s?.cap?' · C ×2':s?.vice?' · V':''}`;
    });
  }
  const style=document.createElement('style');style.textContent=`
    .fxMyPoints{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:0 0 12px;padding:12px 15px;border-radius:14px;background:linear-gradient(120deg,#37003c,#5b0a63);color:#fff;box-shadow:0 5px 16px rgba(55,0,60,.18)}
    .fxMyPoints div{display:grid;gap:2px}.fxMyPoints small{font-size:10px;letter-spacing:.08em;opacity:.78}.fxMyPoints strong{font-size:25px}.fxMyPoints span{font-size:11px;opacity:.82;text-align:right}
    .fxPlayerPoints{margin-top:4px;font-size:11px;font-weight:900;color:#37003c;background:#fff;border-radius:999px;padding:3px 7px;display:inline-block;box-shadow:0 1px 5px rgba(0,0,0,.12)}
    #clear{background:#e31b23!important;color:#fff!important;border-color:#e31b23!important;font-weight:800}
  `;document.head.appendChild(style);
  window.addEventListener('load',()=>{wireReset();setTimeout(decoratePoints,700);setInterval(()=>{const team=$('team');if(team&&!team.classList.contains('hidden'))decoratePoints()},1500)});
  document.addEventListener('click',e=>{const t=e.target.closest('.tab');if(t?.dataset.view==='team')setTimeout(decoratePoints,80)});
})();