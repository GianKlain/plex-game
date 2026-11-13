/* Plex web app: board rendering, input, game flow. */
(function () {
  'use strict';
  const P = window.Plex, AI = window.PlexAI;
  const $ = (id) => document.getElementById(id);
  const SVGNS = 'http://www.w3.org/2000/svg';
  const S3 = Math.sqrt(3) / 2;
  const C30 = Math.cos(Math.PI / 6), S30 = Math.sin(Math.PI / 6);

  const NAMES = { Y: 'Yellow', B: 'Blue' };
  const ui = {
    mode: 'ai', level: 'easy', human: 'Y',
    game: null, ghost: null, grid: true, busy: false, view: null,
    log: [], saved: false, rec: null,
  };

  // lattice vertex -> board units (stones stand upright like in the video)
  function pos(a, b) {
    const x = a + b / 2, y = b * S3;
    return [x * C30 + y * S30, -(-x * S30 + y * C30)];
  }
  // board units -> nearest lattice vertex
  function nearestVertex(X, Y) {
    const xr = X, yr = -Y;
    const x = xr * C30 - yr * S30, y = xr * S30 + yr * C30;
    const bf = y / S3, af = x - bf / 2;
    let best = null;
    for (const a of [Math.floor(af), Math.ceil(af)]) {
      for (const b of [Math.floor(bf), Math.ceil(bf)]) {
        const p = pos(a, b), d = (p[0] - X) ** 2 + (p[1] - Y) ** 2;
        if (!best || d < best.d) best = { a, b, d };
      }
    }
    return best;
  }

  const el = (name, attrs) => {
    const e = document.createElementNS(SVGNS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  };
  const poly = (verts) => verts.map((v) => pos(v[0], v[1]).map((n) => n.toFixed(3)).join(',')).join(' ');

  function computeView() {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const add = (v) => { const p = pos(v[0], v[1]); x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); };
    for (const k of ui.game.cells.keys()) P.cellVerts(P.unkey(k)).forEach(add);
    const pad = 3.2;
    let w = Math.max(x1 - x0 + pad * 2, 9), h = Math.max(y1 - y0 + pad * 2, 9);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  }

  function render() {
    const g = ui.game, svg = $('board');
    const v = ui.view = computeView();
    svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
    svg.textContent = '';

    if (ui.grid) {
      const layer = el('g', {});
      const n = Math.ceil(Math.max(v.w, v.h)) + 4;
      const c = nearestVertex(v.x + v.w / 2, v.y + v.h / 2);
      for (let a = c.a - n; a <= c.a + n; a++) {
        for (let b = c.b - n; b <= c.b + n; b++) {
          const p = pos(a, b);
          if (p[0] < v.x - 1 || p[0] > v.x + v.w + 1 || p[1] < v.y - 1 || p[1] > v.y + v.h + 1) continue;
          layer.appendChild(el('circle', { cx: p[0].toFixed(3), cy: p[1].toFixed(3), r: 0.045, class: 'dot' }));
        }
      }
      svg.appendChild(layer);
    }

    drawPieces(svg, g, true);
    if (ui.ghost && !g.winner && canAct()) {
      const gh = ui.ghost, ok = P.isLegal(g, gh.a, gh.b, gh.r);
      svg.appendChild(el('polygon', { points: poly(P.stoneOutline(gh.a, gh.b, gh.r)), class: 'ghost ' + g.turn + (ok ? '' : ' bad') }));
      $('place-btn').disabled = !ok;
    } else {
      $('place-btn').disabled = true;
    }
    $('rotate-btn').disabled = !canAct() || !!g.winner;
    renderBars();
    renderHint();
  }

  function drawPieces(svg, g, markLast) {
    for (const [k, cell] of g.cells) {
      if (cell.t === 'V') svg.appendChild(el('polygon', { points: poly(P.cellVerts(P.unkey(k))), class: 'void' }));
      else if (cell.t[0] === 'p') svg.appendChild(el('polygon', { points: poly(P.cellVerts(P.unkey(k))), class: 'pt ' + cell.t }));
    }
    svg.appendChild(el('polygon', { points: poly(P.stoneOutline(0, 0, 0)), class: 'stone R' }));
    for (const [id, st] of g.stones) {
      svg.appendChild(el('polygon', { points: poly(P.stoneOutline(st.a, st.b, st.r)), class: 'stone ' + st.owner }));
      if (markLast && g.last && g.last.id === id) svg.appendChild(el('polygon', { points: poly(P.stoneOutline(st.a, st.b, st.r)), class: 'last' }));
    }
  }

  // small picture of a finished pattern
  function thumb(g) {
    const svg = el('svg', { class: 'thumb', 'aria-hidden': 'true' });
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const k of g.cells.keys()) for (const v of P.cellVerts(P.unkey(k))) {
      const p = pos(v[0], v[1]);
      x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]);
    }
    const side = Math.max(x1 - x0, y1 - y0) + 0.6;
    svg.setAttribute('viewBox', `${(x0 + x1 - side) / 2} ${(y0 + y1 - side) / 2} ${side} ${side}`);
    drawPieces(svg, g, false);
    return svg;
  }

  function label(p) {
    if (ui.mode === 'ai') return p === ui.human ? 'You' : 'Computer · ' + ui.level;
    return NAMES[p];
  }

  function renderBars() {
    const g = ui.game;
    const bottom = ui.mode === 'ai' ? ui.human : 'Y';
    const top = P.other(bottom);
    const fill = (node, p) => {
      node.className = 'bar' + (g.turn === p && !g.winner ? ' active' : '');
      node.innerHTML = `<span class="chip ${p}"></span><span class="name">${label(p)}<br><span class="turn">to move</span></span>`
        + `<span class="stat">Stones <b>${g.supply[p]}</b></span>`
        + (g.taken[p] ? `<span class="stat taken">Taken <b>${g.taken[p]}</b></span>` : '')
        + `<span class="stat">Pts <b>${g.points[p]}</b></span>`;
    };
    fill($('bar-top'), top);
    fill($('bar-bottom'), bottom);
  }

  function renderHint() {
    const g = ui.game;
    let t = '';
    if (g.winner) t = 'Game over.';
    else if (!canAct()) t = 'Computer is thinking…';
    else if (ui.ghost && !P.isLegal(g, ui.ghost.a, ui.ghost.b, ui.ghost.r)) t = 'Not there: it must lie free and touch the pattern with at least two corners.';
    else if (g.moves < 2) t = 'Tap the board to move your stone. Tap the stone to rotate it. Then end your turn.';
    else t = 'Move or rotate again, or end your turn.';
    $('hint').textContent = t;
  }

  const canAct = () => !ui.busy && (ui.mode === 'local' || ui.game.turn === ui.human);

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('show'), /took/.test(msg) ? 5000 : 2600);
  }

  function suggestGhost() {
    const g = ui.game, ms = P.legalMoves(g);
    if (!ms.length) { ui.ghost = null; return; }
    const ref = ui.ghost || { a: 0, b: 0, r: 0 };
    const rp = pos(ref.a, ref.b);
    ms.sort((m, n) => {
      const pm = pos(m.a, m.b), pn = pos(n.a, n.b);
      return ((pm[0] - rp[0]) ** 2 + (pm[1] - rp[1]) ** 2) - ((pn[0] - rp[0]) ** 2 + (pn[1] - rp[1]) ** 2);
    });
    ui.ghost = { a: ms[0].a, b: ms[0].b, r: ms[0].r };
  }

  function announce(prev) {
    const g = ui.game, l = g.last;
    if (!l) return;
    const who = (p) => (ui.mode === 'ai' ? (p === ui.human ? 'You' : 'Computer') : NAMES[p]);
    const parts = [];
    if (l.scored) parts.push(`${who(l.player)} scored ${l.scored} point${l.scored > 1 ? 's' : ''}`);
    for (const p of ['Y', 'B']) if (l.capturedBy[p]) parts.push(`${who(p)} took ${l.capturedBy[p]} stone${l.capturedBy[p] > 1 ? 's' : ''} and now ${who(p) === 'You' ? 'have' : 'has'} ${g.supply[p]} to place`);
    if (!g.winner && prev && g.turn === prev.turn) parts.push(`${who(P.other(g.turn))} has no stones left`);
    if (parts.length) toast(parts.join(' · '));
  }

  function commit(a, b, r) {
    const prev = ui.game;
    ui.game = P.play(prev, a, b, r);
    ui.log.push([a, b, r]);
    announce(prev);
    if (ui.game.winner) { ui.ghost = null; render(); setTimeout(showOver, 700); return; }
    if (canAct()) suggestGhost();
    render();
    if (ui.mode === 'ai' && ui.game.turn !== ui.human) aiTurn();
  }

  function aiTurn() {
    ui.busy = true;
    render();
    const game = ui.game;
    setTimeout(() => {
      if (ui.game !== game) { ui.busy = false; return; }
      const m = AI.choose(game, ui.level);
      ui.busy = false;
      if (m) commit(m.a, m.b, m.r);
    }, 450);
  }

  function showOver() {
    const g = ui.game;
    let title, sub, note = '';
    const surround = 'by surrounding the red stone';
    if (g.winner === 'draw') { title = 'Draw'; sub = 'Equal points.'; }
    else if (ui.mode === 'ai') {
      const won = g.winner === ui.human;
      title = won ? 'You won' : 'You lost';
      sub = g.reason === 'surround' ? surround : g.reason === 'points' ? 'on points' : 'by resignation';
      if (won) note = 'To earn a real set you need to beat someone who owns one. Online play against owners is coming next.';
      if (!ui.saved) record(won);
    } else {
      title = NAMES[g.winner] + ' wins';
      sub = g.reason === 'surround' ? surround : g.reason === 'points' ? 'on points' : 'by resignation';
    }
    $('over-title').textContent = title;
    $('over-sub').textContent = sub;
    $('over-score').textContent = g.reason === 'points' ? `${g.points.Y} – ${g.points.B}` : '';
    $('over-note').textContent = note;
    saveGame();
    showPattern();
    $('over').showModal();
  }

  // ---- game log and patterns ----
  // Kept in this browser only. "New" means new on this device until there is
  // a shared registry; the pattern codes are made so that one can take over.
  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
  };

  function saveGame() {
    const g = ui.game;
    if (ui.saved || !g || ui.log.length < 2) return;
    ui.saved = true;
    const finished = !!g.winner && g.reason !== 'resign';
    const rec = {
      v: 1, date: new Date().toISOString(), mode: ui.mode,
      level: ui.mode === 'ai' ? ui.level : null, human: ui.mode === 'ai' ? ui.human : null,
      moves: ui.log.slice(), winner: g.winner, reason: g.reason || 'abandoned',
      points: [g.points.Y, g.points.B], pattern: finished ? P.patternId(g) : null,
    };
    const games = store.get('plex-games', []);
    games.push(rec);
    store.set('plex-games', games.slice(-300));
    ui.rec = rec;
    if (finished) {
      const ps = store.get('plex-patterns', {});
      const p = ps[rec.pattern] || (ps[rec.pattern] = { key: P.patternKey(g), first: rec.date, moves: rec.moves, winner: g.winner, count: 0, name: null });
      p.count++;
      store.set('plex-patterns', ps);
    }
  }

  function showPattern() {
    const g = ui.game, rec = ui.rec, box = $('over-pattern'), form = $('claim');
    form.hidden = true;
    box.hidden = !(rec && rec.pattern);
    if (box.hidden) return;
    const p = store.get('plex-patterns', {})[rec.pattern] || { count: 1 };
    const seen = p.count > 1 ? `played ${p.count} times on this device` : 'never played on this device before';
    let line;
    if (p.name) line = `Pattern “${p.name}” · ${rec.pattern} · ${seen}.`;
    else if (g.winner === 'draw') line = `Pattern ${rec.pattern}, ${seen}. A draw, so nobody names it.`;
    else if (ui.mode === 'ai' && g.winner !== ui.human) line = `Pattern ${rec.pattern}, ${seen}. The computer won it, so it stays unnamed.`;
    else {
      line = `${p.count > 1 ? 'Unnamed pattern' : 'New pattern'} ${rec.pattern}, ${seen}. ${ui.mode === 'ai' ? 'You' : NAMES[g.winner]} may name it.`;
      form.hidden = false;
      $('claim-name').value = '';
    }
    $('pattern-line').textContent = line;
  }

  $('claim').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const name = $('claim-name').value.trim().replace(/\s+/g, ' ');
    if (!name || !ui.rec || !ui.rec.pattern) return;
    const ps = store.get('plex-patterns', {}), p = ps[ui.rec.pattern];
    if (!p || p.name) return;
    p.name = name;
    p.by = ui.mode === 'ai' ? 'You' : NAMES[ui.game.winner];
    p.claimed = new Date().toISOString();
    store.set('plex-patterns', ps);
    ui.rec.name = name;
    $('claim').hidden = true;
    $('pattern-line').textContent = `Claimed: “${name}” · ${ui.rec.pattern}.`;
  });

  function copyText(text, btn) {
    const done = () => { const t = btn.textContent; btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = t; }, 1500); };
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      (btn.closest('dialog') || document.body).appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { /* nothing more to try */ }
      ta.remove();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  }

  function showPatterns() {
    const ps = store.get('plex-patterns', {}), games = store.get('plex-games', []);
    const all = Object.keys(ps), named = all.filter((id) => ps[id].name).sort((x, y) => (ps[y].claimed || '').localeCompare(ps[x].claimed || ''));
    const list = $('patterns');
    list.textContent = '';
    for (const id of named) {
      const li = document.createElement('li');
      try { li.appendChild(thumb(P.replay(ps[id].moves))); } catch (e) { /* rules changed since: no picture */ }
      const txt = document.createElement('span');
      const b = document.createElement('b'); b.textContent = ps[id].name;
      const c = document.createElement('small'); c.textContent = `${id} · ${(ps[id].claimed || '').slice(0, 10)}`;
      txt.append(b, c);
      li.appendChild(txt);
      list.appendChild(li);
    }
    if (all.length) $('patterns-sub').textContent = `${all.length} pattern${all.length > 1 ? 's' : ''} played on this device, ${named.length} named. Win a new one and you may name it.`;
    $('copy-games').hidden = !games.length;
    $('copy-games').textContent = `Copy game log (${games.length})`;
  }
  $('copy-games').addEventListener('click', () => copyText(JSON.stringify(store.get('plex-games', [])), $('copy-games')));

  function record(won) {
    try {
      const r = JSON.parse(localStorage.getItem('plex-record') || '{"w":0,"l":0}');
      if (won) r.w++; else r.l++;
      localStorage.setItem('plex-record', JSON.stringify(r));
    } catch (e) { /* storage unavailable */ }
  }
  function showRecord() {
    let t = '';
    try {
      const r = JSON.parse(localStorage.getItem('plex-record') || 'null');
      if (r && r.w + r.l) t = `Your record: ${r.w} won, ${r.l} lost`;
    } catch (e) { /* storage unavailable */ }
    $('record').textContent = t;
  }

  function start(mode) {
    ui.mode = mode;
    ui.game = P.newGame();
    ui.ghost = null; ui.busy = false;
    ui.log = []; ui.saved = false; ui.rec = null;
    $('home').hidden = true; $('game').hidden = false;
    suggestGhost();
    render();
  }
  function goHome() {
    ui.game = null;
    $('game').hidden = true; $('home').hidden = false;
    showRecord();
    showPatterns();
  }

  // ---- input ----
  function boardPoint(ev) {
    const svg = $('board'), pt = svg.createSVGPoint();
    pt.x = ev.clientX; pt.y = ev.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    return [p.x, p.y];
  }
  let drag = null;
  $('board').addEventListener('pointerdown', (ev) => {
    if (!ui.game || ui.game.winner || !canAct()) return;
    const [x, y] = boardPoint(ev), v = nearestVertex(x, y);
    const same = ui.ghost && ui.ghost.a === v.a && ui.ghost.b === v.b;
    drag = { sx: ev.clientX, sy: ev.clientY, same, moved: false };
    $('board').setPointerCapture(ev.pointerId);
    if (!same) { ui.ghost = { a: v.a, b: v.b, r: ui.ghost ? ui.ghost.r : 0 }; render(); }
  });
  $('board').addEventListener('pointermove', (ev) => {
    if (!drag) return;
    if (Math.hypot(ev.clientX - drag.sx, ev.clientY - drag.sy) > 8) drag.moved = true;
    if (!drag.moved) return;
    const [x, y] = boardPoint(ev), v = nearestVertex(x, y);
    if (v.a !== ui.ghost.a || v.b !== ui.ghost.b) { ui.ghost.a = v.a; ui.ghost.b = v.b; render(); }
  });
  const endDrag = () => {
    if (!drag) return;
    if (drag.same && !drag.moved) rotate();
    drag = null;
  };
  $('board').addEventListener('pointerup', endDrag);
  $('board').addEventListener('pointercancel', () => { drag = null; });

  function rotate() {
    if (!ui.ghost || !canAct()) return;
    ui.ghost.r = (ui.ghost.r + 1) % 6;
    render();
  }
  $('rotate-btn').addEventListener('click', rotate);
  $('place-btn').addEventListener('click', () => {
    const gh = ui.ghost;
    if (gh && canAct() && P.isLegal(ui.game, gh.a, gh.b, gh.r)) commit(gh.a, gh.b, gh.r);
  });
  document.addEventListener('keydown', (ev) => {
    if (!ui.game || $('menu').open || $('over').open) return;
    if (ev.key === 'r' || ev.key === ' ') { ev.preventDefault(); rotate(); }
    if (ev.key === 'Enter') $('place-btn').click();
    const step = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[ev.key];
    if (step && ui.ghost && canAct()) { ev.preventDefault(); ui.ghost.a += step[0]; ui.ghost.b += step[1]; render(); }
  });

  $('levels').addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    ui.level = b.dataset.level;
    for (const x of $('levels').children) x.setAttribute('aria-checked', String(x === b));
  });
  $('start-ai').addEventListener('click', () => start('ai'));
  $('start-local').addEventListener('click', () => start('local'));
  $('menu-btn').addEventListener('click', () => {
    $('menu').querySelector('[data-act="grid"]').textContent = ui.grid ? 'Hide background grid' : 'Show background grid';
    $('menu').querySelector('[data-act="rematch"]').textContent = ui.game.winner ? 'Rematch' : 'Resign and rematch';
    $('menu').showModal();
  });
  const act = (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    const a = b.dataset.act;
    if (!a) return;
    if (a === 'copy') { if (ui.rec) copyText(JSON.stringify(ui.rec), b); return; }
    $('menu').close(); $('over').close();
    if (a === 'grid') { ui.grid = !ui.grid; render(); }
    if (a === 'rematch' || a === 'home') {
      // leaving a running game: it goes into the log as resigned
      if (!ui.game.winner && ui.log.length > 1) {
        if (ui.mode === 'ai') record(false);
        ui.game = P.resign(ui.game, ui.mode === 'ai' ? ui.human : ui.game.turn);
        saveGame();
      }
      if (a === 'rematch') start(ui.mode); else goHome();
    }
  };
  $('menu').addEventListener('click', act);
  $('over').addEventListener('click', act);

  // for watching and replaying a game from outside (teaching sessions, tests)
  window.PlexApp = { get game() { return ui.game; }, get log() { return ui.log; }, get mode() { return ui.mode; }, play: commit };

  showRecord();
  showPatterns();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
