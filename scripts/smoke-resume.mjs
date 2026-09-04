#!/usr/bin/env node
/**
 * 「接續上一盤」真瀏覽器冒煙(Playwright,不在 npm test 裡 —— 這個專案零相依,Playwright 借別的 repo 的)
 *
 *   python -m http.server 8765 --bind 127.0.0.1        # 先起本機站(另一個視窗)
 *   node scripts/smoke-resume.mjs                       # 預設 BASE=http://127.0.0.1:8765/
 *   BASE=https://5-chess.pages.dev/ node scripts/smoke-resume.mjs    # 線上也能跑
 *
 *   PLAYWRIGHT_PATH 指到任何一份 playwright/index.mjs(預設借 Desktop/hfpc-sparks-hub 的)。
 *
 * 為什麼一定要真瀏覽器:整件事的病灶(gomoku.session 只寫不讀、重播帶副作用)
 * **不會讓任何斷言變紅** —— npm test 全綠、部署全綠、畫面看起來也正常。
 * 只有真的開一次、關掉、再開一次,才看得出來。
 *
 * 驗七件:
 *   ① 全新裝置(無存檔)⇒ 接續鈕看不到(沒有棋局可接時不要擋路)
 *   ② 本機雙人下 4 手 → 重新整理 ⇒ 鈕出現且寫「第 4 手」
 *   ③ 按下去 ⇒ 盤上真的 4 顆、顏色與座標對、輪到白棋、鈕自己收起來
 *   ④ 接續後再下一手 ⇒ 存檔變 5 手(接續回來的棋局是「活的」,不是唯讀畫面)
 *   ⑤ ★★ 迴歸:載入一份**已下完**的分享棋譜 ⇒ 勝場數**不可以**變(這是接續之前就存在的計分污染 bug)
 *   ⑥ 已分勝負的存檔 ⇒ 不提供接續(結算時也會存檔,接回來只會看到一盤下完的棋)
 *   ⑦ 全程 console 沒有 error / pageerror
 * ★ 點交點用 el.click()(邏輯冒煙),不用座標 —— 見 skill canvas-playwright-verify「裸座標」那一條。
 */
import { pathToFileURL } from "node:url";

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

const resumeVisible = () => page.$eval("#resumeBtn", el => !el.hidden && el.offsetParent !== null);
const resumeText = () => page.$eval("#resumeBtn", el => el.textContent.trim());
const statusText = () => page.$eval("#status", el => el.textContent.trim());
const session = () => page.evaluate(() => { try { return JSON.parse(localStorage.getItem("gomoku.session")); } catch { return null; } });
const readStats = () => page.evaluate(() => { try { return JSON.parse(localStorage.getItem("gomoku.stats")) || {}; } catch { return {}; } });
const stones = () => page.$$eval(".intersection", els => els
  .map(e => { const s = e.querySelector(".stone"); return s ? { r: +e.dataset.row, c: +e.dataset.col, color: s.classList.contains("black") ? "black" : "white" } : null; })
  .filter(Boolean));

async function clickCell(r, c) {
  await page.$eval(`.intersection[data-row="${r}"][data-col="${c}"]`, el => el.click());
  await sleep(90);
}
async function setPvp() {
  await page.selectOption("#modeSelect", "pvp");
  await sleep(120);
}

console.log(`\n♟ 接續上一盤冒煙 — ${BASE}\n`);

/* ── ① 全新裝置:沒有存檔就不該出現那顆鈕 ───────────────── */
await page.goto(BASE, { waitUntil: "load" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "load" });
await sleep(250);
check(!(await resumeVisible()), "① 全新裝置(無存檔):接續鈕看不到");

/* ── ② 下 4 手 → 重新整理 → 鈕要出現且手數正確 ───────────── */
await setPvp();
const MOVES = [[7, 7], [8, 8], [7, 8], [8, 7]];
for (const [r, c] of MOVES) await clickCell(r, c);
const s4 = await session();
check(s4 && s4.history.length === 4 && s4.mode === "pvp", "② 下完 4 手:gomoku.session 寫進 4 手(pvp)");

