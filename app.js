'use strict';

// 같은 폴더의 'Screentone 태그.xlsx' 한 권 → 줄(랜덤 항목)과 스위치.
// 그 위에 메모 시트 셋을 더 읽는다(전부 없어도 돌아간다).
//   #방향: 릴 · 태그 · 방향("A→B" 또는 "서로") → A 칸 source# / B 칸 target# / 두 칸 mutual#
//   #뜻:   릴 · 태그 · 한국어 뜻 → 줄 아래 작은 글씨
//   #강도: 릴 · 태그 · 1~3 → 수위보다 높은 값은 랜덤에 나오지 않는다(없는 태그는 1로 본다)

const STORE = 'screentone:v1';
const EDITION = 'Screentone';
const SWITCH_SHEET = /켜고\s*끄기|on\s*[\/_-]?\s*off|스위치/i;
const TRUTHY = /^(on|o|y|yes|true|1|켬|켜|켜기|켜짐|ㅇ)$/i;
const MIXY = /^(반반|랜덤|random|mix)$/i;
const DIR_NAME = /\[?\s*A\s*(→|->)\s*B\s*\]?/i;
const BASE_NAME = /인원|드러난|구도|검열|카메라|배경|장소|품질|화풍/;
const nai = (opts) => (opts.length > 1 ? `||${opts.join('|')}||` : opts[0] || '');

const $ = (id) => document.getElementById(id);
const els = {
  rows: $('rows'), empty: $('empty'), rowCount: $('rowCount'), switches: $('switches'),
  spin: $('spinBtn'), status: $('status'), songNo: $('songNo'),
  reload: $('reloadBtn'), fileName: $('fileName'),
  lyric: { base: $('lyricBase'), a: $('lyricA'), b: $('lyricB') },
  whoA: $('whoA'), whoB: $('whoB'), swap: $('swapBtn'), copyAll: $('copyAllBtn'),
  queue: $('queue'), queueEmpty: $('queueEmpty'),
  help: $('help'), helpBtn: $('helpBtn'),
};

let state = {
  fileName: '', loadedAt: '',
  categories: [],   // { key, name, group, items[], def, startOff, dir }
  toggles: [],      // { name, on, off, start, front }
  meta: { dir: {}, ko: {}, lv: {} },
  pick: {}, lock: {}, use: {}, sw: {}, bundle: {},
  route: {},        // key → 'base' | 'a' | 'b' (방향 없는 줄만)
  level: 3,
  swap: false,
  mixRows: 0,       // 돌릴 때 잠그지 않은 줄이 빠질 확률(0이면 켜고 끄기는 그대로)
};

/* ---------- 읽기 ---------- */

const cell = (v) => (v == null ? '' : String(v).trim());
const metaKey = (reel, tag) => reel + '\u0001' + tag;
const bareName = (name) => name.replace(DIR_NAME, '').trim();

function parseWorkbook(wb) {
  const categories = [];
  let toggles = [];
  const meta = { dir: {}, ko: {}, lv: {}, dan: {}, presets: [] };
  const memo = wb.SheetNames.filter((n) => n.trim().startsWith('#'));
  for (const n of memo) {
    const kind = /방향|direction/i.test(n) ? 'dir' : /뜻|meaning/i.test(n) ? 'ko' : /강도|수위|level/i.test(n) ? 'lv' : '';
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '', blankrows: false });
    if (kind) readMemo(rows, kind, meta);
    else if (/단부루|danbooru/i.test(n)) readDanbooru(rows, meta);
    else if (/프리셋|preset/i.test(n)) readPresets(rows, meta);
  }
  const sheets = wb.SheetNames.filter((n) => !n.trim().startsWith('#'));
  const randomSheets = sheets.filter((n) => !SWITCH_SHEET.test(n));
  for (const sheetName of sheets) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '', blankrows: false });
    if (!rows.length) continue;
    if (SWITCH_SHEET.test(sheetName)) { toggles = toggles.concat(parseToggles(rows)); continue; }
    const head = rows[0];
    for (let c = 0; c < head.length; c++) {
      let name = cell(head[c]);
      const startOff = name.startsWith('-');
      if (startOff) name = name.slice(1).trim();
      if (!name) continue;
      const seen = new Set();
      const items = [];
      let def = '';
      for (let r = 1; r < rows.length; r++) {
        let v = cell(rows[r][c]);
        if (v.startsWith('*')) { v = v.slice(1).trim(); if (!def) def = v; }
        if (v && !seen.has(v)) { seen.add(v); items.push(v); }
      }
      if (!items.length) continue;
      const group = randomSheets.length > 1 ? sheetName : '';
      // 머리에 [A→B]가 붙은 줄은 전부 방향이 있고, 아닌 줄은 #방향에 적힌 값만 방향이 있다
      const dir = DIR_NAME.test(name);
      categories.push({ key: group + '\u0001' + name, name, group, items, def, startOff, dir });
    }
  }
  return { categories, toggles, meta };
}

