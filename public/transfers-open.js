// FantasyX transfer window: open until Gameweek 2 kickoff.
(function(){
  const DEADLINE=Date.parse('2026-09-18T08:30:00+02:00');
  function isOpen(){return Date.now()<DEADLINE;}
  function syncTransferDeadline(){
    const open=isOpen(),ms=Math.max(0,DEADLINE-Date.now()),hours=Math.floor(ms/3600000),mins=Math.ceil((ms%3600000)/60000);
    try{TRANSFERS_LOCKED=!open;TRANSFER_REASON=open?'':'Transfer window closed at Gameweek 2 kickoff.';}catch{}
    document.querySelectorAll('.availableBadge,.transferAvailable').forEach(el=>{el.textContent=open?'Available':'Closed';el.classList.toggle('closed',!open)});
    document.querySelectorAll('.transferDeadlineText').forEach(el=>{el.innerHTML=open?`Transfers are <b>OPEN</b> until GW2 kickoff · ${hours}h ${mins}m remaining`:'Transfers are <b>closed</b> because Gameweek 2 has started.'});
    if(typeof market==='function')market();
  }
  try{applyTransferLock=syncTransferDeadline}catch{}
  window.syncTransferDeadline=syncTransferDeadline;syncTransferDeadline();setInterval(syncTransferDeadline,10000);
})();