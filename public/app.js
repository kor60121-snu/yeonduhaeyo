import { REGIONS, emptyCounts, rankRegions, regionColor } from './regions.js';

const $ = selector => document.querySelector(selector);
const format = new Intl.NumberFormat('ko-KR');
const svgNS = 'http://www.w3.org/2000/svg';
const state = {
  day: null, counts: emptyCounts(), ready: false, selected: null,
  resetAt: null, clockOffset: 0, queue: new Map(), batches: new Map(), zoom: 1,
};
let toastTimer, flushTimer, polling = false, geometry = [];
const meter = document.createElement('canvas').getContext('2d');
const svgLabels = [];
// Every region gets the same large card, positioned to avoid neighboring cards.
const labelCardSize = { width: 140, height: 76 };
const mainLabelCenters = {
  seoul: [440, 320],
  incheon: [290, 330],
  gyeonggi: [450, 412],
  gangwon: [680, 300],
  chungbuk: [610, 480],
  chungnam: [330, 550],
  sejong: [475, 578],
  daejeon: [490, 664],
  jeonbuk: [450, 785],
  'jeonnam-gwangju': [375, 987],
  gyeongbuk: [800, 550],
  daegu: [720, 746],
  ulsan: [885, 835],
  busan: [830, 935],
  gyeongnam: [610, 870],
  jeju: [302, 1362],
};

function svgElement(tag, attributes = {}, content) {
  const node = document.createElementNS(svgNS, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  if (content !== undefined) node.textContent = content;
  return node;
}

function fitText(text, maxSize, width, weight = 700) {
  meter.font = `${weight} ${maxSize}px 'Pretendard Variable', sans-serif`;
  return Math.min(maxSize, maxSize * width / Math.max(1, meter.measureText(text).width));
}

function countFor(regionId) {
  let count = state.counts[regionId] ?? 0;
  count += state.queue.get(regionId) ?? 0;
  for (const batch of state.batches.values()) if (batch.regionId === regionId && batch.day === state.day) count += batch.amount;
  return count;
}

function visibleCounts() {
  return Object.fromEntries(REGIONS.map(region => [region.id, countFor(region.id)]));
}

function toast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3300);
}

function setConnection(ready) {
  state.ready = ready;
  document.body.classList.toggle('connection-error', !ready);
  $('#connection-text').textContent = ready ? '함께 응원 중' : '다시 연결하는 중';
  updateSelected();
}

function acceptSnapshot(snapshot) {
  if (!snapshot || typeof snapshot.day !== 'string' || !snapshot.counts) throw new Error('올바르지 않은 서버 응답이에요.');
  if (state.day && snapshot.day < state.day) return;
  if (state.day !== snapshot.day) {
    if (state.day) toast('새로운 하루가 시작됐어요. 다시 연두해요!');
    state.day = snapshot.day;
    state.counts = emptyCounts();
    state.queue.clear();
    state.batches.clear();
  }
  for (const region of REGIONS) {
    const count = snapshot.counts[region.id];
    if (Number.isSafeInteger(count) && count >= 0) state.counts[region.id] = Math.max(state.counts[region.id], count);
  }
  state.resetAt = snapshot.resetAt;
  state.clockOffset = snapshot.serverNow - Date.now();
  setConnection(true);
  render();
}

async function fetchSnapshot() {
  if (polling) return;
  polling = true;
  try {
    const response = await fetch('/api/scores', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('서버에 연결할 수 없어요.');
    acceptSnapshot(await response.json());
  } catch {
    setConnection(false);
  } finally { polling = false; }
}

function selectRegion(id) {
  state.selected = REGIONS.find(region => region.id === id) ?? null;
  document.querySelectorAll('.map-region, .map-region-label').forEach(node => node.classList.toggle('selected', node.dataset.region === id));
  updateSelected();
}

function cheer(id, event) {
  selectRegion(id);
  if (!state.ready || !state.day) { toast('서버에 연결되면 응원할 수 있어요. 잠시만 기다려 주세요.'); return; }
  if (Date.now() + state.clockOffset >= state.resetAt) { fetchSnapshot(); toast('새로운 라운드를 준비하고 있어요.'); return; }
  state.queue.set(id, (state.queue.get(id) ?? 0) + 1);
  render();
  if (event?.clientX) {
    const floating = document.createElement('span');
    floating.className = 'float-cheer';
    floating.textContent = '+1';
    floating.style.left = `${event.pageX}px`;
    floating.style.top = `${event.pageY - 20}px`;
    document.body.append(floating);
    setTimeout(() => floating.remove(), 950);
  }
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flushQueue, 140);
  // Continuous tapping must still flush, even if there is never a pause.
  if ((state.queue.get(id) ?? 0) >= 25) flushQueue();
}

