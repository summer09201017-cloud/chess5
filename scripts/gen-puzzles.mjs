#!/usr/bin/env node
/**
 * 產生 puzzles.js —— 殘局題庫的唯一來源。★ 不要手改 puzzles.js,改這支再重生。
 *
 *   node scripts/gen-puzzles.mjs            # 預設種子 20260902、預設 GEN_GAMES=600 局 ⇒ 決定性:同種子同局數同題庫
 *   node scripts/gen-puzzles.mjs 12345      # 換種子換一批
 *   GEN_GAMES=2000 node scripts/gen-puzzles.mjs   # 局數上限(配額全滿會提早停);GEN_PROFILE=1 印分段計時
 *   ⚠ 預算刻意用「局數」不是「秒數」—— 秒數在不同機器會跑出不同題庫。跑一次約 5~15 分鐘。
 *
 * 流程(daily-puzzle-kit §三「機器生的題,可解性也要機器驗」):
 *   1. 兩個帶隨機性的啟發式玩家自我對弈,產生像真實對局的中盤局面(不是手擺的 5 顆子)
 *   2. 每個局面丟給 puzzle-solver.js:
 *        攻擊題 = 輪到走的一方有「N 步必勝」,且 N 步內必勝的第一手**唯一**、N-1 步證明不了
 *        守備題 = 對手有 N 步連續衝四(VCF),而己方**只有一個點**擋得住(且己方沒有反衝四可用)
 *   3. 依 kind × depth 分四級挑題、去重、同一局最多取一題、黑白先手盡量平均
 *   4. 寫出 puzzles.js;tests/puzzles.test.mjs 每次 npm test 都會把每一題**重新證明一次**
 *
 * 深度 = 攻方總落子數(含成五那手、含被迫回擋那手)= UI 的「剩 N 步」。
 */
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DIRS, other, createBoard, boardKey, isWinAt, winningCells, fourMoves,
  solve, winningFirstMoves, savingMoves,
} from "../puzzle-solver.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SEED = Number(process.argv[2] || 20260902);
// ★ 預算用「局數」不是「秒數」:秒數在快慢不同的機器上會跑出不同題庫,題庫就不可重現了。
//   GEN_GAMES 只是安全上限,配額全滿會提早停;GEN_MS 是防呆(超過就停並警告,結果不可重現)。
const GAME_BUDGET = Number(process.env.GEN_GAMES || 600);   // 600 局 ≈ 12 分鐘(VCT 抽樣 0.4 時每局約 1.2s)
const TIME_CAP_MS = Number(process.env.GEN_MS || 1500000);
const t0 = Date.now();

/* ---------- 想要的配額:tier → [{kind, depths, want, sizes}] ---------- */
const TIERS = [
  { tier: 1, name: "入門", quota: [
    { kind: "vcf", depths: [1], want: 6, sizes: [9, 13] },
    { kind: "vcf", depths: [2], want: 10, sizes: [9, 13, 15] },
  ] },
  { tier: 2, name: "進階", quota: [
    { kind: "vcf", depths: [3], want: 10, sizes: [13, 15] },
    { kind: "vct", depths: [2], want: 4, sizes: [13, 15] },
    { kind: "defend", depths: [2], want: 6, sizes: [13, 15] },
  ] },
  { tier: 3, name: "高手", quota: [
    { kind: "vcf", depths: [4], want: 8, sizes: [15] },
    { kind: "vcf", depths: [5], want: 6, sizes: [15] },
    { kind: "vct", depths: [3], want: 6, sizes: [15] },
    { kind: "defend", depths: [3], want: 4, sizes: [15] },
  ] },
  { tier: 4, name: "大師", quota: [
    { kind: "vcf", depths: [6, 7, 8], want: 10, sizes: [15, 19] },
    { kind: "vct", depths: [4, 5], want: 6, sizes: [15, 19] },
    { kind: "defend", depths: [4], want: 4, sizes: [15, 19] },
  ] },
];

/* ---------- 決定性亂數 ---------- */
function makeRng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const rnd = makeRng(SEED);

