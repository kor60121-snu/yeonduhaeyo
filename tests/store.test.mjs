import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createScoreStore, getRedis } from '../lib/store.js';
import { koreaDay } from '../shared/regions.js';

try { process.loadEnvFile('.env.local'); } catch {}
const configured = Boolean(process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN);

test('real Redis: concurrent clicks, retry deduplication and midnight reset', { skip: !configured }, async () => {
  const redis = getRedis();
  const namespace = `yeondu:test:${randomUUID()}`;
  const store = createScoreStore(redis, namespace);
  const before = Date.parse('2090-11-04T14:59:59Z');
  const after = Date.parse('2090-11-04T15:00:00Z');
  const day = koreaDay(before);
  const ip = 'integration-test';
  const payload = () => ({ regionId: 'seoul', amount: 1, requestId: randomUUID(), day });
  try {
    const operations = Array.from({ length: 20 }, payload);
    const responses = await Promise.all(operations.map(body => store.increment(body, ip, before)));
    assert.ok(responses.every(response => response.status === 200));
    assert.equal((await store.read(before)).counts.seoul, 20);
    await Promise.all(Array.from({ length: 5 }, () => store.increment(operations[0], ip, before)));
    assert.equal((await store.read(before)).counts.seoul, 20, 'retries do not count twice');
    const reset = await store.read(after);
    assert.equal(reset.counts.seoul, 0);
    assert.equal(reset.day, '2090-11-05');
    const stale = await store.increment(payload(), ip, after);
    assert.equal(stale.status, 409);
    assert.equal((await store.read(after)).counts.seoul, 0, 'previous day clicks never leak into new day');
    const next = await store.increment({ ...payload(), day: koreaDay(after), amount: 5 }, ip, after);
    assert.equal(next.data.counts.seoul, 5);
    const conflict = await store.increment({ ...operations[0], amount: 2 }, ip, before);
    assert.equal(conflict.status, 409);
  } finally {
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, { match: `${namespace}:*`, count: 100 });
      if (keys.length) await redis.del(...keys);
      cursor = String(next);
    } while (cursor !== '0');
  }
});
