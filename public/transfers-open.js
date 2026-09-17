// FantasyX transfer windows: open between gameweeks; from GW3 onward each player brought in costs -4 points.
(function(){
  const FIRST=Date.parse('2026-09-18T00:00:00+02:00'),DAY=86400000;
  function state(now=Date.now()){
    const firstKickoff=Date.parse('2026-09-18T08:30:00+02:00');
    if(now<firstKickoff)return{open:true,targetGw:2,penalty:false,text:'Transfers are OPEN until GW2 kickoff.'};
    const d=Math.max(0,Math.floor((now-FIRST)/DAY)),gw=Math.min(38,2+d),start=FIRST+d*DAY+8.5*3600000,end=FIRST+d*DAY+14.5*3600000;
    if(now>=start&&now<end)return{open:false,targetGw:gw,penalty:gw>=3,text:`Transfers are closed while GW${gw} is being played.`};
    const target=now<start?gw:Math.min(38,gw+1),penalty=target>=3;
    return{open:true,targetGw:target,penalty,text:penalty?`Transfers are OPEN for GW${target} · each player brought in costs <b>-4 points</b>.`:`Transfers are OPEN for GW${target}.`};
  }
  function syncTransferDeadline(){
    const s=state();
    window.FX_TRANSFER_OPEN=s.open;window.FX_TRANSFER_TARGET_GW=s.targetGw;window.FX_TRANSFER_PENALTY=s.penalty;
    try{TRANSFERS_LOCKED=!s.open;TRANSFER_REASON=s.open?'':s.text.replace(/<[^>]+>/g,'');}catch{}
    document.querySelectorAll('.availableBadge,.transferAvailable').forEach(el=>{el.textContent=s.open?'Available':'Closed';el.classList.toggle('closed',!s.open)});
    document.querySelectorAll('.transferDeadlineText').forEach(el=>{el.innerHTML=s.text});
    if(typeof market==='function')market();
  }
  try{applyTransferLock=syncTransferDeadline}catch{}
  window.getFantasyXTransferState=state;
  window.syncTransferDeadline=syncTransferDeadline;
  syncTransferDeadline();setInterval(syncTransferDeadline,10000);
})();