/* ---------- 啟發式玩家(只求像真人,不求最強) ---------- */
function inside(size, r, c) { return r >= 0 && r < size && c >= 0 && c < size; }
function lineScore(board, size, r, c, dr, dc, color) {
  let f = 0, rr = r + dr, cc = c + dc;
  while (inside(size, rr, cc) && board[rr][cc] === color) { f++; rr += dr; cc += dc; }
  const fOpen = inside(size, rr, cc) && board[rr][cc] === null;
  let b = 0; rr = r - dr; cc = c - dc;
  while (inside(size, rr, cc) && board[rr][cc] === color) { b++; rr -= dr; cc -= dc; }
  const bOpen = inside(size, rr, cc) && board[rr][cc] === null;
  const stones = f + b + 1, open = (fOpen ? 1 : 0) + (bOpen ? 1 : 0);
  if (stones >= 5) return 1e6;
  if (stones === 4) return open === 2 ? 5e4 : open === 1 ? 4000 : 0;
  if (stones === 3) return open === 2 ? 3000 : open === 1 ? 300 : 0;
  if (stones === 2) return open === 2 ? 250 : open === 1 ? 40 : 0;
  if (stones === 1) return open === 2 ? 20 : 3;
  return 0;
}
function evalMove(board, size, r, c, color, defWeight) {
  let a = 0, d = 0;
  for (const [dr, dc] of DIRS) {
    a += lineScore(board, size, r, c, dr, dc, color);
    d += lineScore(board, size, r, c, dr, dc, other(color));
  }
  const mid = (size - 1) / 2;
  const center = (size - Math.abs(r - mid) - Math.abs(c - mid)) * 2;
  return a + d * defWeight + center;
}
function candidates(board, size) {
  const seen = new Set(), out = [];
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    if (board[r][c] === null) continue;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
      const rr = r + dr, cc = c + dc;
      if (!inside(size, rr, cc) || board[rr][cc] !== null) continue;
      const k = rr * size + cc;
      if (!seen.has(k)) { seen.add(k); out.push([rr, cc]); }
    }
  }
  return out;
}
function pickMove(board, size, color, style) {
  const mine = winningCells(board, size, color);
  if (mine.length) return mine[0];
  const theirs = winningCells(board, size, other(color));
  if (theirs.length && rnd() > style.blunder) return theirs[Math.floor(rnd() * theirs.length)];
  const cands = candidates(board, size);
  if (!cands.length) return null;
  const scored = cands.map(([r, c]) => ({ r, c, s: evalMove(board, size, r, c, color, style.defWeight) }))
    .sort((a, b) => b.s - a.s);
  const u = rnd();
  let idx;
  if (u < style.top1) idx = 0;
  else if (u < style.top1 + 0.25) idx = Math.min(1, scored.length - 1);
  else if (u < style.top1 + 0.37) idx = Math.min(2, scored.length - 1);
  else idx = Math.floor(rnd() * Math.min(8, scored.length));
  return [scored[idx].r, scored[idx].c];
}

