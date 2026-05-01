import assert from "node:assert/strict";
import { analyzeForbiddenMove, analyzeMoveThreat, createRuleBoard } from "../game-rules.js";

function place(board, color, cells) {
  for (const [row, col] of cells) board[row][col] = color;
}

{
  const board = createRuleBoard(15);
  place(board, "black", [[7, 3], [7, 4], [7, 5], [7, 6]]);
  const result = analyzeForbiddenMove(board, 15, 7, 7);
  assert.equal(result.forbidden, false);
  assert.equal(result.reason, "exact-five");
}

{
  const board = createRuleBoard(15);
  place(board, "black", [[7, 2], [7, 3], [7, 4], [7, 5], [7, 6]]);
  const result = analyzeForbiddenMove(board, 15, 7, 7);
  assert.equal(result.forbidden, true);
  assert.equal(result.reason, "long-line");
}

{
  const board = createRuleBoard(15);
  place(board, "black", [[7, 4], [7, 5], [7, 6], [4, 7], [5, 7], [6, 7]]);
  const result = analyzeForbiddenMove(board, 15, 7, 7);
  assert.equal(result.forbidden, true);
  assert.equal(result.reason, "double-four");
}

{
  const board = createRuleBoard(15);
  place(board, "black", [[7, 6], [7, 8], [6, 7], [8, 7]]);
  const result = analyzeForbiddenMove(board, 15, 7, 7);
  assert.equal(result.forbidden, true);
  assert.equal(result.reason, "double-three");
}

{
  const board = createRuleBoard(15);
  place(board, "white", [[7, 3], [7, 4], [7, 5], [7, 6]]);
  const result = analyzeMoveThreat(board, 15, 7, 7, "white");
  assert.equal(result.exactFive, true);
  assert.equal(result.score > 1_000_000, true);
}

console.log("game-rules tests passed");
