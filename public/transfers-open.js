// FantasyX temporary transfer window: open until 12:22 PM Johannesburg time on 17 Sep 2026.
(function(){
  const DEADLINE=Date.parse('2026-09-17T12:22:00+02:00');
  function isOpen(){return Date.now()<DEADLINE;}
  function syncTransferDeadline(){
    const open=isOpen(),remaining=Math.max(0,Math.ceil((DEADLINE-Date.now())/60000));
    try{TRANSFERS_LOCKED=!open;TRANSFER_REASON=open?'':'Temporary transfer window closed.';}catch{}
    document.querySelectorAll('.availableBadge,.transferAvailable').forEach(el=>{el.textContent=open?'Available':'Closed';el.classList.toggle('closed',!open)});
    document.querySelectorAll('.transferDeadlineText').forEach(el=>{el.innerHTML=open?`Transfers temporarily open · <b>${remaining} min remaining</b>`:'Transfers are <b>closed</b> for this gameweek.'});
    if(typeof market==='function')market();
  }
  try{applyTransferLock=syncTransferDeadline}catch{}
  window.syncTransferDeadline=syncTransferDeadline;syncTransferDeadline();setInterval(syncTransferDeadline,10000);
})();