/* ---------- 局面分析 ---------- */
const stats = { positions: 0, vcf: 0, vct: 0, defend: 0, aborted: 0, multi: 0 };
const prof = { vcf: 0, gen: 0, first: 0, vct: 0, defend: 0, play: 0, n: {} };
function timed(name, fn) {
  const t = performance.now();
  const r = fn();
  prof[name] += performance.now() - t;
  prof.n[name] = (prof.n[name] || 0) + 1;
  return r;
}
function analyze(board, size, S) {
  stats.positions++;
  const wS = winningCells(board, size, S);
  if (wS.length) return wS.length === 1 ? { kind: "vcf", depth: 1, sol: wS[0] } : null;

  // 攻擊題 ①:VCF(連續衝四)。狂野局面的四很多,樹會爆 → 給預算,用完就放棄這個局面
  const vcf = timed("vcf", () => solve(board, size, S, MAX_VCF_DEPTH, { vcfOnly: true, budget: 15000 }));
  if (vcf.aborted) { stats.aborted++; return null; }
  if (vcf.depth) {
    const first = timed("first", () => winningFirstMoves(board, size, S, vcf.depth, { vcfOnly: true, budget: 30000 }));
    if (first.aborted) { stats.aborted++; return null; }
    // 淺題要唯一解;深題(≥4 步)允許最多 2 個正解首手 —— 玩家任何一條 N 步內的殺法都算過,
    // 提示只會指其中一條。實測不放寬的話 4 步以上的 VCF 幾乎全被丟掉(1520 局面丟 53 個)。
    if (first.moves.length < 1 || first.moves.length > maxFirstMoves(vcf.depth)) { stats.multi++; return null; }
    stats.vcf++;
    return { kind: "vcf", depth: vcf.depth, sol: first.moves[0], firstCount: first.moves.length };
  }

  // 守備題(先於 VCT:便宜,而且 VCT 存在時通常不是守備局面)。桶滿了就不再算(省時間,把局數留給還缺的桶)
  const O = other(S);
  const def = !needKind("defend") ? null : timed("defend", () => {
    if (fourMoves(board, size, S).length) return null;      // 己方有反衝四 → 語意複雜,不出這種題
    if (winningCells(board, size, O).length) return null;   // 對手已經有四 → 擋點太明顯
    const thr = solve(board, size, O, 4, { vcfOnly: true, budget: 15000 });
    if (!thr.depth || thr.depth < 2) return null;
    const saves = savingMoves(board, size, S, thr.depth, 2);
    // 淺的守備題要唯一擋點;深的(對手 3~4 步連殺)擋點常常有兩個,放寬到 ≤2 —— 遊戲端本來就是「任何擋得住的點都算過」
    if (saves.length < 1 || saves.length > maxFirstMoves(thr.depth)) { if (saves.length) stats.multi++; return null; }
    return { kind: "defend", depth: thr.depth, sol: saves[0], firstCount: saves.length };
  });
  if (def) { stats.defend++; return def; }

  // 攻擊題 ②:VCT(活三+衝四,對手可反衝四)—— 最貴,抽樣做;桶滿就完全不做(實測佔 73% 時間)
  if (!needKind("vct") || rnd() > VCT_SAMPLE) return null;
  const vct = timed("vct", () => solve(board, size, S, 5, { budget: 25000 }));
  if (vct.aborted) { stats.aborted++; return null; }
  if (vct.depth) {
    const first = timed("first", () => winningFirstMoves(board, size, S, vct.depth, { budget: 40000 }));
    if (first.aborted) { stats.aborted++; return null; }
    if (first.moves.length < 1 || first.moves.length > maxFirstMoves(vct.depth)) { stats.multi++; return null; }
    stats.vct++;
    return { kind: "vct", depth: vct.depth, sol: first.moves[0], firstCount: first.moves.length };
  }
  return null;
}
const VCT_SAMPLE = Number(process.env.VCT_SAMPLE || 0.4);
const MAX_VCF_DEPTH = 8;
function maxFirstMoves(depth) { return depth >= 4 ? 2 : 1; }

/* ---------- 自我對弈 + 收集候選 ---------- */
const pool = new Map();        // key → candidate
const seenKeys = new Set();
const bucketHave = new Map();  // bucketKey → 已收到幾個候選(挑題要 3 倍候選才夠平衡黑白/多樣)
const OVERSAMPLE = 3;
function bucketKey(tier, q) { return `${tier}|${q.kind}|${q.depths.join(",")}`; }
function addCandidate(key, cand) {
  pool.set(key, cand);
  const b = bucketOf(cand);
  if (b) { const k = bucketKey(b.tier, b.q); bucketHave.set(k, (bucketHave.get(k) || 0) + 1); }
}
/** 這一類(kind)還有沒有桶沒收滿?—— 收滿的類別就不再花時間搜,把局數留給還缺的 */
function needKind(kind) {
  for (const t of TIERS) for (const q of t.quota) {
    if (q.kind === kind && (bucketHave.get(bucketKey(t.tier, q)) || 0) < q.want * OVERSAMPLE) return true;
  }
  return false;
}
const SIZE_SCHEDULE = [15, 15, 15, 13, 15, 9, 15, 13, 19, 15];

