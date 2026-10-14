import assert from 'node:assert/strict';
import { gameweekMeta, normalizeEventLive } from '../fpl-live.js';

const now = Date.parse('2026-10-14T12:00:00Z');
const meta = gameweekMeta({
  events: [
    { id: 6, is_current: false, is_next: false, finished: true, deadline_time: '2026-10-01T10:00:00Z' },
    { id: 7, is_current: true, is_next: false, finished: false, deadline_time: '2026-10-08T10:00:00Z' },
    { id: 8, is_current: false, is_next: true, finished: false, deadline_time: '2026-10-20T10:00:00Z' }
  ]
}, now);
assert.equal(meta.currentGameweek, 7);
assert.equal(meta.nextGameweek, 8);
assert.equal(meta.deadlineGameweek, 8);
assert.equal(meta.deadline, '2026-10-20T10:00:00Z');

const live = normalizeEventLive({
  elements: [
    { id: 12, stats: { total_points: 8, minutes: 90, starts: 1, goals_scored: 1, assists: 2, yellow_cards: 1 } },
    { id: 13, stats: { total_points: 0, minutes: 0 } }
  ]
}, 7);
assert.equal(live.gameweek, 7);
assert.equal(live.elements[0].stats.total_points, 8);
assert.equal(live.elements[0].stats.goals_scored, 1);
assert.equal(live.elements[0].stats.yellow_cards, 1);
assert.equal(live.elements[1].stats.minutes, 0);
assert.throws(() => normalizeEventLive({}, 7), /invalid payload/);
console.log('PASS official FPL data helpers');
