#!/usr/bin/env node
/**
 * smoke-dice.mjs — 🎲 擲骰 / 🪙 擲硬幣決定先後 + 悔棋兩個洞 真瀏覽器冒煙(v31;skill dice-coin-toss「驗收」段)
 *
 *   node scripts/smoke-dice.mjs                                   # 自己起本機靜態站(port 8767)
 *   BASE=https://5-chess.pages.dev/ node scripts/smoke-dice.mjs   # 線上
 *
 * ① 點「🎲 擲骰決定」→ 浮層開始鈕出現;每顆骰子畫面朝上的面 == 點數(判定 = 畫面);開始鈕 ≥44px
 * ② 按開始 → 誰先 == humanColor:你先 ⇒ 你執黑、棋盤空著;電腦先 ⇒ 你執白、電腦 6 秒內下第一手
 * ③ 擲骰期間點棋盤不會落子
 * ④ 🪙 擲硬幣:硬幣朝上那面 == dataset.v,開局後執色跟浮層寫的誰先對得上
 * ⑤ 悔棋:執黑 下一手+電腦回 → 悔 ⇒ 空盤、輪到你
 *         執白 下一手+電腦回 → 悔 ⇒ 剩電腦第一手、輪到你;再悔 ⇒ 不動(你還沒下過)
 * ⑥ 重新整理頁面(選著擲骰)⇒ 開頁那一局也擲;⑦ 本機雙人 不擲;⑧ 全程零 pageerror
 * 骰子結果用 addInitScript 換掉 Math.random(只在擲骰那段給指定序列),不碰站內程式。
 * ★ 點選項 / 交點用 locator.click(),不用座標(skill canvas-playwright-verify「裸座標」)。
 */
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
/* 🔎 借別的 repo 的 playwright(本 repo 不裝;同 smoke-ai.mjs,兩台機路徑不同 ⇒ 依序試) */
const PW_CANDIDATES = [
  process.env.PLAYWRIGHT_PATH,
  path.join(os.homedir(), "Desktop/hfpc-sparks-hub/node_modules/playwright/index.mjs"),
  path.join(os.homedir(), "Downloads/hfpc-git/checkers/node_modules/playwright/index.mjs"),
  path.join(os.homedir(), "Desktop/hfpc-claude-skills/node_modules/playwright/index.mjs"),
].filter(Boolean);
const PW = PW_CANDIDATES.find((p) => fs.existsSync(p));
if (!PW) {
  console.error("❌ 找不到 playwright。試過:\n     " + PW_CANDIDATES.join("\n     "));
  console.error("   指定路徑再跑:PLAYWRIGHT_PATH=<...>/node_modules/playwright/index.mjs node scripts/smoke-dice.mjs");
  process.exit(1);
}
const { chromium } = await import(pathToFileURL(PW).href);
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".png": "image/png", ".webmanifest": "application/manifest+json", ".json": "application/json", ".svg": "image/svg+xml" };

let server = null;
let BASE = process.env.BASE;
if (!BASE) {
  server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/") p = "/index.html";
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end("404"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream", "Cache-Control": "no-store" });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => server.listen(8767, "127.0.0.1", r));
  BASE = "http://127.0.0.1:8767/";
}

const results = [];
const check = (c, n, d = "") => results.push([c ? "🟢" : "🔴", n, d]);
/* 借來的 playwright 常跟本機下載好的瀏覽器版本對不上 ⇒ 先用系統裝好的 Edge / Chrome(同 darkchess check-3d),都沒有才用內建的 */
let browser = null;
for (const channel of ["msedge", "chrome"]) {
  try { browser = await chromium.launch({ channel, headless: true }); break; } catch { /* 換下一個 */ }
}
browser ||= await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, serviceWorkers: "block" });
/* 🎲 window.__rigRolls = [0.99, 0.01] ⇒ 接下來兩次 Math.random 依序給這兩個值,用完回到真的亂數 */
await ctx.addInitScript(() => {
  const real = Math.random;
  window.__rigRolls = [];
  Math.random = () => (window.__rigRolls.length ? window.__rigRolls.shift() : real());
});
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
page.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text().slice(0, 160)); });

const stones = () => page.evaluate(() => document.querySelectorAll(".intersection.occupied").length);
const st = () => page.evaluate(() => ({ human: window.__dice.humanColor, choice: window.__dice.colorChoice, tossing: window.__dice.tossing }));
const cell = (r, c) => page.locator(`.intersection[data-row="${r}"][data-col="${c}"]`);
const GO = ".dt-ov .dt-go:not([hidden])";
const radio = (v) => page.locator(`label:has(input[name="playerColor"][value="${v}"])`);

