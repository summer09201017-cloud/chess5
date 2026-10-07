#!/usr/bin/env node
/**
 * smoke-pet.mjs —— 🐾 動物對手真瀏覽器冒煙(v32,skill animal-opponent-kit 第五節驗收法的 CSS 棋盤版)
 *   node scripts/smoke-pet.mjs                                   # 本機(自起 http 8768)
 *   BASE=https://5-chess.pages.dev/ node scripts/smoke-pet.mjs   # 線上
 * 驗:誰坐(四檔 + 殘局 🦉 + 雙人不坐)、小窗在棋盤上方且不擋點擊、頭在小窗裡、想棋 / 閒聊事件真的接到、
 *     36 句 mp3 都在、手機直向不溢出、零 JS 錯誤;截圖存 scripts/out/pet-*.png(不進版控)。
 */
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
/* 🔎 借別的 repo 的 playwright(本 repo 不裝;同 smoke-dice.mjs) */
const PW_CANDIDATES = [
  process.env.PLAYWRIGHT_PATH,
  path.join(os.homedir(), "Desktop/hfpc-sparks-hub/node_modules/playwright/index.mjs"),
  path.join(os.homedir(), "Downloads/hfpc-git/checkers/node_modules/playwright/index.mjs"),
  path.join(os.homedir(), "Desktop/hfpc-claude-skills/node_modules/playwright/index.mjs"),
].filter(Boolean);
const PW = PW_CANDIDATES.find((p) => fs.existsSync(p));
if (!PW) { console.error("❌ 找不到 playwright。試過:\n     " + PW_CANDIDATES.join("\n     ")); process.exit(1); }
const { chromium } = await import(pathToFileURL(PW).href);
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".png": "image/png", ".webmanifest": "application/manifest+json", ".json": "application/json", ".svg": "image/svg+xml", ".mp3": "audio/mpeg" };

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
  await new Promise((r) => server.listen(8768, "127.0.0.1", r));
  BASE = "http://127.0.0.1:8768/";
}

const results = [];
const check = (c, n, d = "") => results.push([c ? "🟢" : "🔴", n, d]);
let browser = null;
for (const channel of ["msedge", "chrome"]) {
  try { browser = await chromium.launch({ channel, headless: true }); break; } catch { /* 換下一個 */ }
}
browser ||= await chromium.launch();
fs.mkdirSync(path.join(ROOT, "scripts/out"), { recursive: true });
const shot = (page, name) => page.screenshot({ path: path.join(ROOT, "scripts/out", `pet-${name}.png`) });

async function open(viewport) {
  const ctx = await browser.newContext({ viewport, serviceWorkers: "block" });
  await ctx.addInitScript(() => { try { if (!sessionStorage.getItem("__pet_init")) { localStorage.clear(); sessionStorage.setItem("__pet_init", "1"); } } catch { /* 私密模式 */ } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/peerjs|favicon|play-stats|Failed to load resource/i.test(m.text())) errs.push(m.text()); });
  await page.goto(BASE, { waitUntil: "load" });
  await page.waitForFunction(() => window.__pet && window.__pet.pet, null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(900);
  return { ctx, page, errs };
}
const probe = (page) => page.evaluate(() => { const p = window.__pet && window.__pet.pet; return p ? p.probe() : null; });
const boardRect = (page) => page.evaluate(() => { const r = document.getElementById("board3d").getBoundingClientRect(); return { t: r.top, l: r.left, r: r.right, b: r.bottom }; });

