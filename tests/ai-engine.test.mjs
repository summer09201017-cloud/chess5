// tests/ai-engine.test.mjs — 對局引擎(大師檔 / 💡 提示)的戰術單元測試(純 node,零 DOM)
//
// 由來(2026-09-06):使用者照提示下棋輸了。這裡釘的是「輸給人的那幾種形」:
//   成五不下 / 該擋不擋 / 看不見連續衝四 / 看不見活三連殺 / 對手活三不擋 / 黑棋禁手照走。
//   每一條都用解題器(puzzle-solver)當裁判——它是被 84 題證明過的,不是用引擎自己驗自己。
import assert from "node:assert/strict";
import { chooseBestMove, chooseDefensiveMove, evaluate } from "../ai-engine.js";
import { createBoard, isWinAt, solve, winningFirstMoves, defenderOptions } from "../puzzle-solver.js";
import { analyzeForbiddenMove } from "../game-rules.js";

let pass = 0, fail = 0;
function ok(name, cond, detail = "") {
  if (cond) { pass++; console.log("  🟢 " + name); }
  else { fail++; console.error("  🔴 " + name + (detail ? " — " + detail : "")); }
}

/** 'X'=黑 'O'=白 '.'=空;每列字串長度 = 盤面大小 */
function boardFrom(rows) {
  const size = rows.length;
  const b = createBoard(size);
  rows.forEach((row, r) => { [...row].forEach((c, i) => { if (c === "X") b[r][i] = "black"; else if (c === "O") b[r][i] = "white"; }); });
  return b;
}
const snap = (b) => JSON.stringify(b);
/** 叫引擎並確認盤面沒被改壞(引擎會暫時落子,一定要還原) */
function call(board, color, opts = {}) {
  const before = snap(board);
  const m = chooseBestMove(board, board.length, color, { timeBudgetMs: 700, ...opts });
  assert.equal(snap(board), before, "引擎把盤面改壞了(沒還原)");
  assert.ok(m && board[m.row][m.col] === null, "引擎回了非空點或 null");
  return m;
}
const E = "...............";   // 15 空列
const row = (s) => (s + E).slice(0, 15);

console.log("── ① 開局 / 成五 / 擋五 ──");
{
  const b = createBoard(15);
  const m = call(b, "black");
  ok("空盤開局取天元 (7,7)", m.row === 7 && m.col === 7, JSON.stringify(m));
  const b9 = createBoard(9);
  const m9 = call(b9, "black");
  ok("9 路空盤取天元 (4,4)", m9.row === 4 && m9.col === 4, JSON.stringify(m9));
}
{
  const b = boardFrom([E, E, E, E, E, E, E, row("...XXXX"), row("..OO..."), E, E, E, E, E, E]);
  const m = call(b, "black");
  b[m.row][m.col] = "black";
  ok("黑有四(兩頭空)⇒ 直接成五", isWinAt(b, 15, m.row, m.col, "black"), JSON.stringify(m));
  b[m.row][m.col] = null;
  ok("理由講的是成五", /成五/.test(m.reason), m.reason);
}
{
  const b = boardFrom([E, E, E, E, E, E, E, row("..OXXXX"), row("..O...."), row(".........O"), E, E, E, E, E]);
  const m = call(b, "white");
  ok("黑有四(一頭被擋)⇒ 白必擋 (7,7)", m.row === 7 && m.col === 7, JSON.stringify(m) + " " + m.reason);
}

