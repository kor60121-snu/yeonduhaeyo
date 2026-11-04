export const REGIONS = [
  { id: 'seoul', name: '서울특별시', short: '서울', type: '특별시', code: '11' },
  { id: 'busan', name: '부산광역시', short: '부산', type: '광역시', code: '21' },
  { id: 'daegu', name: '대구광역시', short: '대구', type: '광역시', code: '22' },
  { id: 'incheon', name: '인천광역시', short: '인천', type: '광역시', code: '23' },
  { id: 'daejeon', name: '대전광역시', short: '대전', type: '광역시', code: '25' },
  { id: 'ulsan', name: '울산광역시', short: '울산', type: '광역시', code: '26' },
  { id: 'sejong', name: '세종특별자치시', short: '세종', type: '특별자치시', code: '29' },
  { id: 'gyeonggi', name: '경기도', short: '경기', type: '도', code: '31' },
  { id: 'gangwon', name: '강원특별자치도', short: '강원', type: '특별자치도', code: '32' },
  { id: 'chungbuk', name: '충청북도', short: '충북', type: '도', code: '33' },
  { id: 'chungnam', name: '충청남도', short: '충남', type: '도', code: '34' },
  { id: 'jeonbuk', name: '전북특별자치도', short: '전북', type: '특별자치도', code: '35' },
  { id: 'jeonnam-gwangju', name: '전남광주통합특별시', short: '전남광주', type: '통합특별시', code: '36' },
  { id: 'gyeongbuk', name: '경상북도', short: '경북', type: '도', code: '37' },
  { id: 'gyeongnam', name: '경상남도', short: '경남', type: '도', code: '38' },
  { id: 'jeju', name: '제주특별자치도', short: '제주', type: '특별자치도', code: '39' },
];

export const REGION_IDS = new Set(REGIONS.map(region => region.id));
export const emptyCounts = () => Object.fromEntries(REGIONS.map(region => [region.id, 0]));

export function koreaDay(now = Date.now()) {
  return new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function nextKoreaMidnight(now = Date.now()) {
  const day = koreaDay(now);
  return Date.parse(`${day}T00:00:00+09:00`) + 24 * 60 * 60 * 1000;
}

export function rankRegions(counts) {
  const sorted = REGIONS.map(region => ({ ...region, count: counts[region.id] ?? 0 }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko'));
  let rank = 0;
  return sorted.map((region, index) => {
    if (index === 0 || region.count !== sorted[index - 1].count) rank = index + 1;
    return { ...region, rank: region.count > 0 ? rank : null };
  });
}

export function regionColor(count) {
  if (count <= 0) return '#ffffff';
  const level = Math.min(1, Math.log10(count + 1) / 4);
  const stops = [[242, 251, 224], [192, 232, 111], [115, 179, 31]];
  const index = level < 0.5 ? 0 : 1;
  const t = level < 0.5 ? level * 2 : (level - 0.5) * 2;
  return `rgb(${stops[index].map((v, i) => Math.round(v + (stops[index + 1][i] - v) * t)).join(', ')})`;
}
