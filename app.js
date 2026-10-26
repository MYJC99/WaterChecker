'use strict';
(() => {
  const KEY = 'waterTracker.v1';
  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, '0');
  const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fromKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

  // ---------- storage ----------
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && typeof s === 'object' && s.days) return { goal: Number(s.goal) || 2000, days: s.days };
    } catch (e) {}
    return { goal: 2000, days: {} };
  }
  let state = load();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { showToast('儲存失敗：手機空間不足？'); }
  }
  // Ask iOS/Chrome to keep our storage (best-effort).
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  let today = dayKey();
  function dayObj(k, create) {
    let d = state.days[k];
    if (!d && create) d = state.days[k] = { goal: state.goal, entries: [] };
    return d;
  }
  const totalOf = (k) => { const d = state.days[k]; return d ? d.entries.reduce((a, e) => a + e.ml, 0) : 0; };
  const goalOf = (k) => { const d = state.days[k]; return (d && d.goal) || state.goal; };
  const metOn = (k) => totalOf(k) >= goalOf(k);

  // ---------- actions ----------
  let lastAction = null;
  function addWater(ml) {
    ml = Math.round(Number(ml));
    if (!ml || ml <= 0 || ml > 5000) return;
    rollDay();
    const d = dayObj(today, true);
    d.goal = state.goal;
    const entry = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), t: Date.now(), ml };
    const wasMet = metOn(today);
    d.entries.push(entry);
    save();
    lastAction = { type: 'add', day: today, id: entry.id };
    render(true);
    if (!wasMet && metOn(today)) showToast(`🎉 達標啦！今日飲咗 ${fmt(totalOf(today))} ml`, true);
    else showToast(`已加 ${ml} ml 💧`, true);
    if (navigator.vibrate) navigator.vibrate(15);
  }
  function deleteEntry(id) {
    const d = dayObj(today);
    if (!d) return;
    const i = d.entries.findIndex((e) => e.id === id);
    if (i < 0) return;
    const [removed] = d.entries.splice(i, 1);
    save();
    lastAction = { type: 'del', day: today, entry: removed, index: i };
    render();
    showToast(`已刪除 ${removed.ml} ml`, true);
  }
  function undo() {
    if (!lastAction) return;
    const d = dayObj(lastAction.day, true);
    if (lastAction.type === 'add') d.entries = d.entries.filter((e) => e.id !== lastAction.id);
    else if (lastAction.type === 'del') d.entries.splice(lastAction.index, 0, lastAction.entry);
    lastAction = null;
    save(); render(); hideToast();
  }
  function setGoal(ml) {
    ml = Math.round(Number(ml));
    if (!ml || ml < 100 || ml > 10000) return;
    state.goal = ml;
    dayObj(today, true).goal = ml;
    save(); render();
    showToast(`每日目標已改為 ${fmt(ml)} ml`);
  }

  // ---------- streaks ----------
  function streakNow() {
    // Count back from today if met, otherwise from yesterday (today still in progress).
    let d = fromKey(today);
    if (!metOn(today)) d = addDays(d, -1);
    let n = 0;
    while (metOn(dayKey(d))) { n++; d = addDays(d, -1); }
    return n;
  }
  function bestStreak() {
    const keys = Object.keys(state.days).filter(metOn).sort();
    let best = 0, cur = 0, prev = null;
    for (const k of keys) {
      cur = prev && dayKey(addDays(fromKey(prev), 1)) === k ? cur + 1 : 1;
      best = Math.max(best, cur); prev = k;
    }
    return best;
  }

  // ---------- render ----------
  let range = 7;
  const CIRC = 2 * Math.PI * 100;
  function greeting() {
    const h = new Date().getHours();
    return h < 5 ? '夜喇 🌙' : h < 12 ? '早晨 ☀️' : h < 18 ? '午安 🌤️' : '晚安 🌙';
  }
  function message(total, goal) {
    const p = total / goal;
    if (total === 0) return '開始飲第一杯水啦 💧';
    if (p >= 1) return '今日目標完成！好叻 🎉';
    const left = goal - total;
    const cups = Math.ceil(left / 250);
    if (p >= 0.75) return `就快得喇！仲差 ${fmt(left)} ml 💪`;
    if (p >= 0.5) return `過咗一半！仲差 ${fmt(left)} ml（約 ${cups} 杯）`;
    return `仲差 ${fmt(left)} ml（約 ${cups} 杯）`;
  }
  function render(pop) {
    const total = totalOf(today), goal = goalOf(today);
    const p = Math.min(total / goal, 1);
    const now = new Date();
    $('hello').textContent = greeting();
    $('today-label').textContent = `${now.getMonth() + 1}月${now.getDate()}日 星期${WEEK[now.getDay()]}`;
    $('total').textContent = fmt(total);
    $('goal').textContent = fmt(goal);
    $('pct').textContent = Math.round((total / goal) * 100) + '%';
    $('ring-fg').style.strokeDashoffset = String(CIRC * (1 - p));
    // water level: y=194 empty -> y=26 full (circle r=84 around 110)
    $('water').style.transform = `translateY(${194 - 168 * p}px)`;
    $('msg').textContent = message(total, goal);
    $('streak').textContent = streakNow();
    if (pop) { const t = $('total').parentElement; t.classList.remove('pop'); void t.offsetWidth; t.classList.add('pop'); }

    // entries (newest first)
    const list = $('entries');
    const entries = (dayObj(today) || { entries: [] }).entries.slice().reverse();
    list.innerHTML = '';
    for (const e of entries) {
      const li = document.createElement('li');
      const t = new Date(e.t);
      li.innerHTML = `<span class="dot">${e.ml >= 500 ? '🧴' : '🥛'}</span><span class="ml">${fmt(e.ml)} ml</span><span class="time">${pad(t.getHours())}:${pad(t.getMinutes())}</span><button class="del" aria-label="刪除">🗑️</button>`;
      li.querySelector('.del').addEventListener('click', () => deleteEntry(e.id));
      list.appendChild(li);
    }
    $('empty').hidden = entries.length > 0;
    $('count').textContent = entries.length ? `${entries.length} 次` : '';
    renderChart();
  }
  function renderChart() {
    const chart = $('chart');
    chart.innerHTML = '';
    const days = [];
    for (let i = range - 1; i >= 0; i--) days.push(dayKey(addDays(fromKey(today), -i)));
    const totals = days.map(totalOf);
    const max = Math.max(state.goal * 1.15, ...totals.map((t) => t * 1.05), 1);
    const line = document.createElement('div');
    line.className = 'goal-line';
    line.style.bottom = `calc(${state.goal / max} * (100% - 16px))`;
    line.innerHTML = `<span>目標</span>`;
    chart.appendChild(line);
    days.forEach((k, i) => {
      const d = fromKey(k);
      const bar = document.createElement('div');
      bar.className = 'bar' + (metOn(k) && totals[i] > 0 ? ' met' : '') + (k === today ? ' today' : '');
      let label = '';
      if (range === 7) label = k === today ? '今日' : WEEK[d.getDay()];
      else if (i % 5 === 4 || k === today) label = `${d.getMonth() + 1}/${d.getDate()}`;
      bar.innerHTML = `<i style="height:calc(${(totals[i] / max) * 100}% - 16px)"></i><small>${label}</small>`;
      bar.title = `${k}: ${fmt(totals[i])} ml`;
      chart.appendChild(bar);
    });
    const logged = days.filter((k) => totalOf(k) > 0);
    const sum = totals.reduce((a, b) => a + b, 0);
    $('avg').textContent = fmt(logged.length ? sum / logged.length : 0);
    $('hit').textContent = `${days.filter((k) => totalOf(k) > 0 && metOn(k)).length}/${range}`;
    $('best').textContent = bestStreak();
  }

  // ---------- sheet (custom amount / goal) ----------
  let sheetMode = 'add';
  function openSheet(mode) {
    sheetMode = mode;
    $('sheet-title').textContent = mode === 'goal' ? '每日目標' : '自訂份量';
    $('sheet-ok').textContent = mode === 'goal' ? '儲存' : '加入';
    const input = $('sheet-input');
    input.value = mode === 'goal' ? state.goal : '';
    input.placeholder = mode === 'goal' ? '2000' : '例如 330';
    input.min = mode === 'goal' ? 100 : 1;
    input.max = mode === 'goal' ? 10000 : 5000;
    const chips = mode === 'goal' ? [1500, 2000, 2500, 3000] : [100, 150, 200, 330, 350, 750, 1000];
    $('sheet-chips').innerHTML = chips.map((c) => `<button type="button" data-v="${c}">${fmt(c)}</button>`).join('');
    $('sheet-bg').hidden = false;
    setTimeout(() => input.focus(), 50);
  }
  function closeSheet() { $('sheet-bg').hidden = true; $('sheet-input').blur(); }
  $('sheet-chips').addEventListener('click', (e) => {
    const v = e.target.closest('button')?.dataset.v;
    if (!v) return;
    if (sheetMode === 'goal') { $('sheet-input').value = v; } else { closeSheet(); addWater(v); }
  });
  $('sheet').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('sheet-input').value;
    closeSheet();
    sheetMode === 'goal' ? setGoal(v) : addWater(v);
  });
  $('sheet-cancel').addEventListener('click', closeSheet);
  $('sheet-bg').addEventListener('click', (e) => { if (e.target.id === 'sheet-bg') closeSheet(); });

  // ---------- toast ----------
  let toastTimer;
  function showToast(text, canUndo) {
    $('toast-text').textContent = text;
    $('toast-undo').hidden = !canUndo;
    $('toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 4000);
  }
  function hideToast() { $('toast').hidden = true; }
  $('toast-undo').addEventListener('click', undo);

  // ---------- backup ----------
  $('export-btn').addEventListener('click', async () => {
    const json = JSON.stringify(state);
    const name = `water-backup-${today}.json`;
    const file = new File([json], name, { type: 'application/json' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; }
    } catch (e) { if (e.name === 'AbortError') return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
  $('import-btn').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const s = JSON.parse(await f.text());
      if (!s || !s.days) throw new Error('bad');
      if (!confirm('匯入會合併備份入面嘅記錄，確定？')) return;
      for (const [k, d] of Object.entries(s.days)) {
        const cur = dayObj(k, true);
        const ids = new Set(cur.entries.map((x) => x.id));
        for (const en of d.entries || []) if (!ids.has(en.id)) cur.entries.push(en);
        cur.entries.sort((a, b) => a.t - b.t);
        if (d.goal) cur.goal = d.goal;
      }
      if (s.goal) state.goal = Number(s.goal);
      save(); render(); showToast('匯入完成 ✅');
    } catch (err) { showToast('檔案唔啱，匯入失敗'); }
    e.target.value = '';
  });

  // ---------- wiring ----------
  document.querySelectorAll('.q[data-ml]').forEach((b) => b.addEventListener('click', () => addWater(b.dataset.ml)));
  $('custom-btn').addEventListener('click', () => openSheet('add'));
  $('goal-btn').addEventListener('click', () => openSheet('goal'));
  document.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.seg button').forEach((x) => x.classList.toggle('on', x === b));
    range = Number(b.dataset.range); renderChart();
  }));

  // Day rollover at local midnight
  function rollDay() {
    const k = dayKey();
    if (k !== today) { today = k; lastAction = null; render(); }
  }
  setInterval(rollDay, 30 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { state = load(); today = dayKey(); render(); } });
  window.addEventListener('pageshow', () => { today = dayKey(); render(); });
  window.addEventListener('storage', (e) => { if (e.key === KEY) { state = load(); render(); } });

  render();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
  window.__water = { addWater, state: () => state, dayKey };
})();
