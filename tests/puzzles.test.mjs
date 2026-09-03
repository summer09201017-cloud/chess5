/* 題庫逐題重證(daily-puzzle-kit §三:機器生的題,可解性也要機器驗;而且每次 npm test 都重證,
   不信任「上次生成時證過」—— 解題器一改,舊題庫可能就不成立)。
   每一題驗:
     結構:欄位齊、座標在盤內、不重複、先走方子數合理(黑=白 或 黑=白+1)
     vcf   :VCF 解題器 depth === target(自然含「target-1 步殺不了」),正解首手數 === firstCount 且 solution 在其中
     vct   :一般解題器 depth === target,同上
     defend:守方沒有反衝四、對手沒有現成四、對手 VCF depth === target、唯一擋點 === solution
   另驗 id 唯一、tier/kind 分佈至少涵蓋四級,以及「已解」進度鍵不會被 id 重排打亂(id 是穩定字串)。 */
import assert from "node:assert/strict";
import { PUZZLES, PUZZLE_TIERS, PUZZLE_META } from "../puzzles.js";
import { boardFromSetup, solve, winningFirstMoves, fourMoves, winningCells, savingMoves, other, boardKey } from "../puzzle-solver.js";
import { fnv1a } from "../daily-picker.js";

const t0 = performance.now();
assert.ok(Array.isArray(PUZZLES) && PUZZLES.length >= 40, `題庫至少 40 題(現在 ${PUZZLES.length})—— 使用者原話「只有 8 題太少」`);
assert.deepEqual(PUZZLE_TIERS.map(t => t.tier), [1, 2, 3, 4]);
assert.ok(PUZZLE_META && Array.isArray(PUZZLE_META.runs) && PUZZLE_META.runs.length >= 1, "PUZZLE_META.runs 要記錄生成/補題歷史");
assert.equal(PUZZLE_META.runs.at(-1).total, PUZZLES.length, "META 最後一筆的 total 要等於題數");

const ids = new Set();
const tiersSeen = new Set();
const kindsSeen = new Set();
let maxTarget = 0;

