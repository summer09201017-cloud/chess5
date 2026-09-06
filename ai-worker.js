/* ai-worker.js — 對局引擎的 Web Worker 殼(0906;module worker)
 *
 * 主執行緒(script.js 第 8b 節 engineMoveAsync)丟 { id, fn:"full"|"defend", board, size, color, opts } 進來,
 * 這裡算完丟 { id, move, error } 回去。引擎本身是純函式(ai-engine.js),這殼不含任何棋的邏輯。
 * Worker 建不起來(舊瀏覽器 / file:)或壞掉時,script.js 會自己在主執行緒同步算——行為一樣,只是畫面會凍那 ~0.9 秒。
 * ★ SW 的 CORE_ASSETS 與 scripts/stage.mjs 的 SITE_FILES 都要有這支(離線時 new Worker 抓不到 = 大師/困難退回同步算,不會壞但會凍)。
 */
import { chooseBestMove, chooseDefensiveMove } from "./ai-engine.js";

self.addEventListener("message", (e) => {
  const { id, fn, board, size, color, opts } = e.data || {};
  let move = null, error = null;
  try {
    move = (fn === "defend" ? chooseDefensiveMove : chooseBestMove)(board, size, color, opts || {});
  } catch (err) {
    error = String((err && err.stack) || err);
  }
  self.postMessage({ id, move, error });
});
