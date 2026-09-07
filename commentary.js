/* commentary.js —— 電腦的「角色口白」(0907 立;純函式、無副作用,好測)
 *
 * 這一支跟 script.js 裡原有的 showCommentary() 分工清楚,別搞混:
 *   · showCommentary()(舊,留著)= **棋型播報**:誰下出活三/活四/雙四,講的是棋盤上的事實。
 *   · 本模組(新)= **電腦的口白**:電腦「開始想」與「剛下完」時,以角色語氣講一句話,講的是它的心情。
 * 優先序寫在 script.js:同一手若已經有棋型播報(那是玩家最需要知道的事),就不再插口白,
 * 免得兩句話搶同一個氣泡、變成跑馬燈。
 *
 * ★ 為什麼是文字不是語音:本系列的人聲鐵律是「要唸就得用預烤的神經人聲 mp3,不准用瀏覽器機器聲」
 *   (skill baked-voice-commentary)。五子棋沒有烤好的語音包 ⇒ 這一版只做字幕。
 *   哪天要加聲音,是去烤 mp3,不是改成 speechSynthesis。
 * ★ 語氣守則(給主日學孩子看的):不嘲諷、不用「斷頭」「破產」這種負面字眼、輸的時候不酸人。
 *   決戰房市五子棋的旁白很生動但主題是房貸稅務,學它的「形式」不學它的「內容」。
 */

/** 四個難度各有一個角色;名字會出現在畫面上,所以要好念、孩子看得懂。 */
export const AI_VOICES = {
  easy: {
    name: "初學小白",
    think: ["嗯……我想想喔", "這一步下哪裡好呢？", "我還在學，慢一點喔"],
    calm: ["先這樣試試看", "我下這裡！", "希望這步是對的"],
    block: ["咦，你要連起來了，我擋一下", "不行不行，這裡我先站住"],
    attack: ["我也來排一排看看", "我好像排出東西了？"],
    danger: ["哇，你好厲害", "你這步好兇，我有點慌"],
  },
  normal: {
    name: "穩穩下",
    think: ["讓我看一下棋盤", "這裡有幾個選擇", "我算一下"],
    calm: ["穩穩下一步", "先佔住這個位置", "這樣比較安全"],
    block: ["你這條線我先擋住", "看到了，這裡不能讓你連"],
    attack: ["換我進攻了", "這條線我要延長"],
    danger: ["你的攻勢很強，我得小心", "這局變緊張了"],
  },
  hard: {
    name: "守門員",
    think: ["先看看哪裡有威脅", "我檢查一下你的每條線", "別急，先守穩"],
    calm: ["這步是為了後面", "先把陣形站好"],
    block: ["這一手非擋不可", "你的活三我看見了", "這裡我不會漏掉"],
    attack: ["守住了，換我出手", "現在輪到我逼你了"],
    danger: ["你逼得很好，我只能硬擋", "這步我得認真了"],
  },
  master: {
    name: "老師傅",
    think: ["我往後多算幾手", "讓我把變化算完", "這局有意思"],
    calm: ["這一手看起來平淡，作用在後面", "先埋一顆伏兵"],
    block: ["你的殺著我算到了", "這裡一定要擋"],
    attack: ["我開始收網了", "這條線連起來就結束了"],
    danger: ["好棋，我得重新算一遍", "你這步值得稱讚"],
  },
};

/** 情境:think=開始想、calm=平穩一手、block=剛擋掉你、attack=自己做出攻勢、danger=你的攻勢很強 */
export const SITUATIONS = ["think", "calm", "block", "attack", "danger"];

/**
 * 挑一句口白。純函式:同樣的輸入永遠同樣的輸出,不碰 DOM、不碰時間、不碰隨機源。
 * @param {object} o
 * @param {string} o.level     難度 key(easy/normal/hard/master);不認識的當 normal
 * @param {string} o.situation 情境(見 SITUATIONS);不認識的當 calm
 * @param {number} [o.rand]    0~1 的隨機數,由呼叫方給(測試才好固定)
 * @param {string} [o.avoid]   上一句講過的話,盡量不要重覆(只有一句可選時仍會回同一句)
 * @returns {{name:string, text:string, situation:string}|null} 沒有可用句子時回 null
 */
export function pickAiLine({ level, situation, rand = 0.5, avoid = "" } = {}) {
  const voice = AI_VOICES[level] || AI_VOICES.normal;
  const key = SITUATIONS.includes(situation) ? situation : "calm";
  const pool = voice[key];
  if (!Array.isArray(pool) || pool.length === 0) return null;
  const r = Number.isFinite(rand) ? Math.min(0.999999, Math.max(0, rand)) : 0.5;
  // 先排掉上一句:只有一句可選時 rest 會是空的,那就照樣回那一句(寧可重覆,也不要沒話講)
  const rest = pool.filter((t) => t !== avoid);
  const list = rest.length ? rest : pool;
  return { name: voice.name, text: list[Math.floor(r * list.length)], situation: key };
}

/**
 * 從「這一手造成的棋型」推情境。棋型數字由 script.js 數好傳進來(它有 countDir);
 * 這裡只做對照,免得同一套判斷在兩邊各寫一份、日後改一邊忘另一邊。
 * @param {object} o
 * @param {number} [o.aiLiveThrees] 電腦這手做出的活三數
 * @param {number} [o.aiFours]      電腦這手做出的四(含活四)
 * @param {number} [o.humanThreats] 電腦下手前、玩家已有的活三/四合計
 * @param {boolean} [o.blocked]     這一手是不是踩在玩家的威脅線上(擋)
 */
export function situationFromShape({ aiLiveThrees = 0, aiFours = 0, humanThreats = 0, blocked = false } = {}) {
  if (aiFours > 0 || aiLiveThrees >= 2) return "attack";
  if (blocked) return "block";
  if (humanThreats >= 2) return "danger";
  if (aiLiveThrees === 1) return "attack";
  return "calm";
}
