import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { koreaDay, nextKoreaMidnight, rankRegions, emptyCounts, regionColor, REGIONS } from '../shared/regions.js';
import { validateClick } from '../api/scores.js';

test('Korean midnight changes the competition day, independent of UTC date', () => {
  const before = Date.parse('2026-11-04T14:59:59.999Z');
  const midnight = Date.parse('2026-11-04T15:00:00.000Z');
  assert.equal(koreaDay(before), '2026-11-04');
  assert.equal(koreaDay(midnight), '2026-11-05');
  assert.equal(nextKoreaMidnight(before), midnight);
  assert.equal(nextKoreaMidnight(midnight), midnight + 86400000);
});

test('same counts share a rank and unclicked regions have no rank', () => {
  const ranked = rankRegions({ ...emptyCounts(), seoul: 10, jeju: 10, busan: 9 });
  assert.equal(ranked.find(r => r.id === 'seoul').rank, 1);
  assert.equal(ranked.find(r => r.id === 'jeju').rank, 1);
  assert.equal(ranked.find(r => r.id === 'busan').rank, 3);
  assert.equal(ranked.find(r => r.id === 'sejong').rank, null);
});

test('current competition groups Jeonnam and Gwangju into one region', () => {
  assert.equal(REGIONS.length, 16);
  assert.ok(REGIONS.some(region => region.name === '전남광주통합특별시'));
  assert.equal(REGIONS.filter(region => /전남|광주/.test(region.short)).length, 1);
});

test('color progresses from white through light lime to saturated lime', () => {
  assert.equal(regionColor(0), '#ffffff');
  const colors = [1, 10, 100, 1000, 10000].map(count => regionColor(count).match(/\d+/g).map(Number));
  colors.forEach((color, i) => { if (i) assert.ok(color[0] < colors[i - 1][0]); assert.ok(color[1] > color[0]); });
});

test('server rejects arbitrary regions, fractional clicks and malformed request IDs', () => {
  const body = { regionId: 'seoul', amount: 1, requestId: randomUUID(), day: '2026-11-04' };
  assert.equal(validateClick(body), null);
  for (const invalid of [null, [], {...body,regionId:'gwangju'}, {...body,amount:0}, {...body,amount:41}, {...body,amount:1.5}, {...body,requestId:'test'}, {...body,day:'yesterday'}]) assert.ok(validateClick(invalid));
});
