import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../public/account.js', import.meta.url), 'utf8');
const match = src.match(/\/\/#restore-start\n([\s\S]*?)\n\/\/#restore-end/);
assert.ok(match, 'restoreLineup helper markers must exist');
const restoreLineup = new Function(match[1] + ';return restoreLineup')();

const positions = ['GK','GK','DEF','DEF','DEF','DEF','DEF','MID','MID','MID','MID','MID','FWD','FWD','FWD'];
const rows = positions.map((position, i) => ({
  player_id: i + 1,
  player_name: 'Player ' + i,
  club: 'Club ' + (i % 5),
  position,
  price: 5,
  is_captain: i === 12,
  is_vice: i === 7,
  is_bench: [1, 3, 6, 10].includes(i)
}));

const scrambled = [rows[14], ...rows.slice(0, 14).reverse()];
const restored = restoreLineup(scrambled);
assert.equal(restored.formation, '3-4-3');
assert.equal(restored.arr.length, 15);
assert.equal(restored.arr.slice(11).length, 4);
assert.equal(restored.arr.filter(p => p.cap).length, 1);
assert.equal(restored.arr.filter(p => p.vice).length, 1);
assert.deepEqual(
  new Set(restored.arr.slice(11).map(p => p.id)),
  new Set(rows.filter(p => p.is_bench).map(p => p.player_id)),
  'the same four players must remain on the bench'
);
assert.ok(restored.arr.every(p => !('_b' in p)));

const noBenchFlags = restoreLineup(rows.map(({ is_bench, ...row }) => row));
assert.equal(noBenchFlags.formation, null);
assert.equal(noBenchFlags.arr.length, 15);

const invalidFormation = rows.map(row => ({ ...row }));
invalidFormation.find(row => row.player_id === 4).is_bench = false;
assert.equal(restoreLineup(invalidFormation).formation, null);

console.log('PASS lineup restore');