for (const p of PUZZLES) {
  const tag = `[${p.id}]`;
  assert.ok(typeof p.id === "string" && /^(vcf|vct|defend)\d+-[0-9a-f]{6}$/.test(p.id), `${tag} id 格式(kind+target-局面雜湊)`);
  assert.ok(!ids.has(p.id), `${tag} id 重複`); ids.add(p.id);
  assert.ok(p.id.startsWith(`${p.kind}${p.target}-`), `${tag} id 前綴要對得上 kind/target`);
  assert.ok([1, 2, 3, 4].includes(p.tier), `${tag} tier`);
  assert.ok(["vcf", "vct", "defend"].includes(p.kind), `${tag} kind`);
  assert.ok([9, 13, 15, 19].includes(p.size), `${tag} size 必須是遊戲支援的盤面`);
  assert.ok(p.turn === "black" || p.turn === "white", `${tag} turn`);
  assert.ok(Number.isInteger(p.target) && p.target >= 1 && p.target <= 9, `${tag} target`);
  assert.ok(Array.isArray(p.solution) && p.solution.length === 2, `${tag} solution`);
  assert.ok(Number.isInteger(p.firstCount) && p.firstCount >= 1 && p.firstCount <= 2, `${tag} firstCount`);
  tiersSeen.add(p.tier); kindsSeen.add(p.kind);
  if (p.target > maxTarget) maxTarget = p.target;

  // 結構
  const seen = new Set();
  let black = 0, white = 0;
  for (const [color, r, c] of p.setup) {
    assert.ok(color === "black" || color === "white", `${tag} setup 顏色`);
    assert.ok(Number.isInteger(r) && Number.isInteger(c) && r >= 0 && c >= 0 && r < p.size && c < p.size, `${tag} setup 座標 (${r},${c}) 出界`);
    const k = r * p.size + c;
    assert.ok(!seen.has(k), `${tag} setup 座標重複 (${r},${c})`); seen.add(k);
    if (color === "black") black++; else white++;
  }
  assert.ok(p.setup.length >= 6, `${tag} 至少 6 顆子(太少就不像殘局)`);
  if (p.turn === "black") assert.equal(black, white, `${tag} 黑先 ⇒ 黑白子數相等`);
  else assert.equal(black, white + 1, `${tag} 白先 ⇒ 黑比白多一顆`);
  const [sr, sc] = p.solution;
  assert.ok(!seen.has(sr * p.size + sc), `${tag} 正解點被佔了`);

  const board = boardFromSetup(p.size, p.setup);
  const before = JSON.stringify(board);
  const hash = fnv1a(`${p.size}|${p.turn}|${boardKey(board)}`).toString(16).padStart(8, "0").slice(0, 6);
  assert.equal(p.id, `${p.kind}${p.target}-${hash}`, `${tag} id 雜湊對不上局面(有人手改了 setup 或 id)`);

  if (p.kind === "vcf" || p.kind === "vct") {
    const opts = p.kind === "vcf" ? { vcfOnly: true, budget: 400000 } : { budget: 400000 };
    const res = solve(board, p.size, p.turn, p.target, opts);
    assert.equal(res.aborted, false, `${tag} 證明預算用完 —— 題目太深,生成時應該已丟掉`);
    assert.equal(res.depth, p.target, `${tag} 最少步數應為 ${p.target},解題器說 ${res.depth}`);
    const first = winningFirstMoves(board, p.size, p.turn, p.target, opts);
    assert.equal(first.aborted, false, `${tag} 首手枚舉預算用完`);
    assert.equal(first.moves.length, p.firstCount, `${tag} 正解首手數應為 ${p.firstCount}`);
    assert.ok(first.moves.some(([r, c]) => r === sr && c === sc), `${tag} solution 不在正解首手裡`);
    if (p.target <= 3) assert.equal(p.firstCount, 1, `${tag} 3 步以內的題要唯一解`);
  } else {
    const foe = other(p.turn);
    assert.equal(fourMoves(board, p.size, p.turn).length, 0, `${tag} 守備題守方不該有反衝四`);
    assert.equal(winningCells(board, p.size, foe).length, 0, `${tag} 守備題對手不該已有四`);
    assert.equal(winningCells(board, p.size, p.turn).length, 0, `${tag} 守備題守方不該能直接成五`);
    const thr = solve(board, p.size, foe, p.target, { vcfOnly: true, budget: 400000 });
    assert.equal(thr.depth, p.target, `${tag} 對手 VCF 應為 ${p.target} 步,解題器說 ${thr.depth}`);
    const saves = savingMoves(board, p.size, p.turn, p.target, 2);
    assert.equal(saves.length, p.firstCount, `${tag} 擋點數應為 ${p.firstCount},實得 ${JSON.stringify(saves)}`);
    assert.ok(saves.some(([r, c]) => r === sr && c === sc), `${tag} solution 不在擋點裡:${JSON.stringify(saves)}`);
    // 對手 2 步連殺要唯一擋點;3~4 步允許兩個(生成器 maxSaves 同一條規則)
    if (p.target <= 2) assert.equal(p.firstCount, 1, `${tag} 淺的守備題要唯一擋點`);
  }
  assert.equal(JSON.stringify(board), before, `${tag} 解題器弄髒了盤面`);
}

assert.deepEqual([...tiersSeen].sort(), [1, 2, 3, 4], "四級都要有題");
assert.deepEqual([...kindsSeen].sort(), ["defend", "vcf", "vct"], "三種題型都要有");
assert.ok(maxTarget >= 5, `最深的題至少 5 步(現在 ${maxTarget})—— 使用者原話「太簡單」`);
const byTier = [1, 2, 3, 4].map(t => PUZZLES.filter(p => p.tier === t).length);
console.log(`puzzles tests passed:${PUZZLES.length} 題全部重證(入門 ${byTier[0]}・進階 ${byTier[1]}・高手 ${byTier[2]}・大師 ${byTier[3]};最深 ${maxTarget} 步;${((performance.now() - t0) / 1000).toFixed(1)}s)`);