// 메모 시트는 위에 설명 줄이 있어도 된다. "태그"가 든 줄을 머리말로 본다
function readMemo(rows, kind, meta) {
  const h = rows.findIndex((r) => r.some((x) => /^태그$|^tag$/i.test(cell(x))));
  if (h < 0) return;
  const head = rows[h].map(cell);
  const ti = head.findIndex((x) => /^태그$|^tag$/i.test(x));
  const ri = head.findIndex((x) => /^릴$|항목|reel/i.test(x));
  const vi = ti + 1;
  for (const row of rows.slice(h + 1)) {
    const tag = cell(row[ti]);
    const val = cell(row[vi]);
    if (!tag || !val) continue;
    const reel = ri >= 0 ? cell(row[ri]).replace(/^-/, '').trim() : '';
    let v = val;
    if (kind === 'dir') v = /서로|mutual/i.test(val) ? 'mutual' : 'ab';
    if (kind === 'lv') { v = Math.min(3, Math.max(1, parseInt(val, 10) || 1)); }
    meta[kind][metaKey(reel, tag)] = v;
    if (!(metaKey('', tag) in meta[kind])) meta[kind][metaKey('', tag)] = v;
  }
}

// #단부루: 시트 · 릴 · 칸 값 · 태그 · 판정. 칸 안의 태그가 전부 단부루(또는 NAI 문법)일 때만 공식으로 본다.
// 화면에는 표시하지 않고, 태그 모음의 '단부루 태그만' 거르기에만 쓴다
function readDanbooru(rows, meta) {
  const h = rows.findIndex((r) => r.some((x) => /^판정$/.test(cell(x))));
  if (h < 0) return;
  const head = rows[h].map(cell);
  const ri = head.indexOf('릴');
  const vi = head.indexOf('칸 값');
  const ji = head.indexOf('판정');
  for (const row of rows.slice(h + 1)) {
    const k = metaKey(cell(row[ri]).replace(/^-/, '').trim(), cell(row[vi]));
    const ok = /^(단부루|NAI 문법)$/.test(cell(row[ji]));
    meta.dan[k] = (meta.dan[k] ?? true) && ok;
  }
}

// #프리셋: 프리셋 · 설명 · 수위 · 줄 섞기 · 고를 값("줄=값 ; 줄=값") · 켤 것 · 끌 것(쉼표로 나눔)
function readPresets(rows, meta) {
  const h = rows.findIndex((r) => cell(r[0]) === '프리셋');
  if (h < 0) return;
  const head = rows[h].map(cell);
  const at = (row, name) => cell(row[head.indexOf(name)]);
  const list = (text) => text.split(',').map((x) => x.trim()).filter(Boolean);
  for (const row of rows.slice(h + 1)) {
    const name = at(row, '프리셋');
    if (!name) continue;
    meta.presets.push({
      name,
      note: at(row, '설명'),
      level: parseInt(at(row, '수위'), 10) || 0,
      mix: { '안 함': 0, '조금': 0.25, '반반': 0.5 }[at(row, '줄 섞기')],
      picks: at(row, '고를 값').split(';').map((x) => x.split('=')).filter((x) => x.length > 1)
        .map(([k, ...v]) => [k.trim(), v.join('=').trim()]),
      on: list(at(row, '켤 것')),
      off: list(at(row, '끌 것')),
    });
  }
}

function parseToggles(rows) {
  const head = rows[0].map((h) => cell(h).toLowerCase());
  const find = (re, fallback) => {
    const i = head.findIndex((h) => re.test(h));
    return i >= 0 ? i : fallback;
  };
  const col = {
    name: find(/이름|name/, 0), on: find(/켜면|켤 때|^on/, 1), off: find(/끄면|끌 때|^off/, 2),
    start: find(/처음|기본|default/, 3), pos: find(/위치|자리|position/, 4),
  };
  const out = [];
  for (const row of rows.slice(1)) {
    const name = cell(row[col.name]);
    const on = cell(row[col.on]);
    const off = cell(row[col.off]);
    if (!name || (!on && !off)) continue;
    out.push({
      name, on, off,
      start: MIXY.test(cell(row[col.start])) ? 'mix' : TRUTHY.test(cell(row[col.start])),
      front: /^(앞|front|처음)/i.test(cell(row[col.pos])),
    });
  }
  return out;
}

const metaOf = (kind, c, tag) => {
  const m = state.meta[kind] || {};
  return m[metaKey(c.name, tag)] ?? m[metaKey('', tag)];
};
const levelOf = (c, tag) => metaOf('lv', c, tag) || 1;
// 이 값이 방향 있는 값인가: [A→B] 줄이면 늘, 아니면 그 줄 이름으로 #방향에 적혀 있을 때만
const dirOf = (c, v) => (c.dir ? metaOf('dir', c, v) || 'ab' : (state.meta.dir || {})[metaKey(c.name, v)]);
const allowed = (c) => c.items.filter((t) => levelOf(c, t) <= state.level);

function defaultRoute(c, hasDir) {
  if (BASE_NAME.test(c.name) || BASE_NAME.test(c.group)) return 'base';
  return hasDir ? 'b' : 'base';
}

