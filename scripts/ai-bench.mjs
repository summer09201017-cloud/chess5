#!/usr/bin/env node
/**
 * ai-bench.mjs — 新引擎(ai-engine.js)對打「舊大師」(2026-09-06 之前 script.js 的 chooseAiMove master 檔,逐行搬來、去 DOM)
 *
 *   node scripts/ai-bench.mjs                 # 6 局(新引擎黑白各 3),引擎每手 250ms
 *   node scripts/ai-bench.mjs --games 10 --budget 400 --size 15
 *
 * 目的:回答「加強了嗎」要用**對局結果**回答,不是看程式碼覺得應該更強。
 * 舊大師這份搬運刻意保留它的所有毛病(只擋成五、radius 1 淺搜、static eval),就是要當基準。
 * 不放進 npm test(一局要幾十秒);改了引擎就手跑一次,把結果記進 HANDOFF。
 */
import { analyzeMoveThreat } from "../game-rules.js";
import { chooseBestMove } from "../ai-engine.js";
import { createBoard, isWinAt } from "../puzzle-solver.js";

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? Number(args[i + 1]) : d; };
const GAMES = arg("--games", 6), BUDGET = arg("--budget", 250), SIZE = arg("--size", 15), MAXPLY = SIZE * SIZE;

/* ───────── 舊大師(逐行搬運;board/size 改成參數,其餘一字不動) ───────── */
const PATTERN = { FIVE: 1000000, LIVE_FOUR: 100000, FOUR: 10000, LIVE_THREE: 8000, THREE: 800, LIVE_TWO: 600, TWO: 60, ONE: 8 };
const DIRECTIONS = [[1, 0], [0, 1], [1, 1], [1, -1]];
const MASTER = { topK: 10, randomTop: 1, mistake: 0.0, blockErr: 0.0, lookahead: 3 };
const opp = (c) => (c === "black" ? "white" : "black");

