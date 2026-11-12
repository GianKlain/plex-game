/* Plex computer opponent. Levels: easy (loose 1-ply), medium (1-ply), hard (2-ply on the best candidates). */
(function (root) {
  'use strict';
  const P = root.Plex;

  function evaluate(s, me) {
    const opp = P.other(me);
    if (s.winner === me) return s.reason === 'surround' ? 1e6 : 5e5;
    if (s.winner === opp) return s.reason === 'surround' ? -1e6 : -5e5;
    if (s.winner === 'draw') return 0;
    return (s.points[me] - s.points[opp]) * 12
      + (s.supply[me] - s.supply[opp]) * 30
      + (P.openness(s, opp) - P.openness(s, me)) * 1.5;
  }

  function ranked(s, me) {
    return P.legalMoves(s).map((m) => {
      const n = P.play(s, m.a, m.b, m.r);
      return { m, n, v: evaluate(n, me) + Math.random() * 0.5 };
    }).sort((x, y) => y.v - x.v);
  }

  function choose(s, level) {
    const me = s.turn;
    const list = ranked(s, me);
    if (!list.length) return null;
    if (level === 'easy') {
      if (list[0].v > 1e5) return list[0].m;
      const top = list.slice(0, Math.min(6, list.length));
      return top[Math.floor(Math.random() * top.length)].m;
    }
    if (level === 'medium' || list[0].v > 1e5) return list[0].m;
    let best = null;
    for (const c of list.slice(0, 10)) {
      let worst = c.v;
      if (!c.n.winner && c.n.turn !== me) {
        for (const r of P.legalMoves(c.n)) {
          const v = evaluate(P.play(c.n, r.a, r.b, r.r), me);
          if (v < worst) worst = v;
          if (worst < -1e5) break;
        }
      }
      if (!best || worst > best.v) best = { m: c.m, v: worst };
    }
    return best.m;
  }

  root.PlexAI = { choose, evaluate };
})(typeof window !== 'undefined' ? window : globalThis);