function applyParsed(parsed, fileName) {
  const old = state;
  const next = {
    ...old,
    fileName, loadedAt: stamp(),
    categories: parsed.categories, toggles: parsed.toggles, meta: parsed.meta,
    pick: {}, lock: {}, use: {}, sw: {}, bundle: {}, route: {},
  };
  state = next;
  const hasDir = next.categories.some((c) => c.dir);
  // 다시 읽어도 잠근 줄 · 뺀 줄 · 칸 · 스위치는 이름이 같으면 그대로 둔다
  const known = new Set(old.categories.map((c) => c.key));
  for (const c of next.categories) {
    next.route[c.key] = old.route[c.key] || defaultRoute(c, hasDir);
    if (!known.has(c.key)) {
      if (c.startOff) next.use[c.key] = false;
      if (c.def) { next.pick[c.key] = c.def; next.lock[c.key] = true; continue; }
    }
    if (old.use[c.key] === false) next.use[c.key] = false;
    const b = old.bundle && old.bundle[c.key];
    if (b) next.bundle[c.key] = { items: b.items.filter((v) => c.items.includes(v)), none: b.none };
    if (old.pick[c.key] && c.items.includes(old.pick[c.key])) {
      next.pick[c.key] = old.pick[c.key];
      if (old.lock[c.key]) next.lock[c.key] = true;
    } else if (c.def) {
      // 전에 고른 값이 엑셀에서 빠졌으면 엑셀의 처음 값(*)으로 돌아간다
      next.pick[c.key] = c.def;
      next.lock[c.key] = true;
    } else {
      next.pick[c.key] = randomOf(allowed(c));
    }
  }
  for (const t of next.toggles) next.sw[t.name] = t.name in old.sw ? old.sw[t.name] : t.start;
  save();
  render();
  const n = state.categories.length;
  setStatus(n ? `줄 ${n}개 · 스위치 ${state.toggles.length}개를 읽었어요.` : '첫 줄에 항목 이름, 그 아래에 값이 든 시트를 찾지 못했어요.');
}

/* ---------- 같은 폴더의 엑셀 읽기 ---------- */

// 엑셀은 이 파일 하나로 정해져 있다. 켤 때 · 다시 읽기를 누를 때마다 같은 폴더에서 새로 읽는다
const TAGS_FILE = 'Screentone 태그.xlsx';

async function loadTags() {
  try {
    const res = await fetch(encodeURIComponent(TAGS_FILE), { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    applyParsed(parseWorkbook(XLSX.read(await res.arrayBuffer())), TAGS_FILE);
  } catch (_) {
    // 파일을 두 번 눌러 연 file:// 화면에서는 브라우저가 옆 파일 읽기를 막는다
    const local = location.protocol === 'file:';
    els.empty.textContent = local
      ? `브라우저가 파일로 연 화면에서는 옆의 엑셀을 못 읽어요. 같은 폴더의 '켜기.bat'으로 여세요.`
      : `같은 폴더에서 '${TAGS_FILE}'을 찾지 못했어요.`;
    els.empty.hidden = false;
    setStatus('엑셀을 읽지 못했어요.');
  }
}

/* ---------- 뽑기 ---------- */

function randomOf(arr, not) {
  if (!arr.length) return '';
  const pool = arr.length > 1 && not != null ? arr.filter((v) => v !== not) : arr;
  return pool[Math.floor(Math.random() * pool.length)];
}

function rollOne(c) {
  state.pick[c.key] = randomOf(allowed(c), state.pick[c.key]);
}

function spin() {
  if (!state.categories.length) return;
  for (const c of state.categories) {
    if (state.lock[c.key] || state.bundle[c.key]) continue;
    // 줄 섞기를 켜면 잠그지 않은 줄의 넣기/빼기도 같이 뽑는다. 잠근 줄은 값도 켜고 끄기도 그대로
    if (state.mixRows) {
      if (Math.random() < state.mixRows) state.use[c.key] = false; else delete state.use[c.key];
    }
    if (state.use[c.key] !== false) rollOne(c);
  }
  save();
  renderRows();
  renderLyrics(true);
  pushHistory();
}

function setLevel(n) {
  state.level = n;
  // 잠그지 않은 줄 중 새 수위를 넘는 값만 다시 뽑는다. 직접 고른(잠근) 값은 그대로
  for (const c of state.categories) {
    const p = state.pick[c.key];
    if (!state.lock[c.key] && (!p || levelOf(c, p) > n)) state.pick[c.key] = randomOf(allowed(c));
  }
  save();
  renderLevel();
  renderRows();
  renderLyrics();
}

/* ---------- 세 칸 만들기 ---------- */

const splitTags = (text) => {
  const out = [];
  let cur = '';
  let inside = false;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '|' && text[i + 1] === '|') { inside = !inside; cur += '||'; i++; }
    else if (text[i] === ',' && !inside) { out.push(cur); cur = ''; }
    else cur += text[i];
  }
  out.push(cur);
  return out.map((t) => t.trim()).filter(Boolean);
};