function legacyMove(board, size, aiColor, history) {
  const isInside = (r, c) => r >= 0 && r < size && c >= 0 && c < size;
  const clamp = (v, mn, mx) => Math.max(mn, Math.min(mx, v));
  const checkWinFast = (row, col, color) => {
    for (const [dx, dy] of DIRECTIONS) {
      let count = 1, r = row + dy, c = col + dx;
      while (isInside(r, c) && board[r][c] === color) { count++; r += dy; c += dx; }
      r = row - dy; c = col - dx;
      while (isInside(r, c) && board[r][c] === color) { count++; r -= dy; c -= dx; }
      if (count >= 5) return true;
    }
    return false;
  };
  const countDir = (r0, c0, dx, dy, color) => {
    let count = 0, r = r0 + dy, c = c0 + dx;
    while (isInside(r, c) && board[r][c] === color) { count++; r += dy; c += dx; }
    return { count, open: isInside(r, c) && board[r][c] === null };
  };
  const lineScore = (row, col, dx, dy, color) => {
    const f = countDir(row, col, dx, dy, color), b = countDir(row, col, -dx, -dy, color);
    const stones = f.count + b.count + 1, open = (f.open ? 1 : 0) + (b.open ? 1 : 0);
    if (stones >= 5) return PATTERN.FIVE;
    if (stones === 4 && open === 2) return PATTERN.LIVE_FOUR;
    if (stones === 4 && open === 1) return PATTERN.FOUR;
    if (stones === 3 && open === 2) return PATTERN.LIVE_THREE;
    if (stones === 3 && open === 1) return PATTERN.THREE;
    if (stones === 2 && open === 2) return PATTERN.LIVE_TWO;
    if (stones === 2 && open === 1) return PATTERN.TWO;
    if (stones === 1 && open === 2) return PATTERN.ONE;
    return 1;
  };
  const potential = (row, col, color) => {
    if (board[row][col]) return -Infinity;
    let total = 0, strongest = 0;
    for (const [dx, dy] of DIRECTIONS) { const v = lineScore(row, col, dx, dy, color); total += v; if (v > strongest) strongest = v; }
    return total + strongest * 0.5;
  };
  const centerBias = (row, col) => { const c = (size - 1) / 2; const d = Math.abs(row - c) + Math.abs(col - c); return (size * 2 - d) * 4; };
  const scoreMove = (row, col, color) => {
    const attack = analyzeMoveThreat(board, size, row, col, color, { renjuBlack: false });
    const defense = analyzeMoveThreat(board, size, row, col, opp(color), { renjuBlack: false });
    if (attack.forbidden) return -Infinity;
    return attack.score * 1.25 + defense.score * 1.15 + potential(row, col, color) * 1.18 + potential(row, col, opp(color)) * 1.22 + centerBias(row, col);
  };
  const generateCandidateMoves = (radius) => {
    if (history.length === 0) { const c = Math.floor(size / 2); return [{ row: c, col: c }]; }
    const seen = new Set(), out = [];
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
      if (!board[r][c]) continue;
      for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
        const nr = r + dy, nc = c + dx;
        if (!isInside(nr, nc) || board[nr][nc]) continue;
        const k = nr * size + nc; if (seen.has(k)) continue; seen.add(k); out.push({ row: nr, col: nc });
      }
    }
    return out;
  };
  const findWinningMove = (cands, color) => {
    for (const m of cands) { board[m.row][m.col] = color; const w = checkWinFast(m.row, m.col, color); board[m.row][m.col] = null; if (w) return m; }
    return null;
  };
  const patternValue = (stones, open) => {
    if (stones >= 5) return PATTERN.FIVE;
    if (stones === 4 && open === 2) return PATTERN.LIVE_FOUR;
    if (stones === 4 && open === 1) return PATTERN.FOUR;
    if (stones === 3 && open === 2) return PATTERN.LIVE_THREE;
    if (stones === 3 && open === 1) return PATTERN.THREE;
    if (stones === 2 && open === 2) return PATTERN.LIVE_TWO;
    if (stones === 2 && open === 1) return PATTERN.TWO;
    return 1;
  };
  const staticEval = (side) => {
    let my = 0, op = 0;
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
      const cell = board[r][c]; if (!cell) continue;
      for (const [dx, dy] of DIRECTIONS) {
        const pr = r - dy, pc = c - dx;
        if (isInside(pr, pc) && board[pr][pc] === cell) continue;
        let count = 1, rr = r + dy, cc = c + dx;
        while (isInside(rr, cc) && board[rr][cc] === cell) { count++; rr += dy; cc += dx; }
        const endA = isInside(rr, cc) && board[rr][cc] === null, endB = isInside(pr, pc) && board[pr][pc] === null;
        const v = patternValue(count, (endA ? 1 : 0) + (endB ? 1 : 0));
        if (cell === side) my += v; else op += v;
      }
    }
    return my - op;
  };
  const negamax = (depth, alpha, beta, side) => {
    if (depth === 0) return staticEval(side);
    const cands = generateCandidateMoves(1);
    if (cands.length === 0) return 0;
    const ranked = cands.map((c) => ({ ...c, s: scoreMove(c.row, c.col, side) })).sort((a, b) => b.s - a.s).slice(0, 8);
    let val = -1e12;
    for (const m of ranked) {
      board[m.row][m.col] = side;
      let s;
      if (checkWinFast(m.row, m.col, side)) s = PATTERN.FIVE - (10 - depth);
      else s = -negamax(depth - 1, -beta, -alpha, opp(side));
      board[m.row][m.col] = null;
      if (s > val) val = s;
      if (val > alpha) alpha = val;
      if (alpha >= beta) break;
    }
    return val;
  };
  const alphaBetaPick = (scored, config, color) => {
    const sample = scored.slice(0, Math.min(config.topK, scored.length));
    let best = null, bestScore = -Infinity;
    for (const m of sample) {
      board[m.row][m.col] = color;
      let val;
      if (checkWinFast(m.row, m.col, color)) val = PATTERN.FIVE;
      else val = -negamax(config.lookahead - 1, -1e12, 1e12, opp(color));
      board[m.row][m.col] = null;
      if (val > bestScore) { bestScore = val; best = m; }
    }
    return best ? { row: best.row, col: best.col } : { row: scored[0].row, col: scored[0].col };
  };

  if (history.length === 0) { const c = Math.floor(size / 2); return { row: c, col: c }; }
  if (history.length === 1) {
    const last = history[0];
    const offsets = [[-1, -1], [-1, 1], [1, -1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]];
    const [dr, dc] = offsets[Math.floor(Math.random() * offsets.length)];
    const r = clamp(last.row + dr, 0, size - 1), c = clamp(last.col + dc, 0, size - 1);
    if (!board[r][c]) return { row: r, col: c };
  }
  const candidates = generateCandidateMoves(2);
  if (!candidates.length) return null;
  const winNow = findWinningMove(candidates, aiColor); if (winNow) return winNow;
  const mustBlock = findWinningMove(candidates, opp(aiColor)); if (mustBlock) return mustBlock;
  const scored = candidates.map((c) => ({ ...c, score: scoreMove(c.row, c.col, aiColor) })).sort((a, b) => b.score - a.score);
  return alphaBetaPick(scored, MASTER, aiColor);
}

/* ───────── 對局 ───────── */
function playGame(engineColor) {
  const board = createBoard(SIZE);
  const history = [];
  let color = "black", winner = null, tEngine = 0, nEngine = 0;
  for (let ply = 0; ply < MAXPLY; ply++) {
    let m;
    if (color === engineColor) {
      const t = Date.now();
      m = chooseBestMove(board, SIZE, color, { timeBudgetMs: BUDGET });
      tEngine += Date.now() - t; nEngine++;
    } else m = legacyMove(board, SIZE, color, history);
    if (!m) break;
    board[m.row][m.col] = color;
    history.push({ row: m.row, col: m.col, color });
    if (isWinAt(board, SIZE, m.row, m.col, color)) { winner = color; break; }
    color = opp(color);
  }
  return { winner, plies: history.length, avgEngineMs: nEngine ? Math.round(tEngine / nEngine) : 0 };
}

let eng = 0, leg = 0, draw = 0;
console.log(`🥊 新引擎 vs 舊大師 — ${GAMES} 局・${SIZE} 路・引擎每手 ${BUDGET}ms`);
for (let g = 0; g < GAMES; g++) {
  const engineColor = g % 2 === 0 ? "black" : "white";
  const r = playGame(engineColor);
  const who = r.winner === null ? "和" : r.winner === engineColor ? "新引擎" : "舊大師";
  if (who === "新引擎") eng++; else if (who === "舊大師") leg++; else draw++;
  console.log(`  第 ${g + 1} 局 引擎執${engineColor === "black" ? "黑" : "白"}:${who} 勝(${r.plies} 手,引擎平均 ${r.avgEngineMs}ms/手)`);
}
console.log(`\n結果:新引擎 ${eng} 勝 / 舊大師 ${leg} 勝 / 和 ${draw}`);
process.exit(eng > leg ? 0 : 1);