async function pick(value, rig) {
  await page.evaluate((r) => { window.__rigRolls = r.slice(); }, rig || []);
  await radio(value).click();
}
const facesMatch = () => page.evaluate(() => [...document.querySelectorAll(".dt-ov .dt-die, .dt-ov .dt-coin")].map((el) => [String(window.__dice.topFace(el)), String(el.dataset.v)]));
async function goAndSettle(expectHuman) {
  const btn = page.locator(GO);
  const box = await btn.boundingBox();
  check(box && box.height >= 44 && box.width >= 44, "開始鈕 ≥44px", box ? `${Math.round(box.width)}×${Math.round(box.height)}` : "沒有框");
  await btn.click();
  await page.waitForSelector(".dt-ov", { state: "detached", timeout: 5000 }).catch(() => {});
  const s = await st();
  check(s.human === expectHuman && !s.tossing, `開局後你執 ${expectHuman}`, JSON.stringify(s));
  if (expectHuman === "white") {
    await page.waitForFunction(() => document.querySelectorAll(".intersection.occupied").length >= 1, null, { timeout: 6000 }).catch(() => {});
    check((await stones()) === 1, "電腦先 ⇒ 6 秒內下第一手", `子數 ${await stones()}`);
  } else {
    await page.waitForTimeout(600);
    check((await stones()) === 0, "你先 ⇒ 電腦沒有搶下", `子數 ${await stones()}`);
  }
}
async function humanMoveAndReply(r, c) {
  const before = await stones();
  await cell(r, c).click();
  await page.waitForFunction((n) => document.querySelectorAll(".intersection.occupied").length >= n, before + 2, { timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(400);
  return stones();
}

await page.goto(BASE + "?v=" + Date.now());
await page.evaluate(() => { try { localStorage.clear(); } catch {} });
await page.reload();
await page.waitForFunction(() => !!window.__dice, null, { timeout: 10000 });

// ① ② 擲骰:你 6 點、電腦 1 點 ⇒ 你先執黑
await pick("dice", [0.99, 0.01]);
await page.waitForSelector(GO, { timeout: 8000 }).catch(() => {});
let fm = await facesMatch();
check(fm.length === 2 && fm.every(([a, b]) => a === b), "🎲 骰面朝上 == 點數(你先那局)", JSON.stringify(fm));
// ③ 擲骰期間點棋盤不落子。浮層本來就蓋住棋盤(真的點會點到浮層),這裡直接對交點送 click 事件,
//    驗的是 tossing 旗標那一道(浮層被別的東西關掉 / 鍵盤觸發時靠的就是它;突變拿掉會紅)
await cell(7, 7).dispatchEvent("click");
check((await stones()) === 0 && (await st()).tossing, "擲骰期間棋盤不收點");
await goAndSettle("black");
// ⑤ 執黑:下一手+電腦回 → 悔 ⇒ 空盤、還是你
let n = await humanMoveAndReply(7, 7);
await page.click("#undoBtn");
await page.waitForTimeout(300);
check(n === 2 && (await stones()) === 0 && (await st()).human === "black", "執黑 悔棋 ⇒ 空盤、還是你", `悔前 ${n} 子 → ${await stones()}`);

// 重新開始(選著擲骰)⇒ 每局重擲:電腦 6、你 1 ⇒ 電腦先、你執白
await page.evaluate(() => { window.__rigRolls = [0.01, 0.99]; });
await page.click("#resetBtn");
await page.waitForSelector(GO, { timeout: 8000 }).catch(() => {});
fm = await facesMatch();
check(fm.length === 2 && fm.every(([a, b]) => a === b), "🎲 重新開始也重擲、骰面 == 點數(電腦先那局)", JSON.stringify(fm));
await goAndSettle("white");
// ⑤ 執白:下一手+電腦回 → 悔 ⇒ 剩電腦第一手、輪到你;再悔 ⇒ 不動
n = await humanMoveAndReply(6, 6);
await page.click("#undoBtn");
await page.waitForTimeout(400);
check(n === 3 && (await stones()) === 1 && (await st()).human === "white", "執白 悔棋 ⇒ 剩電腦第一手、輪到你", `悔前 ${n} 子 → ${await stones()}`);
await page.click("#undoBtn");
await page.waitForTimeout(400);
check((await stones()) === 1, "執白 你還沒下 ⇒ 悔棋不動", `子數 ${await stones()}`);
n = await humanMoveAndReply(8, 8);
check(n === 3, "悔棋後照樣能下、電腦照樣回", `子數 ${n}`);

// ④ 擲硬幣:只驗「畫面那面 == 結果」且執色跟浮層寫的誰先對得上(不猜正反面對應哪個亂數)
await pick("coin", [0.2]);
await page.waitForSelector(GO, { timeout: 8000 }).catch(() => {});
fm = await facesMatch();
check(fm.length === 1 && fm[0][0] === fm[0][1], "🪙 硬幣朝上那面 == 結果", JSON.stringify(fm));
const youFirst = await page.evaluate(() => /你\s*先/.test(document.querySelector(".dt-ov")?.textContent || ""));
await goAndSettle(youFirst ? "black" : "white");

// ⑥ 重新整理(選著擲骰)⇒ 開頁那一局也擲
await pick("dice", []);
await page.waitForSelector(GO, { timeout: 8000 }).catch(() => {});
await page.locator(GO).click();
await page.evaluate(() => { try { localStorage.removeItem("gomoku.session"); } catch {} });
await page.reload();
await page.waitForFunction(() => !!window.__dice, null, { timeout: 10000 });
const bootToss = await page.waitForSelector(GO, { timeout: 8000 }).then(() => true).catch(() => false);
check(bootToss && (await st()).choice === "dice", "重新整理 ⇒ 選項還是擲骰、開頁那局也擲");
if (bootToss) await page.locator(GO).click();
await page.waitForSelector(".dt-ov", { state: "detached", timeout: 5000 }).catch(() => {});

// ⑦ 本機雙人不擲
await page.selectOption("#modeSelect", "pvp");
await page.waitForTimeout(800);
check((await page.locator(".dt-ov").count()) === 0 && !(await st()).tossing, "本機雙人 ⇒ 不擲");

// ⑧
check(errs.length === 0, "整場零 pageerror / console error", errs.join(" | "));

await browser.close();
if (server) server.close();
for (const [c, name, d] of results) console.log(`${c} ${name}${d ? " — " + d : ""}`);
const red = results.filter((r) => r[0] === "🔴").length;
console.log(`\nsmoke-dice:${results.length - red} 綠 / ${red} 紅(${BASE})`);
process.exit(red ? 1 : 0);
