import assert from "node:assert/strict";
import {
  boardFromSetup, solve, winningFirstMoves, defenderOptions, winningCells,
  attackStillForced, bestDefence, savingMoves, threatMoves, fourMoves,
} from "../puzzle-solver.js";

const S = 15;
const B = (cells) => cells.map(([r, c]) => ["black", r, c]);
const W = (cells) => cells.map(([r, c]) => ["white", r, c]);
const key = ([r, c]) => `${r},${c}`;

/* 1. 一手成五:黑 4 連,兩端空 → depth 1,兩個完成點都是解 */
{
  const board = boardFromSetup(S, [...B([[7, 3], [7, 4], [7, 5], [7, 6]]), ...W([[8, 8], [6, 6], [9, 9]])]);
  const r = solve(board, S, "black", 5);
  assert.equal(r.depth, 1);
  const first = winningFirstMoves(board, S, "black", 1);
  assert.deepEqual(first.moves.map(key).sort(), ["7,2", "7,7"]);
}

/* 2. 活三 → 活四 → 成五 = 2 步;白沒有任何反擊 */
{
  const board = boardFromSetup(S, [...B([[7, 4], [7, 5], [7, 6]]), ...W([[3, 3], [11, 11], [3, 11]])]);
  const r = solve(board, S, "black", 5);
  assert.equal(r.depth, 2, "活三應該 2 步必勝");
  const first = winningFirstMoves(board, S, "black", 2);
  // 7,3 或 7,7 都做出活四(兩邊各一個完成點)
  assert.deepEqual(first.moves.map(key).sort(), ["7,3", "7,7"]);
  // VCF 模式下也是 2 步(做出 ≥2 完成點的那一手本身就是「四」)
  assert.equal(solve(board, S, "black", 5, { vcfOnly: true }).depth, 2);
}

/* 3. 活三的擋點 = 相鄰兩端;遠端不算(另一邊仍能做活四) */
{
  const board = boardFromSetup(S, [...B([[7, 4], [7, 5], [7, 6]]), ...W([[3, 3], [11, 11], [3, 11]])]);
  const o = defenderOptions(board, S, "black");
  assert.equal(o.kind, "threat");
  assert.deepEqual(o.moves.map(key).sort(), ["7,3", "7,7"]);
}

/* 4. 一邊被封的三(眠三)不是威脅 */
{
  const board = boardFromSetup(S, [...B([[7, 4], [7, 5], [7, 6]]), ...W([[7, 3], [11, 11], [3, 11]])]);
  const o = defenderOptions(board, S, "black");
  assert.equal(o.kind, "noThreat");
  assert.equal(solve(board, S, "black", 3).depth, null);
}

/* 5. 四三:一手同時衝四 + 活三 → 3 步(擋四 → 做活四 → 成五) */
{
  // 黑:橫向 7,4 7,5 7,6(左端 7,3 被白封)+ 直向 5,7 6,7;下 7,7 = 橫四(完成點 7,8)+ 直活三(5,7 6,7 7,7)
  const board = boardFromSetup(S, [
    ...B([[7, 4], [7, 5], [7, 6], [5, 7], [6, 7]]),
    ...W([[7, 3], [12, 12], [12, 2], [2, 12]]),
  ]);
  const r = solve(board, S, "black", 5);
  assert.equal(r.depth, 3, "四三應該 3 步");
  assert.equal(key(r.move), "7,7");
  assert.equal(solve(board, S, "black", 2).depth, null, "2 步殺不了");
  const first = winningFirstMoves(board, S, "black", 3);
  assert.deepEqual(first.moves.map(key), ["7,7"], "四三的第一手應唯一");
  // VCF 模式也能證(每一手都是四)
  assert.equal(solve(board, S, "black", 5, { vcfOnly: true }).depth, 3);
}

/* 6. 守方的四要先擋:白有四(完成點 9,7),黑即使有活三也不能直接做活四 */
{
  const board = boardFromSetup(S, [
    ...B([[7, 4], [7, 5], [7, 6]]),
    ...W([[9, 3], [9, 4], [9, 5], [9, 6]]),
  ]);
  // 黑走:白有兩個完成點(9,2 / 9,7)→ 擋不住 → 黑無解
  assert.equal(solve(board, S, "black", 4).depth, null);
}

/* 7. 反衝四能破活三:黑活三,但白衝四後的擋點順帶破掉黑的活三 */
{
  // 黑 7,4 7,5 7,6 活三;白 3,7 4,7 5,7(直向三,一端 2,7 空、另一端 6,7 空)
  // 黑做活四(7,3 或 7,7)後白反衝四 6,7 → 黑必須擋 2,7 …… 但黑此時已有兩個完成點 → 黑直接成五。
  // 所以活三仍然 2 步必勝;這題驗的是 defenderOptions 有把反衝四列進來。
  const board = boardFromSetup(S, [
    ...B([[7, 4], [7, 5], [7, 6]]),
    ...W([[3, 7], [4, 7], [5, 7]]),
  ]);
  const o = defenderOptions(board, S, "black");
  assert.equal(o.kind, "threat");
  const ms = new Set(o.moves.map(key));
  assert.ok(ms.has("7,3") && ms.has("7,7"), "擋點");
  assert.ok(ms.has("6,7") && ms.has("2,7"), "反衝四也是選項");
  assert.equal(solve(board, S, "black", 4).depth, 2);
}