function playGame(gameNo) {
  const size = SIZE_SCHEDULE[gameNo % SIZE_SCHEDULE.length];
  const board = createBoard(size);
  // 風格拉得很開:有些人幾乎不防守(defWeight 0.3)→ 對手會累積好幾個三,長 VCF 就是從這種盤面長出來的
  const styles = {
    black: { top1: 0.3 + rnd() * 0.55, defWeight: 0.3 + rnd() * 1.0, blunder: rnd() * 0.15 },
    white: { top1: 0.3 + rnd() * 0.55, defWeight: 0.3 + rnd() * 1.0, blunder: rnd() * 0.15 },
  };
  const mid = Math.floor(size / 2);
  board[mid + Math.floor(rnd() * 3) - 1][mid + Math.floor(rnd() * 3) - 1] = "black";
  let color = "white";
  let stones = 1;
  const maxStones = Math.min(size * size - 10, size === 9 ? 40 : 70);
  const minStones = size === 9 ? 6 : 8;
  while (stones < maxStones) {
    if (stones >= minStones) {
      const found = analyze(board, size, color);
      if (found) {
        const key = boardKey(board);
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          const setup = [];
          for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (board[r][c]) setup.push([board[r][c], r, c]);
          addCandidate(key, { ...found, size, turn: color, setup, stones, game: gameNo });
        }
      }
    }
    const m = timed("play", () => pickMove(board, size, color, styles[color]));
    if (!m) break;
    board[m[0]][m[1]] = color;
    stones++;
    if (isWinAt(board, size, m[0], m[1], color)) break;
    color = other(color);
  }
}