// 인원 줄의 값으로 A · B 성별을 정한다. 남녀면 A 남자 · B 여자, 혼자면 B 없음
function cast() {
  const c = state.categories.find((x) => /인원/.test(x.name));
  const text = c && state.use[c.key] !== false && !state.bundle[c.key] ? state.pick[c.key] || '' : '';
  const girls = /\b(multiple girls|[2-9]girls)\b/.test(text) ? 2 : /\b1girl\b/.test(text) ? 1 : 0;
  const boys = /\b(multiple boys|[2-9]boys)\b/.test(text) ? 2 : /\b1boy\b/.test(text) ? 1 : 0;
  let a = 'boy';
  let b = 'girl';
  if (!girls && boys) { a = 'boy'; b = boys > 1 ? 'boy' : ''; }
  else if (girls && !boys) { a = 'girl'; b = girls > 1 ? 'girl' : ''; }
  if (state.swap && b) [a, b] = [b, a];
  return { a, b };
}

function buildParts() {
  const who = cast();
  const out = { base: [], a: [], b: [] };
  const front = [];
  const back = [];
  for (const t of state.toggles) {
    const s = state.sw[t.name];
    const text = s === 'mix' ? nai([t.on || ',', t.off || ',']) : s ? t.on : t.off;
    if (text) (t.front ? front : back).push(text);
  }
  out.base.push(...front);
  for (const c of state.categories) {
    if (state.use[c.key] === false) continue;
    const b = state.bundle[c.key];
    if (b) {
      if (!b.items.length && !b.none) continue;
      const text = nai(b.none ? [...b.items, ','] : b.items);
      out[c.dir ? 'base' : (state.route[c.key] || 'base')].push(text);
      continue;
    }
    const v = state.pick[c.key];
    if (!v) continue;
    const mode = dirOf(c, v);
    if (!mode) { out[state.route[c.key] || 'base'].push(v); continue; }
    const tags = splitTags(v);
    // 태그 여럿이 한 칸이면 자세 · 손 · 표정이 섞여 있어 source#/target#를 붙일 수 없다
    if (tags.length > 1 || !who.b) { out.base.push(v); continue; }
    out.a.push((mode === 'mutual' ? 'mutual#' : 'source#') + v);
    out.b.push((mode === 'mutual' ? 'mutual#' : 'target#') + v);
  }
  out.base.push(...back);
  if (!who.b) { out.a.push(...out.b); out.b = []; }
  const join = (chunks, lead) => {
    const seen = new Set();
    const tags = [];
    for (const t of [lead, ...chunks.flatMap(splitTags)].filter(Boolean)) {
      const k = t.toLowerCase();
      if (!seen.has(k)) { seen.add(k); tags.push(t); }
    }
    return tags.join(', ');
  };
  return {
    base: join(out.base),
    a: join(out.a, who.a),
    b: who.b ? join(out.b, who.b) : '',
    who,
  };
}

const combined = (p) => [`기본: ${p.base}`, `A: ${p.a}`, p.b ? `B: ${p.b}` : ''].filter(Boolean).join('\n');

function songNo(text) {
  let h = 7;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 9973;
  return String(h).padStart(4, '0');
}

/* ---------- 그리기 ---------- */

function render() {
  const has = state.categories.length > 0;
  els.empty.hidden = has;
  els.spin.disabled = !has;
  els.fileName.textContent = state.fileName ? `${state.fileName} · ${state.loadedAt}` : TAGS_FILE;
  els.fileName.title = els.fileName.textContent;
  renderLevel();
  renderPresets();
  renderRows();
  renderSwitches();
  renderLyrics();
}

// 줄 이름은 앞의 "-"와 [A→B]를 떼고, 스위치 이름은 괄호 앞까지만 맞춘다
const sameName = (a, b) => bareName(a.replace(/^-/, '')) === bareName(b.replace(/^-/, ''));
const swName = (t) => t.name.replace(/\s*\(.*\)\s*$/, '');

function applyPreset(p) {
  // 프리셋끼리 쌓이지 않게 엑셀의 처음 상태(- 꺼 둔 줄 · * 처음 값 · 스위치 처음)로 되돌린 뒤 적용한다
  for (const c of state.categories) {
    delete state.lock[c.key];
    delete state.bundle[c.key];
    if (c.startOff) state.use[c.key] = false; else delete state.use[c.key];
    if (c.def) { state.pick[c.key] = c.def; state.lock[c.key] = true; }
  }
  for (const t of state.toggles) state.sw[t.name] = t.start;
  state.swap = false;
  if (p.level) state.level = p.level;
  if (p.mix != null) state.mixRows = p.mix;
  const all = p.on.includes('전부');
  for (const c of state.categories) {
    if (all || p.on.some((n) => sameName(n, c.name))) delete state.use[c.key];
    if (p.off.some((n) => sameName(n, c.name))) state.use[c.key] = false;
  }
  for (const t of state.toggles) {
    if (p.on.some((n) => n === swName(t) || n === t.name)) state.sw[t.name] = true;
    if (p.off.some((n) => n === swName(t) || n === t.name)) state.sw[t.name] = false;
  }
  for (const [reel, value] of p.picks) {
    const c = state.categories.find((x) => sameName(reel, x.name));
    if (!c || !c.items.includes(value)) continue;
    state.pick[c.key] = value;
    state.lock[c.key] = true;
    delete state.use[c.key];
    delete state.bundle[c.key];
  }
  // 프리셋이 켠 줄이 바로 빠지지 않게, 이번 한 번은 줄 섞기 없이 값만 뽑는다
  for (const c of state.categories) {
    if (state.use[c.key] === false || state.lock[c.key] || state.bundle[c.key]) continue;
    const v = state.pick[c.key];
    if (!v || levelOf(c, v) > state.level) state.pick[c.key] = randomOf(allowed(c));
    else rollOne(c);
  }
  save();
  render();
  renderLyrics(true);
  pushHistory();
  setStatus(`${p.name} 프리셋을 적용했어요.`);
}

