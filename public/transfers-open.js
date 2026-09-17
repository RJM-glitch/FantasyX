// FantasyX transfers are intentionally open for this gameweek.
try{
  TRANSFERS_LOCKED=false;
  TRANSFER_REASON='';
  applyTransferLock=function(){TRANSFERS_LOCKED=false;TRANSFER_REASON='';if(typeof market==='function')market()};
  if(typeof market==='function')market();
}catch(e){console.warn('Transfer availability override could not initialize',e)}