let games = 0;
let timedOut = false;
while (games < GAME_BUDGET) {
  if (Date.now() - t0 > TIME_CAP_MS) { timedOut = true; break; }
  playGame(games++);
  if (games % 50 === 0) {
    const need = remainingNeed();
    process.stderr.write(`  局 ${games}  候選 ${pool.size}  尚缺 ${need}  ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);
    if (need === 0) break;
  }
}
if (timedOut) process.stderr.write(`  ⚠ 超過時間上限 ${TIME_CAP_MS / 1000}s 提早停在第 ${games} 局 —— 這份題庫不可重現,請調高 GEN_MS 重跑\n`);

function bucketOf(cand) {
  for (const t of TIERS) for (const q of t.quota) {
    if (q.kind === cand.kind && q.depths.includes(cand.depth) && q.sizes.includes(cand.size)) return { tier: t.tier, q };
  }
  return null;
}
function remainingNeed() {
  let need = 0;
  for (const t of TIERS) for (const q of t.quota) {
    need += Math.max(0, q.want * OVERSAMPLE - (bucketHave.get(bucketKey(t.tier, q)) || 0));
  }
  return need;
}

/* ---------- 挑題 ---------- */
const chosen = [];
const usedGames = new Set();
for (const t of TIERS) {
  for (const q of t.quota) {
    const cands = [...pool.values()].filter(c => bucketOf(c)?.q === q)
      // 子多的局面比較像真對局、解也藏得深;同深度下優先取子多的,但太滿的盤面不好看
      .sort((a, b) => (b.stones - a.stones) || (a.game - b.game));
    const picked = [];
    let wantBlack = Math.ceil(q.want / 2);
    let wantWhite = q.want - wantBlack;
    for (const c of cands) {
      if (picked.length >= q.want) break;
      if (usedGames.has(c.game)) continue;
      if (c.turn === "black" && wantBlack <= 0 && wantWhite > 0) continue;
      if (c.turn === "white" && wantWhite <= 0 && wantBlack > 0) continue;
      picked.push(c);
      usedGames.add(c.game);
      if (c.turn === "black") wantBlack--; else wantWhite--;
    }
    // 同一級裡淺的排前面、子少的排前面(由易到難)
    picked.sort((a, b) => (a.depth - b.depth) || (a.stones - b.stones));
    picked.forEach(c => chosen.push({ tier: t.tier, ...c }));
    if (picked.length < q.want) {
      process.stderr.write(`  ⚠ ${t.name} ${q.kind} depth ${q.depths.join("/")} 只找到 ${picked.length}/${q.want}\n`);
    }
  }
}

/* ---------- 寫檔 ---------- */
const counters = new Map();
const lines = chosen.map(c => {
  const k = `${c.kind}${c.depth}`;
  const n = (counters.get(k) || 0) + 1;
  counters.set(k, n);
  const p = {
    id: `${k}-${String(n).padStart(2, "0")}`,
    tier: c.tier, kind: c.kind, size: c.size, turn: c.turn, target: c.depth,
    solution: c.sol,
    firstCount: c.firstCount ?? 1,     // N 步內必勝的正解首手有幾個(1 = 唯一解;深題最多 2)
    setup: c.setup,
  };
  return "  " + JSON.stringify(p) + ",";
});

const header = `/* puzzles.js — 殘局題庫(自動產生,★ 不要手改;改 scripts/gen-puzzles.mjs 再重生)
 *
 *   node scripts/gen-puzzles.mjs ${SEED}     ← 產生這一份(決定性:同種子同題庫)
 *   產生時間 ${new Date().toISOString().slice(0, 10)};自我對弈 ${games} 局、分析 ${stats.positions} 個局面
 *
 * 每一題都經 puzzle-solver.js 證明,而且 tests/puzzles.test.mjs 每次 npm test 都會**重新證明**:
 *   kind "vcf"    連續衝四必勝:target 步內必勝、target-1 步證明不了、第一手唯一
 *   kind "vct"    活三+衝四必勝(對手可反衝四):同上
 *   kind "defend" 守備:對手有 target 步 VCF,己方唯一擋點 = solution(己方沒有反衝四可用)
 * 規則:自由規則(五連或以上即勝、無禁手)—— 與解謎模式的 commitMove 一致。
 * target = 攻方總落子數(含成五那手、含被迫回擋那手)= UI「剩 N 步」。
 * 欄位:id / tier(1 入門・2 進階・3 高手・4 大師)/ kind / size / turn(先走方)/ target / solution [row,col] / setup [[color,row,col],…]
 */
export const PUZZLE_TIERS = [
  { tier: 1, name: "入門", stars: "⭐" },
  { tier: 2, name: "進階", stars: "⭐⭐" },
  { tier: 3, name: "高手", stars: "⭐⭐⭐" },
  { tier: 4, name: "大師", stars: "⭐⭐⭐⭐" },
];

export const PUZZLES = [
`;
writeFileSync(join(ROOT, "puzzles.js"), header + lines.join("\n") + "\n];\n");

/* ---------- 報表 ---------- */
const byTier = new Map();
for (const c of chosen) {
  const k = `T${c.tier} ${c.kind}${c.depth}`;
  byTier.set(k, (byTier.get(k) || 0) + 1);
}
console.log(`✅ puzzles.js:${chosen.length} 題(自我對弈 ${games} 局、局面 ${stats.positions}、候選 ${pool.size}、預算用完 ${stats.aborted}、有解但第一手不唯一 ${stats.multi})`);
for (const [k, v] of [...byTier.entries()].sort()) console.log(`   ${k.padEnd(14)} ${v}`);
const black = chosen.filter(c => c.turn === "black").length;
console.log(`   黑先 ${black} / 白先 ${chosen.length - black};耗時 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (process.env.GEN_PROFILE) {
  for (const k of ["play", "vcf", "gen", "first", "defend", "vct"]) {
    console.log(`   ⏱ ${k.padEnd(7)} ${(prof[k] / 1000).toFixed(1)}s / ${prof.n[k] || 0} 次 = ${(prof[k] / Math.max(1, prof.n[k] || 0)).toFixed(1)}ms`);
  }
}
