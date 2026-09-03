import assert from "node:assert/strict";
import { PUZZLES } from "../puzzles.js";
import { pickDailySet, dailyKey, shiftKey, fnv1a, DAILY_LADDER } from "../daily-picker.js";

/* 日期鍵:補零、跨月、跨年 */
assert.equal(dailyKey(new Date(2026, 1, 11)), "2026-02-11");
assert.equal(dailyKey(new Date(2026, 11, 1)), "2026-12-01");
assert.notEqual(fnv1a("2026-02-11"), fnv1a("2026-12-01"), "舊版不補零會把 2/11 與 12/1 撞成同一天");
assert.equal(shiftKey("2026-03-01", -1), "2026-02-28");
assert.equal(shiftKey("2026-12-31", 1), "2027-01-01");

/* 同一 key 兩次一樣(全世界同一組) */
const a = pickDailySet(PUZZLES, "2026-09-03");
const b = pickDailySet(PUZZLES, "2026-09-03");
assert.deepEqual(a, b);
assert.equal(a.length, 3);

/* 未來 400 天逐日驗(daily-puzzle-kit §三 A 型的驗法):三題、不重複、階梯 tier 對、id 對得上題庫 */
const byId = new Map(PUZZLES.map(p => [p.id, p]));
let key = dailyKey(new Date());
const sets = new Set();
for (let d = 0; d < 400; d++) {
  const set = pickDailySet(PUZZLES, key);
  assert.equal(set.length, 3, `${key} 應有 3 題`);
  assert.equal(new Set(set.map(s => s.id)).size, 3, `${key} 三題重複`);
  set.forEach((s, i) => {
    const p = byId.get(s.id);
    assert.ok(p, `${key} 第 ${i + 1} 題 id 不在題庫`);
    assert.equal(PUZZLES[s.index], p, `${key} index 對不上 id`);
    assert.equal(s.label, DAILY_LADDER[i].label);
    assert.ok(DAILY_LADDER[i].tiers.includes(p.tier), `${key} 第 ${i + 1} 題「${s.label}」抽到 tier ${p.tier}`);
  });
  sets.add(set.map(s => s.id).join(","));
  key = shiftKey(key, 1);
}
assert.ok(sets.size >= 380, `400 天裡至少 380 組不同(實得 ${sets.size})——太多重複表示種子沒揉進去`);

/* 題庫太小時不炸:2 題就回 2 題,1 題回 1 題 */
assert.equal(pickDailySet(PUZZLES.slice(0, 2), "2026-09-03").length, 2);
assert.equal(pickDailySet(PUZZLES.slice(0, 1), "2026-09-03").length, 1);
assert.equal(pickDailySet([], "2026-09-03").length, 0);

console.log(`daily-picker tests passed(400 天 ${sets.size} 組不同;今天 ${dailyKey()}:${a.map(s => `${s.label}=${s.id}`).join(" / ")})`);
