import { REGION_IDS } from '../shared/regions.js';
import { getStore } from '../lib/store.js';

export function validateClick(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return '올바른 응원 요청이 아니에요.';
  if (!REGION_IDS.has(body.regionId)) return '지역을 다시 선택해 주세요.';
  if (!Number.isInteger(body.amount) || body.amount < 1 || body.amount > 40) return '한 번에 저장할 수 있는 응원 수는 1~40번이에요.';
  if (typeof body.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId)) return '요청 번호가 올바르지 않아요.';
  if (typeof body.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.day)) return '날짜가 올바르지 않아요.';
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: '지원하지 않는 요청 방식이에요.' });
  }
  try {
    if (req.method === 'GET') return res.status(200).json(await getStore().read());
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return res.status(403).json({ error: '앱 안에서 응원해 주세요.' });
    if (!req.headers['content-type']?.startsWith('application/json')) return res.status(415).json({ error: 'JSON 요청이 필요해요.' });
    if (Number(req.headers['content-length']) > 2048) return res.status(413).json({ error: '요청이 너무 커요.' });
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { return res.status(400).json({ error: '요청을 읽을 수 없어요.' }); }
    }
    const validationError = validateClick(body);
    if (validationError) return res.status(400).json({ error: validationError });
    const ip = req.headers['x-real-ip'] || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
    const result = await getStore().increment(body, ip);
    if (result.status === 429) res.setHeader('Retry-After', '60');
    return res.status(result.status).json(result.data);
  } catch (error) {
    console.error('scores_request_failed', { name: error?.name ?? 'Error', method: req.method });
    return res.status(503).json({ error: '응원 서버에 잠시 연결하지 못했어요. 곧 다시 시도할게요.' });
  }
}
