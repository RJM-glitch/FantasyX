const hub = document.getElementById('accountHub');

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

async function api(path, opts = {}) {
  const r = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) }
  });
  let d = {};
  try { d = await r.json(); } catch {}
  if (!r.ok) throw Error(d.error || 'Request failed.');
  return d;
}

async function me() {
  try { return (await api('/api/auth/me')).user; } catch { return null; }
}

let currentUser = await me();

async function drawHub() {
  if (!hub) return;
  if (!currentUser) {
    hub.innerHTML = '<a class="loginBtn" href="/login.html">Log in</a><a class="signupBtn" href="/signup.html">Sign up</a>';
    return;
  }
  hub.innerHTML = `<span class="accountName">${esc(currentUser.username || 'Signed in')}</span><button id="signOutBtn">Sign out</button>`;
  document.getElementById('signOutBtn').onclick = async () => {
    try { await api('/api/auth/logout', { method: 'POST', body: '{}' }); } catch {}
    location.reload();
  };
}

function fxNotify(msg, bad = false) {
  let t = document.getElementById('fxSaveToast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'fxSaveToast';
    t.setAttribute('role', 'status');
    t.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);padding:10px 16px;border-radius:10px;font:600 14px system-ui;z-index:9999;max-width:90vw;box-shadow:0 4px 16px #0004';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.background = bad ? '#7a0f1a' : '#1b5e20';
  t.style.color = '#fff';
  t.style.display = 'block';
  clearTimeout(t._hideTimer);
  t._hideTimer = setTimeout(() => { t.style.display = 'none'; }, bad ? 6000 : 1800);
}

// Keep this helper isolated so it can be tested without a browser.
function restoreLineup(rows) {
  const arr = (Array.isArray(rows) ? rows : []).map(x => ({
    id: Number(x.player_id ?? x.id),
    name: x.player_name ?? x.name,
    club: x.club,
    pos: String(x.position ?? x.pos ?? '').toUpperCase(),
    price: Number(x.price),
    cap: Boolean(x.is_captain ?? x.cap),
    vice: Boolean(x.is_vice ?? x.vice),
    _b: x.is_bench ?? x.bench
  }));

  if (arr.length !== 15 || !arr.every(p => typeof p._b === 'boolean')) {
    return { arr: arr.map(({ _b, ...p }) => p), formation: null };
  }

  const starters = arr.filter(p => !p._b);
  const bench = arr.filter(p => p._b);
  const count = pos => starters.filter(p => p.pos === pos).length;
  const formation = `${count('DEF')}-${count('MID')}-${count('FWD')}`;
  const validFormations = ['3-4-3', '3-5-2', '4-3-3', '4-4-2', '4-5-1', '5-2-3', '5-3-2', '5-4-1'];
  const captainCount = arr.filter(p => p.cap).length;
  const viceCount = arr.filter(p => p.vice).length;

  if (
    starters.length !== 11 || bench.length !== 4 || count('GK') !== 1 ||
    !validFormations.includes(formation) || captainCount > 1 || viceCount > 1
  ) {
    return { arr: arr.map(({ _b, ...p }) => p), formation: null };
  }

  const ordered = ['GK', 'DEF', 'MID', 'FWD']
    .flatMap(pos => starters.filter(p => p.pos === pos))
    .concat(bench);
  return { arr: ordered.map(({ _b, ...p }) => p), formation };
}

async function loadCloudSquad() {
  if (!currentUser) return;
  try {
    const d = await api('/api/account/squad');
    const rows = d.squad || [];
    if (rows.length) {
      const restored = restoreLineup(rows);
      if (restored.formation) localStorage.setItem('fx-formation', restored.formation);
      if (window.setOnlineSquad) window.setOnlineSquad(restored.arr);
    } else {
      const local = JSON.parse(localStorage.getItem('fx-squad-v7') || '[]');
      if (local.length && window.saveOnlineSquad) await window.saveOnlineSquad(local);
    }
  } catch (e) {
    fxNotify('Could not load your saved squad: ' + e.message, true);
  }
}

const formations = {
  '3-4-3': [3, 4, 3], '3-5-2': [3, 5, 2], '4-3-3': [4, 3, 3],
  '4-4-2': [4, 4, 2], '4-5-1': [4, 5, 1], '5-2-3': [5, 2, 3],
  '5-3-2': [5, 3, 2], '5-4-1': [5, 4, 1]
};

