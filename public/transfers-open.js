// FantasyX transfer deadline: 10:00 AM Africa/Johannesburg time.
(function(){
  function johannesburgClock(){
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Johannesburg',hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'}).formatToParts(new Date());
    const get=t=>Number(parts.find(x=>x.type===t)?.value||0);
    return {hour:get('hour'),minute:get('minute'),second:get('second')};
  }
  function beforeDeadline(){const t=johannesburgClock();return t.hour<10;}
  function syncTransferDeadline(){
    const open=beforeDeadline();
    try{TRANSFERS_LOCKED=!open;TRANSFER_REASON=open?'':'Transfers closed at 10:00 AM for this gameweek.';}catch{}
    document.querySelectorAll('.availableBadge,.transferAvailable').forEach(el=>{el.textContent=open?'Available':'Closed';el.classList.toggle('closed',!open)});
    document.querySelectorAll('.transferDeadlineText').forEach(el=>{el.innerHTML=open?'Transfers are available until <b>10:00 AM</b> this gameweek.':'Transfers closed at <b>10:00 AM</b> for this gameweek.'});
    if(typeof market==='function')market();
  }
  try{applyTransferLock=syncTransferDeadline}catch{}
  window.syncTransferDeadline=syncTransferDeadline;
  syncTransferDeadline();
  setInterval(syncTransferDeadline,30000);
})();