function flushQueue() {
  for (const [regionId, count] of state.queue) {
    if (!count) continue;
    const amount = Math.min(count, 40);
    state.queue.set(regionId, count - amount);
    const batch = { regionId, amount, day: state.day, requestId: crypto.randomUUID(), attempts: 0 };
    state.batches.set(batch.requestId, batch);
    sendBatch(batch);
  }
  if ([...state.queue.values()].some(Boolean)) flushTimer = setTimeout(flushQueue, 150);
}

async function sendBatch(batch) {
  try {
    const response = await fetch('/api/scores', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch), signal: AbortSignal.timeout(12000), keepalive: true,
    });
    const result = await response.json();
    if (response.status === 409 && result.counts) {
      state.batches.delete(batch.requestId);
      acceptSnapshot(result);
      toast('새 라운드가 시작됐어요. 다시 눌러 주세요.');
      return;
    }
    if (!response.ok) {
      const error = new Error(result.error || '응원을 저장하지 못했어요.');
      error.terminal = response.status >= 400 && response.status < 500;
      throw error;
    }
    // Remove the optimistic increment before applying its confirmed snapshot.
    state.batches.delete(batch.requestId);
    acceptSnapshot(result);
  } catch (error) {
    if (!state.batches.has(batch.requestId)) return;
    batch.attempts += 1;
    if (!error.terminal && batch.attempts < 4 && batch.day === state.day) {
      setTimeout(() => sendBatch(batch), 700 * 2 ** (batch.attempts - 1));
    } else {
      state.batches.delete(batch.requestId);
      render();
      toast(error.terminal ? error.message : '연결이 잠시 끊겼어요. 응원 수를 다시 확인할게요.');
      fetchSnapshot();
    }
  }
}

function makeRegion(region, geo) {
  const group = svgElement('g', {
    class: 'map-region', 'data-region': region.id, role: 'button', tabindex: '0',
    'data-map-part': 'main',
    'aria-label': `${region.name} 응원하기`,
  });
  group.append(svgElement('title', {}, `${region.name} · 누르면 응원 +1`));
  group.append(svgElement('path', { class: 'region-shape', d: geo.path, fill: '#fff' }));
  const [centerX, centerY] = mainLabelCenters[region.id];
  const { width: w, height: h } = labelCardSize;
  const x = centerX - w / 2, y = centerY - h / 2;
  const label = svgElement('g', { class: 'map-region-label', 'data-region': region.id, 'aria-hidden': 'true' });
  label.append(svgElement('rect', { class: 'region-label-bg', x, y, width: w, height: h, rx: Math.min(3, h * .08) }));
  const name = svgElement('text', {
    class: 'region-label-name', x: x + w / 2, y: y + h * .36, 'text-anchor': 'middle',
    'dominant-baseline': 'central', 'font-size': fitText(region.short, h * .30, w * .86, 550),
  }, region.short);
  const count = svgElement('text', {
    class: 'region-label-count', x: x + w / 2, y: y + h * .72, 'text-anchor': 'middle',
    'dominant-baseline': 'central', 'font-size': h * .36, 'data-count-for': region.id,
  }, '0');
  label.append(name, count);
  // A card remains clickable even where it extends beyond its region's shape.
  label.addEventListener('click', event => { event.stopPropagation(); cheer(region.id, event); });
  label.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); event.stopPropagation(); cheer(region.id);
    }
  });
  group.append(label);
  svgLabels.push({ id: region.id, count, width: w * .86, fontSize: h * .36 });
  group.addEventListener('click', event => cheer(region.id, event));
  group.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); cheer(region.id); }
  });
  return group;
}