await page.reload({ waitUntil: "load" });
await sleep(300);
check(await resumeVisible(), "② 重新整理後:接續鈕出現了");
check((await resumeText()).includes("第 4 手"), `② 鈕上寫著手數 — 實際「${await resumeText()}」`);
check((await stones()).length === 0, "② 但棋盤還是空的(不自動套用,由使用者決定)");

/* ── ③ 按下去:棋局真的回來了 ─────────────────────────── */
await page.click("#resumeBtn");
await sleep(400);
const back = await stones();
check(back.length === 4, `③ 接續後盤上 4 顆 — 實際 ${back.length} 顆`);
const same = MOVES.every(([r, c], i) =>
  back.some(s => s.r === r && s.c === c && s.color === (i % 2 === 0 ? "black" : "white")));
check(same, "③ 四顆的座標與黑白都對");
// 下了 4 手 ⇒ 第 5 手是黑(moveHistory.length % 2 === 0 → black),別寫成白棋
check((await statusText()).includes("黑棋"), `③ 輪回黑棋(第 5 手) — 實際「${await statusText()}」`);
check(!(await resumeVisible()), "③ 接續後鈕自己收起來(不會按第二次)");

/* ── ④ 接回來的是「活的」棋局,不是唯讀畫面 ───────────────── */
await clickCell(6, 6);
const s5 = await session();
check(s5 && s5.history.length === 5, `④ 接續後還能繼續下,存檔變 5 手 — 實際 ${s5 ? s5.history.length : "null"}`);

/* ── ⑤ ★★ 迴歸:載入已下完的分享棋譜不可以偷加勝場 ───────── */
await page.evaluate(() => localStorage.clear());
await page.goto(BASE, { waitUntil: "load" });
await sleep(200);
const before = await readStats();
// 黑棋 (7,3)…(7,7) 連五;白棋擺在完全無關的另一區,不會提前成五
const blackWin = [[7, 3], [7, 4], [7, 5], [7, 6], [7, 7]];
const whiteFill = [[0, 0], [0, 2], [0, 4], [0, 6], [0, 8]];
const share = await page.evaluate(({ b, w }) => {
  const m = [];
  for (let i = 0; i < b.length; i++) { m.push(b[i]); if (w[i]) m.push(w[i]); }
  const data = { s: 15, m };
  return "#share=" + btoa(unescape(encodeURIComponent(JSON.stringify(data))));
}, { b: blackWin, w: whiteFill });

await page.goto(BASE + share, { waitUntil: "load" });
// ⚠ 從 BASE 跳到 BASE#share=... 是「同文件 hash 跳轉」,不會重新執行 script.js
//    ⇒ 不 reload 的話 maybeLoadFromUrl() 根本沒跑,底下那條最關鍵的斷言會**假綠**。
await page.reload({ waitUntil: "load" });
await sleep(700);
const after = await readStats();
const loaded = await stones();
const winCells = await page.$$eval(".intersection.winning", els => els.length);
// 黑棋第 9 手就連五 ⇒ maybeLoadFromUrl 的迴圈 break,第 10 手(白)不會下 ⇒ 9 顆才是對的
check(loaded.length === 9, `⑤ 分享棋譜真的載進來了 — 盤上 ${loaded.length} 顆(黑 5 白 4,第 9 手成五後停)`);
check(winCells === 5, `⑤ 而且是「已分勝負」— 連五格 ${winCells} 個(應 5)`);
check((after.black || 0) === (before.black || 0) && (after.white || 0) === (before.white || 0),
  `⑤ ★★ 勝場數沒有被偷加(這是修掉的舊 bug) — 黑 ${before.black || 0}→${after.black || 0} / 白 ${before.white || 0}→${after.white || 0}`);
check(!(await resumeVisible()), "⑥ 已分勝負的棋局不提供接續");

/* ── ⑦ console 乾淨 ──────────────────────────────────── */
check(errors.length === 0, `⑦ console 無 error${errors.length ? " — " + errors.slice(0, 3).join(" | ") : ""}`);

await browser.close();
console.log(failures === 0 ? `\n🟢 接續冒煙全過\n` : `\n🔴 ${failures} 項失敗\n`);
process.exit(failures === 0 ? 0 : 1);
