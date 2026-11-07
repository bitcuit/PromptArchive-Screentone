'use strict';

// data.js(window.SCREENTONE)의 줄 · 스위치 · 프리셋으로 NovelAI 기본 · A · B 칸을 뽑는다.
// 어울림: 태그마다 data.js에 적힌 성질(need · pose · poses · wear · cover · bare · side · by)로
// 이미 정해진 값과 맞는 후보만 뽑는다. 잠근 값이 이기고, 나머지가 맞춰 바뀐다.

const STORE = 'screentone:v1';
const VERSION = '1.0';
const EDITION = 'Screentone';
const DIR_NAME = /\[?\s*A\s*(→|->)\s*B\s*\]?/i;
const BASE_NAME = /인원|드러난|구도|검열|카메라|배경|장소|품질|화풍/;
const nai = (opts) => (opts.length > 1 ? `||${opts.join('|')}||` : opts[0] || '');

const $ = (id) => document.getElementById(id);
const els = {
  rows: $('rows'), empty: $('empty'), rowCount: $('rowCount'), switches: $('switches'),
  spin: $('spinBtn'), status: $('status'), songNo: $('songNo'),
  lyric: { base: $('lyricBase'), a: $('lyricA'), b: $('lyricB') },
  whoA: $('whoA'), whoB: $('whoB'), swap: $('swapBtn'), copyAll: $('copyAllBtn'),
  queue: $('queue'), queueEmpty: $('queueEmpty'),
  help: $('help'), helpBtn: $('helpBtn'),
};

let state = {
  categories: [],   // { key, name, group, items[], def, startOff, dir }
  toggles: [],      // { name, on, off, start, front }
  meta: { dir: {}, ko: {}, lv: {}, dan: {}, rule: {}, presets: [] },
  pick: {}, lock: {}, use: {}, sw: {}, bundle: {},
  route: {},        // key → 'base' | 'a' | 'b' (방향 없는 줄만)
  level: 3,
  swap: false,
  off: {},          // key → true: 사용자 · 프리셋이 끈 줄
};

/* ---------- 읽기 ---------- */

const metaKey = (reel, tag) => reel + '\u0001' + tag;
const bareName = (name) => name.replace(DIR_NAME, '').trim();

function fromData(D) {
  const meta = { dir: {}, ko: {}, lv: {}, dan: {}, rule: {}, presets: D.presets || [] };
  const categories = D.reels.map((r) => {
    for (const it of r.items) {
      const k = metaKey(r.name, it.t);
      const { t, ko, lv, dir, dan, def, ...rule } = it;
      meta.ko[k] = ko || '';
      meta.lv[k] = lv || 1;
      if (dir) meta.dir[k] = dir;
      if (dan === false) meta.dan[k] = false;
      meta.rule[k] = rule;
    }
    return {
      key: r.sheet + '\u0001' + r.name, name: r.name, group: r.sheet,
      items: r.items.map((it) => it.t), def: (r.items.find((it) => it.def) || {}).t || '',
      startOff: r.off, dir: r.dir, route: r.route,
    };
  });
  return { categories, toggles: D.toggles, meta };
}

const metaOf = (kind, c, tag) => (state.meta[kind] || {})[metaKey(c.name, tag)];
const ruleOf = (c, tag) => (state.meta.rule || {})[metaKey(c.name, tag)] || {};
const levelOf = (c, tag) => metaOf('lv', c, tag) || 1;
// 이 값이 방향 있는 값인가: [A→B] 줄이면 늘, 아니면 그 줄 이름으로 #방향에 적혀 있을 때만
const dirOf = (c, v) => (c.dir ? metaOf('dir', c, v) || 'ab' : (state.meta.dir || {})[metaKey(c.name, v)]);
const allowed = (c) => c.items.filter((t) => levelOf(c, t) <= state.level);

function defaultRoute(c, hasDir) {
  if (c.route) return c.route;
  if (BASE_NAME.test(c.name) || BASE_NAME.test(c.group)) return 'base';
  return hasDir ? 'b' : 'base';
}

