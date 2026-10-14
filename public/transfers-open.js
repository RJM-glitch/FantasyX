// FantasyX transfer window UI synced from the server.
// Poll the server infrequently; update the local countdown without extra requests.
(function () {
  let last = null;
  let busy = false;
  let lastSignature = '';

  function paint(state) {
    let text = String(state.message || '');
    if (state.special && state.closes_at) {
      const seconds = Math.max(0, Math.ceil((Date.parse(state.closes_at) - Date.now()) / 1000));
      const minutes = Math.floor(seconds / 60);
      const remainder = String(seconds % 60).padStart(2, '0');
      text = 'Special transfer window OPEN · ' + minutes + ':' + remainder + ' left.';
    }

    document.querySelectorAll('.availableBadge,.transferAvailable').forEach(el => {
      el.textContent = state.open ? 'Available' : 'Closed';
      el.classList.toggle('closed', !state.open);
    });
    document.querySelectorAll('.transferDeadlineText').forEach(el => { el.textContent = text; });
  }

  async function syncTransferDeadline() {
    if (busy) return;
    busy = true;
    try {
      const response = await fetch('/api/transfer-window', { cache: 'no-store' });
      if (!response.ok) throw Error('Transfer window unavailable.');
      const state = await response.json();
      last = state;
      window.FX_TRANSFER_OPEN = Boolean(state.open);
      window.FX_TRANSFER_TARGET_GW = Number(state.targetGw || 2);
      window.FX_TRANSFER_PENALTY = Boolean(state.penalty);
      window.FX_TRANSFER_SPECIAL = Boolean(state.special);

      try {
        TRANSFERS_LOCKED = !state.open;
        TRANSFER_REASON = state.open ? '' : String(state.message || 'Transfers are closed.');
      } catch {}

      paint(state);
      const signature = [state.open, state.targetGw, state.penalty, state.special, state.closes_at].join('|');
      if (signature !== lastSignature) {
        lastSignature = signature;
        if (typeof market === 'function') market();
      }
    } catch (error) {
      window.FX_TRANSFER_ERROR = error.message || 'Transfer window unavailable.';
    } finally {
      busy = false;
    }
  }

  window.getFantasyXTransferState = () => last || { open: false, targetGw: 2, penalty: false, special: false };
  window.syncTransferDeadline = syncTransferDeadline;
  syncTransferDeadline();
  setInterval(syncTransferDeadline, 30000);
  setInterval(() => { if (last && last.special) paint(last); }, 1000);
})();