function addIslands(map, title, regionId, { x, y, w, h, viewBox }) {
  const region = REGIONS.find(item => item.id === regionId);
  const geo = geometry.find(item => item.code === region.code);
  map.append(svgElement('rect', { class: 'inset-bg', x, y, width: w, height: h, rx: 9 }));
  map.append(svgElement('text', { class: 'inset-title', x: x + 14, y: y + 24 }, title));
  const inset = svgElement('svg', { x: x + 10, y: y + 40, width: w - 20, height: h - 50, viewBox, 'aria-label': title });
  const group = svgElement('g', { class: 'map-region', 'data-region': regionId, role: 'button', tabindex: '0', 'aria-label': `${title}, ${region.name} 응원하기` });
  group.append(svgElement('path', { class: 'region-shape', d: geo.path, fill: '#fff' }));
  group.addEventListener('click', event => cheer(regionId, event));
  group.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); cheer(regionId); } });
  inset.append(group);
  map.append(inset);
}

async function drawMap() {
  try {
    const response = await fetch('/map.json');
    if (!response.ok) throw new Error('map');
    geometry = await response.json();
    const map = $('#korea-map');
    const labelLayer = svgElement('g', { class: 'map-label-layer' });
    for (const region of REGIONS) {
      const geo = geometry.find(item => item.code === region.code);
      const group = makeRegion(region, geo);
      const label = group.querySelector('.map-region-label');
      label.removeAttribute('aria-hidden');
      label.setAttribute('role', 'button');
      label.setAttribute('tabindex', '0');
      label.setAttribute('aria-label', `${region.name} 응원하기`);
      group.setAttribute('tabindex', '-1');
      labelLayer.append(label);
      map.append(group);
    }
    map.append(svgElement('text', { class: 'sea-label', x: 982, y: 420 }, '동해'));
    map.append(svgElement('text', { class: 'sea-label', x: 92, y: 930 }, '서해'));
    map.append(svgElement('text', { class: 'sea-label', x: 682, y: 1280 }, '남해'));
    addIslands(map, '울릉도 · 독도', 'gyeongbuk', { x: 945, y: 125, w: 225, h: 170, viewBox: '1180 300 270 160' });
    addIslands(map, '서해 도서 · 인천', 'incheon', { x: 24, y: 1010, w: 190, h: 180, viewBox: '-120 220 220 230' });
    map.append(svgElement('text', { class: 'map-caption', x: 250, y: 1420 }, '제주특별자치도'));
    // Main-map cards sit above every region, so a neighboring path cannot intercept a tap.
    map.append(labelLayer);
    $('#map-loading').remove();
    render();
    if (document.fonts?.ready) document.fonts.ready.then(render);
  } catch {
    $('#map-loading').innerHTML = '<p>지도를 불러오지 못했어요.</p><button class="text-button" id="map-retry">다시 불러오기 ↗</button>';
    $('#map-retry').addEventListener('click', () => location.reload());
  }
}

function updateSelected() {
  const region = state.selected;
  const button = $('#cheer-button');
  button.disabled = !region || !state.ready;
  if (!region) return;
  $('#support-label').textContent = '오늘, 내가 응원하는 곳';
  $('#selected-name').textContent = region.name;
  $('#selected-name').style.fontSize = region.name.length > 8 ? '21px' : '';
  $('#selected-type').textContent = `${region.type} · 마음이 모이는 중`;
  const text = format.format(countFor(region.id));
  const strong = $('#selected-count');
  strong.textContent = text;
  strong.style.fontSize = `${fitText(text, 48, strong.parentElement.clientWidth - 5, 650)}px`;
  const ranking = rankRegions(visibleCounts()).find(item => item.id === region.id);
  $('#selected-rank').textContent = ranking.rank ? `${ranking.rank}위` : '첫 응원을 기다려요';
  button.firstElementChild.textContent = state.ready ? `${region.short} 응원하기` : '연결을 기다리고 있어요';
  button.setAttribute('aria-label', `${region.name} 응원 수 1 올리기`);
}