function renderPresets() {
  const box = $('presets');
  box.textContent = '';
  for (const p of (state.meta.presets || [])) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'preset';
    b.textContent = p.name;
    b.title = p.note;
    b.addEventListener('click', () => applyPreset(p));
    box.append(b);
  }
}

function renderLevel() {
  document.querySelectorAll('.mix-step').forEach((b) => {
    b.setAttribute('aria-pressed', String(Number(b.dataset.mix) === (state.mixRows || 0)));
  });
  document.querySelectorAll('.heat-step').forEach((b) => {
    b.setAttribute('aria-pressed', String(Number(b.dataset.level) === state.level));
  });
}

const ROUTE_NEXT = { base: 'a', a: 'b', b: 'base' };
const ROUTE_WORD = { base: '기본', a: 'A', b: 'B' };

function renderRows() {
  closePicker();
  els.rows.textContent = '';
  let group = null;
  let no = 0;
  for (const c of state.categories) {
    if (c.group !== group) {
      group = c.group;
      if (group) {
        const g = document.createElement('div');
        g.className = 'shelf';
        g.textContent = group;
        els.rows.append(g);
      }
    }
    no++;
    els.rows.append(makeRow(c, no));
  }
  els.rowCount.textContent = state.categories.length ? `${state.categories.length}줄` : '';
}

function makeRow(c, no) {
  const row = document.createElement('div');
  row.className = 'row';
  row.dataset.key = c.key;
  const used = state.use[c.key] !== false;
  const locked = !!state.lock[c.key];
  const b = state.bundle[c.key];
  row.classList.toggle('off', !used);
  row.classList.toggle('locked', locked && !b);
  row.classList.toggle('bundled', !!b);

  const use = document.createElement('input');
  use.type = 'checkbox';
  use.className = 'use';
  use.checked = used;
  use.title = '끄면 이 줄을 프롬프트에서 빼요';
  use.addEventListener('change', () => {
    if (use.checked) delete state.use[c.key]; else state.use[c.key] = false;
    save(); refreshRow(c); renderLyrics();
  });

  const num = document.createElement('span');
  num.className = 'num';
  num.textContent = String(no).padStart(2, '0');

  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = bareName(c.name);
  const ok = allowed(c).length;
  name.title = `${c.group ? c.group + ' · ' : ''}${c.name}\n이 수위에서 ${ok}개 / 전체 ${c.items.length}개`;

  const val = document.createElement('div');
  val.className = 'val';
  const tag = document.createElement('span');
  tag.className = 'tag';
  const ko = document.createElement('span');
  ko.className = 'ko';
  if (b) {
    tag.textContent = b.items.length ? `NAI 랜덤 · ${b.items.length}개 중 하나${b.none ? ' + 없음' : ''}` : '묶을 값을 골라 주세요';
    ko.textContent = b.items.slice(0, 4).join(' | ') + (b.items.length > 4 ? ' …' : '');
    val.title = '눌러서 묶을 값 고르기';
    val.classList.add('as-button');
    val.addEventListener('click', () => openPicker(c, row));
  } else {
    const v = state.pick[c.key] || '';
    tag.textContent = v || (ok ? '' : '이 수위엔 값이 없어요');
    ko.textContent = v ? metaOf('ko', c, v) || '' : '';
    const select = document.createElement('select');
    select.className = 'chooser';
    select.title = '눌러서 직접 고르기 (고르면 잠겨요)';
    for (const item of c.items) {
      const lv = levelOf(c, item);
      const k = metaOf('ko', c, item);
      const opt = new Option(`${'●'.repeat(lv)}${'○'.repeat(3 - lv)}  ${item}${k ? '  — ' + k : ''}`, item);
      if (lv > state.level) opt.className = 'over';
      select.add(opt);
    }
    if (!v) select.add(new Option('', ''), 0);
    select.value = v;
    select.addEventListener('change', () => {
      state.pick[c.key] = select.value;
      state.lock[c.key] = true;
      save(); refreshRow(c); renderLyrics();
    });
    val.append(select);
  }
  val.prepend(tag, ko);

  const heat = document.createElement('span');
  heat.className = 'dots';
  const lv = !b && state.pick[c.key] ? levelOf(c, state.pick[c.key]) : 0;
  heat.textContent = lv ? '●'.repeat(lv) + '○'.repeat(3 - lv) : '';
  heat.title = lv ? `강도 ${lv}` : '';

  let route;
  if (c.dir || (!b && state.pick[c.key] && dirOf(c, state.pick[c.key]))) {
    route = document.createElement('span');
    route.className = 'route fixed';
    route.textContent = 'A→B';
    route.title = 'A 칸 source# · B 칸 target#, 서로 하는 동작은 mutual#';
  } else {
    route = document.createElement('button');
    route.type = 'button';
    route.className = 'route';
    const r = state.route[c.key] || 'base';
    route.dataset.route = r;
    route.textContent = ROUTE_WORD[r];
    route.title = '이 줄을 넣을 칸: 누를 때마다 기본 → A → B';
    route.addEventListener('click', () => {
      state.route[c.key] = ROUTE_NEXT[state.route[c.key] || 'base'];
      save(); refreshRow(c); renderLyrics();
    });
  }

  const bundle = document.createElement('button');
  bundle.type = 'button';
  bundle.className = 'tool bundle';
  bundle.textContent = '||';
  bundle.setAttribute('aria-pressed', String(!!b));
  bundle.title = b ? 'NAI 묶음 풀기' : '값 여러 개를 ||a|b||로 묶어 NovelAI가 고르게';
  bundle.addEventListener('click', () => {
    if (state.bundle[c.key]) delete state.bundle[c.key];
    else state.bundle[c.key] = { items: allowed(c), none: false };
    save(); refreshRow(c); renderLyrics();
    if (state.bundle[c.key]) openPicker(c, els.rows.querySelector(`[data-key="${CSS.escape(c.key)}"]`));
  });

  const lock = document.createElement('button');
  lock.type = 'button';
  lock.className = 'tool lock';
  lock.textContent = locked ? '◆' : '◇';
  lock.title = locked ? '잠김 — 눌러서 풀기' : '돌려도 이 값 지키기';
  lock.disabled = !!b;
  lock.addEventListener('click', () => {
    if (state.lock[c.key]) delete state.lock[c.key]; else state.lock[c.key] = true;
    save(); refreshRow(c);
  });

  const roll = document.createElement('button');
  roll.type = 'button';
  roll.className = 'tool roll';
  roll.textContent = '🎲';
  roll.title = '이 줄만 다시 뽑기';
  roll.disabled = !!b;
  roll.addEventListener('click', () => {
    rollOne(c);
    save(); refreshRow(c); renderLyrics(true);
  });

  row.append(use, num, name, val, heat, route, bundle, lock, roll);
  return row;
}