/* ── 桌機 ── */
{
  const { ctx, page, errs } = await open({ width: 1400, height: 1000 });
  check(await page.evaluate(() => !!(window.__pet && window.__pet.pet)), "動物對手載入(three CDN + import map + dynamic import)");
  let pr = await probe(page);
  check(pr && pr.kind === "cat" && pr.visible, "普通 ⇒ 🐱 坐著、看得到", JSON.stringify(pr && { kind: pr.kind, visible: pr.visible }));
  check(pr && pr.placement === "top", "小窗放在棋盤正上方", pr && pr.placement);
  check(pr && pr.head && pr.head.inside, "頭頂在小窗裡(沒被切掉)", pr && JSON.stringify(pr.head));
  check(pr && pr.canvas.h >= 64, "小窗夠大(≥64px)", pr && `${pr.canvas.w}×${pr.canvas.h}`);
  const br = await boardRect(page);
  check(pr && pr.headBox.b <= br.t + 40, "臉在棋盤上緣以上(不壓在格子上)", pr && `頭底 ${pr.headBox.b} / 盤頂 ${Math.round(br.t)}`);
  const hit = await page.evaluate(() => {
    const pts = [...document.querySelectorAll(".intersection")];
    const n = Math.round(Math.sqrt(pts.length)); const el = pts[Math.floor(n / 2)];
    const r = el.getBoundingClientRect(); const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { ok: !!at && (at === el || el.contains(at)), at: at && (at.id || at.className) };
  });
  check(hit.ok, "最上排交叉點點得到(小窗不擋)", JSON.stringify(hit));
  await shot(page, "desktop-cat");

  for (const [lv, kind] of [["easy", "rabbit"], ["hard", "bear"], ["master", "owl"], ["normal", "cat"]]) {
    await page.selectOption("#aiLevel", lv); await page.waitForTimeout(150);
    pr = await probe(page);
    check(pr && pr.kind === kind, `難度 ${lv} ⇒ ${kind}`, pr && pr.kind);
  }
  const t0 = await page.evaluate(() => window.__pet.pet.thinkCount);
  await page.evaluate(() => { const pts = [...document.querySelectorAll(".intersection")]; pts[Math.floor(pts.length / 2)].click(); });
  await page.waitForFunction(() => document.querySelectorAll(".stone").length >= 2, null, { timeout: 8000 }).catch(() => {});
  const t1 = await page.evaluate(() => window.__pet.pet.thinkCount);
  check(t1 === t0 + 1, "你下一手 ⇒ 電腦想棋時牠托腮(think 接到)", `${t0}→${t1}`);
  const stones = await page.evaluate(() => document.querySelectorAll(".stone").length);
  check(stones === 2, "電腦有回一手", `盤上 ${stones} 子`);
  await page.waitForTimeout(300);
  await page.evaluate(() => { const c = window.__pet.pet.chat; c.first = 300; c.every = 300; c.idleMs = 0; c.said = 0; c.log.length = 0; });
  await page.waitForTimeout(1600);
  const chat = await page.evaluate(() => ({ log: [...window.__pet.pet.chat.log], waiting: window.__pet.pet.waiting }));
  check(chat.waiting && chat.log.length === 2, "輪到你發呆 ⇒ 說「該你了」(一回合最多兩句)", JSON.stringify(chat));

  await page.selectOption("#modeSelect", "pvp"); await page.waitForTimeout(300);
  pr = await probe(page);
  const petOn = await page.evaluate(() => document.body.classList.contains("pet-on"));
  check(pr && !pr.on && !petOn, "本機雙人 ⇒ 不坐、棋盤不讓位", JSON.stringify({ on: pr && pr.on, petOn }));
  await page.selectOption("#modeSelect", "puzzle"); await page.waitForTimeout(600);
  pr = await probe(page);
  check(pr && pr.kind === "owl" && pr.visible, "殘局解謎 ⇒ 🦉 陪解", pr && pr.kind);
  await shot(page, "desktop-puzzle-owl");

  await page.selectOption("#modeSelect", "pve"); await page.waitForTimeout(300);
  await page.click('#petRow .pet-opt[data-pet="off"]'); await page.waitForTimeout(200);
  pr = await probe(page);
  check(pr && !pr.on && await page.evaluate(() => document.getElementById("petCanvas").hidden), "選「關」⇒ 小窗藏起來");
  check(await page.evaluate(() => localStorage.getItem("chess5-pet")) === "off", "選擇記住(localStorage chess5-pet)");
  await page.click('#petRow .pet-opt[data-pet="voice"]'); await page.waitForTimeout(200);
  await page.click("#viewModeBtn"); await page.waitForTimeout(700);
  pr = await probe(page);
  check(pr && pr.visible && pr.head.inside, "2D 平面也坐得好", pr && pr.placement);
  await shot(page, "desktop-2d");

  const voiceOk = await page.evaluate(async () => {
    const { VOICE_FILES } = await import("./js/voicePhrases.js");
    const m = await (await fetch("voice/manifest.json")).json();
    const miss = [];
    for (const f of VOICE_FILES) { const r = await fetch("voice/" + f); if (!r.ok) miss.push(f); }
    return { n: VOICE_FILES.length, keys: Object.keys(m).length, miss };
  });
  check(voiceOk.n === 36 && voiceOk.keys === 36 && !voiceOk.miss.length, "36 句人聲 mp3 都在、manifest 對得上", JSON.stringify(voiceOk));
  const MACHINE = ["speech", "Synthesis"].join("");   // 拆開寫:這行是在「檢查沒有」,別讓 scripture-voice-guard 誤判
  const noMachine = await page.evaluate(async (w) => !((await (await fetch("js/voice.js")).text()) + (await (await fetch("js/opponent.js")).text())).includes(w), MACHINE);
  check(noMachine, "人聲沒有瀏覽器機器聲");
  check(!errs.length, "桌機零 JS 錯誤", errs.slice(0, 3).join(" | "));
  await ctx.close();
}

/* ── 手機直向 ── */
{
  const { ctx, page, errs } = await open({ width: 390, height: 844 });
  const pr = await probe(page);
  check(pr && pr.on, "手機直向:有坐", pr && pr.placement);
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(ov <= 1, "手機直向沒有橫向捲動", `溢出 ${ov}px`);
  if (pr && pr.visible) {
    const br = await boardRect(page);
    check(pr.headBox.b <= br.t + 30, "手機:臉不壓在棋盤格子上", `頭底 ${pr.headBox.b} / 盤頂 ${Math.round(br.t)}`);
  }
  await page.evaluate(() => document.getElementById("board3d").scrollIntoView({ block: "center" }));
  await page.waitForTimeout(500);
  await shot(page, "mobile");
  check(!errs.length, "手機零 JS 錯誤", errs.slice(0, 3).join(" | "));
  await ctx.close();
}

await browser.close();
if (server) server.close();
for (const [c, n, d] of results) console.log(`  ${c} ${n}${d ? "  — " + d : ""}`);
const bad = results.filter((r) => r[0] === "🔴").length;
console.log(bad ? `\n❌ 🐾 冒煙 ${bad} 紅 / ${results.length}` : `\n✅ 🐾 冒煙 ${results.length} 項全過`);
process.exit(bad ? 1 : 0);
