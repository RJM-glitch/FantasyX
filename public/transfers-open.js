// FantasyX transfer window UI synced directly from the server.
(function(){
  let last=null,busy=false;
  async function syncTransferDeadline(){
    if(busy)return;busy=true;
    try{
      const r=await fetch('/api/transfer-window?t='+Date.now(),{cache:'no-store'});
      if(!r.ok)throw Error('window unavailable');
      const s=await r.json();last=s;
      window.FX_TRANSFER_OPEN=!!s.open;
      window.FX_TRANSFER_TARGET_GW=Number(s.targetGw||2);
      window.FX_TRANSFER_PENALTY=!!s.penalty;
      window.FX_TRANSFER_SPECIAL=!!s.special;
      try{TRANSFERS_LOCKED=!s.open;TRANSFER_REASON=s.open?'':String(s.message||'Transfers are closed.')}catch{}
      let text=String(s.message||'');
      if(s.special&&s.closes_at){
        const sec=Math.max(0,Math.ceil((Date.parse(s.closes_at)-Date.now())/1000));
        const m=Math.floor(sec/60),ss=String(sec%60).padStart(2,'0');
        text='Special transfer window OPEN · '+m+':'+ss+' left · GW2 transfers are free.';
      }
      document.querySelectorAll('.availableBadge,.transferAvailable').forEach(el=>{
        el.textContent=s.open?'Available':'Closed';
        el.classList.toggle('closed',!s.open);
      });
      document.querySelectorAll('.transferDeadlineText').forEach(el=>{el.textContent=text});
      if(typeof market==='function')market();
    }catch{}finally{busy=false}
  }
  window.getFantasyXTransferState=()=>last||{open:false,targetGw:2,penalty:false,special:false};
  window.syncTransferDeadline=syncTransferDeadline;
  syncTransferDeadline();setInterval(syncTransferDeadline,1000);
})();