function refreshRow(c) {
  const old = els.rows.querySelector(`[data-key="${CSS.escape(c.key)}"]`);
  if (!old) return;
  old.replaceWith(makeRow(c, Number(old.querySelector('.num').textContent)));
}

/* 묶음 고르기 창 — 목록 스크롤에 잘리지 않게 body에 띄운다 */
let picker = null;

function closePicker() {
  if (picker) { picker.remove(); picker = null; }
}

function openPicker(c, row) {
  closePicker();
  const b = state.bundle[c.key];
  if (!b || !row) return;
  picker = document.createElement('div');
  picker.className = 'picker';

  const head = document.createElement('div');
  head.className = 'picker-head';
  const title = document.createElement('strong');
  title.textContent = `${bareName(c.name)} · 묶을 값`;
  const mk = (text) => {
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'nib small';
    x.textContent = text;
    return x;
  };
  const all = mk('수위까지 전부');
  const clear = mk('비우기');
  const close = mk('닫기');
  close.addEventListener('click', closePicker);
  head.append(title, all, clear, close);

  const list = document.createElement('div');
  list.className = 'picker-list';
  const boxes = c.items.map((item) => {
    const label = document.createElement('label');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = b.items.includes(item);
    const text = document.createElement('span');
    const k = metaOf('ko', c, item);
    text.textContent = item + (k ? ` — ${k}` : '');
    const dots = document.createElement('span');
    dots.className = 'dots';
    const lv = levelOf(c, item);
    dots.textContent = '●'.repeat(lv) + '○'.repeat(3 - lv);
    label.append(box, text, dots);
    list.append(label);
    return box;
  });

  const noneRow = document.createElement('label');
  noneRow.className = 'none-row';
  const none = document.createElement('input');
  none.type = 'checkbox';
  none.checked = b.none;
  noneRow.append(none, document.createTextNode('없음도 넣기'));

  const sync = () => {
    b.items = c.items.filter((_, i) => boxes[i].checked);
    b.none = none.checked;
    save(); renderLyrics();
    const r = els.rows.querySelector(`[data-key="${CSS.escape(c.key)}"]`);
    if (r) { const fresh = makeRow(c, Number(r.querySelector('.num').textContent)); r.replaceWith(fresh); }
  };
  boxes.forEach((x) => x.addEventListener('change', sync));
  none.addEventListener('change', sync);
  all.addEventListener('click', () => { boxes.forEach((x, i) => { x.checked = levelOf(c, c.items[i]) <= state.level; }); sync(); });
  clear.addEventListener('click', () => { boxes.forEach((x) => { x.checked = false; }); sync(); });

  picker.append(head, list, noneRow);
  document.body.append(picker);
  const r = row.getBoundingClientRect();
  const w = Math.max(r.width, 360);
  picker.style.width = w + 'px';
  picker.style.left = Math.min(Math.max(8, r.left), innerWidth - w - 8) + 'px';
  const h = picker.offsetHeight;
  picker.style.top = (r.bottom + 4 + h < innerHeight - 8 ? r.bottom + 4 : Math.max(8, r.top - h - 4)) + 'px';
}

