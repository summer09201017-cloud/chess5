import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = new URL("..", import.meta.url);
const rootPath = fileURLToPath(root);
const read = (path) => readFileSync(new URL(path, root), "utf8");

const index = read("index.html");
const manifest = JSON.parse(read("manifest.webmanifest"));
const serviceWorker = read("service-worker.js");
const readme = read("README.md");
const gitignore = read(".gitignore");
const style = read("style.css");
const script = read("script.js");

assert.match(index, /<title>3D 五子棋<\/title>/);
assert.match(index, /<script type="module" src="script\.js"><\/script>/);
assert.equal(manifest.name, "3D 五子棋");
assert.match(serviceWorker, /game-rules\.js/);
assert.match(serviceWorker, /gomoku-pwa-v16/);
// 解謎題庫、解題器、每日抽題器都是 script.js 的 import ⇒ 必須進 SW 快取,否則離線開解謎會整個模組載入失敗(白畫面)
assert.match(serviceWorker, /"\.\/puzzle-solver\.js"/);
assert.match(serviceWorker, /"\.\/puzzles\.js"/);
assert.match(serviceWorker, /"\.\/daily-picker\.js"/);
assert.match(script, /from "\.\/puzzles\.js"/);
assert.match(script, /from "\.\/puzzle-solver\.js"/);
assert.match(script, /from "\.\/daily-picker\.js"/);
// 解謎面板四顆鈕 + 進度行(2026-09-02 重做:步數限制、最強防守、答錯判負可重試、分級與進度)
for (const id of ["puzzleSelect", "puzzleStart", "puzzleNext", "puzzleHintBtn", "puzzleShare", "puzzleProgress", "puzzleHint", "puzzleStars"]) {
  assert.match(index, new RegExp(`id="${id}"`), `index.html 缺 #${id}`);
}
// 每日挑戰面板(2026-09-03 改題庫制:每天一組 3 題階梯、全世界同一組、全破才記一天)
for (const id of ["dailyLine", "dailyStart", "dailyNext", "dailyRetry", "dailyHintBtn", "dailyHint", "dailyStars"]) {
  assert.match(index, new RegExp(`id="${id}"`), `index.html 缺 #${id}`);
}
// 每日模式不進 gomoku.session(存檔是「重播棋譜」,自訂起手會重建出別的局面 —— daily-puzzle-kit §四)
assert.match(script, /if \(isPuzzleMode\(\) \|\| mode === "online"\) return;/);
// 舊的每日挑戰(跟 hard AI 下一局、步數金銀銅)已拆掉,不准復活
assert.doesNotMatch(script, /handleDailyHumanMove/);
assert.doesNotMatch(script, /function dateSeed/);
// 解謎不准借對局 AI 的難度檔當對手(hard 會故意犯錯、還帶隨機)—— 對手一律走解題器的最頑強防守。
// 只看第 19 節:每日挑戰(第 20 節)的對手用 hard 是刻意的難度設計,不在此限。
const puzzleSection = script.slice(script.indexOf("19. 殘局解謎"), script.indexOf("20. 每日挑戰"));
assert.ok(puzzleSection.length > 1000, "找不到解謎那一節");
assert.doesNotMatch(puzzleSection, /chooseAiMove\(/);
assert.match(puzzleSection, /puzzleBestDefence\(boardState, BOARD_SIZE/);
// 解謎模式的悔棋/重做不能變成無限試錯
assert.match(script, /if \(replayIndex !== null \|\| isPuzzleMode\(\)\) return;/);

/* 💡 提示必須用 master 檔位,不可以用 hard。
   hard 是 { randomTop: 2, mistake: 0.03 } ⇒ 從前兩名隨機挑(按兩次會跳針)、
   而且有 3% 機率**故意**挑一步更差的。對手該不該犯錯是難度設計,提示不該 ——
   提示是玩家問「最好怎麼走」的答案。這一條就是釘死不准改回去。 */
assert.match(script, /chooseAiMove\(AI_LEVELS\.master, currentPlayer\)/);
assert.doesNotMatch(script, /const config = AI_LEVELS\.hard;\s*\n\s*const move = chooseAiMove/);
// 同局面按兩次要回同一手 ⇒ 一定要有快取那條路
assert.match(script, /hintCache && hintCache\.key === key/);
assert.match(gitignore, /\.claude\//);
assert.match(readme, /npm run verify/);
assert.match(style, /\.intersection\.last-move::after/);
assert.match(style, /body\[data-skin="cat"\] \.stone::before/);
assert.match(style, /--board-thickness/);
assert.match(style, /--stone-size/);
assert.doesNotMatch(style, /\.stone[\s\S]*?transform:\s*translateZ/);
assert.match(style, /width:\s*100vw/);
assert.match(style, /perspective:\s*none/);
assert.match(style, /\.stone[\s\S]*?filter:\s*none/);
assert.match(style, /\.stone[\s\S]*?box-shadow:\s*none/);
assert.doesNotMatch(style, /drop-shadow/);
assert.match(script, /function refreshZoomLimit/);
assert.match(script, /mobile \? 1\.00 : 1\.45/);
assert.equal(existsSync(join(rootPath, "docs", "screenshot.png")), true);

// ── 接續上一盤(2026-09-04):gomoku.session 的讀取半邊 ──
assert.match(index, /id="resumeBtn"/, 'index.html 缺 #resumeBtn(接續上一盤那顆鈕)');
assert.match(index, /id="resumeBtn"[^>]*hidden/, '#resumeBtn 預設要 hidden —— 沒棋局可接時不要擋路');
// UA 的 [hidden] 選擇器比 .action-row button 弱,少了這行鈕永遠藏不掉(地雷 1 同族)
assert.match(style, /\.action-row button\[hidden\]/);
// ★★ 重播守門:沒有它,分享連結/匯入棋譜載入已分勝負的棋譜會讓勝場數加一(2026-09-04 前就存在的 bug)
assert.match(script, /if \(replaying\) return;/);
assert.match(script, /if \(!replaying\) \{ playClick\(\); showCommentary/);
assert.match(script, /placeStone\(row, col, color, !replaying\)/);
// 兩條重播路徑都要走 replaySilently,不可以再直接裸呼叫 commitMove 迴圈
assert.match(script, /function replaySilently/);
assert.equal((script.match(/replaySilently\(/g) || []).length, 4, 'replaySilently 應為 1 個定義 + 3 個呼叫(匯入棋譜、分享連結、接續上一盤)');
// ⚠ RESUMABLE_SIZES 必須宣告在 offerResume() 被呼叫(開機 ~148 行)之前,否則是 TDZ ReferenceError
//   —— 這個錯 npm test 完全看不到,只有真瀏覽器會炸;2026-09-04 實際踩過一次
assert.ok(script.indexOf('const RESUMABLE_SIZES') < script.indexOf('offerResume();'),
  'RESUMABLE_SIZES 要宣告在 offerResume() 呼叫之前(const 不會像 function 那樣提升到可用)');
// 開機那行「黑棋先手」不可以無條件蓋掉分享棋譜載好的狀態
assert.match(script, /if \(moveHistory\.length === 0\) updateStatus\(`黑棋先手/);

console.log("static tests passed");
