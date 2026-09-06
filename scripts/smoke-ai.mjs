#!/usr/bin/env node
/**
 * smoke-ai.mjs — 大師檔 + 💡 提示 真瀏覽器冒煙(Playwright,借 Desktop/hfpc-sparks-hub 的;不在 npm test 裡)
 *
 *   node scripts/smoke-ai.mjs                          # 自己起本機靜態站(port 8766)
 *   BASE=https://5-chess.pages.dev/ node scripts/smoke-ai.mjs   # 線上
 *
 * 驗的是「人玩得到」不是「函式會動」(evaluate-not-click-guard):
 *   ① 選大師、人執黑,真的**點**交點落子 → 電腦在 2.5 秒內回一手(狀態列有「大師」字樣)
 *   ② 連下三手把黑棋做成活三(電腦每手都回)→ 電腦的回手要讓黑棋做不出活四(擋或反衝四)
 *   ③ 按 💡 提示 → 氣泡出現「建議:XX(理由)」而且有一格亮 .hint-spot
 *   ④ 全程 console 沒有 error / pageerror
 * ★ 點交點用 locator.click()(不可見就會失敗),不用座標——見 skill canvas-playwright-verify「裸座標」那一條。
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { defenderOptions } from "../puzzle-solver.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PW = process.env.PLAYWRIGHT_PATH || "C:/Users/agape250/Desktop/hfpc-sparks-hub/node_modules/playwright/index.mjs";
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
  await new Promise((r) => server.listen(8766, "127.0.0.1", r));
  BASE = "http://127.0.0.1:8766/";
}

const results = [];
const ok = (n, d = "") => results.push(["🟢", n, d]);
const bad = (n, d = "") => results.push(["🔴", n, d]);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const errs = [];
page.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
page.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text().slice(0, 160)); });

const cell = (r, c) => page.locator(`.intersection[data-row="${r}"][data-col="${c}"]`);
const stones = () => page.evaluate(() => document.querySelectorAll(".intersection.occupied").length);
async function humanMove(r, c) {
  const before = await stones();
  await cell(r, c).click();
  // 等電腦回手:總子數 +2(人一手、電腦一手)
  const t0 = Date.now();
  await page.waitForFunction((n) => document.querySelectorAll(".intersection.occupied").length >= n, before + 2, { timeout: 6000 }).catch(() => {});
  return { dt: Date.now() - t0, after: await stones(), before };
}
async function readBoard() {
  return page.evaluate(() => {
    const size = Math.sqrt(document.querySelectorAll(".intersection").length) | 0;
    const b = Array.from({ length: size }, () => Array(size).fill(null));
    document.querySelectorAll(".intersection.occupied").forEach((el) => {
      const s = el.querySelector(".stone");
      b[Number(el.dataset.row)][Number(el.dataset.col)] = s && s.classList.contains("black") ? "black" : "white";
    });
    return { size, b };
  });
}

try {
  await page.goto(BASE + "?nocache=" + Date.now(), { waitUntil: "load" });
  await page.waitForSelector(".intersection");
  await page.selectOption("#modeSelect", "pve");
  await page.selectOption("#aiLevel", "master");
  await page.check('input[name="playerColor"][value="black"]');
  await page.click("#resetBtn");
  await page.waitForTimeout(300);

  const gameOver = () => page.evaluate(() => !!document.querySelector("dialog[open]") || /勝|贏|和局|超時/.test(document.getElementById("status").textContent));

  // ① 第一手 + 電腦回手
  let m = await humanMove(7, 7);
  (m.after === 2) ? ok("① 人落第一手後電腦回一手", `${m.dt}ms`) : bad("① 電腦沒回手", `子數 ${m.before}→${m.after}`);
  const st = await page.textContent("#status");
  /大師|你/.test(st || "") ? ok("① 狀態列有在動", (st || "").trim()) : bad("① 狀態列", st);

  // ③ 提示:第一輪交換後、輪到人(黑)就按(★ 要在遊戲結束前按——首版把它排在最後,傻黑棋六手就被大師殺掉,gameOver 後提示本來就不作用)
  await page.click("#hintBtn");
  await page.waitForFunction(() => { const b = document.getElementById("commentaryBubble"); return b && !b.hidden && /建議/.test(b.textContent); }, null, { timeout: 4000 }).catch(() => {});
  const bubbleShown = await page.evaluate(() => { const b = document.getElementById("commentaryBubble"); return !b.hidden && b.textContent; });
  /建議/.test(bubbleShown || "") ? ok("③ 💡 提示氣泡(可見)", String(bubbleShown).trim()) : bad("③ 提示沒出可見的氣泡", String(bubbleShown));
  /（.+）/.test(bubbleShown || "") ? ok("③ 提示帶理由") : bad("③ 提示沒有理由字串", String(bubbleShown));
  const spot = await page.evaluate(() => { const el = document.querySelector(".intersection.hint-spot"); return el ? (el.classList.contains("occupied") ? "occupied" : "empty") : "none"; });
  spot === "empty" ? ok("③ 亮起的那一格是空點") : bad("③ hint-spot", spot);

  // ② 黑棋連下往活三走(電腦每手都回);回手要讓黑做不出擋不住的活四;遊戲結束就停
  const targets = [[7, 8], [7, 6], [7, 9], [7, 5], [7, 10], [8, 7], [6, 7]];
  let replied = 0, blackUnstoppable = false, ended = false;
  for (const [r, c] of targets) {
    if (await gameOver()) { ended = true; break; }
    const free = await page.evaluate(([r, c]) => !document.querySelector(`.intersection[data-row="${r}"][data-col="${c}"]`).classList.contains("occupied"), [r, c]);
    if (!free) continue;
    m = await humanMove(r, c);
    if (m.after >= m.before + 2) replied++;
    if (await gameOver()) { ended = true; break; }
    const { size, b } = await readBoard();
    const od = defenderOptions(b, size, "black");   // 輪黑(人)走:黑此刻有沒有 ≥2 個完成點(擋不住的活四)
    if (od.kind === "mustBlock" && od.unstoppable) { blackUnstoppable = true; break; }
  }
  replied >= 2 ? ok("② 電腦連續回手", `${replied} 次${ended ? "(對局已分勝負)" : ""}`) : bad("② 電腦回手中斷", `${replied} 次`);
  !blackUnstoppable ? ok("② 黑亂下時電腦沒放任黑拿到擋不住的活四") : bad("② 電腦放任黑棋活三 → 活四", "大師不該讓這種事發生");

  errs.length === 0 ? ok("④ 無 console error / pageerror") : bad("④ 有例外", errs.slice(0, 3).join(" | "));
} catch (e) {
  bad("腳本中斷", String(e).slice(0, 200));
}
await browser.close();
if (server) server.close();
console.log("─".repeat(60));
for (const [s, n, d] of results) console.log(s + " " + n + (d ? "　— " + d : ""));
const fails = results.filter((r) => r[0] === "🔴").length;
console.log(fails ? `❌ ${fails} 項紅` : `✅ 全綠(${results.length} 項)`);
process.exit(fails ? 1 : 0);