function render() {
  const counts = visibleCounts();
  const ranked = rankRegions(counts);
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  $('#hero-total').textContent = state.day ? format.format(total) : '—';
  $('#hero-total').style.fontSize = `${fitText(format.format(total), innerWidth < 430 ? 25 : innerWidth < 780 ? 29 : 42, innerWidth < 430 ? 115 : innerWidth < 780 ? 155 : 235, 650)}px`;
  if (state.day) {
    const date = new Date(`${state.day}T12:00:00+09:00`);
    $('#today-date').textContent = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short', timeZone: 'Asia/Seoul' }).format(date);
  }
  document.querySelectorAll('.map-region').forEach(node => {
    node.querySelector('.region-shape').setAttribute('fill', regionColor(counts[node.dataset.region]));
    const region = REGIONS.find(item => item.id === node.dataset.region);
    node.setAttribute('aria-label', `${region.name}, ${format.format(counts[region.id])}번의 응원. 누르면 1 증가`);
  });
  for (const label of svgLabels) {
    const text = format.format(counts[label.id]);
    label.count.textContent = text;
    label.count.setAttribute('font-size', fitText(text, label.fontSize, label.width, 750));
    // Measure the actual SVG font as well, including a late-loading web font.
    const measured = label.count.getComputedTextLength();
    if (measured > label.width) {
      const currentSize = Number(label.count.getAttribute('font-size'));
      label.count.setAttribute('font-size', currentSize * label.width / measured * .98);
    }
  }
  document.querySelectorAll('.map-label-layer .map-region-label').forEach(node => {
    const region = REGIONS.find(item => item.id === node.dataset.region);
    node.setAttribute('aria-label', `${region.name}, ${format.format(counts[region.id])}번의 응원. 누르면 1 증가`);
  });
  updateSelected();
  renderRankings(ranked, total);
}

function renderRankings(ranked, total) {
  const top = $('#top-list');
  if (!total) {
    top.innerHTML = '<div class="empty-top"><b>아직은 모두 같은 출발선.</b>첫 번째 응원으로<br>우리 지역을 1위로 만들어 보세요.</div>';
    $('#podium').innerHTML = '<div class="podium-empty"><strong>오늘의 첫 연두를 기다려요.</strong>지도에서 우리 지역을 누르면<br>새로운 경쟁이 시작됩니다.</div>';
  } else {
    top.innerHTML = ranked.filter(region => region.count > 0).slice(0, 5).map(region => `<div class="top-row"><span class="top-rank">${region.rank}</span><span class="top-region">${region.short}</span><span class="top-count">${format.format(region.count)}<small>번</small></span></div>`).join('');
    $('#podium').innerHTML = ranked.slice(0, 3).map((region, index) => `<div class="podium-card ${index === 0 ? 'winner' : index === 1 ? 'second' : 'third'}"><span class="podium-rank">${region.rank ?? '—'}</span><h3>${region.short}</h3><strong title="${format.format(region.count)}번">${format.format(region.count)}</strong><small>번의 응원</small></div>`).join('');
  }
  $('#ranking-list').innerHTML = ranked.map(region => `<button class="ranking-row" data-select-region="${region.id}" aria-label="${region.name} 지도에서 보기"><span class="rank-number">${region.rank ?? '—'}</span><span class="rank-region-dot" style="background:${regionColor(region.count)}"></span><span class="rank-name">${region.name}<span class="rank-type">${region.type}</span></span><span class="rank-count" title="${format.format(region.count)}번">${format.format(region.count)}<small>번</small></span></button>`).join('');
}

