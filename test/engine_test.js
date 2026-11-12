// run: osascript -l JavaScript test/engine_test.js   (from the repo root)
ObjC.import('Foundation');
function load(p){ const s=$.NSString.stringWithContentsOfFileEncodingError(p,$.NSUTF8StringEncoding,null); eval.call(globalThis, ObjC.unwrap(s)); }
function run(){
  load('play/engine.js'); load('play/ai.js');
  const P=globalThis.Plex, AI=globalThis.PlexAI; const out=[]; let fail=0;
  const ok=(c,m)=>{ out.push((c?'ok   ':'FAIL ')+m); if(!c) fail++; };
  let s=P.newGame();
  ok(s.cells.size===4,'red stone has 4 cells');
  ok(P.legalMoves(s).length>0,'opening moves exist: '+P.legalMoves(s).length);
  // video 1:20 - a stone under the red notch, touching at two corners, closes a diamond = 2 points
  ok(P.isLegal(s,1,-1,3),'two-corner touch is legal');
  let t=P.play(s,1,-1,3);
  ok(t.points.Y===2,'closing the red notch scores 2, got '+t.points.Y);
  ok(t.turn==='B','turn passes');
  // one corner only is not legal: stone far right touching a single vertex
  ok(!P.isLegal(s,3,0,0),'single-corner touch is illegal');
  ok(!P.isLegal(s,0,0,3),'overlap is illegal');
  // ring: fill the whole neighbourhood with yellow by brute force -> yellow must win by surround
  let g=P.newGame({stones:40}); let guard=0;
  while(!g.winner && guard++<200){
    const ms=P.legalMoves(g); if(!ms.length) break;
    if(g.turn==='Y'){ ms.sort((x,y)=>(x.a*x.a+x.b*x.b+x.a*x.b)-(y.a*y.a+y.b*y.b+y.a*y.b)); g=P.play(g,ms[0].a,ms[0].b,ms[0].r); }
    else { ms.sort((x,y)=>(y.a*y.a+y.b*y.b+y.a*y.b)-(x.a*x.a+x.b*x.b+x.a*x.b)); g=P.play(g,ms[0].a,ms[0].b,ms[0].r); }
  }
  ok(g.winner==='Y'&&g.reason==='surround','yellow hugging red wins by surround: '+g.winner+'/'+g.reason+' after '+g.moves);
  // AI self-play terminates with a result, several games
  const res={};
  for(let i=0;i<6;i++){ let a=P.newGame(); let n=0; const t0=Date.now();
    while(!a.winner && n++<80){ const m=AI.choose(a, a.turn==='Y'?'medium':'easy'); if(!m) break; a=P.play(a,m.a,m.b,m.r); }
    const k=a.winner+'/'+a.reason; res[k]=(res[k]||0)+1; out.push('     game '+i+': '+k+' moves '+a.moves+' pts '+a.points.Y+'-'+a.points.B+' '+(Date.now()-t0)+'ms'); ok(!!a.winner,'self-play game ends'); }
  let h=P.newGame(); const t1=Date.now(); for(let i=0;i<6;i++){ const m=AI.choose(h,'hard'); h=P.play(h,m.a,m.b,m.r); if(h.winner)break; }
  out.push('     6 hard moves: '+(Date.now()-t1)+'ms');
  // patterns: mirror of a stone covers the mirrored cells
  let mok=true;
  for(let r=0;r<6;r++){ const st={a:2,b:-1,r}; const m=P.mirrorStone(st);
    const A=P.stoneCells(st.a,st.b,st.r).map(c=>P.key(P.mirrorCell(c))).sort().join('|');
    const B=P.stoneCells(m.a,m.b,m.r).map(P.key).sort().join('|'); if(A!==B) mok=false; }
  ok(mok,'mirrored stone covers the mirrored cells');
  ok(P.stoneCells(0,0,0).map(c=>P.key(P.mirrorCell(c))).sort().join('|')===P.stoneCells(0,0,0).map(P.key).sort().join('|'),'mirror keeps the red stone');
  // a game and its mirror image give the same pattern code; a different game does not
  const mv=[]; let pg=P.newGame(); while(!pg.winner){ const m=AI.choose(pg,'medium'); mv.push([m.a,m.b,m.r]); pg=P.play(pg,m.a,m.b,m.r); }
  const rp=P.replay(mv); ok(P.patternId(rp)===P.patternId(pg),'replay gives the same pattern '+P.patternId(pg));
  const mm=mv.map(m=>{const t=P.mirrorStone({a:m[0],b:m[1],r:m[2]}); return [t.a,t.b,t.r];});
  let mg=null; try{ mg=P.replay(mm);}catch(e){}
  ok(mg&&P.patternId(mg)===P.patternId(pg),'mirrored game gives the same pattern');
  ok(mg&&mg.winner===pg.winner&&mg.points.Y===pg.points.Y,'mirrored game has the same result');
  ok(P.patternId(P.replay(mv.slice(0,3)))!==P.patternId(pg),'different position, different code');
  ok(/^PX-[0-9A-Z]{5}-[0-9A-Z]{5}$/.test(P.patternId(pg)),'code format');
  out.push(fail?('FAILED '+fail):'ALL PASSED');
  return out.join('\n');
}
