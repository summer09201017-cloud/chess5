#!/usr/bin/env node
/**
 * 解謎模式真瀏覽器冒煙(Playwright,不在 npm test 裡 —— 這個專案零相依,Playwright 借別的 repo 的)
 *
 *   python -m http.server 8765 --bind 127.0.0.1        # 先起本機站(另一個視窗)
 *   node scripts/smoke-puzzles.mjs                      # 預設 BASE=http://127.0.0.1:8765/
 *   BASE=https://5-chess.pages.dev/ node scripts/smoke-puzzles.mjs   # 線上也能跑
 *
 *   PLAYWRIGHT_PATH 指到任何一份 playwright/index.mjs(預設借 Desktop/hfpc-sparks-hub 的)。
 *
 * 驗的是「流程」不是「對位」(對位 0901 已用 Playwright 量過):
 *   ① 題庫載入:select 的 option 數 = puzzles.js 題數、四個 optgroup
 *   ② 攻擊題照解題器的正解一路點到成五 → 狀態 ✅、星星 ⭐⭐⭐
 *   ③ 走一手爛棋 → 對手回應後立刻 ❌(不必等步數用完);按重試 → 再解出 → 只剩 ⭐⭐☆
 *   ④ 守備題:唯一擋點 → ✅;錯點 → ❌ 且對手開始示範連殺
 *   ⑤ 深連結 ?puzzle=<id> 直接進解謎模式並載入那一題
 *   ⑥ 重新整理後進度還在(已解 n/N、option 前面有 ✅)
 *   ⑦ 全程 console 沒有 error / pageerror
 * ★ 點交點用 el.click()(邏輯冒煙),不用座標 —— 見 skill canvas-playwright-verify「裸座標」那一條。
 */
import { pathToFileURL } from "node:url";
import { PUZZLES } from "../puzzles.js";
import { boardFromSetup, solve, createBoard } from "../puzzle-solver.js";

const BASE = process.env.BASE || "http://127.0.0.1:8765/";
const PW = process.env.PLAYWRIGHT_PATH || "C:/Users/agape250/Desktop/hfpc-sparks-hub/node_modules/playwright/index.mjs";
const { chromium } = await import(pathToFileURL(PW).href);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const errors = [];
page.on("pageerror", e => errors.push("pageerror: " + String(e)));
page.on("console", m => { if (m.type() === "error") errors.push("console.error: " + m.text()); });