function applyParsed(parsed) {
  const old = state;
  const next = {
    ...old,
    categories: parsed.categories, toggles: parsed.toggles, meta: parsed.meta,
    pick: {}, lock: {}, use: {}, sw: {}, bundle: {}, route: {}, off: {},
  };
  state = next;
  const hasDir = next.categories.some((c) => c.dir);
  // 다시 읽어도 잠근 줄 · 뺀 줄 · 칸 · 스위치는 이름이 같으면 그대로 둔다
  const known = new Set(old.categories.map((c) => c.key));
  for (const c of next.categories) {
    next.route[c.key] = old.route[c.key] || defaultRoute(c, hasDir);
    if (!known.has(c.key)) {
      if (c.startOff) { next.use[c.key] = false; next.off[c.key] = true; }
      if (c.def) { next.pick[c.key] = c.def; next.lock[c.key] = true; continue; }
    }
    if (old.use[c.key] === false) next.use[c.key] = false;
    if ((old.off || {})[c.key] || (!old.off && old.use[c.key] === false)) next.off[c.key] = true;
    const b = old.bundle && old.bundle[c.key];
    if (b) next.bundle[c.key] = { items: b.items.filter((v) => c.items.includes(v)), none: b.none };
    if (old.pick[c.key] && c.items.includes(old.pick[c.key])) {
      next.pick[c.key] = old.pick[c.key];
      if (old.lock[c.key]) next.lock[c.key] = true;
    } else if (c.def) {
      // 전에 고른 값이 데이터에서 빠졌으면 처음 값(def)으로 돌아간다
      next.pick[c.key] = c.def;
      next.lock[c.key] = true;
    } else {
      next.pick[c.key] = randomOf(allowed(c));
    }
  }
  for (const t of next.toggles) next.sw[t.name] = t.name in old.sw ? old.sw[t.name] : t.start;
  settle();
  save();
  render();
}

/* ---------- 뽑기 ---------- */

function randomOf(arr, not) {
  if (!arr.length) return '';
  const pool = arr.length > 1 && not != null ? arr.filter((v) => v !== not) : arr;
  return pool[Math.floor(Math.random() * pool.length)];
}

/* ---------- 어울림 ---------- */

const active = (c) => state.use[c.key] !== false && !state.bundle[c.key];

// 인원 값 → 남자 · 여자 수와 A · B 성별. 인원 줄을 끄면 남녀 둘로 본다
function headcount(text) {
  const count = (word) => {
    if (new RegExp(`multiple ${word}s`).test(text)) return 3;
    const m = text.match(new RegExp(`\\b([1-9])${word}s?\\b`));
    return m ? Number(m[1]) : 0;
  };
  return { m: count('boy'), f: count('girl') };
}
function castOf(picks) {
  const c = state.categories.find((x) => /인원/.test(x.name));
  const text = c && active(c) ? picks[c.key] || '' : '';
  const { m, f } = text ? headcount(text) : { m: 1, f: 1 };
  let a = 'boy';
  let b = 'girl';
  if (!f && m) b = m > 1 ? 'boy' : '';
  else if (f && !m) { a = 'girl'; b = f > 1 ? 'girl' : ''; }
  if (state.swap && b) [a, b] = [b, a];
  return { m, f, n: m + f, a, b };
}

// 이 값이 들어가는 칸: 방향 있는 한 태그는 두 사람(pair), 여러 태그 칸은 기본, 나머지는 줄의 칸
function sideOf(c, v) {
  if (dirOf(c, v)) return splitTags(v).length > 1 ? 'base' : (ruleOf(c, v).side || 'pair');
  return state.route[c.key] || 'base';
}

// need: 그 몸 · 사람 수가 있어야 한다. A · B 칸에 들어가면 그 사람의 성별을 본다
function needOk(c, v, who) {
  let side = sideOf(c, v);
  if (side === 'b' && !who.b) side = 'a';
  const sex = { a: who.a, b: who.b };
  for (const k of ruleOf(c, v).need || []) {
    if (k === 'm' && !(sex[side] ? sex[side] === 'boy' : who.m > 0)) return false;
    if (k === 'f' && !(sex[side] ? sex[side] === 'girl' : who.f > 0)) return false;
    if (k === 'mm' && who.m < 2) return false;
    if (k === 'ff' && who.f < 2) return false;
    if (k === '3' && who.n < 3) return false;
    if (k === 'pair' && who.n < 2) return false;
  }
  return true;
}