function changeTab(name, focus = false) {
  for (const tab of ['map', 'ranking']) {
    const selected = tab === name;
    $(`#${tab}-tab`).classList.toggle('active', selected);
    $(`#${tab}-tab`).setAttribute('aria-selected', String(selected));
    $(`#${tab}-tab`).tabIndex = selected ? 0 : -1;
    $(`#${tab}-panel`).hidden = !selected;
  }
  if (focus) $(`#${name}-tab`).focus();
}

function setZoom(next) {
  state.zoom = Math.max(1, Math.min(3, next));
  $('#map-canvas').style.width = `${state.zoom * 100}%`;
  $('#zoom-reset').textContent = `${Math.round(state.zoom * 100)}%`;
  $('#zoom-out').disabled = state.zoom <= 1;
  $('#zoom-in').disabled = state.zoom >= 3;
}

function updateCountdown() {
  if (!state.resetAt) return;
  const left = Math.max(0, Math.ceil((state.resetAt - Date.now() - state.clockOffset) / 1000));
  const parts = [Math.floor(left / 3600), Math.floor(left % 3600 / 60), left % 60];
  $('#countdown').textContent = parts.map(part => String(part).padStart(2, '0')).join(':');
  if (!left) fetchSnapshot();
}

$('#cheer-button').addEventListener('click', event => state.selected && cheer(state.selected.id, event));
$('#map-tab').addEventListener('click', () => changeTab('map'));
$('#ranking-tab').addEventListener('click', () => changeTab('ranking'));
$('#view-ranking').addEventListener('click', () => {
  changeTab('ranking');
  $('#ranking-tab').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
$('.workspace-tabs').addEventListener('keydown', event => {
  if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    changeTab(event.key === 'Home' ? 'map' : event.key === 'End' ? 'ranking' : $('#map-tab').getAttribute('aria-selected') === 'true' ? 'ranking' : 'map', true);
  }
});
$('#ranking-list').addEventListener('click', event => {
  const row = event.target.closest('[data-select-region]');
  if (!row) return;
  selectRegion(row.dataset.selectRegion);
  changeTab('map');
  $('#map-tab').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
$('#zoom-in').addEventListener('click', () => setZoom(state.zoom + .5));
$('#zoom-out').addEventListener('click', () => setZoom(state.zoom - .5));
$('#zoom-reset').addEventListener('click', () => { setZoom(1); $('#map-scroll').scrollTo({ top: 0, left: 0 }); });
$('#how-button').addEventListener('click', () => $('#how-dialog').showModal());
$('.dialog-close').addEventListener('click', () => $('#how-dialog').close());
$('.dialog-start').addEventListener('click', () => $('#how-dialog').close());
$('#how-dialog').addEventListener('click', event => { if (event.target === $('#how-dialog')) { const r = event.target.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) event.target.close(); } });
$('#share-button').addEventListener('click', async () => {
  const share = { title: '연두해요', text: '한 번의 클릭으로 우리 지역을 연두로! 함께 응원해요.', url: location.origin };
  try {
    if (navigator.share) await navigator.share(share);
    else { await navigator.clipboard.writeText(share.url); toast('주소를 복사했어요. 친구에게 보내 보세요!'); }
  } catch (error) {
    if (error.name === 'AbortError') return;
    const input = document.createElement('input');
    input.value = share.url;
    input.readOnly = true;
    input.setAttribute('aria-label', '공유할 웹앱 주소');
    input.style.cssText = 'position:fixed;bottom:75px;left:10%;width:80%;padding:14px;z-index:90;border:1px solid #9fb67f;border-radius:8px';
    document.body.append(input); input.focus(); input.select();
    toast('주소를 길게 누르거나 복사해서 공유해 주세요.');
    input.addEventListener('blur', () => setTimeout(() => input.remove(), 200));
  }
});
window.addEventListener('online', fetchSnapshot);
window.addEventListener('resize', render);
window.addEventListener('pagehide', flushQueue);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) flushQueue();
  else fetchSnapshot();
});
setInterval(() => { if (!document.hidden) fetchSnapshot(); }, 3000);
setInterval(updateCountdown, 1000);
setZoom(1);
render();
drawMap();
fetchSnapshot();