document.addEventListener('pointerdown', (e) => {
  if (picker && !e.target.closest('.picker, .bundle, .as-button')) closePicker();
});
addEventListener('resize', closePicker);
els.rows.addEventListener('scroll', closePicker);

const SW_NEXT = { false: true, true: 'mix', mix: false };
const SW_WORD = { false: '끔', true: '켬', mix: '반반' };

function renderSwitches() {
  els.switches.textContent = '';
  for (const t of state.toggles) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'switch';
    const label = document.createElement('span');
    label.textContent = t.name.replace(/\s*\(.*\)\s*$/, '');
    const word = document.createElement('span');
    word.className = 'state';
    b.append(label, word);
    // 누를 때마다 끔 → 켬 → 반반(NovelAI가 둘 중 하나를 고름)
    const paint = () => {
      const s = String(state.sw[t.name] ?? false);
      b.dataset.state = s;
      word.textContent = SW_WORD[s];
      b.title = `${t.name}\n켜면: ${t.on || '(없음)'}\n끄면: ${t.off || '(없음)'}\n누를 때마다 끔 → 켬 → 반반`;
    };
    b.addEventListener('click', () => {
      state.sw[t.name] = SW_NEXT[String(state.sw[t.name] ?? false)];
      paint(); save(); renderLyrics();
    });
    paint();
    els.switches.append(b);
  }
}

let current = { base: '', a: '', b: '' };

function renderLyrics(sing) {
  const has = state.categories.length > 0;
  current = has ? buildParts() : { base: '', a: '', b: '', who: { a: '', b: '' } };
  for (const part of ['base', 'a', 'b']) {
    const p = els.lyric[part];
    p.textContent = current[part];
    p.closest('.part').classList.toggle('silent', !current[part]);
    if (sing && current[part] && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // 컷마다 스크린톤 한 장이 대각선으로 깔린다. 다시 걸려면 클래스를 한 번 뗀다
      const panel = p.closest('.part');
      panel.classList.remove('toned');
      void panel.offsetWidth;
      panel.style.setProperty('--delay', { base: '0s', a: '.1s', b: '.2s' }[part]);
      panel.classList.add('toned');
    }
  }
  els.whoA.textContent = has && current.who.a ? current.who.a : '';
  els.whoB.textContent = has ? (current.who.b || '없음 (혼자)') : '';
  els.swap.disabled = !has || !current.who.b;
  document.querySelectorAll('.copy').forEach((b) => { b.disabled = !current[b.dataset.copy]; });
  els.copyAll.disabled = !current.base && !current.a;
  els.songNo.textContent = has ? `No. ${songNo(combined(current))}` : 'No. ----';
}

/* ---------- 예약 목록 (받은 프롬프트) ---------- */

const received = [];

function pushHistory() {
  const text = combined(current);
  if (!current.base && !current.a) return;
  if (received.some((h) => h.prompt === text)) return;
  const lead = state.categories.find((c) => c.dir && state.use[c.key] !== false && state.pick[c.key] && !state.bundle[c.key]) ||
    state.categories.find((c) => state.use[c.key] !== false && state.pick[c.key] && !state.bundle[c.key]);
  const title = lead ? state.pick[lead.key] : '';
  received.unshift({
    at: fullStamp(),
    prompt: text,
    title,
    sub: lead ? metaOf('ko', lead, title) || '' : '',
    meta: `수위 ${state.level} · ${[current.who.a, current.who.b].filter(Boolean).join(' × ')}`,
    code: songNo(text),
    snap: JSON.parse(JSON.stringify({
      pick: state.pick, lock: state.lock, use: state.use, sw: state.sw, bundle: state.bundle,
      route: state.route, level: state.level, swap: state.swap, mixRows: state.mixRows,
    })),
  });
  if (received.length > 20) received.length = 20;
  renderHistory();
}

function renderHistory() {
  els.queue.textContent = '';
  els.queueEmpty.hidden = received.length > 0;
  ['histTxt', 'histMd', 'histNote'].forEach((id) => { $(id).disabled = !received.length; });
  received.forEach((h) => {
    const li = document.createElement('li');
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'queue-open';
    open.title = '그때 뽑은 대로 다시 열기';
    const no = document.createElement('span');
    no.className = 'q-no';
    no.textContent = h.code;
    const t = document.createElement('span');
    t.className = 'q-title';
    t.textContent = h.title + (h.sub ? ` — ${h.sub}` : '');
    const m = document.createElement('span');
    m.className = 'q-meta';
    m.textContent = `${h.meta} · ${h.at.slice(11)}`;
    open.append(no, t, m);
    open.addEventListener('click', () => {
      Object.assign(state, JSON.parse(JSON.stringify(h.snap)));
      save(); render();
      setStatus(`${h.code}번을 다시 열었어요.`);
    });
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'nib small';
    copy.textContent = '복사';
    copy.addEventListener('click', () => copyText(h.prompt, '세 칸을 한꺼번에 복사했어요.'));
    li.append(open, copy);
    els.queue.append(li);
  });
}

