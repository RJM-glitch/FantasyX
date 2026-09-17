// FantasyX team status: vice captain controls + next-game availability indicators.
(function(){
  function h32(...xs){let h=2166136261;for(const x of xs)for(const c of String(x)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
  function currentGwSafe(){try{return typeof currentGw==='function'?Number(currentGw())||1:1}catch{return 1}}
  function availability(p){
    if(!p)return{chance:100,label:'Available',kind:'ok'};
    const r=h32('FXAVAIL',p.id,currentGwSafe())%100;
    if(r<4)return{chance:0,label:'Out',kind:'red'};
    if(r<9)return{chance:25,label:'25% chance',kind:'yellow'};
    if(r<15)return{chance:50,label:'50% chance',kind:'yellow'};
    if(r<22)return{chance:75,label:'75% chance',kind:'yellow'};
    return{chance:100,label:'Available',kind:'ok'};
  }
  function playerByName(name){const n=String(name||'').trim();return (typeof S!=='undefined'?S:[]).find(p=>p.name===n)||(typeof P!=='undefined'?P:[]).find(p=>p.name===n)}
  function statusHTML(p,compact=false){const a=availability(p);if(a.chance===100)return'';const icon=a.chance===0?'!':'!';return `<span class="fxAvailability ${a.kind}" title="${a.chance===0?'Will not play':'May play'} · ${a.chance}% chance">${icon}${compact?'':' '+a.chance+'%'}</span>`}
  function decorate(){
    document.querySelectorAll('.player').forEach(row=>{if(row.querySelector('.fxAvailability'))return;const p=playerByName(row.querySelector('.marketPlayerInfo b')?.textContent);const h=statusHTML(p);if(h)row.querySelector('.marketPlayerInfo b')?.insertAdjacentHTML('afterend',h)});
    document.querySelectorAll('.teamPlayerCard').forEach(card=>{
      const p=playerByName(card.querySelector('.teamCardName')?.textContent);if(!p)return;
      card.querySelectorAll('.fxAvailability,.viceBadge').forEach(x=>x.remove());
      const top=card.querySelector('.teamCardTop');if(!top)return;
      const h=statusHTML(p,true);if(h)top.insertAdjacentHTML('beforeend',h);
      if(p.vice)top.insertAdjacentHTML('beforeend','<span class="viceBadge" title="Vice captain">V</span>');
    });
  }
  window.setViceCaptain=id=>{
    if(typeof S==='undefined')return;
    const p=S.find(x=>x.id===Number(id));if(!p)return;
    if(p.cap)return alert('Your captain and vice captain must be different players.');
    S.forEach(x=>x.vice=false);p.vice=true;
    if(typeof save==='function')save();if(typeof pitch==='function')pitch();decorate();
  };
  const originalCap=window.cap;
  if(originalCap)window.cap=i=>{if(typeof S!=='undefined'&&S[i]?.vice)S[i].vice=false;originalCap(i);decorate()};
  const originalModal=window.openPlayerModal;
  if(originalModal)window.openPlayerModal=id=>{
    originalModal(id);
    const p=(typeof S!=='undefined'?S:[]).find(x=>x.id===Number(id))||(typeof P!=='undefined'?P:[]).find(x=>x.id===Number(id));
    if(!p)return;
    const head=document.querySelector('#playerModalContent .playerDetailHead>div');
    if(head&&!head.querySelector('.modalAvailability')){const a=availability(p);head.insertAdjacentHTML('beforeend',`<div class="modalAvailability ${a.kind}">${a.chance===0?'🔴':'🟡'} ${a.chance}% chance of playing${a.chance===0?' · OUT':''}</div>`)}
    const grid=document.querySelector('#playerModalContent .playerActionGrid');
    if(grid&&typeof S!=='undefined'&&S.some(x=>x.id===Number(id))&&!grid.querySelector('.viceAction')){
      const q=S.find(x=>x.id===Number(id));grid.insertAdjacentHTML('beforeend',`<button class="detailAction viceAction" onclick="setViceCaptain(${Number(id)});closePlayerModal()">${q?.vice?'Vice captain ✓':'Make vice captain'}</button>`)
    }
  };
  const style=document.createElement('style');style.textContent=`
    .fxAvailability{display:inline-flex;align-items:center;justify-content:center;margin-top:3px;font-size:11px;font-weight:900;border-radius:999px;padding:2px 6px;width:max-content}
    .fxAvailability.red{background:#e31b23;color:#fff}.fxAvailability.yellow{background:#ffd84d;color:#351d00}
    .teamCardTop .fxAvailability{position:absolute;left:4px;top:4px;margin:0;width:19px;height:19px;padding:0;border-radius:50%;font-size:12px}
    .teamCardTop{position:relative}.viceBadge{position:absolute;right:4px;bottom:3px;background:#fff;color:#37003c;border:2px solid #37003c;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-size:11px;font-weight:900}
    .modalAvailability{display:inline-flex;margin-top:7px;padding:5px 9px;border-radius:999px;font-size:12px;font-weight:800}.modalAvailability.red{background:#ffe7e8;color:#b30009}.modalAvailability.yellow{background:#fff3bf;color:#6b4d00}.modalAvailability.ok{background:#e8fff1;color:#007a3d}
  `;document.head.appendChild(style);
  const obs=new MutationObserver(decorate);window.addEventListener('load',()=>{setTimeout(decorate,500);obs.observe(document.body,{childList:true,subtree:true})});
})();