console.log("── ② 連續衝四(VCF)/ 活三連殺(VCT)──");
{
  // 黑 (7,4)(7,5)(7,6) + (4,7)(5,7)(6,7),兩條都被白擋住一頭 ⇒ (7,7) 一手做出雙四 = 擋不住
  const b = boardFrom([
    E, E, E,
    row(".......O"),
    row(".......X"),
    row(".......X"),
    row(".......X"),
    row("...OXXX"),
    E, E, E, E,
    row("............OO"),
    E,
    row(".............OO"),
  ]);
  const m = call(b, "black");
  ok("雙四點 (7,7) 一眼看到", m.row === 7 && m.col === 7, JSON.stringify(m) + " " + m.reason);
  ok("理由是連續衝四/必勝", /衝四|必勝/.test(m.reason), m.reason);
}
{
  // 三三:黑 (7,5)(7,6) + (5,7)(6,7);(7,7) 落下同時做出兩個活三 ⇒ 解題器證 3 手必勝
  const b = boardFrom([
    row("OO"), E, E, E, E,
    row(".......X"),
    row(".......X"),
    row(".....XX"),
    E, E, E, E, E, E,
    row("..............O"),
  ]);
  const proof = solve(b, 15, "black", 7);
  ok("前提:解題器證黑 3 手必勝", proof.depth === 3, "depth=" + proof.depth);
  const firsts = winningFirstMoves(b, 15, "black", 3).moves.map(([r, c]) => r + "," + c);
  const m = call(b, "black");
  ok("引擎的第一手在必勝首手集合裡(三三)", firsts.includes(m.row + "," + m.col), JSON.stringify(m) + " ∉ " + firsts.join(" "));
  ok("理由是活三連殺/必勝", /連殺|必勝/.test(m.reason), m.reason);
}

console.log("── ③ 防守:對手活三 / 對手連殺 ──");
{
  // 黑有活三 (7,6)(7,7)(7,8),白要走:走完黑不能再一手做出 ≥2 完成點
  const b = boardFrom([E, E, E, E, E, E, E, row("......XXX"), E, row("..O"), row("............O"), E, E, E, E]);
  const m = call(b, "white");
  b[m.row][m.col] = "white";
  const od = defenderOptions(b, 15, "black");
  b[m.row][m.col] = null;
  ok("白擋掉黑的活三(擋完黑沒有成活四點)", od.kind !== "threat" || od.moves.length === 0 ? od.kind !== "threat" : false, JSON.stringify(m) + " → " + od.kind);
  ok("理由講到活三", /活三/.test(m.reason), m.reason);
}
{
  // 三三威脅:輪白走,黑下一手 (7,7) 就三三 ⇒ 白這一手要讓黑 5 手內沒有必勝
  const b = boardFrom([
    row("OO"), E, E, E, E,
    row(".......X"),
    row(".......X"),
    row(".....XX"),
    E, E, E, E, E, E,
    row(".............OO"),
  ]);
  ok("前提:換黑走的話黑 3 手必勝", solve(b, 15, "black", 5).depth === 3);
  // ★ 這個局白其實已經輸了:0906 用解題器掃過白的每一個候選點,黑都仍有 ≤5 手必勝(沒有任何一點能完全破掉)。
  //   所以這裡守的是「至少把 3 手殺拆掉、撐到最久(5 手)」——舊大師連三三的威脅都看不見,黑照原計畫 3 手就贏。
  const m = call(b, "white", { timeBudgetMs: 900 });
  b[m.row][m.col] = "white";
  const after = solve(b, 15, "black", 5, { budget: 300000 });
  b[m.row][m.col] = null;
  ok("白拆掉黑的三三 3 手殺(走完黑至少要 5 手)", after.depth === null || after.depth >= 5, JSON.stringify(m) + " " + m.reason + " → depth=" + after.depth);
  ok("理由講到對手的威脅", /破|擋|活三|連殺/.test(m.reason), m.reason);
}

console.log("── ④ 黑棋禁手 ──");
{
  // 同上三三局,黑走且開禁手:(7,7) 是雙三禁手,引擎不准走
  const b = boardFrom([
    row("OO"), E, E, E, E,
    row(".......X"),
    row(".......X"),
    row(".....XX"),
    E, E, E, E, E, E,
    row("..............O"),
  ]);
  ok("前提:(7,7) 在禁手規則下是雙三", analyzeForbiddenMove(b, 15, 7, 7).forbidden === true);
  const m = call(b, "black", { renjuBlack: true });
  ok("開禁手時黑不走 (7,7)", !(m.row === 7 && m.col === 7), JSON.stringify(m));
  ok("回的點不是禁手點", analyzeForbiddenMove(b, 15, m.row, m.col).forbidden === false, JSON.stringify(m));
}

