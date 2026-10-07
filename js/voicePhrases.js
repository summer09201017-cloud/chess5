/* voicePhrases.js — 四隻動物對手的固定唸稿(烤製 scripts/gen-voice.mjs 與 runtime src/voice.js 共用)。
 *
 * ★ 人聲鐵律(skill baked-voice-commentary):一律預烤 mp3 神經人聲(msedge-tts),絕不用 Web Speech 機器聲;缺檔 = 不唸。
 * ★ 只放「實際會唸」的固定句。落子太頻繁,不唸;think 只在每三手唸一次(main.js 口白同節奏)。
 * ★ 檔名 = <animal>-<event>.mp3(gen-voice 照這張表烤、sw.js 的 SHELL 照目錄重生、smoke 對賬 VOICE_FILES)。
 * ★ 一隻一種嗓音:兔=曉雨更高更快 / 貓=曉臻拉高 / 熊=雲哲壓低 / 貓頭鷹=雲哲慢一點(老師傅);pitch / rate 是 SSML prosody 字串。
 * ★ 💬 閒聊 chat1~chat3:輪到你、發呆太久才唸(opponent.js:15 秒第一句、再 30 秒第二句、一回合最多兩句);要節制。
 */
export const VOICES = {
  rabbit: { voice: "zh-TW-HsiaoYuNeural",   pitch: "+40%", rate: "+14%" },
  cat:    { voice: "zh-TW-HsiaoChenNeural", pitch: "+25%", rate: "+8%" },
  bear:   { voice: "zh-TW-YunJheNeural",    pitch: "-18%", rate: "-6%" },
  owl:    { voice: "zh-TW-YunJheNeural",    pitch: "-4%",  rate: "-14%" },
};

export const LINES = {
  rabbit: { think: "嗯…讓我想想",     win: "耶~我連五了!",     lose: "哇…你好厲害!",   draw: "平手了~再來一局!", wow: "哇!好棋!",        again: "沒關係,再想想~",   chat1: "耶~該你了!",     chat2: "快快快~",         chat3: "你在想什麼呀?" },
  cat:    { think: "喵…讓我想一下",   win: "喵~我連五了!",     lose: "喵嗚…你贏了",     draw: "喵~平手了",       wow: "哇!好棋!",        again: "喵…再試一次嘛",   chat1: "喵~輪到你了",     chat2: "快點下啦~",       chat3: "想好了沒呀?" },
  bear:   { think: "吼…我想想",       win: "吼~我連五了!",     lose: "嗚…你好厲害",     draw: "吼~平手了",       wow: "哇!好棋!",        again: "嗯,再想想看",     chat1: "吼~輪到你囉",     chat2: "慢慢想,不急",     chat3: "要下哪一格呢?" },
  owl:    { think: "嗯…讓老夫想想",   win: "呵呵,老夫連五了", lose: "後生可畏啊!",     draw: "棋逢敵手,平手",   wow: "好棋!有兩下子",   again: "別急,再想一想",   chat1: "該你了,小朋友",   chat2: "不急,想清楚再下", chat3: "看看哪裡有活三?" },
};
/** 閒聊事件名(每隻都有同一組) */
export const CHAT_EVENTS = Object.keys(LINES.cat).filter((k) => k.startsWith("chat"));
/** 所有應該存在的檔名(烤製對賬 / smoke 對賬用) */
export const VOICE_FILES = Object.entries(LINES).flatMap(([animal, ev]) => Object.keys(ev).map((event) => `${animal}-${event}.mp3`));
