const EVENT_LIVE_URL = 'https://fantasy.premierleague.com/api/event/';
const CACHE = new Map();
const USER_AGENT = 'FantasyX/1.0 (+https://fantasyx.onrender.com)';

export function gameweekMeta(boot, now = Date.now()) {
  const events = [...(Array.isArray(boot?.events) ? boot.events : [])]
    .filter(event => Number.isFinite(Number(event.id)))
    .sort((a, b) => Number(a.id) - Number(b.id));
  const current = events.find(event => event.is_current);
  const next = events.find(event => event.is_next);
  const latestFinished = [...events].reverse().find(event => event.finished);
  const futureDeadlines = events
    .map(event => ({ event, timestamp: Date.parse(event.deadline_time || '') }))
    .filter(item => Number.isFinite(item.timestamp) && item.timestamp > now)
    .sort((a, b) => a.timestamp - b.timestamp);
  const deadlineTarget = futureDeadlines[0]?.event || null;
  return {
    currentGameweek: Number(current?.id ?? next?.id ?? latestFinished?.id ?? 1),
    nextGameweek: Number(next?.id ?? deadlineTarget?.id ?? current?.id ?? latestFinished?.id ?? 1),
    deadlineGameweek: deadlineTarget ? Number(deadlineTarget.id) : null,
    deadline: deadlineTarget?.deadline_time || null
  };
}

export function normalizeEventLive(payload, gameweek) {
  if (!payload || !Array.isArray(payload.elements)) {
    throw new Error('Official FPL live feed returned an invalid payload for Gameweek ' + gameweek + '.');
  }
  return {
    gameweek: Number(gameweek),
    elements: payload.elements.map(row => {
      const stats = row?.stats && typeof row.stats === 'object' ? row.stats : {};
      return {
        id: Number(row.id),
        stats: {
          total_points: Number(stats.total_points) || 0,
          minutes: Number(stats.minutes) || 0,
          starts: Number(stats.starts) || 0,
          goals_scored: Number(stats.goals_scored) || 0,
          assists: Number(stats.assists) || 0,
          clean_sheets: Number(stats.clean_sheets) || 0,
          goals_conceded: Number(stats.goals_conceded) || 0,
          own_goals: Number(stats.own_goals) || 0,
          penalties_saved: Number(stats.penalties_saved) || 0,
          penalties_missed: Number(stats.penalties_missed) || 0,
          yellow_cards: Number(stats.yellow_cards) || 0,
          red_cards: Number(stats.red_cards) || 0,
          saves: Number(stats.saves) || 0,
          bonus: Number(stats.bonus) || 0,
          bps: Number(stats.bps) || 0
        }
      };
    }).filter(row => Number.isFinite(row.id))
  };
}

export async function getEventLive(gameweek, { finished = false } = {}) {
  const gw = Math.max(1, Math.min(38, Number(gameweek) || 1));
  const key = String(gw);
  const now = Date.now();
  const old = CACHE.get(key);
  const ttl = finished ? 60 * 60 * 1000 : 15 * 1000;
  if (old?.data && now - old.at < ttl) return old.data;
  if (old?.promise) return old.promise;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  const promise = (async () => {
    try {
      const response = await fetch(EVENT_LIVE_URL + gw + '/live/', {
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
        signal: controller.signal
      });
      if (!response.ok) throw new Error('Official FPL live feed unavailable (' + response.status + ') for Gameweek ' + gw + '.');
      const data = normalizeEventLive(await response.json(), gw);
      CACHE.set(key, { data, at: Date.now(), promise: null });
      return data;
    } catch (error) {
      if (old?.data) return old.data;
      throw error;
    } finally {
      clearTimeout(timeout);
      const current = CACHE.get(key);
      if (current?.promise) CACHE.set(key, { data: current.data, at: current.at });
    }
  })();
  CACHE.set(key, { data: old?.data, at: old?.at || 0, promise });
  try {
    return await promise;
  } finally {
    const current = CACHE.get(key);
    if (current?.promise) CACHE.set(key, { data: current.data, at: current.at });
  }
}
