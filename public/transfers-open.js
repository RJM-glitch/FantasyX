// FantasyX transfer windows. Special 10-minute GW2 window; transfers cost -4 each.
(function(){
  const FIRST=Date.parse('2026-09-18T00:00:00+02:00'),DAY=86400000,SPECIAL_UNTIL=Date.parse('2026-09-18T12:56:14+02:00');
  function state(now=Date.now()){
    const firstKickoff=Date.parse('2026-09-18T14:20:00+02:00');
    if(now<firstKickoff)return{open:true,targetGw:2,penalty:false,special:false,text:'Transfers are OPEN until GW2 kickoff.'};
    if(now<SPECIAL_UNTIL){
      const sec=Math.max(0,Math.ceil((SPECIAL_UNTIL-now)/1000)),m=Math.floor(sec/60),s=String(sec%60).padStart(2,'0');
      return{open:true,targetGw:2,penalty:false,special:true,text:`Special transfer window OPEN · ${m}:${s} left · GW2 transfers are free · new players do not score GW2 points.`};
    }
    const d=Math.max(0,Math.floor((now-FIRST)/DAY)),gw=Math.min(38,2+d),start=FIRST+d*DAY+(gw===2?(14*3600000+20*60000):8.5*3600000),end=FIRST+d*DAY+(gw===2?(19*3600000+35*60000):14.5*3600000);
    if(now>=start&&now<end)return{open:false,targetGw:gw,penalty:gw>=3,special:false,text:`Transfers are closed while GW${gw} is being played.`};
    const target=now<start?gw:Math.min(38,gw+1),penalty=target>=3;
    return{open:true,targetGw:target,penalty,special:false,text:penalty?`Transfers are OPEN for GW${target} · each player brought in costs <b>-4 points</b>.`:`Transfers are OPEN for GW${target}.`};
  }
  function syncTransferDeadline(){
    const s=state();
    window.FX_TRANSFER_OPEN=s.open;window.FX_TRANSFER_TARGET_GW=s.targetGw;window.FX_TRANSFER_PENALTY=s.penalty;window.FX_TRANSFER_SPECIAL=s.special;
    try{TRANSFERS_LOCKED=!s.open;TRANSFER_REASON=s.open?'':s.text.replace(/<[^>]+>/g,'')}catch{}
    document.querySelectorAll('.availableBadge,.transferAvailable').forEach(el=>{el.textContent=s.open?'Available':'Closed';el.classList.toggle('closed',!s.open)});
    document.querySelectorAll('.transferDeadlineText').forEach(el=>{el.innerHTML=s.text});
    if(typeof market==='function')market();
  }
  try{applyTransferLock=syncTransferDeadline}catch{}
  window.getFantasyXTransferState=state;window.syncTransferDeadline=syncTransferDeadline;
  syncTransferDeadline();setInterval(syncTransferDeadline,1000);
})();