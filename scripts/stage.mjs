#!/usr/bin/env node
/**
 * 產生乾淨的部署目錄 .deploy/
 *
 * 這裡是「哪些檔案會上線」的**單一真相之源**——CI 與本機 `npm run deploy` 都吃這一份,
 * 避免兩邊各自維護一張清單而漂移。
 *
 * 刻意不部署:.git / .github / .wrangler / tests / scripts / node_modules /
 *            package.json / *.md / 讀我-HANDOFF.txt / docs
 * (它們對玩家沒用。舊的 Netlify 站因為直接發佈 repo 根目錄,曾把 package.json 與
 *  tests/ 公開供檔——那不是外洩,但沒必要。)
 */
import { readdirSync, readFileSync, cpSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, ".deploy");

const SITE_FILES = [
  "index.html",
  "style.css",
  "script.js",
  "game-rules.js",
  "manifest.webmanifest",
  "service-worker.js",
  "icons",
];

const missing = SITE_FILES.filter((f) => !existsSync(join(ROOT, f)));
if (missing.length) {
  console.error("🛑 缺少要部署的檔案:", missing.join(", "));
  process.exit(1);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
for (const f of SITE_FILES) cpSync(join(ROOT, f), join(OUT, f), { recursive: true });

// service-worker.js 的 CORE_ASSETS 每一項都必須真的在部署目錄裡,
// 否則安裝時 cache.addAll 會整批失敗 → PWA 靜默地不再離線可玩。
const swText = readFileSync(join(OUT, "service-worker.js"), "utf8");
const coreBlock = swText.match(/CORE_ASSETS\s*=\s*\[([\s\S]*?)\]/);
const core = coreBlock
  ? [...coreBlock[1].matchAll(/"\.\/([^"]*)"/g)].map((m) => m[1]).filter(Boolean)
  : [];
const notShipped = core.filter((p) => !existsSync(join(OUT, p)));
if (notShipped.length) {
  console.error("🛑 service-worker.js 的 CORE_ASSETS 有檔案不在部署目錄裡:", notShipped.join(", "));
  process.exit(1);
}

let count = 0;
(function walk(p) {
  for (const e of readdirSync(p, { withFileTypes: true })) {
    if (e.isDirectory()) walk(join(p, e.name));
    else count++;
  }
})(OUT);

console.log(`✅ .deploy/ 已備妥:${count} 個檔案(SW CORE_ASSETS ${core.length} 項全部到齊)`);
