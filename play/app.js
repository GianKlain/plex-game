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
    log: [], saved: false, rec: null, linked: false,
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
    const pad = 2.2;
    let w = Math.max(x1 - x0 + pad * 2, 7.5), h = Math.max(y1 - y0 + pad * 2 + 2.5, 11);
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

    const showGhost = ui.ghost && !g.winner && canAct();
    const ok = showGhost && P.isLegal(g, ui.ghost.a, ui.ghost.b, ui.ghost.r);
    const layer = el('g', { class: 'pieces' + (showGhost && !ok ? ' dim' : '') });
    drawPieces(layer, g, true);
    svg.appendChild(layer);
    if (showGhost) {
      const gh = ui.ghost, out = P.stoneOutline(gh.a, gh.b, gh.r);
      svg.appendChild(el('polygon', { points: poly(out), class: 'ghost ' + g.turn + (ok ? '' : ' bad') }));
      // badge inside the stone: halfway from its centre corner to the middle rim corner
      const c = pos(gh.a, gh.b), m = pos(out[3][0], out[3][1]);
      const bx = (c[0] + m[0]) / 2, by = (c[1] + m[1]) / 2;
      const badge = el('g', { class: 'badge ' + (ok ? 'ok' : 'bad'), transform: `translate(${bx.toFixed(3)} ${by.toFixed(3)})` });
      badge.appendChild(el('circle', { r: 0.24 }));
      badge.appendChild(el('path', { d: ok ? 'M-0.1 0.01 -0.03 0.08 0.11 -0.07' : 'M-0.08 -0.08 0.08 0.08M0.08 -0.08 -0.08 0.08' }));
      svg.appendChild(badge);
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
    if (ui.mode === 'online') return p === ui.human ? 'You' : 'Friend';
    return NAMES[p];
  }

  const CHEVRON = '<svg viewBox="0 0 14 10" aria-hidden="true"><path d="M7 0 14 4v6L7 6 0 10V4z" fill="currentColor"/></svg>';
  const TRI = '<svg viewBox="0 0 12 11" aria-hidden="true"><path d="M6 0 12 11H0z" fill="currentColor"/></svg>';

  function renderBars() {
    const g = ui.game;
    const bottom = ui.mode !== 'local' ? ui.human : 'Y';
    const top = P.other(bottom);
    const fill = (node, p) => {
      node.className = 'pbar' + (g.turn === p && !g.winner ? ' active' : '');
      node.innerHTML = `<span class="avatar ${p}">${label(p)[0]}</span>`
        + `<span class="name"><span>${label(p)}</span><span class="turn">to move</span></span>`
        + `<span class="count ${p}" title="Stones left to place" aria-label="${g.supply[p]} stones left">${CHEVRON}${g.supply[p]}</span>`
        + (g.taken[p] ? `<span class="taken" title="Stones taken">+${g.taken[p]} taken</span>` : '')
        + `<span class="pts ${p}">${TRI}<b>${g.points[p]}</b> Pts</span>`;
    };
    fill($('bar-top'), top);
    fill($('bar-bottom'), bottom);
  }

  function renderHint() {
    const g = ui.game;
    let t = '';
    if (g.winner) t = 'Game over.';
    else if (!canAct()) t = ui.mode === 'ai' ? 'Computer is thinking…' : ui.linked ? 'Waiting for your friend…' : 'Your friend is disconnected. They can reopen the invite link.';
    else if (ui.ghost && !P.isLegal(g, ui.ghost.a, ui.ghost.b, ui.ghost.r)) t = g.moves < 2 ? 'Good, now align it with the red stone.' : 'Not there. Two corners must touch the pattern.';
    else if (g.moves < 2) t = 'Tap to move, tap the stone to rotate, then <b>end turn →</b>';
    else t = 'Move or rotate again or <b>end turn →</b>';
    $('hint').innerHTML = t;
  }

  const canAct = () => !ui.busy && (ui.mode === 'local' || ui.game.turn === ui.human) && (ui.mode !== 'online' || ui.linked);

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
    const who = (p) => (ui.mode === 'local' ? NAMES[p] : p === ui.human ? 'You' : ui.mode === 'ai' ? 'Computer' : 'Friend');
    const parts = [];
    if (l.scored) parts.push(`${who(l.player)} scored ${l.scored} point${l.scored > 1 ? 's' : ''}`);
    for (const p of ['Y', 'B']) if (l.capturedBy[p]) parts.push(`${who(p)} took ${l.capturedBy[p]} stone${l.capturedBy[p] > 1 ? 's' : ''} and now ${who(p) === 'You' ? 'have' : 'has'} ${g.supply[p]} to place`);
    if (!g.winner && prev && g.turn === prev.turn) parts.push(`${who(P.other(g.turn))} has no stones left`);
    if (parts.length) toast(parts.join(' · '));
  }

  function commit(a, b, r, remote) {
    const prev = ui.game;
    ui.game = P.play(prev, a, b, r);
    ui.log.push([a, b, r]);
    if (ui.mode === 'online' && !remote) netSend({ t: 'move', n: ui.log.length - 1, a, b, r });
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
    else if (ui.mode !== 'local') {
      const won = g.winner === ui.human;
      title = won ? 'You won!' : 'You lost';
      sub = g.reason === 'surround' ? surround : g.reason === 'points' ? 'on points' : 'by resignation';
      sub = 'by ' + sub.replace(/^by /, '').replace(/^on /, '');
      if (won && ui.mode === 'ai') note = 'To earn a real set you need to beat someone who owns one. Online play against owners is coming next.';
      if (!ui.saved && ui.mode === 'ai') record(won);
    } else {
      title = NAMES[g.winner] + ' wins';
      sub = g.reason === 'surround' ? surround : g.reason === 'points' ? 'on points' : 'by resignation';
    }
    $('over-title').textContent = title;
    $('over-sub').textContent = sub;
    $('over-score').innerHTML = `<span class="avatar Y">${label('Y')[0]}</span>${g.points.Y} – ${g.points.B} pts<span class="avatar B">${label('B')[0]}</span>`;
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
      level: ui.mode === 'ai' ? ui.level : null, human: ui.mode !== 'local' ? ui.human : null,
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
    else if (ui.mode === 'online' && g.winner !== ui.human) line = `Pattern ${rec.pattern}, ${seen}. Your friend won it and may name it.`;
    else {
      line = `${p.count > 1 ? 'Unnamed pattern' : 'New pattern'} ${rec.pattern}, ${seen}. ${ui.mode !== 'local' ? 'You' : NAMES[g.winner]} may name it.`;
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
    p.by = ui.mode !== 'local' ? 'You' : NAMES[ui.game.winner];
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
  const REASON = { surround: 'red stone surrounded', points: 'on points', resign: 'resigned', abandoned: 'abandoned' };
  function showRecord() {
    const games = store.get('plex-games', []), ps = store.get('plex-patterns', {});
    const list = $('archive');
    list.textContent = '';
    let w = 0, l = 0;
    for (const g of games) if (g.mode !== 'local' && g.winner && g.winner !== 'draw') { if (g.winner === g.human) w++; else l++; }
    for (const g of games.slice(-10).reverse()) {
      const li = document.createElement('li');
      const ai = g.mode !== 'local';
      const av = document.createElement('span'); av.className = 'avatar'; av.textContent = g.mode === 'ai' ? 'C' : g.mode === 'online' ? 'F' : '2';
      const who = document.createElement('span'); who.className = 'who';
      const b = document.createElement('b'); b.textContent = g.mode === 'ai' ? 'Computer · ' + g.level : g.mode === 'online' ? 'Friend · online' : 'Two players';
      const sm = document.createElement('small');
      const name = g.pattern && ps[g.pattern] && ps[g.pattern].name;
      sm.textContent = `${g.date.slice(0, 10)} · ${REASON[g.reason] || g.reason} · ${g.points[0]}–${g.points[1]}` + (name ? ` · “${name}”` : '');
      who.append(b, sm);
      const pill = document.createElement('span');
      const res = g.winner === 'draw' ? 'd' : ai ? (g.winner === g.human ? 'w' : 'l') : 'd';
      pill.className = 'pill ' + res;
      pill.textContent = g.winner === 'draw' ? 'D' : ai ? res.toUpperCase() : (g.winner === 'Y' ? 'Yellow' : 'Blue');
      li.append(av, who, pill);
      list.appendChild(li);
    }
    $('archive-empty').hidden = games.length > 0;
    $('w-pct').hidden = $('l-pct').hidden = !(w + l);
    if (w + l) { const p = Math.round(100 * w / (w + l)); $('w-pct').textContent = `W ${p} %`; $('l-pct').textContent = `L ${100 - p} %`; }
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
    netClose();
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
    $('ai-sub').textContent = 'Level ' + ui.level;
    for (const x of $('levels').children) x.setAttribute('aria-checked', String(x === b));
  });
  $('start-ai').addEventListener('click', () => { ui.human = 'Y'; start('ai'); });
  $('start-online').addEventListener('click', hostGame);
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
        if (ui.mode === 'online') netSend({ t: 'resign' });
        ui.game = P.resign(ui.game, ui.mode !== 'local' ? ui.human : ui.game.turn);
        saveGame();
      }
      if (a === 'rematch' && ui.mode === 'online') {
        if (!ui.linked) { goHome(); return; }
        netSend({ t: 'rematch' });
        ui.human = P.other(ui.human);   // colours swap every game
      }
      if (a === 'rematch') start(ui.mode); else goHome();
    }
  };
  $('menu').addEventListener('click', act);
  $('over').addEventListener('click', act);

  // ---- online: two devices, connected peer to peer through an invite link ----
  // The host is yellow in the first game; colours swap on every rematch.
  const net = { peer: null, conn: null, host: false, started: false };
  function netClose() {
    try { if (net.conn) net.conn.close(); } catch (e) { /* already gone */ }
    try { if (net.peer) net.peer.destroy(); } catch (e) { /* already gone */ }
    net.peer = net.conn = null; net.started = false; ui.linked = false;
  }
  function netSend(msg) { if (net.conn && net.conn.open) net.conn.send(msg); }
  const inviteStatus = (t) => { $('invite-status').textContent = t; };
  function netError(err) {
    const t = err && err.type;
    inviteStatus(t === 'peer-unavailable' ? 'This invite is no longer open. Ask your friend for a new link.'
      : 'Could not connect. Check your internet connection and try again.');
  }
  function openInvite(asHost) {
    $('invite-box').hidden = !asHost;
    if (!window.Peer) { inviteStatus('Online play could not be loaded.'); $('invite').showModal(); return false; }
    $('invite').showModal();
    return true;
  }
  function hostGame() {
    netClose();
    const code = Array.from(crypto.getRandomValues(new Uint8Array(8)), (x) => 'abcdefghjkmnpqrstuvwxyz23456789'[x % 31]).join('');
    net.host = true;
    $('invite-link').value = location.origin + location.pathname + '?join=' + code;
    inviteStatus('Opening the game…');
    if (!openInvite(true)) return;
    net.peer = new window.Peer('plex-' + code);
    net.peer.on('open', () => inviteStatus('Waiting for your friend…'));
    net.peer.on('connection', (c) => { if (net.conn && net.conn.open) c.close(); else wire(c); });
    net.peer.on('error', netError);
  }
  function joinGame(code) {
    netClose();
    net.host = false;
    inviteStatus('Joining the game…');
    if (!openInvite(false)) return;
    net.peer = new window.Peer();
    net.peer.on('open', () => wire(net.peer.connect('plex-' + code, { reliable: true })));
    net.peer.on('error', netError);
  }
  function wire(c) {
    net.conn = c;
    c.on('open', () => {
      ui.linked = true;
      if (!net.host) return;               // the guest waits for the host's state
      if (net.started && ui.mode === 'online' && ui.game) {
        c.send({ t: 'state', human: P.other(ui.human), moves: ui.log });   // friend came back
        toast('Your friend is back');
        if (canAct() && !ui.ghost) suggestGhost();
        render();
      } else {
        $('invite').close();
        net.started = true;
        ui.human = 'Y';
        start('online');
        c.send({ t: 'state', human: 'B', moves: [] });
      }
    });
    c.on('data', onNet);
    c.on('close', () => {
      if (net.conn !== c) return;
      ui.linked = false;
      if (ui.mode === 'online' && ui.game) { if (!ui.game.winner) toast('Your friend disconnected'); render(); }
    });
  }
  const isInt = Number.isInteger;
  function onNet(m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'state' && !net.host && Array.isArray(m.moves)) {
      $('invite').close(); $('over').close(); $('menu').close();
      net.started = true;
      ui.human = m.human === 'Y' ? 'Y' : 'B';
      ui.linked = true;
      start('online');
      try {
        for (const mv of m.moves) { ui.game = P.play(ui.game, mv[0], mv[1], mv[2]); ui.log.push([mv[0], mv[1], mv[2]]); }
      } catch (e) { /* host sent something unplayable: stay with what replayed */ }
      ui.ghost = null;
      if (!ui.game.winner && canAct()) suggestGhost();
      render();
    } else if (m.t === 'move') {
      if (ui.mode !== 'online' || !ui.game || ui.game.winner || ui.game.turn === ui.human) return;
      if (m.n !== ui.log.length || !isInt(m.a) || !isInt(m.b) || !isInt(m.r) || !P.isLegal(ui.game, m.a, m.b, m.r)) return;
      commit(m.a, m.b, m.r, true);
    } else if (m.t === 'resign') {
      if (ui.mode !== 'online' || !ui.game || ui.game.winner) return;
      ui.game = P.resign(ui.game, P.other(ui.human));
      ui.ghost = null;
      render();
      showOver();
    } else if (m.t === 'rematch') {
      if (ui.mode !== 'online' || !ui.game) return;
      $('over').close(); $('menu').close();
      if (!ui.game.winner && ui.log.length > 1) { ui.game = P.resign(ui.game, P.other(ui.human)); saveGame(); }
      ui.human = P.other(ui.human);
      start('online');
    }
  }
  $('invite-copy').addEventListener('click', () => copyText($('invite-link').value, $('invite-copy')));
  $('invite-share').hidden = !navigator.share;
  $('invite-share').addEventListener('click', () => {
    navigator.share({ title: 'Plex', text: 'Play Plex with me', url: $('invite-link').value }).catch(() => {});
  });
  $('invite-cancel').addEventListener('click', () => { $('invite').close(); netClose(); });
  $('invite').addEventListener('cancel', netClose);
  const joinCode = new URLSearchParams(location.search).get('join');
  if (joinCode && /^[a-z0-9]{6,12}$/.test(joinCode)) joinGame(joinCode);

  // for watching and replaying a game from outside (teaching sessions, tests)
  window.PlexApp = { get game() { return ui.game; }, get log() { return ui.log; }, get mode() { return ui.mode; }, play: commit };

  showRecord();
  showPatterns();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
