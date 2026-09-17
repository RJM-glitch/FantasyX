// FantasyX transfer deadline: 10:20 AM Johannesburg time.
(function(){
  function localClock(){
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Johannesburg',hour12:false,hour:'2-digit',minute:'2-digit'}).formatToParts(new Date());
    const value=t=>Number(parts.find(x=>x.type===t)?.value||0);
    return {hour:value('hour'),minute:value('minute')};
  }
  function beforeDeadline(){const t=localClock();return t.hour<10||(t.hour===10&&t.minute<20);}
  function syncTransferDeadline(){
    const isOpen=beforeDeadline();
    try{TRANSFERS_LOCKED=!isOpen;TRANSFER_REASON=isOpen?'':'Transfers closed at 10:20 AM for this gameweek.';}catch{}
    document.querySelectorAll('.availableBadge,.transferAvailable').forEach(el=>{el.textContent=isOpen?'Available':'Closed';el.classList.toggle('closed',!isOpen)});
    document.querySelectorAll('.transferDeadlineText').forEach(el=>{el.innerHTML=isOpen?'Transfers are available until <b>10:20 AM</b> this gameweek.':'Transfers closed at <b>10:20 AM</b> for this gameweek.'});
    if(typeof market==='function')market();
  }
  try{applyTransferLock=syncTransferDeadline}catch{}
  window.syncTransferDeadline=syncTransferDeadline;
  syncTransferDeadline();
  setInterval(syncTransferDeadline,30000);
})();