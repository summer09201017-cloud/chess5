#!/usr/bin/env node
/**
 * smoke-ai.mjs — 大師檔 + 💡 提示 真瀏覽器冒煙(Playwright,借 Desktop/hfpc-sparks-hub 的;不在 npm test 裡)
 *
 *   node scripts/smoke-ai.mjs                          # 自己起本機靜態站(port 8766)
 *   BASE=https://5-chess.pages.dev/ node scripts/smoke-ai.mjs   # 線上
 *   LEVEL=hard node scripts/smoke-ai.mjs                        # 困難檔(預設 master);兩檔都要跑一次
 *
 * 驗的是「人玩得到」不是「函式會動」(evaluate-not-click-guard):
 *   ① 選大師、人執黑,真的**點**交點落子 → 電腦在 6 秒內回一手(狀態列有「大師」字樣)
 *      ⚠ 別把這個上限收緊:大師的等待 = 引擎(budgetMs 上限 2s)+ 最短可見思考 minThinkMs(0.24s)⇒ 最壞約 2.3 秒(v23 砍掉 thinkDelay 前是 2.9 秒)。
 *        ★ 這個 6 秒是「有沒有回手」的保險,不是效能指標;HFP 機比 agape250 慢,收緊會在慢機器上假紅。
 *   ② 連下三手把黑棋做成活三(電腦每手都回)→ 電腦的回手要讓黑棋做不出活四(擋或反衝四)
 *   ③ 按 💡 提示 → 氣泡出現「建議:XX(理由)」而且有一格亮 .hint-spot
 *   ④ 全程 console 沒有 error / pageerror
 * ★ 點交點用 locator.click()(不可見就會失敗),不用座標——見 skill canvas-playwright-verify「裸座標」那一條。
 */
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { defenderOptions } from "../puzzle-solver.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
/* 🔎 借別的 repo 的 playwright(本 repo 不裝)。★ 兩台機的家目錄與 clone 位置都不同 ⇒ 不可以寫死一條路徑:
   0906 實錄:原本只寫死 agape250 的路徑,在 HFP 機上這個檔根本不存在 ⇒ 冒煙腳本一跑就炸,
   而它是「上線前唯一的真瀏覽器關卡」⇒ 等於那台機的人只能跳過它。改成依序試,找不到才報清楚要怎麼指定。 */
const PW_CANDIDATES = [
  process.env.PLAYWRIGHT_PATH,
  path.join(os.homedir(), "Desktop/hfpc-sparks-hub/node_modules/playwright/index.mjs"),
  path.join(os.homedir(), "Downloads/hfpc-git/checkers/node_modules/playwright/index.mjs"),
  path.join(os.homedir(), "Desktop/hfpc-claude-skills/node_modules/playwright/index.mjs"),
].filter(Boolean);
const PW = PW_CANDIDATES.find((p) => fs.existsSync(p));
if (!PW) {
  console.error("❌ 找不到 playwright。這個 repo 不裝它,是跟別的 repo 借的。");
  console.error("   試過:\n     " + PW_CANDIDATES.join("\n     "));
  console.error("   指定路徑再跑:PLAYWRIGHT_PATH=<...>/node_modules/playwright/index.mjs node scripts/smoke-ai.mjs");
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
  const LEVEL = process.env.LEVEL || "master";
  await page.selectOption("#aiLevel", LEVEL);
  // 🧵 主執行緒有沒有凍:rAF 兩幀最大間隔(引擎搬進 Worker 前,大師一手會凍 ~0.9 秒)
  await page.evaluate(() => { window.__maxGap = 0; let last = performance.now(); const tick = (t) => { window.__maxGap = Math.max(window.__maxGap, t - last); last = t; requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
  await page.check('input[name="playerColor"][value="black"]');
  await page.click("#resetBtn");
  await page.waitForTimeout(300);
  /* ★ 量測窗從「第一手」開始,不含前面的暖機期(reset 重建棋盤 + SW 安裝與 14 個資產預快取)。
     0906 深夜線上實錄:同一份程式 ⑥ 量到 833 / 417 / 333 / 283 / 150ms 忽紅忽綠,時間軸探針一看,
     尖峰全落在 reset 那段(舊版 v22 甚至更大:333 / 217 / 367ms),跟電腦思考一點關係都沒有 ——
     這條守門自稱量「電腦思考時主執行緒會不會凍」,量到的卻是「這次 CDN 與 SW 暖機多快」。
     暖機期的卡頓要管是另一條守門的事,不該讓它把這條變成擲骰子。 */
  await page.evaluate(() => { window.__maxGap = 0; });

  const gameOver = () => page.evaluate(() => !!document.querySelector("dialog[open]") || /勝|贏|和局|超時/.test(document.getElementById("status").textContent));

  // ① 第一手 + 電腦回手
  let m = await humanMove(7, 7);
  (m.after === 2) ? ok("① 人落第一手後電腦回一手", `${m.dt}ms`) : bad("① 電腦沒回手", `子數 ${m.before}→${m.after}`);
  const st = await page.textContent("#status");
  /大師|困難|你/.test(st || "") ? ok(`① 狀態列有在動(${LEVEL})`, (st || "").trim()) : bad("① 狀態列", st);

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

  // ⑥ 🧵 引擎真的在 Worker 跑 + 主執行緒沒凍(rAF 最大間隔)—— ★ 一定要在 ⑤ 的 reload 之前讀:重載後模組重新初始化成 "sync"、__maxGap 歸零(0906 首跑就這樣假紅)
  const engineMode = await page.evaluate(() => window.__aiEngineMode);
  engineMode === "worker" ? ok("⑥ 引擎在 Web Worker 跑", engineMode) : bad("⑥ 引擎沒進 Worker(退回同步)", String(engineMode));
  const maxGap = Math.round(await page.evaluate(() => window.__maxGap || 0));
  maxGap < 400 ? ok("⑥ 電腦思考時主執行緒沒凍(rAF 最大間隔 < 400ms)", maxGap + "ms") : bad("⑥ 主執行緒有凍", maxGap + "ms");

  // ⑤ 🏷 版本號兩件套(鐵則⑦,0906):左欄簡歷版號 == sw;重整一次後右下徽章顯示同一版(SW 接管後才問得到)
  const swTxt = await page.evaluate(async () => { try { return await (await fetch("service-worker.js", { cache: "no-store" })).text(); } catch (_) { return ""; } });
  const swV = (swTxt.match(/gomoku-pwa-v(\d+)/) || [])[1] || "";
  const tagV = await page.evaluate(() => (((document.getElementById("verTag") || {}).textContent || "").match(/版本 v(\d+)/) || [])[1] || "");
  swV && tagV === swV ? ok("⑤ 左欄改版簡歷版號 == sw", "v" + tagV) : bad("⑤ 簡歷版號與 sw 不同", `verTag v${tagV} vs sw v${swV}`);
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => /版本 v\d+/.test((document.getElementById("appVerBadge") || {}).textContent || ""), null, { timeout: 8000 }).catch(() => {});
  const badge = await page.evaluate(() => (document.getElementById("appVerBadge") || {}).textContent || "");
  new RegExp("版本 v" + swV + "[(（]").test(badge) ? ok("⑤ 右下徽章顯示實際執行版本", badge) : bad("⑤ 徽章沒顯示對的版本", badge || "(空)");

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
