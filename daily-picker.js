/* daily-picker.js — 每日挑戰「今天這一組是哪三題」(純函式,瀏覽器 / Node / 測試共用)
 *
 * daily-puzzle-kit §十一「兩層」:📅 每日一組(儀式:全世界同一組、全破才記一天)+ 🧩 練功房(殘局解謎,無限)。
 * 同一天、任何裝置、任何時區內的同一個「本地日期」→ 同一組三題;沒有後端。
 *   日期字串(本地,YYYY-MM-DD)→ FNV-1a → 線性同餘亂數 → 三段階梯各抽一題(暖身 / 標準 / 挑戰),不重複。
 * ⚠ 舊版 dateSeed 用 `${y}${getMonth()}${getDate()}` 不補零:2 月 11 日與 12 月 1 日都是 "2026111",會撞題。
 */

export const DAILY_LADDER = [
  { label: "暖身", tiers: [1, 2] },
  { label: "標準", tiers: [2, 3] },
  { label: "挑戰", tiers: [3, 4] },
];
export const DAILY_KEEP_DAYS = 60;

export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function seededRandom(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** 本地日期鍵 YYYY-MM-DD(補零) */
export function dailyKey(date = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/** key 往前/後 n 天 */
export function shiftKey(key, days) {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return dailyKey(dt);
}

/**
 * 今天這一組:[{ index, id, label }],依 DAILY_LADDER 順序;三題互不重複。
 * 某一段沒有符合 tier 的題就退回「任何還沒用過的題」,題庫少於 3 題就回傳有幾題算幾題。
 */
export function pickDailySet(puzzles, key) {
  const rnd = seededRandom(fnv1a("chess5-daily|" + key));
  const used = new Set();
  const out = [];
  for (const step of DAILY_LADDER) {
    let pool = [];
    puzzles.forEach((p, i) => { if (!used.has(i) && step.tiers.includes(p.tier)) pool.push(i); });
    if (!pool.length) puzzles.forEach((p, i) => { if (!used.has(i)) pool.push(i); });
    if (!pool.length) break;
    const i = pool[Math.floor(rnd() * pool.length)];
    used.add(i);
    out.push({ index: i, id: puzzles[i].id, label: step.label });
  }
  return out;
}
