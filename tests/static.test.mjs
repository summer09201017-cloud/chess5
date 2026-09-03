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
assert.match(serviceWorker, /gomoku-pwa-v13/);
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

console.log("static tests passed");