// 두 값이 한 장에 같이 있을 수 없나: 자세끼리 · 장소와 자세 · 옷 상태와 옷
function clash(r, q) {
  if (r.pose && q.pose && r.pose !== q.pose) return true;
  if (r.pose && q.poses && !q.poses.includes(r.pose)) return true;
  if (q.pose && r.poses && !r.poses.includes(q.pose)) return true;
  if ((r.big && q.tight) || (q.big && r.tight)) return true;
  // 입이 바쁘면 키스 안 됨, 재갈을 물면 다른 입 동작 안 됨 · 손이 묶이면 손 쓰는 동작 안 됨
  if ((r.mouth === 'oral' && q.mouth === 'kiss') || (r.mouth === 'kiss' && q.mouth === 'oral')) return true;
  if ((r.mouth === 'gag' && q.mouth) || (q.mouth === 'gag' && r.mouth)) return true;
  if ((r.bound && q.hands) || (q.bound && r.hands)) return true;
  if ((r.at && q.place && !r.at.includes(q.place)) || (q.at && r.place && !q.at.includes(r.place))) return true;
  if ((r.garb && q.has && !q.has.includes(r.garb)) || (q.garb && r.has && !r.has.includes(q.garb))) return true;
  // 넣기 직전 · 하는 중 · 끝난 뒤는 한 장에 하나만
  if (r.phase && q.phase && r.phase !== q.phase) return true;
  if ((r.wear === 'nude' && q.cover) || (q.wear === 'nude' && r.cover)) return true;
  if ((r.wear === 'full' && q.bare) || (q.wear === 'full' && r.bare)) return true;
  return false;
}

// picks: 이미 정해진 줄의 값. c 줄에 t를 넣어도 그 값들과 맞는가
function fits(c, t, picks) {
  const ctx = { ...picks, [c.key]: t };
  const who = castOf(ctx);
  if (!needOk(c, t, who)) return false;
  const r = ruleOf(c, t);
  const isCast = /인원/.test(c.name);
  for (const d of state.categories) {
    if (d === c || !active(d) || !picks[d.key]) continue;
    const u = picks[d.key];
    if (isCast && !needOk(d, u, who)) return false;
    if (clash(r, ruleOf(d, u))) return false;
  }
  return true;
}

const candidates = (c, picks) => allowed(c).filter((t) => fits(c, t, picks));