console.log("── ⑤ 速度與穩定 ──");
{
  // 固定種子的中盤(24 子,中央 7×7),沒有任何五連
  let seed = 20260906;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const b = createBoard(15);
  let color = "black", placed = 0, guard = 0;
  while (placed < 24 && guard++ < 5000) {
    const r = 4 + Math.floor(rnd() * 7), c = 4 + Math.floor(rnd() * 7);
    if (b[r][c] !== null) continue;
    b[r][c] = color;
    if (isWinAt(b, 15, r, c, color)) { b[r][c] = null; continue; }
    color = color === "black" ? "white" : "black";
    placed++;
  }
  const t0 = Date.now();
  const m = call(b, color, { timeBudgetMs: 800 });
  const dt = Date.now() - t0;
  ok("中盤 15 路一手 < 1600ms(預算 800)", dt < 1600, dt + "ms");
  ok("回的是合法空點", b[m.row][m.col] === null, JSON.stringify(m));
  ok("有理由字串", typeof m.reason === "string" && m.reason.length > 0, m.reason);
  const t1 = Date.now();
  call(b, color, { timeBudgetMs: 250 });
  ok("預算 250ms 時 < 900ms 回來(時間預算真的有在管)", Date.now() - t1 < 900, (Date.now() - t1) + "ms");
}
{
  const b = createBoard(15);
  ok("空盤評估 = 0", evaluate(b, 15, "black") === 0);
  const t = boardFrom([E, E, E, E, E, E, E, row("......XXX"), E, E, E, E, E, E, E]);
  ok("黑活三:黑視角 > 0、白視角 < 0", evaluate(t, 15, "black") > 0 && evaluate(t, 15, "white") < 0, evaluate(t, 15, "black") + " / " + evaluate(t, 15, "white"));
}

console.log("── ⑥ 只守不攻(困難檔 defend)──");
{
  const quiet = boardFrom([E, E, E, E, E, E, E, row(".......X"), row("......O"), E, E, E, E, E, E]);
  const q = snap(quiet);
  const m0 = chooseDefensiveMove(quiet, 15, "black", { timeBudgetMs: 400 });
  ok("沒威脅時回 null(困難檔走自己的舊路)", m0 === null, JSON.stringify(m0));
  ok("盤面沒被改壞", snap(quiet) === q);
  // 白有活三,黑要走 ⇒ 要回一手擋住
  const t = boardFrom([E, E, E, E, E, E, E, row("......OOO"), row("..X"), row("............X"), E, E, E, E, E]);
  const d = chooseDefensiveMove(t, 15, "black", { timeBudgetMs: 400 });
  ok("對手活三 ⇒ 回一手", !!d && t[d.row][d.col] === null, JSON.stringify(d));
  if (d) { t[d.row][d.col] = "black"; const od = defenderOptions(t, 15, "white"); t[d.row][d.col] = null; ok("擋完白沒有成活四點", od.kind !== "threat", od.kind + " " + (d.reason || "")); }
  // 自己有四 ⇒ 成五(守的入口也要會贏)
  const w = boardFrom([E, E, E, E, E, E, E, row("...XXXX"), row("..OO..O"), row("..O"), E, E, E, E, E]);
  const f = chooseDefensiveMove(w, 15, "black", { timeBudgetMs: 400 });
  if (f) w[f.row][f.col] = "black";
  ok("自己能成五就成五", !!f && isWinAt(w, 15, f.row, f.col, "black"), JSON.stringify(f));
  // 對手有四 ⇒ 擋
  const g = boardFrom([E, E, E, E, E, E, E, row("..XOOOO"), row("..X"), row(".........X"), E, E, E, E, E]);
  const b = chooseDefensiveMove(g, 15, "black", { timeBudgetMs: 400 });
  ok("對手有四 ⇒ 擋在 (7,7)", !!b && b.row === 7 && b.col === 7, JSON.stringify(b));
  // 開局(≤1 子)不插手
  const o = boardFrom([E, E, E, E, E, E, E, row(".......X"), E, E, E, E, E, E, E]);
  ok("開局(1 子)回 null", chooseDefensiveMove(o, 15, "white", { timeBudgetMs: 400 }) === null);
}

console.log(`\nai-engine: ${pass} 綠 / ${fail} 紅`);
if (fail) process.exit(1);