window.saveOnlineSquad = async squad => {
  if (!currentUser || !Array.isArray(squad)) return { ok: false, localOnly: true };
  if (squad.length !== 15) {
    window.FX_SAVE_STATE = { ok: false, error: 'A squad must contain 15 players.' };
    fxNotify('Squad NOT saved: a squad must contain 15 players.', true);
    return window.FX_SAVE_STATE;
  }

  const formation = localStorage.getItem('fx-formation') || '3-4-3';
  const [defenders, midfielders, forwards] = formations[formation] || formations['3-4-3'];
  const starters = [
    ...squad.filter(p => p.pos === 'GK').slice(0, 1),
    ...squad.filter(p => p.pos === 'DEF').slice(0, defenders),
    ...squad.filter(p => p.pos === 'MID').slice(0, midfielders),
    ...squad.filter(p => p.pos === 'FWD').slice(0, forwards)
  ];
  if (starters.length !== 11) {
    window.FX_SAVE_STATE = { ok: false, error: 'Your squad does not match the selected formation.' };
    fxNotify('Squad NOT saved: check your formation and player positions.', true);
    return window.FX_SAVE_STATE;
  }

  const starterIds = new Set(starters.map(p => Number(p.id)));
  const payload = squad.map(p => {
    const bench = !starterIds.has(Number(p.id));
    return {
      ...p,
      id: Number(p.id),
      cap: Boolean(p.cap),
      vice: Boolean(p.vice),
      bench,
      is_captain: Boolean(p.cap),
      is_vice: Boolean(p.vice),
      is_bench: bench
    };
  });

  try {
    await api('/api/account/squad', { method: 'PUT', body: JSON.stringify({ squad: payload }) });
    window.FX_SAVE_STATE = { ok: true };
    fxNotify('Squad saved');
    return window.FX_SAVE_STATE;
  } catch (e) {
    window.FX_SAVE_STATE = { ok: false, error: e.message };
    fxNotify('Squad NOT saved: ' + e.message, true);
    return window.FX_SAVE_STATE;
  }
};

async function setupLeagueCard() {
  const card = document.querySelector('#league .card');
  if (!card) return;
  if (!currentUser) {
    card.insertAdjacentHTML('afterbegin', '<p><a href="/login.html">Log in</a> to save your profile, squad and leagues.</p>');
    return;
  }
  let profile = null;
  try { profile = (await api('/api/account/profile')).profile; } catch {}
  card.insertAdjacentHTML('afterbegin', `<div class="profileSettings"><h3>Manager profile</h3><div class="form">
    <input id="realName" placeholder="Your name" value="${esc(profile?.real_name || '')}">
    <input id="teamName" placeholder="Team name" value="${esc(profile?.team_name || 'My XI')}">
    <input id="favoriteTeam" placeholder="Favorite team (e.g. Arsenal)" value="${esc(profile?.favorite_team || '')}">
    <input id="favoritePlayer" placeholder="Favorite player" value="${esc(profile?.favorite_player || '')}">
    <button id="saveProfile">Save profile</button></div><p id="profileMsg"></p></div>
    <div class="form"><input id="leagueCode" placeholder="League code"><button id="joinLeague">Join league</button></div>`);

  document.getElementById('saveProfile').onclick = async () => {
    const msg = document.getElementById('profileMsg');
    try {
      await api('/api/account/profile', {
        method: 'PUT',
        body: JSON.stringify({
          real_name: document.getElementById('realName').value.trim(),
          team_name: document.getElementById('teamName').value.trim() || 'My XI',
          favorite_team: document.getElementById('favoriteTeam').value.trim(),
          favorite_player: document.getElementById('favoritePlayer').value.trim()
        })
      });
      msg.textContent = 'Saved ✓';
      window.loadFantasyXManagers?.();
    } catch (e) { msg.textContent = e.message; }
  };

  document.getElementById('joinLeague').onclick = async () => {
    const msg = document.getElementById('profileMsg');
    const code = document.getElementById('leagueCode').value.trim().toUpperCase();
    try {
      const d = await api('/api/account/join-league', { method: 'POST', body: JSON.stringify({ code }) });
      msg.textContent = 'Joined ' + d.league.name + ' ✓';
    } catch (e) { msg.textContent = e.message; }
  };
}

await drawHub();
await setupLeagueCard();
if (window.setOnlineSquad) await loadCloudSquad();
else window.addEventListener('fantasyx-ready', loadCloudSquad, { once: true });
