/* Plex game engine. No DOM. Rules: docs/rules-for-app.md
 *
 * Grid: triangular lattice. Vertex (a,b) sits at a*e1 + b*e2.
 * Cell (a,b,0) = up triangle   with corners (a,b) (a+1,b) (a,b+1)
 * Cell (a,b,1) = down triangle with corners (a+1,b) (a+1,b+1) (a,b+1)
 * A stone is 4 consecutive triangles around a vertex: {a, b, r} with r = 0..5.
 */
(function (root) {
  'use strict';

  const DIRS = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];

  const key = (c) => c[0] + ',' + c[1] + ',' + c[2];
  const unkey = (k) => k.split(',').map(Number);
  const vkey = (a, b) => a + ',' + b;

  // the six triangles around vertex (a,b), counter-clockwise
  const hex = (a, b) => [
    [a, b, 0], [a - 1, b, 1], [a - 1, b, 0],
    [a - 1, b - 1, 1], [a, b - 1, 0], [a, b - 1, 1],
  ];

  const stoneCells = (a, b, r) => {
    const h = hex(a, b);
    return [0, 1, 2, 3].map((i) => h[(r + i) % 6]);
  };

  // outline of a stone as lattice vertices: centre, then five rim corners
  const stoneOutline = (a, b, r) => {
    const pts = [[a, b]];
    for (let i = 0; i <= 4; i++) {
      const d = DIRS[(r + i) % 6];
      pts.push([a + d[0], b + d[1]]);
    }
    return pts;
  };

  const cellVerts = (c) => (c[2] === 0
    ? [[c[0], c[1]], [c[0] + 1, c[1]], [c[0], c[1] + 1]]
    : [[c[0] + 1, c[1]], [c[0] + 1, c[1] + 1], [c[0], c[1] + 1]]);

  const edgeNbrs = (c) => (c[2] === 0
    ? [[c[0], c[1], 1], [c[0] - 1, c[1], 1], [c[0], c[1] - 1, 1]]
    : [[c[0], c[1], 0], [c[0] + 1, c[1], 0], [c[0], c[1] + 1, 0]]);

  const other = (p) => (p === 'Y' ? 'B' : 'Y');

  /* cell types: R red key, Y / B stones, pY / pB point stones, V void left by a capture */
  function newGame(opts) {
    const stones = (opts && opts.stones) || 12;
    const s = {
      cells: new Map(),
      stones: new Map(),
      nextId: 1,
      supply: { Y: stones, B: stones },
      points: { Y: 0, B: 0 },
      turn: 'Y',
      winner: null,   // 'Y' | 'B' | 'draw'
      reason: null,   // 'surround' | 'points' | 'resign' | 'timeout'
      moves: 0,
      last: null,     // what the last move did, for the UI
    };
    for (const c of stoneCells(0, 0, 0)) s.cells.set(key(c), { t: 'R', id: 0 });
    return s;
  }

  function clone(s) {
    return {
      cells: new Map(s.cells),
      stones: new Map(s.stones),
      nextId: s.nextId,
      supply: { Y: s.supply.Y, B: s.supply.B },
      points: { Y: s.points.Y, B: s.points.B },
      turn: s.turn, winner: s.winner, reason: s.reason, moves: s.moves, last: s.last,
    };
  }

  function bounds(s, pad) {
    let a0 = 0, a1 = 0, b0 = 0, b1 = 0;
    for (const k of s.cells.keys()) {
      const c = unkey(k);
      if (c[0] < a0) a0 = c[0]; if (c[0] > a1) a1 = c[0];
      if (c[1] < b0) b0 = c[1]; if (c[1] > b1) b1 = c[1];
    }
    return { a0: a0 - pad, a1: a1 + pad, b0: b0 - pad, b1: b1 + pad };
  }

  const isPiece = (cell) => cell && cell.t !== 'V';

  function touchedVerts(s) {
    const set = new Set();
    for (const [k, cell] of s.cells) {
      if (!isPiece(cell)) continue;
      for (const v of cellVerts(unkey(k))) set.add(vkey(v[0], v[1]));
    }
    return set;
  }

  // A stone may be placed where it overlaps nothing and at least two of its
  // corners touch pieces already on the table.
  function isLegal(s, a, b, r, touched) {
    if (s.winner) return false;
    for (const c of stoneCells(a, b, r)) if (s.cells.has(key(c))) return false;
    const t = touched || touchedVerts(s);
    let n = 0;
    for (const v of stoneOutline(a, b, r)) if (t.has(vkey(v[0], v[1]))) n++;
    return n >= 2;
  }

  function legalMoves(s) {
    if (s.winner) return [];
    const t = touchedVerts(s);
    const seen = new Set();
    const out = [];
    for (const vk of t) {
      const [va, vb] = vk.split(',').map(Number);
      const cand = [[va, vb]].concat(DIRS.map((d) => [va + d[0], vb + d[1]]));
      for (const [a, b] of cand) {
        const ck = vkey(a, b);
        if (seen.has(ck)) continue;
        seen.add(ck);
        for (let r = 0; r < 6; r++) if (isLegal(s, a, b, r, t)) out.push({ a, b, r });
      }
    }
    return out;
  }

  // Flood from start cells across triangle edges through passable cells.
  // Returns { escaped, visited } - escaped means the open table was reached.
  function flood(s, start, passable, bb) {
    const visited = new Set();
    const queue = [];
    for (const c of start) { const k = key(c); if (!visited.has(k)) { visited.add(k); queue.push(c); } }
    let escaped = false;
    while (queue.length) {
      const c = queue.pop();
      if (c[0] < bb.a0 || c[0] > bb.a1 || c[1] < bb.b0 || c[1] > bb.b1) { escaped = true; continue; }
      for (const n of edgeNbrs(c)) {
        const k = key(n);
        if (visited.has(k)) continue;
        if (!passable(s.cells.get(k))) continue;
        visited.add(k);
        queue.push(n);
      }
    }
    return { escaped, visited };
  }

  const redCells = () => stoneCells(0, 0, 0);

  // Is the red stone enclosed by player p (own colour + common ground)?
  function surrounds(s, p, bb) {
    const o = other(p);
    const res = flood(s, redCells(), (cell) => !cell || cell.t === o, bb || bounds(s, 2));
    return !res.escaped;
  }

  // How open the red stone still is against player p (smaller = closer to a win).
  function openness(s, p) {
    const o = other(p);
    const bb = { a0: -4, a1: 4, b0: -4, b1: 4 };
    return flood(s, redCells(), (cell) => !cell || cell.t === o, bb).visited.size;
  }

  function captureStonesOf(s, victim, bb) {
    const captor = other(victim);
    const done = new Set();
    const taken = [];
    for (const [id, st] of s.stones) {
      if (st.owner !== victim || done.has(id)) continue;
      const res = flood(s, stoneCells(st.a, st.b, st.r), (cell) => !cell || cell.t === victim, bb);
      const ids = new Set();
      for (const k of res.visited) { const cell = s.cells.get(k); if (cell && cell.t === victim) ids.add(cell.id); }
      for (const i of ids) done.add(i);
      if (!res.escaped) for (const i of ids) taken.push(i);
    }
    for (const id of taken) {
      const st = s.stones.get(id);
      for (const c of stoneCells(st.a, st.b, st.r)) s.cells.set(key(c), { t: 'V', id: -1 });
      s.stones.delete(id);
      s.supply[captor]++;
    }
    return taken.length;
  }

  function fillHollows(s, p, bb) {
    // every empty cell near the pattern that cannot reach the open table
    const seen = new Set();
    const filled = [];
    for (const k of Array.from(s.cells.keys())) {
      for (const n of edgeNbrs(unkey(k))) {
        const nk = key(n);
        if (s.cells.has(nk) || seen.has(nk)) continue;
        const res = flood(s, [n], (cell) => !cell, bb);
        for (const v of res.visited) seen.add(v);
        if (!res.escaped) for (const v of res.visited) filled.push(v);
      }
    }
    for (const k of filled) s.cells.set(k, { t: 'p' + p, id: -1 });
    s.points[p] += filled.length;
    return filled;
  }

  function finish(s) {
    if (s.points.Y > s.points.B) s.winner = 'Y';
    else if (s.points.B > s.points.Y) s.winner = 'B';
    else s.winner = 'draw';
    s.reason = 'points';
  }

  // Returns a new state; throws on an illegal move.
  function play(s0, a, b, r) {
    if (!isLegal(s0, a, b, r)) throw new Error('illegal move');
    const s = clone(s0);
    const p = s.turn, o = other(p);
    const id = s.nextId++;
    const cells = stoneCells(a, b, r);
    for (const c of cells) s.cells.set(key(c), { t: p, id });
    s.stones.set(id, { owner: p, a, b, r });
    s.supply[p]--;
    s.moves++;
    const last = { player: p, a, b, r, id, capturedBy: { Y: 0, B: 0 }, scored: 0, filled: [] };
    s.last = last;
    const bb = bounds(s, 2);

    if (surrounds(s, p, bb)) { s.winner = p; s.reason = 'surround'; return s; }

    last.capturedBy[p] = captureStonesOf(s, o, bb);
    last.capturedBy[o] = captureStonesOf(s, p, bb);
    last.filled = fillHollows(s, p, bb);
    last.scored = last.filled.length;

    // point stones and voids are common ground: they can complete either ring
    if (surrounds(s, p, bb)) { s.winner = p; s.reason = 'surround'; return s; }
    if (surrounds(s, o, bb)) { s.winner = o; s.reason = 'surround'; return s; }

    if (s.supply[o] > 0 && legalMoves(Object.assign(s, { turn: o })).length) return s;
    if (s.supply[p] > 0 && legalMoves(Object.assign(s, { turn: p })).length) return s;
    finish(s);
    return s;
  }

  function resign(s0, p, reason) {
    const s = clone(s0);
    s.winner = other(p);
    s.reason = reason || 'resign';
    return s;
  }

  // ---- patterns ----
  // The red stone fixes position and rotation of every pattern, so the only
  // symmetry left is the mirror across the red stone's axis: (a,b) -> (-b,-a).
  const mirrorCell = (c) => [-c[1] - 1, -c[0] - 1, 1 - c[2]];
  const mirrorStone = (st) => ({ a: -st.b, b: -st.a, r: (6 - st.r) % 6 });

  // Canonical description of what lies on the table: every stone with its
  // colour and seams, every point stone, every void. A pattern and its mirror
  // image get the same key.
  function patternKey(s) {
    const build = (m) => {
      const items = [];
      for (const st of s.stones.values()) {
        const t = m ? mirrorStone(st) : st;
        items.push(st.owner + t.a + ',' + t.b + ',' + t.r);
      }
      for (const [k, cell] of s.cells) {
        if (cell.t !== 'V' && cell.t[0] !== 'p') continue;
        const c = m ? mirrorCell(unkey(k)) : unkey(k);
        items.push((cell.t === 'V' ? 'v' : cell.t === 'pY' ? 'y' : 'b') + key(c));
      }
      return items.sort().join(' ');
    };
    const k1 = build(false), k2 = build(true);
    return k1 < k2 ? k1 : k2;
  }

  // Short code for a pattern, e.g. PX-7K3MQ-9TD2A (50 bits of the key's hash).
  function patternId(s) {
    const str = patternKey(s);
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    const A = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    const five = (h) => { let o = ''; h >>>= 0; for (let i = 0; i < 5; i++) { o += A[h & 31]; h >>>= 5; } return o; };
    return 'PX-' + five(h1) + '-' + five(h2);
  }

  // Rebuild a game from its move list [[a,b,r], ...]. Throws on an illegal move.
  function replay(moves, opts) {
    let s = newGame(opts);
    for (const m of moves) s = play(s, m[0], m[1], m[2]);
    return s;
  }

  root.Plex = {
    DIRS, key, unkey, hex, stoneCells, stoneOutline, cellVerts, edgeNbrs, other,
    newGame, clone, isLegal, legalMoves, play, resign, surrounds, openness, bounds,
    mirrorCell, mirrorStone, patternKey, patternId, replay,
  };
})(typeof window !== 'undefined' ? window : globalThis);