/* 8. 反衝四真的能救:黑活三,白衝四的擋點正好是黑活三的擋點 → 黑不再 2 步殺 */
{
  // 黑 7,4 7,5 7,6;白 4,7 5,7 6,7 三顆,若白走 3,7 成四,完成點 2,7 與 7,7 → 黑要擋 7,7?不對,那正好是黑做活四的點。
  // 換一個:白直向 8,3 9,3 10,3 + 11,3 空、7,3 空。白走 11,3 成四(完成點 7,3、12,3)—— 黑必須擋其中之一,
  // 但白有 2 個完成點 → 黑擋不住 → 黑輸。所以黑的活三這時候不是必勝(黑做活四後白反衝四且有 2 完成點)。
  const board = boardFromSetup(S, [
    ...B([[7, 4], [7, 5], [7, 6]]),
    ...W([[8, 3], [9, 3], [10, 3]]),
  ]);
  // 黑走 7,3 做活四並堵住白那一端 → 白只能擋一邊 → 黑成五。
  // 黑走 7,7 做活四 → 白 7,3 擋一端「同時」成四(完成點 6,3 / 11,3)—— 但黑有 2 個完成點,輪到黑直接 7,8 成五。
  // ★ 活四不怕反衝四:攻方先成五。所以兩手都是解(首版我手算成只有 7,3 —— 這正是「手擺直覺七成會錯」的活例)。
  const first = winningFirstMoves(board, S, "black", 2);
  assert.deepEqual(first.moves.map(key).sort(), ["7,3", "7,7"]);
  assert.equal(solve(board, S, "black", 3).depth, 2);
  // 反衝四真正有用的情況:黑只是「四」(1 個完成點)而白的擋點順帶成四 → 黑被迫回擋,失去先手。
  // 黑 7,4 7,5 7,6、7,3 被白封;白 8,8 9,8 10,8(直向三)。黑走 7,7 成四(完成點 7,8)→ 白擋 7,8 同時成四(7,8 8,8 9,8 10,8,完成點 6,8 / 11,8 → 2 個)→ 黑擋不住 → 黑輸。
  const b2 = boardFromSetup(S, [...B([[7, 4], [7, 5], [7, 6]]), ...W([[7, 3], [8, 8], [9, 8], [10, 8]])]);
  assert.equal(solve(b2, S, "black", 4).depth, null, "被封一端的四衝出去只會讓白反成活四");
}

/* 9. attackStillForced / bestDefence 語意 */
{
  const board = boardFromSetup(S, [
    ...B([[7, 4], [7, 5], [7, 6], [5, 7], [6, 7], [7, 7]]),   // 黑剛下 7,7 四三
    ...W([[7, 3], [12, 12], [12, 2], [2, 12]]),
  ]);
  const st = attackStillForced(board, S, "black", 2);
  assert.equal(st.forced, true);
  const d = bestDefence(board, S, "black", 2);
  assert.equal(d.kind, "mustBlock");
  assert.equal(key(d.move), "7,8");
  assert.equal(d.refutes, false);
}

/* 10. savingMoves:白要擋黑的 3 步 VCF(四三點),唯一擋點 */
{
  // 黑 7,4 7,5 7,6(7,3 被白封)+ 5,7 6,7;黑下 7,7 就是四三。白先走:能救的點?
  const board = boardFromSetup(S, [
    ...B([[7, 4], [7, 5], [7, 6], [5, 7], [6, 7]]),
    ...W([[7, 3], [12, 12], [12, 2], [2, 12], [1, 1]]),
  ]);
  assert.equal(solve(board, S, "black", 5, { vcfOnly: true }).depth, 3);
  assert.equal(fourMoves(board, S, "white").length, 0);
  const saves = savingMoves(board, S, "white", 3);
  // 7,7 本身一定是;7,8 擋橫四後黑走 7,7 仍是直活三+橫四?7,7 橫向 7,4-7,7 四顆但 7,3 7,8 都被封 → 沒完成點,
  // 直向活三 → 只是活三不是四 → 不是 VCF ⇒ 7,8 也「擋住 VCF」。所以答案不唯一,測試只驗 7,7 在裡面且都是真的。
  const ks = saves.map(key);
  assert.ok(ks.includes("7,7"));
  for (const [r, c] of saves) {
    board[r][c] = "white";
    assert.equal(solve(board, S, "black", 5, { vcfOnly: true }).depth, null, `${r},${c} 應該擋住 VCF`);
    board[r][c] = null;
  }
}

/* 11. 解題器不會弄髒盤面(所有路徑都還原) */
{
  const setup = [...B([[7, 4], [7, 5], [7, 6], [5, 7], [6, 7]]), ...W([[7, 3], [12, 12], [12, 2], [2, 12]])];
  const board = boardFromSetup(S, setup);
  const before = JSON.stringify(board);
  solve(board, S, "black", 6);
  winningFirstMoves(board, S, "black", 3);
  defenderOptions(board, S, "black");
  bestDefence(board, S, "black", 3);
  savingMoves(board, S, "white", 3);
  threatMoves(board, S, "black", false);
  winningCells(board, S, "white");
  assert.equal(JSON.stringify(board), before);
}

/* 12. 預算用完要誠實回 aborted,不能回「無解」 */
{
  const board = boardFromSetup(S, [...B([[7, 4], [7, 5], [7, 6], [5, 7], [6, 7]]), ...W([[7, 3], [12, 12]])]);
  const r = solve(board, S, "black", 6, { budget: 1 });
  assert.equal(r.aborted, true);
  assert.equal(r.depth, null);
}

console.log("puzzle-solver tests passed");