let failures = 0;
function check(cond, msg) {
  if (cond) console.log("  ✅ " + msg);
  else { failures++; console.log("  ❌ " + msg); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const status = () => page.$eval("#status", el => el.textContent);
const hintText = () => page.$eval("#puzzleHint", el => el.textContent);
const starsText = () => page.$eval("#puzzleStars", el => el.textContent);

async function readBoard(size) {
  const cells = await page.$$eval(".intersection", els => els.map(e => {
    const s = e.querySelector(".stone");
    return { r: +e.dataset.row, c: +e.dataset.col, color: s ? (s.classList.contains("black") ? "black" : "white") : null };
  }));
  const board = createBoard(size);
  for (const { r, c, color } of cells) if (color) board[r][c] = color;
  return board;
}
async function clickCell(r, c) {
  await page.$eval(`.intersection[data-row="${r}"][data-col="${c}"]`, el => el.click());
}
async function waitTurn() {
  // 對手回應是 setTimeout 380/420ms;等 pointerEvents 放開,再多等一拍讓狀態文字更新
  await sleep(150);
  await page.waitForFunction(() => document.getElementById("intersections").style.pointerEvents !== "none", null, { timeout: 8000 });
  await sleep(120);
}
async function openPuzzle(idx) {
  // 解謎面板預設收合(<details>),Playwright 對不可見元素不動手 → 先展開
  await page.$eval("#puzzleSelect", el => { el.closest("details").open = true; });
  await page.selectOption("#puzzleSelect", String(idx));
  await page.click("#puzzleStart");
  await sleep(100);
}
/** 照解題器一路走到底;回傳最後狀態字串 */
async function playToWin(p, idx) {
  let movesLeft = p.target;
  for (let step = 0; step < p.target + 1; step++) {
    const board = await readBoard(p.size);
    const res = solve(board, p.size, p.turn, movesLeft, { budget: 300000 });
    if (!res.move) return `no-move-at-step-${step}:${await status()}`;
    await clickCell(res.move[0], res.move[1]);
    movesLeft--;
    await waitTurn();
    const st = await status();
    if (st.includes("✅") || st.includes("❌")) return st;
  }
  return await status();
}

console.log(`▶ ${BASE}(題庫 ${PUZZLES.length} 題)`);
await page.goto(BASE, { waitUntil: "load" });
await page.waitForFunction(() => document.querySelectorAll("#puzzleSelect option").length > 0, null, { timeout: 10000 });

/* ① 題庫載入 */
const optCount = await page.$$eval("#puzzleSelect option", o => o.length);
check(optCount === PUZZLES.length, `select 有 ${optCount} 題 = puzzles.js ${PUZZLES.length} 題`);
const groups = await page.$$eval("#puzzleSelect optgroup", g => g.map(x => x.label));
check(groups.length === 4, `四個分級 optgroup:${groups.join(" / ")}`);
const progress0 = await page.$eval("#puzzleProgress", el => el.textContent);
check(/已解 \d+\/\d+ 題/.test(progress0), `進度行:${progress0}`);

/* ② 攻擊題正解到底 */
const attackIdx = PUZZLES.findIndex(p => p.kind === "vcf" && p.target >= 3);
const attackP = PUZZLES[attackIdx];
await openPuzzle(attackIdx);
let st = await status();
check(st.includes(`解謎 ${attackIdx + 1}/`) && st.includes(`剩 ${attackP.target} 步`), `開題狀態:${st}`);
check(await page.$eval("#modeSelect", el => el.value) === "puzzle", "模式切到 puzzle");
const boardLoaded = await readBoard(attackP.size);
check(JSON.stringify(boardLoaded) === JSON.stringify(boardFromSetup(attackP.size, attackP.setup)), "盤面 = 題目 setup");
st = await playToWin(attackP, attackIdx);
check(st.includes("✅"), `[${attackP.id}] 照正解走 → ${st}`);
check((await starsText()).startsWith("⭐⭐⭐"), `三星:${await starsText()}`);

/* ③ 爛棋 → 立刻 ❌;重試 → 二星 */
const attack2Idx = PUZZLES.findIndex((p, i) => i !== attackIdx && p.kind === "vcf" && p.target >= 2 && p.target <= 4);
const attack2 = PUZZLES[attack2Idx];
await openPuzzle(attack2Idx);
{
  // 找一個離所有棋子都很遠的空點當爛棋(角落往內找)
  const b = await readBoard(attack2.size);
  let bad = null;
  outer: for (let r = 0; r < attack2.size; r++) for (let c = 0; c < attack2.size; c++) {
    if (b[r][c]) continue;
    let far = true;
    for (let rr = r - 2; rr <= r + 2 && far; rr++) for (let cc = c - 2; cc <= c + 2; cc++) {
      if (rr >= 0 && cc >= 0 && rr < attack2.size && cc < attack2.size && b[rr][cc]) { far = false; break; }
    }
    if (far) { bad = [r, c]; break outer; }
  }
  if (!bad) bad = [0, 0];
  await clickCell(bad[0], bad[1]);
  await waitTurn();
  st = await status();
  const ht = await hintText();
  check(st.includes("❌") && ht.includes("❌"), `[${attack2.id}] 爛棋 (${bad}) → 立刻判失敗:${ht}`);
  // 失敗後盤面鎖住:再點不會落子
  const stonesBefore = (await readBoard(attack2.size)).flat().filter(Boolean).length;
  const b2 = await readBoard(attack2.size);
  let empty = null;
  for (let r = 0; r < attack2.size && !empty; r++) for (let c = 0; c < attack2.size; c++) if (!b2[r][c]) { empty = [r, c]; break; }
  await clickCell(empty[0], empty[1]);
  await sleep(200);
  const stonesAfter = (await readBoard(attack2.size)).flat().filter(Boolean).length;
  check(stonesAfter === stonesBefore, "失敗後盤面鎖住(點了不落子)");
  await page.click("#puzzleStart");     // 重試
  await sleep(100);
  st = await status();
  check(st.includes(`剩 ${attack2.target} 步`) && !st.includes("❌"), `重試後回到起點:${st}`);
  st = await playToWin(attack2, attack2Idx);
  check(st.includes("✅"), `重試後照正解走 → ${st}`);
  check((await starsText()).startsWith("⭐⭐☆"), `重試過一次 → 二星:${await starsText()}`);
}

/* ④ 守備題 */
const defIdx = PUZZLES.findIndex(p => p.kind === "defend");
const defP = PUZZLES[defIdx];
if (defIdx >= 0) {
  await openPuzzle(defIdx);
  st = await status();
  check(st.includes("守備"), `守備題狀態:${st}`);
  await clickCell(defP.solution[0], defP.solution[1]);
  await sleep(300);
  st = await status();
  check(st.includes("✅"), `[${defP.id}] 唯一擋點 → ${st}`);
  // 錯點 → 對手示範
  await page.click("#puzzleStart");
  await sleep(100);
  const b = await readBoard(defP.size);
  let wrong = null;
  for (let r = 0; r < defP.size && !wrong; r++) for (let c = 0; c < defP.size; c++) {
    if (!b[r][c] && !(r === defP.solution[0] && c === defP.solution[1])) { wrong = [r, c]; break; }
  }
  await clickCell(wrong[0], wrong[1]);
  await waitTurn();
  const ht = await hintText();
  const stonesNow = (await readBoard(defP.size)).flat().filter(Boolean).length;
  check(ht.includes("❌") && stonesNow === defP.setup.length + 2, `錯點 → ❌ 且對手已下一手示範(${ht.slice(0, 30)}…)`);
} else {
  check(false, "題庫裡沒有守備題");
}

/* ⑤ 深連結 */
const linkIdx = PUZZLES.length - 1;
await page.goto(`${BASE}?puzzle=${encodeURIComponent(PUZZLES[linkIdx].id)}`, { waitUntil: "load" });
await sleep(300);
st = await status();
check(st.includes(`解謎 ${linkIdx + 1}/${PUZZLES.length}`), `?puzzle=${PUZZLES[linkIdx].id} → ${st}`);
check(await page.$eval("#modeSelect", el => el.value) === "puzzle", "深連結進入 puzzle 模式");
check(await page.$eval("#puzzleSelect", el => el.closest("details").open), "深連結自動展開解謎面板");

/* ⑥ 進度保存 */
await page.goto(BASE, { waitUntil: "load" });
await sleep(300);
const progress1 = await page.$eval("#puzzleProgress", el => el.textContent);
check(/已解 [1-9]\d*\/\d+ 題/.test(progress1), `重整後進度還在:${progress1}`);
const solvedOpt = await page.$eval(`#puzzleSelect option[value="${attackIdx}"]`, el => el.textContent);
check(solvedOpt.startsWith("✅") && solvedOpt.includes("⭐⭐⭐"), `已解的題在清單上有 ✅ 與星星:${solvedOpt}`);
// 開機接續:上次是解謎模式 → 直接載題(不是空盤配「黑棋先手」)
st = await status();
check(st.includes("解謎"), `重整後接續解謎模式:${st}`);

/* ⑦ console */
check(errors.length === 0, errors.length ? `console 有錯:\n    ${errors.join("\n    ")}` : "console 乾淨");

await browser.close();
console.log(failures ? `\n🛑 ${failures} 項失敗` : "\n🎉 解謎冒煙全部通過");
process.exit(failures ? 1 : 0);
