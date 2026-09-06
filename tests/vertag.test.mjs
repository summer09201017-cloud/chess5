// tests/vertag.test.mjs — 守「版本號與改版簡歷」不漂(艦隊鐵則⑦;0906 立,抄 hfpc-joshua-land / hfpc-sparks-hub 的守法)
//
// 由來:index.html 左欄底的 verTag 是**靜態**的,而 service-worker.js 的 CACHE_NAME 每次改版都會 bump。
//   象棋局 0904 實錘:verTag 停在 v2、站上其實 v5,三版改動一個字都沒寫進去,沒有任何測試會紅。
// ⇒ 這支就是那個「人」。不管文案好不好(白話品質只有人能判斷),只守機器驗得出來的事:
//   ①verTag 版號 == sw CACHE_NAME ②前幾版從 vN-1 一路到 v1 不跳號(容許「v4~v1」這種範圖寫法:上線前草稿版控沒紀錄)
//   ③verTag 帶日期 ④摺疊列標題也寫本版 ⑤CLAUDE.md 提到的最新「SW **vN**」同版(文件 drift)⑥徽章三件套(容器 / script.js 問 SW / sw 回答 / 會淡出)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("..", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const html = read("index.html");
const sw = read("service-worker.js");
const script = read("script.js");
const claude = read("CLAUDE.md");

const swV = (sw.match(/CACHE_NAME\s*=\s*"gomoku-pwa-v(\d+)"/) || [])[1];
assert.ok(swV, "service-worker.js 抽得出 CACHE_NAME 版號");

const tag = (html.match(/id="verTag"[^>]*>([\s\S]*?)<\/p>/) || [])[1] || "";
assert.ok(tag.length > 0, "index.html 有 #verTag");
const tagV = (tag.match(/版本 v(\d+)/) || [])[1];
assert.equal(tagV, swV, `★ verTag 版號 == sw CACHE_NAME(改版忘了更新這行 ⇒ 這條紅):verTag v${tagV} vs sw v${swV}`);
assert.match(tag, /版本 v\d+[(（]\d{4}-\d{2}-\d{2}[)）]/, "verTag 帶日期(家長/老師要看得出多新)");
const summary = (html.match(/<details class="ver-fold">\s*<summary>([^<]*)<\/summary>/) || [])[1] || "";
assert.match(summary, new RegExp("版本 v" + swV + "\\b"), "摺疊列標題也寫本版版號:" + summary);

// 前幾版:vN-1 … v1 不跳號、不缺;「vA~vB」展開成 A..B
// ⚠ 每一版的說明文字裡不要再出現「 vN 」(例如「被 v19 取代」),會被當成另一版 —— 0906 首跑就踩到,寫「被下一版取代」。
const after = tag.split(/前幾版[:：]/)[1] || "";
const prev = [];
for (const m of after.matchAll(/(?:^|[・\s])v(\d+)(?:~v(\d+))?\s/g)) {
  const a = Number(m[1]);
  if (m[2] === undefined) prev.push(a);
  else { const b = Number(m[2]); for (let v = a; v >= b; v--) prev.push(v); }
}
assert.ok(prev.length > 0, "有列「前幾版」");
const want = [];
for (let v = Number(swV) - 1; v >= 1; v--) want.push(v);
assert.deepEqual(prev, want, `★ 前幾版 vN-1 → v1 不跳號不缺(跳號 = 有一版沒寫進來):${prev.join(",")} 預期 ${want.join(",")}`);

// 文件不說謊:CLAUDE.md 裡提到的最大 SW **vN** 要等於現在的版
const docVs = [...claude.matchAll(/SW \*\*v(\d+)\*\*/g)].map((m) => Number(m[1]));
assert.ok(docVs.length > 0, "CLAUDE.md 有寫 SW **vN**");
assert.equal(String(Math.max(...docVs)), swV, `CLAUDE.md 最新提到的 SW v${Math.max(...docVs)} != sw v${swV}(文件 drift:改版要順手寫一條)`);

// 徽章三件套:index 只放容器(本站鐵則:index.html 無內嵌 JS),邏輯在 script.js,版號由 SW 回報
assert.match(html, /id="appVerBadge"/, "徽章容器 #appVerBadge 在");
assert.doesNotMatch(html, /appVerBadge[\s\S]{0,400}<script>(?!\s*<\/script>)/, "index.html 不放內嵌 JS(徽章邏輯要在 script.js)");
assert.match(script, /GET_VERSION/, "script.js 有問 SW 拿版本");
assert.match(script, /SW_VERSION/, "script.js 有收 SW_VERSION");
assert.match(sw, /GET_VERSION/, "service-worker.js 有回答 GET_VERSION");
assert.match(sw, /SW_VERSION/, "service-worker.js 回的是 SW_VERSION");
assert.match(script, /appVerBadge[\s\S]{0,900}opacity\s*=\s*["']0["']/, "徽章會淡出(不遮住按鈕的字)");
assert.doesNotMatch(script, /gomoku-pwa-v\d+/, "script.js 不得寫死版號(版號只准住在 service-worker.js)");

console.log(`vertag tests passed(sw v${swV};前幾版 ${prev.length} 版不跳號;CLAUDE.md 同版)`);