const noteEntries = () => received.map((h) => ({
  edition: EDITION, title: h.title, sub: h.sub, meta: h.meta, code: h.code, at: h.at, prompt: h.prompt,
}));
const fileStamp = () => fullStamp().replace(/[-: ]/g, '').slice(0, 12);

/* ---------- 기타 ---------- */

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fullStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

let statusTimer = 0;
function setStatus(text) {
  els.status.textContent = text;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { els.status.textContent = ''; }, 4000);
}

function save() {
  try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (_) { /* 사생활 보호 창 등 */ }
}

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (raw && Array.isArray(raw.categories)) state = { ...state, ...raw };
  } catch (_) { /* 처음 켠 것처럼 */ }
}

async function copyText(text, done) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (_) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  setStatus(done);
}

const PART_WORD = { base: '기본 프롬프트', a: 'A 칸', b: 'B 칸' };
document.querySelectorAll('.copy').forEach((b) => {
  b.addEventListener('click', () => copyText(current[b.dataset.copy], `${PART_WORD[b.dataset.copy]}을 복사했어요.`));
});
els.copyAll.addEventListener('click', () => copyText(combined(current), '세 칸을 한꺼번에 복사했어요.'));
els.swap.addEventListener('click', () => { state.swap = !state.swap; save(); renderLyrics(); });
document.querySelectorAll('.heat-step').forEach((b) => b.addEventListener('click', () => setLevel(Number(b.dataset.level))));
$('histTxt').addEventListener('click', () => PANote.download(`screentone-${fileStamp()}.txt`, PANote.toTxt(noteEntries()), 'text/plain;charset=utf-8'));
$('histMd').addEventListener('click', () => PANote.download(`screentone-${fileStamp()}.md`, PANote.toMd(noteEntries()), 'text/markdown;charset=utf-8'));
$('histNote').addEventListener('click', () => PANote.download(`prompt-archive-note-${fileStamp()}.html`, PANote.toHtml(noteEntries()), 'text/html;charset=utf-8'));
els.helpBtn.addEventListener('click', () => els.help.showModal());
document.querySelectorAll('.mix-step').forEach((b) => b.addEventListener('click', () => {
  state.mixRows = Number(b.dataset.mix);
  save(); renderLevel();
}));

/* ---------- 태그 모음 ---------- */

const book = $('book');
const bookList = $('bookList');
const bookFind = $('bookFind');
const bookOfficial = $('bookOfficial');

function renderBook() {
  const q = bookFind.value.trim().toLowerCase();
  const only = bookOfficial.checked;
  bookList.textContent = '';
  let shown = 0;
  let total = 0;
  for (const c of state.categories) {
    total += c.items.length;
    const items = c.items.filter((t) => {
      if (only && state.meta.dan && state.meta.dan[metaKey(c.name, t)] === false) return false;
      if (!q) return true;
      return (t + ' ' + (metaOf('ko', c, t) || '')).toLowerCase().includes(q);
    });
    if (!items.length) continue;
    shown += items.length;
    const sec = document.createElement('section');
    sec.className = 'book-sec';
    const h = document.createElement('h3');
    h.textContent = (c.group ? c.group + ' · ' : '') + bareName(c.name);
    const n = document.createElement('span');
    n.textContent = items.length;
    h.append(n);
    sec.append(h);
    for (const t of items) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'book-row';
      if (state.pick[c.key] === t) b.classList.add('now');
      b.title = '눌러서 이 줄에 고르기(잠겨요)';
      const lv = levelOf(c, t);
      const mode = dirOf(c, t);
      const tag = document.createElement('span');
      tag.className = 'b-tag';
      tag.textContent = t;
      const ko = document.createElement('span');
      ko.className = 'b-ko';
      ko.textContent = metaOf('ko', c, t) || '';
      const side = document.createElement('span');
      side.className = 'b-side';
      side.textContent = `${mode === 'mutual' ? '서로 ' : mode ? 'A→B ' : ''}${'●'.repeat(lv)}${'○'.repeat(3 - lv)}`;
      b.append(tag, ko, side);
      b.addEventListener('click', () => {
        state.pick[c.key] = t;
        state.lock[c.key] = true;
        delete state.use[c.key];
        delete state.bundle[c.key];
        save(); renderRows(); renderLyrics(); renderBook();
        setStatus(`${bareName(c.name)} 줄에 '${t}'를 골랐어요.`);
      });
      sec.append(b);
    }
    bookList.append(sec);
  }
  $('bookCount').textContent = `${shown} / ${total}개`;
}

$('bookBtn').addEventListener('click', () => { renderBook(); book.showModal(); bookFind.focus(); });
bookFind.addEventListener('input', renderBook);
bookOfficial.addEventListener('change', renderBook);

els.reload.addEventListener('click', loadTags);
els.spin.addEventListener('click', spin);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closePicker();
  if (e.target.closest('select, input, textarea, button, dialog')) return;
  if (e.key === ' ' && !els.spin.disabled) { e.preventDefault(); spin(); }
});

load();
render();
renderHistory();
loadTags();

// 헤드리스 점검용 창구
window.__screentone = { parseWorkbook, applyParsed, buildParts, spin, setLevel, state: () => state, received };