// 정하는 순서: 사람 → 장소 → 옷 → 체위 → 나머지. 앞에서 정한 것에 뒤가 맞춘다
const ORDER = [/인원/, /장소/, /옷 상태/, /^옷$/, /^체위 \[/, /체위 조합/, /행위/, /몸 자세/];
function rollOrder() {
  const rank = (c) => { const i = ORDER.findIndex((re) => re.test(c.name)); return i < 0 ? ORDER.length : i; };
  return state.categories.slice().sort((a, b) => rank(a) - rank(b));
}
const lockedPicks = () => Object.fromEntries(state.categories
  .filter((c) => active(c) && state.lock[c.key] && state.pick[c.key]).map((c) => [c.key, state.pick[c.key]]));

// 잠그지 않은 줄을 순서대로 다시 맞춘다. keep이면 지금 값이 맞을 때 그대로 둔다
function settle(keep = true) {
  const decided = lockedPicks();
  for (const c of rollOrder()) {
    if (!active(c) || state.lock[c.key]) continue;
    const v = state.pick[c.key];
    if (!(keep && v && levelOf(c, v) <= state.level && fits(c, v, decided))) {
      state.pick[c.key] = randomOf(candidates(c, decided), keep ? null : v);
    }
    if (state.pick[c.key]) decided[c.key] = state.pick[c.key];
  }
}

// 🎲: 그 줄만 다른 줄들과 맞는 것 중에서 다시 뽑는다
function rollOne(c) {
  const others = Object.fromEntries(state.categories
    .filter((d) => d !== c && active(d) && state.pick[d.key]).map((d) => [d.key, state.pick[d.key]]));
  state.pick[c.key] = randomOf(candidates(c, others), state.pick[c.key]);
}

function spin() {
  if (!state.categories.length) return;
  settle(false);
  save();
  renderRows();
  renderLyrics(true);
  pushHistory();
}

function setLevel(n) {
  state.level = n;
  // 잠그지 않은 줄 중 새 수위를 넘거나 안 맞는 값만 다시 뽑는다. 직접 고른(잠근) 값은 그대로
  settle();
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

const cast = () => castOf(state.pick);

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
    const r = ruleOf(c, v);
    // another …(상대가 나에게 하는) 태그는 받는 쪽에만
    if (r.side === 'b') { out.b.push(v); continue; }
    if (mode === 'mutual') { out.a.push('mutual#' + v); out.b.push('mutual#' + v); continue; }
    // 남녀일 때 그 동작을 하는 쪽(by)이 따로 있으면 그쪽에 source#. 펠라 · 기승위는 여자 쪽
    const want = r.by === 'f' ? 'girl' : r.by === 'm' ? 'boy' : '';
    const flip = want && who.a !== want && who.b === want;
    out[flip ? 'b' : 'a'].push('source#' + v);
    out[flip ? 'a' : 'b'].push('target#' + v);
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
  // 프리셋끼리 쌓이지 않게 켜고 끄기 · 스위치는 처음 상태(- 꺼 둔 줄 · 스위치 처음)로 되돌린 뒤 적용한다.
  // 잠금은 사용자가 정한 것이라 그대로 두고, 프리셋이 직접 고르는 값만 잠근다
  for (const c of state.categories) {
    delete state.bundle[c.key];
    if (c.startOff) state.off[c.key] = true; else delete state.off[c.key];
  }
  for (const t of state.toggles) state.sw[t.name] = t.start;
  state.swap = false;
  if (p.level) state.level = p.level;
  const all = p.on.includes('전부');
  for (const c of state.categories) {
    if (all || p.on.some((n) => sameName(n, c.name))) delete state.off[c.key];
    if (p.off.some((n) => sameName(n, c.name))) state.off[c.key] = true;
    if (state.off[c.key]) state.use[c.key] = false; else delete state.use[c.key];
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
    delete state.off[c.key];
    delete state.bundle[c.key];
  }
  settle(false);
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
  document.querySelectorAll('.heat-step[data-level]').forEach((b) => {
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
    if (use.checked) { delete state.use[c.key]; delete state.off[c.key]; } else { state.use[c.key] = false; state.off[c.key] = true; }
    settle(); save(); renderRows(); renderLyrics();
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
    const others = Object.fromEntries(state.categories
      .filter((d) => d !== c && active(d) && state.pick[d.key]).map((d) => [d.key, state.pick[d.key]]));
    tag.textContent = v || (ok ? blocker(c) : '이 수위엔 값이 없어요');
    ko.textContent = v ? metaOf('ko', c, v) || '' : '';
    const select = document.createElement('select');
    select.className = 'chooser';
    select.title = '눌러서 직접 고르기 (고르면 잠겨요)';
    for (const item of c.items) {
      const lv = levelOf(c, item);
      const k = metaOf('ko', c, item);
      const opt = new Option(`${'●'.repeat(lv)}${'○'.repeat(3 - lv)}  ${item}${k ? '  — ' + k : ''}`, item);
      // 수위를 넘거나 다른 줄과 안 맞는 값은 흐리게. 골라도 되고, 고르면 그 값이 이긴다
      if (lv > state.level || !fits(c, item, others)) opt.className = 'over';
      select.add(opt);
    }
    if (!v) select.add(new Option('', ''), 0);
    select.value = v;
    select.addEventListener('change', () => {
      state.pick[c.key] = select.value;
      state.lock[c.key] = true;
      settle(); save(); renderRows(); renderLyrics();
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
      settle(); save(); renderRows(); renderLyrics();
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
    settle(); save(); renderRows(); renderLyrics();
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
      route: state.route, level: state.level, swap: state.swap, off: state.off,
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

// 이 줄에 맞는 값이 없을 때, 그 잠근 줄 하나만 빼면 생기는지 보고 그 줄을 짚는다
function blocker(c) {
  const all = Object.fromEntries(state.categories
    .filter((d) => d !== c && active(d) && state.pick[d.key]).map((d) => [d.key, state.pick[d.key]]));
  for (const d of state.categories) {
    if (!(d.key in all) || !state.lock[d.key]) continue;
    const rest = { ...all };
    delete rest[d.key];
    if (candidates(c, rest).length) return `${bareName(d.name)}(${all[d.key]})와 맞는 값이 없어요`;
  }
  return '이 조합엔 맞는 값이 없어요';
}

/* ---------- 데이터 검사 (켤 때 콘솔에) ---------- */

function validate() {
  const warn = [];
  for (const c of state.categories) {
    for (const t of c.items) if (!metaOf('ko', c, t)) warn.push(`뜻 없음: ${c.name} · ${t}`);
  }
  const named = (n) => state.categories.some((c) => sameName(n, c.name)) || state.toggles.some((t) => n === swName(t) || n === t.name);
  for (const p of state.meta.presets || []) {
    for (const [reel, v] of p.picks) {
      const c = state.categories.find((x) => sameName(reel, x.name));
      if (!c || !c.items.includes(v)) warn.push(`프리셋 ${p.name}: 없는 값 ${reel}=${v}`);
    }
    for (const n of [...p.on, ...p.off]) if (n !== '전부' && !named(n)) warn.push(`프리셋 ${p.name}: 없는 줄 · 스위치 ${n}`);
  }
  // 둘 이상인 인원마다 체위 줄에 고를 값이 남는지
  const castRow = state.categories.find((c) => /인원/.test(c.name));
  const posRow = state.categories.find((c) => /^체위 \[/.test(c.name));
  if (castRow && posRow) {
    for (const v of castRow.items) {
      if (/solo/.test(v)) continue;
      if (!posRow.items.some((t) => fits(posRow, t, { [castRow.key]: v }))) warn.push(`인원 '${v}'에 맞는 체위가 없음`);
    }
  }
  if (warn.length) console.warn('[Screentone 데이터 검사]\n' + warn.join('\n'));
  return warn;
}

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
  // 예전 버그로 수위가 숫자가 아니게 저장됐으면 3으로 되돌린다
  if (![1, 2, 3].includes(state.level)) state.level = 3;
  delete state.mixRows;
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
els.swap.addEventListener('click', () => { state.swap = !state.swap; settle(); save(); renderRows(); renderLyrics(); });
document.querySelectorAll('.heat-step[data-level]').forEach((b) => b.addEventListener('click', () => setLevel(Number(b.dataset.level))));
$('histTxt').addEventListener('click', () => PANote.download(`screentone-${fileStamp()}.txt`, PANote.toTxt(noteEntries()), 'text/plain;charset=utf-8'));
$('histMd').addEventListener('click', () => PANote.download(`screentone-${fileStamp()}.md`, PANote.toMd(noteEntries()), 'text/markdown;charset=utf-8'));
$('histNote').addEventListener('click', () => PANote.download(`prompt-archive-note-${fileStamp()}.html`, PANote.toHtml(noteEntries()), 'text/html;charset=utf-8'));
els.helpBtn.addEventListener('click', () => els.help.showModal());

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
        delete state.off[c.key];
        delete state.bundle[c.key];
        settle(); save(); renderRows(); renderLyrics(); renderBook();
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

els.spin.addEventListener('click', spin);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closePicker();
  if (e.target.closest('select, input, textarea, button, dialog')) return;
  if (e.key === ' ' && !els.spin.disabled) { e.preventDefault(); spin(); }
});

load();
render();
renderHistory();
applyParsed(fromData(window.SCREENTONE));
$('version').textContent = `v${VERSION}`;
validate();

// 헤드리스 점검용 창구
window.__screentone = { VERSION, validate, fromData, applyParsed, buildParts, spin, setLevel, settle, fits, castOf, candidates, state: () => state, received };
