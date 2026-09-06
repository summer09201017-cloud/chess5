#!/usr/bin/env node
/**
 * measure-master-wait.mjs — 量「大師每一手的實際等待」(Playwright 真瀏覽器;不在 npm test 裡)
 *
 *   node scripts/measure-master-wait.mjs                          # 量現在的工作區(起本機站 8767)
 *   OLDJS=<某份 script.js> node scripts/measure-master-wait.mjs    # 同一台機的 A/B:只把 script.js 換成舊版
 *   BASE=https://5-chess.pages.dev/ node scripts/measure-master-wait.mjs   # 量線上
 *
 * 量的是**畫面上的等待**:從「人點下交點」到「電腦的子出現在畫面上」(= 引擎時間 + 任何刻意的停頓),
 * 不是引擎函式的內部耗時 —— 使用者感受到的是前者。順手記 rAF 最大間隔(主執行緒有沒有被凍)與 console 錯誤。
 *
 * ★ 由來(0906 v23):大師原本 thinkDelay 0.42~0.9 秒的「假思考」是**加在引擎之前**,兩段相加。
 *   砍掉之前必須先有這支,否則只能憑「感覺變快了」——同機 A/B 實測中位 1124~1416ms → 535~674ms。
 * ⚠ 只跑一輪不算數:開局書有隨機性,同一組手也會落在不同局面 ⇒ 至少三輪、看中位數的區間。
 * ⚠ 這是「量」不是「測」:不要把它變成有門檻的測試 —— 兩台開發機速度不同(HFP 比 agape250 慢),
 *   有門檻就會在慢的那台假紅(見 tests/ai-engine.test.mjs 那顆 VCT 題的教訓)。
 */
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
/* 🔎 借別的 repo 的 playwright(本 repo 不裝);兩台機的 clone 位置不同 ⇒ 依序試,不寫死一條路徑 */
const PW_CANDIDATES = [
  process.env.PLAYWRIGHT_PATH,
  path.join(os.homedir(), "Downloads/hfpc-git/checkers/node_modules/playwright/index.mjs"),
  path.join(os.homedir(), "Desktop/hfpc-sparks-hub/node_modules/playwright/index.mjs"),
  path.join(os.homedir(), "Desktop/hfpc-claude-skills/node_modules/playwright/index.mjs"),
].filter(Boolean);
const PW = PW_CANDIDATES.find((p) => fs.existsSync(p));
if (!PW) {
  console.error("❌ 找不到 playwright(本 repo 不裝,是跟別的 repo 借的)。試過:\n     " + PW_CANDIDATES.join("\n     "));
  console.error("   指定路徑再跑:PLAYWRIGHT_PATH=<...>/node_modules/playwright/index.mjs node scripts/measure-master-wait.mjs");
  process.exit(1);
}
const { chromium } = await import(pathToFileURL(PW).href);
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".png": "image/png", ".webmanifest": "application/manifest+json", ".json": "application/json", ".svg": "image/svg+xml" };
const OLDJS = process.env.OLDJS ? path.resolve(process.env.OLDJS) : null;
if (OLDJS && !fs.existsSync(OLDJS)) { console.error("❌ OLDJS 指的檔案不存在:" + OLDJS); process.exit(1); }

let server = null;
let BASE = process.env.BASE;
if (!BASE) {
  server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/") p = "/index.html";
    const f = (OLDJS && p === "/script.js") ? OLDJS : path.join(ROOT, p);
    if ((!f.startsWith(ROOT) && f !== OLDJS) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end("404"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream", "Cache-Control": "no-store" });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => server.listen(8767, "127.0.0.1", r));
  BASE = "http://127.0.0.1:8767/";
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const errs = [];
page.on("pageerror", (e) => errs.push(String(e).slice(0, 120)));
page.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text().slice(0, 120)); });
const stones = () => page.evaluate(() => document.querySelectorAll(".intersection.occupied").length);

await page.goto(BASE + "?nocache=" + Date.now(), { waitUntil: "load" });
await page.waitForSelector(".intersection");
await page.selectOption("#modeSelect", "pve");
await page.selectOption("#aiLevel", process.env.LEVEL || "master");
await page.check('input[name="playerColor"][value="black"]');
await page.click("#resetBtn");
await page.waitForTimeout(300);
await page.evaluate(() => { window.__maxGap = 0; let last = performance.now(); const tick = (t) => { window.__maxGap = Math.max(window.__maxGap, t - last); last = t; requestAnimationFrame(tick); }; requestAnimationFrame(tick); });

/* 固定一組人類手(斜線 + 兩翼),讓每輪面對的局面大致同型;電腦回手仍可能分岔 ⇒ 看中位數不看單手 */
const SEQ = [[7, 7], [7, 8], [8, 8], [6, 6], [9, 9], [5, 5], [10, 10], [4, 4], [8, 6], [6, 8]];
const dts = [];
for (const [r, c] of SEQ) {
  const over = await page.evaluate(() => !!document.querySelector("dialog[open]") || /勝|贏|和局|超時/.test(document.getElementById("status").textContent));
  if (over) break;
  const free = await page.evaluate(([r, c]) => {
    const el = document.querySelector('.intersection[data-row="' + r + '"][data-col="' + c + '"]');
    return el && !el.classList.contains("occupied");
  }, [r, c]);
  if (!free) continue;
  const before = await stones();
  const t0 = Date.now();
  await page.locator('.intersection[data-row="' + r + '"][data-col="' + c + '"]').click();
  const replied = await page.waitForFunction((n) => document.querySelectorAll(".intersection.occupied").length >= n, before + 2, { timeout: 8000 }).then(() => true).catch(() => false);
  const dt = Date.now() - t0;
  if (replied) dts.push(dt);
  console.log("  手 " + dts.length + ": " + (replied ? dt + "ms" : "⚠ 8 秒內沒回手"));
}

const maxGap = await page.evaluate(() => Math.round(window.__maxGap));
await browser.close();
if (server) server.close();
if (!dts.length) { console.error("❌ 一手都沒量到"); process.exit(1); }
const s = [...dts].sort((a, b) => a - b);
const med = s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2);
console.log("\nBASE=" + BASE + (OLDJS ? "  (script.js ← " + path.basename(OLDJS) + ")" : ""));
console.log("n=" + dts.length + "  中位 " + med + "ms  平均 " + Math.round(dts.reduce((a, b) => a + b, 0) / dts.length) + "ms  最快 " + s[0] + "ms  最慢 " + s[s.length - 1] + "ms");
console.log("主執行緒 rAF 最大間隔 " + maxGap + "ms   console/page 錯誤 " + errs.length + (errs.length ? " ⇒ " + errs.join(" | ") : ""));
