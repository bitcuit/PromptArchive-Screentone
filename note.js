/* Prompt Archive — 받은 프롬프트 노트 (에디션 공통)
 * 에디션은 받은 프롬프트를 아래 모양으로 모아 두었다가 TXT · MD · 노트(HTML)로 내려받는다.
 *   { edition, title, sub, meta, code, at: 'YYYY-MM-DD HH:MM', prompt }
 * 노트 HTML 은 혼자 열리는 파일이다. 에디션별 탭 · 검색 · 복사 · 삭제, 그리고 TXT · MD · 다른 노트를
 * 끌어다 놓거나 불러오면 합쳐진다(같은 에디션 · 시각 · 프롬프트는 한 번만). '노트 저장'은 합친 내용을 새 HTML 로 받는다.
 * 다른 에디션에 붙일 때는 이 파일을 그대로 복사하고, 항목만 위 모양으로 넘기면 된다. */
(function () {
  /* 노트 HTML 안에도 그대로 들어가는 부분 — 형식 만들기 · 읽기 · 합치기 */
  function core() {
    const key = e => [e.edition, e.at, e.prompt].join('\u0001');
    const head = e => [e.title, e.sub].filter(Boolean).join(' — ');
    function merge(a, b) {
      const seen = new Set(a.map(key)), out = a.slice();
      let added = 0;
      for (const e of b) { const k = key(e); if (!seen.has(k)) { seen.add(k); out.push(e); added++; } }
      out.sort((x, y) => (y.at || '').localeCompare(x.at || ''));
      return { list: out, added };
    }
    function toTxt(list) {
      return list.map(e => `[${e.edition}] ${head(e)} | ${e.at} | ${e.meta || ''}\n${e.prompt}`).join('\n\n') + '\n';
    }
    function toMd(list) {
      const eds = [...new Set(list.map(e => e.edition))];
      let s = '# Prompt Archive — 받은 프롬프트\n';
      for (const ed of eds) {
        s += `\n## ${ed}\n`;
        for (const e of list.filter(x => x.edition === ed)) {
          s += `\n### ${head(e) || '(이름 없음)'}\n- 받은 때: ${e.at}\n`;
          if (e.meta) s += `- 차림: ${e.meta}\n`;
          if (e.code) s += `- 번호: ${e.code}\n`;
          s += '\n```text\n' + e.prompt + '\n```\n';
        }
      }
      return s;
    }
    const splitHead = h => { const i = h.indexOf(' — '); return i < 0 ? { title: h, sub: '' } : { title: h.slice(0, i), sub: h.slice(i + 3) }; };
    /* 노트 HTML · MD · TXT 를 알아서 읽는다. 머리줄이 없는 TXT 는 빈 줄로 나뉜 덩어리를 프롬프트 하나씩으로 본다. */
    function parseText(text, fileName) {
      text = String(text).replace(/\r\n/g, '\n');
      const m = text.match(/<script id="pa-data" type="application\/json">([\s\S]*?)<\/script>/);
      if (m) { try { return JSON.parse(m[1]); } catch (e) { return []; } }
      const out = [];
      if (/^### /m.test(text) && /```/.test(text)) {
        let ed = '', cur = null, inCode = false, buf = [];
        for (const ln of text.split('\n')) {
          if (inCode) {
            if (ln.startsWith('```')) { cur.prompt = buf.join('\n').trim(); out.push(cur); cur = null; inCode = false; buf = []; }
            else buf.push(ln);
            continue;
          }
          if (/^## /.test(ln)) { ed = ln.slice(3).trim(); continue; }
          if (/^### /.test(ln)) { cur = { edition: ed || '불러온 글', ...splitHead(ln.slice(4).trim()), at: '', meta: '', code: '', prompt: '' }; continue; }
          if (!cur) continue;
          if (/^- 받은 때:/.test(ln)) cur.at = ln.replace(/^- 받은 때:\s*/, '');
          else if (/^- 차림:/.test(ln)) cur.meta = ln.replace(/^- 차림:\s*/, '');
          else if (/^- 번호:/.test(ln)) cur.code = ln.replace(/^- 번호:\s*/, '');
          else if (ln.startsWith('```')) { inCode = true; buf = []; }
        }
        return out.filter(e => e.prompt);
      }
      const base = (fileName || '불러온 글').replace(/\.[^.]+$/, '');
      for (const b of text.split(/\n\s*\n/)) {
        const ls = b.trim().split('\n');
        if (!ls[0]) continue;
        const h = ls[0].match(/^\[(.+?)\]\s+(.*?)\s+\|\s+([\d-]+ [\d:]+)\s*\|?\s*(.*)$/);
        if (h) out.push({ edition: h[1], ...splitHead(h[2]), at: h[3], meta: h[4] || '', code: '', prompt: ls.slice(1).join('\n').trim() });
        else out.push({ edition: base, title: '', sub: '', at: '', meta: '', code: '', prompt: b.trim() });
      }
      return out.filter(e => e.prompt);
    }
    return { key, head, merge, toTxt, toMd, parseText };
  }

  /* 노트 HTML 의 화면 — 위에 탭 · 검색 · 단추, 아래에 칸 목록 */
  function viewer(C) {
    const dataEl = document.getElementById('pa-data');
    let list = []; try { list = JSON.parse(dataEl.textContent || '[]'); } catch (e) {}
    let tab = 'all', q = '';
    const app = document.getElementById('app'); app.innerHTML = '';
    const el = (t, cls, txt) => { const n = document.createElement(t); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; };
    const stamp = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; };
    const save = (name, text, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
    const top = el('header', 'top');
    const h1 = el('h1', '', '받은 프롬프트');
    const count = el('span', 'count');
    const tools = el('div', 'tools');
    const file = el('input'); file.type = 'file'; file.multiple = true; file.accept = '.txt,.md,.html,.htm'; file.hidden = true;
    const bOpen = el('button', '', '불러오기'), bSave = el('button', 'main', '노트 저장'), bTxt = el('button', '', 'TXT'), bMd = el('button', '', 'MD');
    bOpen.title = 'TXT · MD · 다른 노트를 골라 합치기 (끌어다 놓아도 됨)';
    bSave.title = '합친 내용을 새 노트(HTML)로 받기';
    tools.append(bOpen, bTxt, bMd, bSave, file);
    h1.append(count); top.append(h1, tools);
    const bar = el('div', 'bar'), tabs = el('nav', 'tabs'), search = el('input', 'search'); search.type = 'search'; search.placeholder = '검색 — 이름 · 프롬프트';
    bar.append(tabs, search);
    const status = el('p', 'status', 'TXT · MD · 노트 파일을 이 창에 끌어다 놓으면 합쳐져요.');
    const ul = el('ol', 'cards');
    app.append(top, bar, status, ul);
    const visible = () => list.filter(e => (tab === 'all' || e.edition === tab) && (!q || (C.head(e) + ' ' + e.prompt + ' ' + (e.meta || '')).toLowerCase().includes(q)));
    function render() {
      count.textContent = ` ${list.length}`;
      tabs.innerHTML = '';
      const eds = [...new Set(list.map(e => e.edition))];
      if (tab !== 'all' && !eds.includes(tab)) tab = 'all';
      for (const t of ['all', ...eds]) {
        const n = t === 'all' ? list.length : list.filter(e => e.edition === t).length;
        const b = el('button', 'tab' + (t === tab ? ' on' : ''), (t === 'all' ? '전체' : t) + ' ' + n);
        b.onclick = () => { tab = t; render(); };
        tabs.append(b);
      }
      ul.innerHTML = '';
      const v = visible();
      if (!v.length) { ul.append(el('li', 'empty', list.length ? '맞는 프롬프트가 없어요.' : '아직 비어 있어요. TXT · MD · 노트를 불러오세요.')); }
      for (const e of v) {
        const li = el('li', 'card');
        const hd = el('div', 'hd');
        const name = el('strong', '', e.title || '(이름 없음)');
        if (e.sub) name.append(el('span', 'sub', ' ' + e.sub));
        hd.append(name);
        if (tab === 'all') hd.append(el('span', 'chip', e.edition));
        hd.append(el('span', 'time', e.at || ''));
        const meta = el('div', 'meta', [e.meta, e.code].filter(Boolean).join('  ·  '));
        const pr = el('p', 'prompt', e.prompt);
        const act = el('div', 'act');
        const cp = el('button', 'main', '복사'), del = el('button', 'ghost', '삭제');
        cp.onclick = async () => { try { await navigator.clipboard.writeText(e.prompt); status.textContent = '복사했어요.'; } catch (x) { status.textContent = '복사가 막혔어요. 글을 직접 선택해 복사하세요.'; } };
        del.onclick = () => { list = list.filter(x => x !== e); render(); status.textContent = '지웠어요. 남기려면 노트 저장을 누르세요.'; };
        act.append(cp, del);
        li.append(hd, meta, pr, act);
        ul.append(li);
      }
    }
    async function take(files) {
      let added = 0, read = 0;
      for (const f of files) {
        const r = C.merge(list, C.parseText(await f.text(), f.name));
        list = r.list; added += r.added; read++;
      }
      render();
      status.textContent = `${read}개 파일에서 ${added}개를 더했어요. 남기려면 노트 저장을 누르세요.`;
    }
    bOpen.onclick = () => file.click();
    file.onchange = () => { if (file.files.length) take([...file.files]); file.value = ''; };
    search.oninput = () => { q = search.value.trim().toLowerCase(); render(); };
    bTxt.onclick = () => save(`prompt-archive-${stamp()}.txt`, C.toTxt(visible()), 'text/plain;charset=utf-8');
    bMd.onclick = () => save(`prompt-archive-${stamp()}.md`, C.toMd(visible()), 'text/markdown;charset=utf-8');
    bSave.onclick = () => {
      dataEl.textContent = JSON.stringify(list).replace(/</g, '\\u003c');
      const copy = document.documentElement.cloneNode(true);
      copy.querySelector('#app').innerHTML = '';
      copy.querySelector('body').classList.remove('drop');
      const html = '<!doctype html>\n' + copy.outerHTML;
      save(`prompt-archive-note-${stamp()}.html`, html, 'text/html;charset=utf-8');
      status.textContent = '노트를 새 파일로 받았어요.';
    };
    addEventListener('dragover', e => { e.preventDefault(); document.body.classList.add('drop'); });
    addEventListener('dragleave', e => { if (e.target === document.documentElement || e.clientX <= 0) document.body.classList.remove('drop'); });
    addEventListener('drop', e => { e.preventDefault(); document.body.classList.remove('drop'); if (e.dataTransfer.files.length) take([...e.dataTransfer.files]); });
    render();
  }

  // 노트 HTML 은 혼자 열리는 파일 — 글꼴은 <link> 없이 웹폰트 주소에 바로 연결한다(본문만 붙여넣어도 따라오게)
  const CSS = `
@font-face{font-family:"Pretendard Variable";src:url("https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/web/variable/woff2/PretendardVariable.woff2") format("woff2-variations"),url("https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/web/variable/woff2/PretendardVariable.woff2") format("woff2");font-weight:45 920;font-style:normal;font-display:swap}
:root{--bg:#f6f4f1;--card:#fff;--ink:#1f1b19;--dim:#776f69;--line:#e3ded8;--accent:#6e2529;--chip:#efe9e3}
@media (prefers-color-scheme:dark){:root{--bg:#17131a;--card:#211b24;--ink:#ece1d0;--dim:#a69888;--line:#3a3040;--accent:#d9a05a;--chip:#2c2430}}
*{box-sizing:border-box}html,body{margin:0}body{background:var(--bg);color:var(--ink);font:14px/1.6 "Pretendard Variable","Pretendard","Malgun Gothic","Apple SD Gothic Neo",system-ui,sans-serif}
#app{max-width:980px;margin:0 auto;padding:24px 16px 40px}
.top{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
h1{font-size:22px;margin:0}.count{color:var(--dim);font-weight:400;font-size:16px}
.tools{display:flex;gap:6px;flex-wrap:wrap}
button{font:inherit;border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:6px;padding:6px 12px;cursor:pointer}
button:hover{border-color:var(--dim)}button.main{background:var(--ink);color:var(--bg);border-color:var(--ink)}button.ghost{background:transparent}
.bar{position:sticky;top:0;z-index:2;background:var(--bg);display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:14px 0 10px;border-bottom:1px solid var(--line);margin-top:12px}
.tabs{display:flex;gap:4px;flex-wrap:wrap;flex:1}
.tab{border-radius:999px;padding:4px 12px}.tab.on{background:var(--accent);border-color:var(--accent);color:#fff}
.search{flex:0 1 260px;min-width:160px;font:inherit;border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:6px;padding:6px 10px}
.status{color:var(--dim);font-size:12.5px;margin:10px 0}
.cards{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px}
.hd{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}.hd strong{font-size:16px}.sub{color:var(--dim);font-weight:400;font-size:13px}
.chip{font-size:11.5px;background:var(--chip);border-radius:999px;padding:1px 9px}.time{margin-left:auto;color:var(--dim);font-size:12px;font-variant-numeric:tabular-nums}
.meta{color:var(--dim);font-size:11.5px;letter-spacing:.04em;margin-top:2px}
.prompt{margin:10px 0 12px;white-space:pre-wrap;word-break:break-word;user-select:text}
.act{display:flex;gap:6px}.empty{color:var(--dim);padding:28px 0;text-align:center}
body.drop #app{outline:2px dashed var(--accent);outline-offset:6px;border-radius:12px}
`;

  function toHtml(list) {
    const data = JSON.stringify(list).replace(/</g, '\\u003c');
    return '<!doctype html>\n<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
      + '<title>받은 프롬프트 노트</title><style>' + CSS + '</style></head><body><div id="app"></div>'
      + '<script id="pa-data" type="application/json">' + data + '</' + 'script>'
      + '<script>(' + viewer.toString() + ')((' + core.toString() + ')());</' + 'script></body></html>\n';
  }
  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const C = core();
  window.PANote = { ...C, toHtml, download };
})();
