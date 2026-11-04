import { Redis } from '@upstash/redis';
import { createHash } from 'node:crypto';
import { emptyCounts, koreaDay, nextKoreaMidnight, REGION_IDS } from '../shared/regions.js';

let client;
export function getRedis() {
  if (client) return client;
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('Database environment is not configured');
  client = new Redis({ url, token, retry: { retries: 2, backoff: retry => Math.min(300 * 2 ** retry, 1200) } });
  return client;
}

// Deduplication, rate limiting and incrementing run in one Redis transaction.
// Retrying the same request never adds the same clicks twice.
const incrementScript = `
local previous = redis.call('HGET', KEYS[2], ARGV[1])
local fingerprint = ARGV[2] .. ':' .. ARGV[3]
if previous then
  if previous ~= fingerprint then return {-2, {}} end
  return {0, redis.call('HGETALL', KEYS[1])}
end
local amount = tonumber(ARGV[3])
local used = tonumber(redis.call('GET', KEYS[3]) or '0')
if used + amount > tonumber(ARGV[5]) then return {-1, {}} end
local current = tonumber(redis.call('HGET', KEYS[1], ARGV[2]) or '0')
if current + amount > 9000000000000000 then return {-3, {}} end
redis.call('INCRBY', KEYS[3], amount)
if used == 0 then redis.call('EXPIRE', KEYS[3], 60) end
redis.call('HINCRBY', KEYS[1], ARGV[2], amount)
redis.call('HSET', KEYS[2], ARGV[1], fingerprint)
redis.call('EXPIREAT', KEYS[1], ARGV[4])
redis.call('EXPIREAT', KEYS[2], ARGV[4])
return {1, redis.call('HGETALL', KEYS[1])}
`;

function normalizeCounts(values = {}) {
  const result = emptyCounts();
  for (const id of REGION_IDS) {
    const value = Number(values?.[id] ?? 0);
    result[id] = Number.isSafeInteger(value) && value >= 0 ? value : 0;
  }
  return result;
}

function snapshot(counts, now) {
  return { day: koreaDay(now), counts: normalizeCounts(counts), serverNow: now, resetAt: nextKoreaMidnight(now) };
}

export function createScoreStore(redis, namespace = 'yeondu:production:v1') {
  const scoreKey = now => `${namespace}:scores:${koreaDay(now)}`;
  return {
    async read(now = Date.now()) {
      return snapshot(await redis.hgetall(scoreKey(now)), now);
    },
    async increment({ regionId, amount, requestId, day }, ip, now = Date.now()) {
      if (day !== koreaDay(now)) return { status: 409, data: await this.read(now) };
      const ipHash = createHash('sha256').update(ip).digest('hex').slice(0, 24);
      const expiration = Math.floor(nextKoreaMidnight(now) / 1000) + 2 * 86400;
      const result = await redis.eval(incrementScript, [
        scoreKey(now), `${namespace}:requests:${day}`, `${namespace}:rate:${ipHash}`,
      ], [requestId, regionId, String(amount), String(expiration), '1200']);
      const [status, flatCounts] = result;
      if (status === -1) return { status: 429, data: { error: '응원이 너무 빠르게 모였어요. 잠시 쉬었다 다시 눌러 주세요.' } };
      if (status === -2) return { status: 409, data: { error: '이미 사용된 요청 번호예요. 새로고침 후 다시 시도해 주세요.' } };
      if (status === -3) return { status: 409, data: { error: '오늘의 응원 수 한도에 도달했어요.' } };
      const counts = {};
      for (let index = 0; index < flatCounts.length; index += 2) counts[flatCounts[index]] = flatCounts[index + 1];
      return { status: 200, data: snapshot(counts, now) };
    },
  };
}

export function getStore() {
  // Development and previews use separate counters from the public competition.
  const environment = process.env.VERCEL_ENV || 'development';
  return createScoreStore(getRedis(), `yeondu:${environment}:v1`);
}
