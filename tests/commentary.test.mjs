// tests/commentary.test.mjs —— 守電腦口白模組(0907 立)
//
// 只守機器驗得出來的事(文案好不好聽只有人能判斷):
//   ①四個難度都有角色名與五種情境的句子 ②rand 決定挑哪句、同輸入同輸出(純函式)
//   ③avoid 會避開上一句、但只剩一句時仍然有話講(不能回 null 讓氣泡空著)
//   ④不認識的難度/情境要有安全退路 ⑤棋型 → 情境的對照表 ⑥語氣紅線:不准出現負面字眼
import assert from "node:assert/strict";
import { AI_VOICES, SITUATIONS, pickAiLine, situationFromShape } from "../commentary.js";

// ① 四檔齊全
const LEVELS = ["easy", "normal", "hard", "master"];
for (const lv of LEVELS) {
  const v = AI_VOICES[lv];
  assert.ok(v, `AI_VOICES 有 ${lv}`);
  assert.ok(typeof v.name === "string" && v.name.length > 0, `${lv} 有角色名`);
  for (const s of SITUATIONS) {
    assert.ok(Array.isArray(v[s]) && v[s].length > 0, `${lv} 的 ${s} 有句子`);
    for (const t of v[s]) assert.ok(typeof t === "string" && t.length > 0, `${lv}.${s} 每句都是非空字串`);
  }
}

// ② rand 決定挑哪句;同輸入同輸出
const a = pickAiLine({ level: "hard", situation: "block", rand: 0 });
const b = pickAiLine({ level: "hard", situation: "block", rand: 0 });
assert.deepEqual(a, b, "純函式:同輸入同輸出");
assert.equal(a.text, AI_VOICES.hard.block[0], "rand=0 取第一句");
assert.equal(a.name, AI_VOICES.hard.name, "帶回角色名");
const last = pickAiLine({ level: "hard", situation: "block", rand: 0.999999 });
assert.equal(last.text, AI_VOICES.hard.block[AI_VOICES.hard.block.length - 1], "rand 接近 1 取最後一句");
// rand 越界不可以炸、也不可以回 undefined 的句子
for (const r of [-5, 1, 2, NaN, undefined]) {
  const got = pickAiLine({ level: "normal", situation: "calm", rand: r });
  assert.ok(got && AI_VOICES.normal.calm.includes(got.text), `rand=${r} 仍回合法句子`);
}

// ③ avoid:避開上一句;只剩一句時仍要有話講
const pool = AI_VOICES.master.block;
const avoided = pickAiLine({ level: "master", situation: "block", rand: 0, avoid: pool[0] });
assert.notEqual(avoided.text, pool[0], "avoid 會避開上一句");

// ④ 安全退路
const unknownLevel = pickAiLine({ level: "no-such-level", situation: "calm", rand: 0 });
assert.equal(unknownLevel.name, AI_VOICES.normal.name, "不認識的難度退回普通");
const unknownSit = pickAiLine({ level: "normal", situation: "no-such-situation", rand: 0 });
assert.equal(unknownSit.situation, "calm", "不認識的情境退回 calm");
assert.ok(pickAiLine({}), "什麼都不給也不炸");

// ⑤ 棋型 → 情境
assert.equal(situationFromShape({ aiFours: 1 }), "attack", "做出四 = 進攻");
assert.equal(situationFromShape({ aiLiveThrees: 2 }), "attack", "雙活三 = 進攻");
assert.equal(situationFromShape({ aiLiveThrees: 1 }), "attack", "單活三 = 進攻");
assert.equal(situationFromShape({ blocked: true }), "block", "踩在對手威脅線上 = 擋");
assert.equal(situationFromShape({ humanThreats: 2 }), "danger", "對手威脅多 = 危險");
assert.equal(situationFromShape({}), "calm", "什麼都沒有 = 平穩");
// 優先序:自己做出四時,即使同時是擋,也算進攻(那一手更值得講)
assert.equal(situationFromShape({ aiFours: 1, blocked: true }), "attack", "進攻優先於擋");

// ⑥ 語氣紅線(0907 使用者要的是給主日學孩子玩的,決戰房市那種「斷頭」用語不要)
const BANNED = ["斷頭", "破產", "廢物", "笨", "蠢", "白痴", "垃圾", "死"];
for (const lv of LEVELS) {
  for (const s of SITUATIONS) {
    for (const t of AI_VOICES[lv][s]) {
      for (const w of BANNED) assert.ok(!t.includes(w), `${lv}.${s}「${t}」不得含負面字眼「${w}」`);
    }
  }
}

console.log(`commentary tests passed(${LEVELS.length} 檔 × ${SITUATIONS.length} 情境;純函式、avoid、退路、棋型對照、語氣紅線)`);
