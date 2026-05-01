import { analyzeForbiddenMove, analyzeMoveThreat } from "./game-rules.js";

/* ============================================================
 * 3D 五子棋 — 全功能版
 * ============================================================ */

/* ---------- 1. 常數 ---------- */
const DIRECTIONS = [[1, 0], [0, 1], [1, 1], [1, -1]];
const COLORS = ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S"];
const STAR_PATTERNS = {
  9:  [[2,2],[2,6],[6,2],[6,6],[4,4]],
  13: [[3,3],[3,9],[9,3],[9,9],[6,6]],
  15: [[3,3],[3,7],[3,11],[7,3],[7,7],[7,11],[11,3],[11,7],[11,11]],
  19: [[3,3],[3,9],[3,15],[9,3],[9,9],[9,15],[15,3],[15,9],[15,15]],
};

const AI_LEVELS = {
  easy:    { label:"簡單",   topK:8,  randomTop:5, mistake:0.42, blockErr:0.20, lookahead:0, thinkDelay:[240,520] },
  normal:  { label:"普通",   topK:10, randomTop:3, mistake:0.15, blockErr:0.0,  lookahead:0, thinkDelay:[300,620] },
  hard:    { label:"困難",   topK:12, randomTop:2, mistake:0.03, blockErr:0.0,  lookahead:1, thinkDelay:[360,760] },
  master:  { label:"大師",   topK:10, randomTop:1, mistake:0.0,  blockErr:0.0,  lookahead:3, thinkDelay:[420,900] },
};

const PATTERN = {
  FIVE: 1000000, LIVE_FOUR: 100000, FOUR: 10000,
  LIVE_THREE: 8000, THREE: 800, LIVE_TWO: 600, TWO: 60, ONE: 8,
};

const PUZZLES = [
  { name:"白先三步殺 A", size:15, turn:"white", target:3,
    hint:"白棋下出雙活四",
    setup:[["black",7,7],["white",7,8],["black",8,8],["white",8,7],["black",6,6],["white",9,9],["black",6,7]] },
  { name:"白先必勝（活四）", size:15, turn:"white", target:1,
    hint:"找出可形成活四的關鍵點",
    setup:[["white",7,7],["white",7,8],["white",7,9],["black",8,8],["black",6,6]] },
  { name:"黑先一手致勝", size:9, turn:"black", target:1,
    hint:"黑棋已有四連，請完成五連",
    setup:[["black",4,2],["black",4,3],["black",4,4],["black",4,5],["white",3,3],["white",5,5],["white",2,2]] },
  { name:"黑先制勝雙活三", size:13, turn:"black", target:1,
    hint:"找出雙活三點",
    setup:[["black",6,5],["black",6,6],["white",7,7],["black",5,6],["white",4,4],["white",8,8]] },
  { name:"白防守要點", size:15, turn:"white", target:1,
    hint:"擋住黑棋的活四",
    setup:[["black",7,5],["black",7,6],["black",7,7],["black",7,8],["white",8,8],["white",6,6]] },
  { name:"黑必勝活四", size:15, turn:"black", target:1,
    hint:"形成兩端皆活的四連",
    setup:[["black",8,7],["black",8,8],["black",8,9],["white",9,9],["white",7,7],["white",6,6]] },
  { name:"白先反擊", size:15, turn:"white", target:1,
    hint:"白棋下哪裡能反包圍黑棋",
    setup:[["black",7,7],["black",8,8],["white",6,6],["white",9,9],["black",7,8],["white",8,7]] },
  { name:"黑必殺三步", size:15, turn:"black", target:3,
    hint:"連續攻擊不給白棋喘息",
    setup:[["black",7,7],["white",8,8],["black",6,7],["white",9,9],["black",7,6],["white",8,9]] },
];

const ACHIEVEMENTS = [
  { id:"first_win", name:"初出茅蘆", desc:"贏得第一場勝利", icon:"🏆" },
  { id:"swift", name:"神速勝利", desc:"在 12 步內取勝", icon:"⚡" },
  { id:"streak5", name:"連勝五場", desc:"連續勝利 5 場", icon:"🔥" },
  { id:"beat_master", name:"挑戰大師", desc:"擊敗大師難度 AI", icon:"👑" },
  { id:"puzzle_solved", name:"解謎啟程", desc:"完成第一個解謎", icon:"🧩" },
  { id:"all_boards", name:"環遊棋盤", desc:"在四種尺寸都下過棋", icon:"🌐" },
  { id:"daily_gold", name:"每日金牌", desc:"每日挑戰獲得金牌", icon:"🥇" },
  { id:"online_match", name:"線上對手", desc:"完成第一場線上對戰", icon:"🌍" },
];

/* ---------- 2. 狀態 ---------- */
let BOARD_SIZE = 15;
let MARGIN_RATIO = 0.072;
let CELL_RATIO = (1 - MARGIN_RATIO * 2) / (BOARD_SIZE - 1);
let HOTSPOT_RATIO = CELL_RATIO * 1.0;

let boardState = createEmptyBoard(BOARD_SIZE);
let pointRefs = [];
let moveHistory = [];          // [{row,col,color}]
let redoStack = [];
let replayIndex = null;        // null = 即時, 數字 = 回放某步
let currentPlayer = "black";
let gameOver = false;
let aiThinking = false;
let aiTimer = null;
let mode = "pve";              // pve | pvp | online | puzzle | daily
let humanColor = "black";
let forbiddenOn = false;
let perMoveSeconds = 0;
let timerInterval = null;
let timerRemain = { black: 0, white: 0 };
let activeTimerColor = "black";
let lastMoveCell = null;
let winningCells = [];
let currentPuzzle = null;
let dailySession = null;
let onlinePeer = null;
let onlineConn = null;
let onlineColor = null;
let onlineLocked = false;
let deferredInstallPrompt = null;
let soundOn = true;
let stats = { black:0, white:0, draw:0, streak:0, lastWinner:null, sizesPlayed:[], achievements:[] };

// 這些必須在 top-level 就 hoist 完成，否則 attachEvents() 透過 spawnWeather/playClick 等
// 函式會在它們的 let 行還沒執行前就讀取到，觸發 TDZ 錯誤造成整個 commitMove 中斷。
let audioCtx = null;
let bubbleTimer = null;
let snapshotHistory = null;
let weatherParticles = [];
let confettiParticles = [];
let weatherStarted = false;

const rotation = { yaw: 0, pitch: 0, zoom: 1.0, autoSpin: false };
const dragState = { active:false, pointerId:null, startX:0, startY:0, startYaw:0, startPitch:0 };

/* ---------- 3. DOM refs ---------- */
const $ = (id) => document.getElementById(id);
const statusEl = $("status");
const intersections = $("intersections");
const grid = $("grid");
const scene = $("scene");
const board3d = $("board3d");
const yawRange = $("yawRange");
const pitchRange = $("pitchRange");
const zoomRange = $("zoomRange");
const autoSpinInput = $("autoSpin");
const aiLevelInput = $("aiLevel");
const modeSelect = $("modeSelect");
const boardSizeSelect = $("boardSize");
const forbiddenToggle = $("forbiddenToggle");
const timerModeSelect = $("timerMode");
const themeSelect = $("themeSelect");
const skinSelect = $("skinSelect");
const weatherSelect = $("weatherSelect");
const soundToggle = $("soundToggle");
const commentaryBubble = $("commentaryBubble");
const weatherCanvas = $("weatherCanvas");
const confettiCanvas = $("confettiCanvas");
const blackTimerEl = $("blackTimer");
const whiteTimerEl = $("whiteTimer");
const blackTimerValue = $("blackTimerValue");
const whiteTimerValue = $("whiteTimerValue");

/* ---------- 4. 初始化 ---------- */
loadStats();
loadPersistedSettings();
buildPuzzleList();
populateAchievements();
buildGrid();
buildIntersections();
refreshZoomLimit();
applyRotation();
attachEvents();
startAutoRotateLoop();
startWeatherLoop();
initPwa();
maybeLoadFromUrl();
updateStatus(`黑棋先手（${humanColor === "black" ? "你" : "電腦"}）`);
if (mode === "pve" && humanColor === "white") startAiTurn();

/* ---------- 5. 棋盤建構 ---------- */
function setBoardSize(n) {
  BOARD_SIZE = n;
  CELL_RATIO = (1 - MARGIN_RATIO * 2) / (BOARD_SIZE - 1);
  HOTSPOT_RATIO = CELL_RATIO * 1.0;
  boardState = createEmptyBoard(BOARD_SIZE);
  moveHistory = [];
  redoStack = [];
  lastMoveCell = null;
  winningCells = [];
  buildGrid();
  buildIntersections();
  if (!stats.sizesPlayed.includes(n)) {
    stats.sizesPlayed.push(n);
    saveStats();
    if (stats.sizesPlayed.length >= 4) unlockAchievement("all_boards");
  }
}

function buildGrid() {
  grid.innerHTML = "";
  const innerStart = MARGIN_RATIO;
  const innerSize = 1 - MARGIN_RATIO * 2;
  for (let i = 0; i < BOARD_SIZE; i++) {
    const pos = ratioAtIndex(i);
    const v = document.createElement("div");
    v.className = `grid-line vertical${isOuter(i) ? " outer" : ""}`;
    v.style.left = toPercent(pos);
    v.style.top = toPercent(innerStart);
    v.style.height = toPercent(innerSize);
    grid.appendChild(v);
    const h = document.createElement("div");
    h.className = `grid-line horizontal${isOuter(i) ? " outer" : ""}`;
    h.style.left = toPercent(innerStart);
    h.style.top = toPercent(pos);
    h.style.width = toPercent(innerSize);
    grid.appendChild(h);
  }
  (STAR_PATTERNS[BOARD_SIZE] || []).forEach(([r, c]) => {
    const star = document.createElement("div");
    star.className = "star-point";
    star.style.left = toPercent(ratioAtIndex(c));
    star.style.top = toPercent(ratioAtIndex(r));
    grid.appendChild(star);
  });
}

function buildIntersections() {
  intersections.innerHTML = "";
  pointRefs = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const p = document.createElement("button");
      p.type = "button";
      p.className = "intersection";
      p.dataset.row = r;
      p.dataset.col = c;
      p.style.left = toPercent(ratioAtIndex(c));
      p.style.top = toPercent(ratioAtIndex(r));
      p.style.width = toPercent(HOTSPOT_RATIO);
      p.style.height = toPercent(HOTSPOT_RATIO);
      p.setAttribute("aria-label", `第 ${r+1} 列 第 ${c+1} 行 空位`);
      p.addEventListener("click", onPointClick);
      // 阻止 pointerdown 冒泡到 scene 的拖曳處理器，避免微抖動吃掉 click
      p.addEventListener("pointerdown", (e) => e.stopPropagation());
      intersections.appendChild(p);
      pointRefs[r][c] = p;
    }
  }
}

/* ---------- 6. 落子核心 ---------- */
function onPointClick(event) {
  if (gameOver || aiThinking || replayIndex !== null) return;
  const p = event.currentTarget;
  const row = Number(p.dataset.row);
  const col = Number(p.dataset.col);

  if (mode === "puzzle") return handlePuzzleMove(row, col);
  if (mode === "online") return handleOnlineHumanMove(row, col);
  if (mode === "pvp") return playMoveLocal(row, col, currentPlayer);
  if (mode === "daily") return handleDailyHumanMove(row, col);

  // pve
  if (humanColor === "random") humanColor = currentPlayer; // 保險：若殘留 "random" 立即解析
  if (currentPlayer !== humanColor) return;
  if (!playMoveLocal(row, col, humanColor)) return;
  if (gameOver) return;
  startAiTurn();
}

function playMoveLocal(row, col, color) {
  if (forbiddenOn && color === "black") {
    const forbidden = getForbiddenMove(row, col);
    if (forbidden.forbidden) {
      bubble(`❌ 黑棋禁手（${forbidden.label || "雙三 / 雙四 / 長連"}）`);
      return false;
    }
  }
  return commitMove(row, col, color);
}

function isForbiddenMove(row, col) {
  return getForbiddenMove(row, col).forbidden;
}

function getForbiddenMove(row, col) {
  if (!isInside(row, col) || boardState[row][col]) {
    return { forbidden: false, valid: false };
  }
  return analyzeForbiddenMove(boardState, BOARD_SIZE, row, col);
}

function isLegalCandidate(row, col, color) {
  if (!isInside(row, col) || boardState[row][col]) return false;
  if (forbiddenOn && color === "black" && isForbiddenMove(row, col)) {
    return false;
  }
  return true;
}

function commitMove(row, col, color) {
  if (!isInside(row, col) || boardState[row][col] || gameOver) return false;
  boardState[row][col] = color;
  moveHistory.push({ row, col, color });
  redoStack = [];
  placeStone(row, col, color, true);
  setLastMove(row, col);
  playClick();
  showCommentary(row, col, color);

  const win = checkWinFull(row, col, color);
  if (win) {
    gameOver = true;
    winningCells = win;
    win.forEach(([r,c]) => pointRefs[r][c].classList.add("winning"));
    finalizeGame(color);
    return true;
  }
  if (moveHistory.length === BOARD_SIZE * BOARD_SIZE) {
    gameOver = true;
    finalizeGame(null);
    return true;
  }
  // switch turn
  currentPlayer = currentPlayer === "black" ? "white" : "black";
  if (mode === "pve") {
    updateStatus(`輪到${playerLabel(currentPlayer)}`);
  } else if (mode === "pvp") {
    updateStatus(`輪到 ${currentPlayer === "black" ? "黑棋玩家" : "白棋玩家"}`);
  } else if (mode === "online") {
    updateStatus(currentPlayer === onlineColor ? "輪到你" : "等待對手...");
  }
  if (perMoveSeconds > 0) restartTurnTimer(currentPlayer);
  saveOngoing();
  return true;
}

function placeStone(row, col, color, animate) {
  const point = pointRefs[row][col];
  point.classList.add("occupied");
  point.style.setProperty("--stone-stack", String(10 + row));
  point.setAttribute("aria-label",
    `第 ${row+1} 列 第 ${col+1} 行 ${color === "black" ? "黑棋" : "白棋"}`);
  const stone = document.createElement("span");
  stone.className = `stone ${color}`;
  if (!animate) stone.style.animation = "none";
  point.replaceChildren(stone);
}

function setLastMove(row, col) {
  document.querySelectorAll(".intersection.last-move")
    .forEach(el => el.classList.remove("last-move"));
  if (row != null) pointRefs[row][col].classList.add("last-move");
  lastMoveCell = (row != null) ? [row, col] : null;
}

function finalizeGame(winnerColor) {
  stopTimer();
  if (winnerColor) {
    updateStatus(`${playerLabel(winnerColor)} 獲勝 🎉`);
    playWin();
    burstConfetti();
  } else {
    updateStatus("平手");
  }
  if (mode === "pve") {
    if (winnerColor === humanColor) {
      stats.black = humanColor === "black" ? stats.black + 1 : stats.black;
      stats.white = humanColor === "white" ? stats.white + 1 : stats.white;
      stats.streak = stats.lastWinner === "human" ? stats.streak + 1 : 1;
      stats.lastWinner = "human";
      unlockAchievement("first_win");
      if (moveHistory.length <= 24) unlockAchievement("swift");
      if (stats.streak >= 5) unlockAchievement("streak5");
      if (aiLevelInput.value === "master") unlockAchievement("beat_master");
    } else if (winnerColor) {
      // AI 勝
      if (humanColor === "black") stats.white += 1;
      else stats.black += 1;
      stats.streak = 0;
      stats.lastWinner = "ai";
    } else {
      stats.draw += 1;
      stats.streak = 0;
    }
  } else if (mode === "pvp") {
    if (winnerColor === "black") stats.black += 1;
    else if (winnerColor === "white") stats.white += 1;
    else stats.draw += 1;
  } else if (mode === "daily" && winnerColor === humanColor) {
    const score = moveHistory.length <= 18 ? "gold" : moveHistory.length <= 28 ? "silver" : "bronze";
    if (score === "gold") unlockAchievement("daily_gold");
    bubble(`每日挑戰：${score === "gold" ? "🥇 金牌" : score === "silver" ? "🥈 銀牌" : "🥉 銅牌"}`);
  } else if (mode === "online") {
    unlockAchievement("online_match");
  }
  saveStats();
  saveOngoing();
  refreshStats();
}

/* ---------- 7. 勝利偵測 ---------- */
function checkWinFull(row, col, color) {
  for (const [dx, dy] of DIRECTIONS) {
    const cells = [[row, col]];
    let r = row + dy, c = col + dx;
    while (isInside(r, c) && boardState[r][c] === color) { cells.push([r, c]); r += dy; c += dx; }
    r = row - dy; c = col - dx;
    while (isInside(r, c) && boardState[r][c] === color) { cells.unshift([r, c]); r -= dy; c -= dx; }
    if (cells.length >= 5) return cells.slice(0, 5);
  }
  return null;
}

function checkWinFast(row, col, color) {
  for (const [dx, dy] of DIRECTIONS) {
    let count = 1;
    let r = row + dy, c = col + dx;
    while (isInside(r,c) && boardState[r][c] === color) { count++; r += dy; c += dx; }
    r = row - dy; c = col - dx;
    while (isInside(r,c) && boardState[r][c] === color) { count++; r -= dy; c -= dx; }
    if (count >= 5) return true;
  }
  return false;
}

/* ---------- 8. 悔棋 / 重做 / 提示 ---------- */
function undoMove() {
  if (replayIndex !== null) return;
  if (moveHistory.length === 0 || aiThinking) return;
  // 在 PvE 一次回兩步（玩家+AI），其他模式回一步
  const steps = (mode === "pve" && moveHistory.length >= 2) ? 2 : 1;
  for (let i = 0; i < steps; i++) {
    const last = moveHistory.pop();
    if (!last) break;
    redoStack.push(last);
    boardState[last.row][last.col] = null;
    const p = pointRefs[last.row][last.col];
    p.classList.remove("occupied", "last-move", "winning");
    p.replaceChildren();
    p.setAttribute("aria-label", `第 ${last.row+1} 列 第 ${last.col+1} 行 空位`);
  }
  gameOver = false;
  winningCells = [];
  // recompute current player from history
  if (mode === "pvp") {
    currentPlayer = moveHistory.length % 2 === 0 ? "black" : "white";
  } else if (mode === "pve") {
    currentPlayer = humanColor;
  }
  // restore last-move marker
  const last = moveHistory[moveHistory.length - 1];
  if (last) setLastMove(last.row, last.col); else setLastMove(null, null);
  updateStatus(`輪到${playerLabel(currentPlayer)}`);
  saveOngoing();
}

function redoMove() {
  if (replayIndex !== null) return;
  if (redoStack.length === 0 || aiThinking) return;
  const m = redoStack.pop();
  commitMove(m.row, m.col, m.color);
}

function showHint() {
  if (gameOver || aiThinking) return;
  const config = AI_LEVELS.hard;
  const move = chooseAiMove(config, currentPlayer);
  if (!move) return;
  const el = pointRefs[move.row][move.col];
  el.classList.add("hint-spot");
  setTimeout(() => el.classList.remove("hint-spot"), 1800);
  bubble(`💡 建議：${coordLabel(move.row, move.col)}`);
}

/* ---------- 9. AI ---------- */
function startAiTurn() {
  if (gameOver || mode !== "pve") return;
  if (currentPlayer === humanColor) return;
  const config = AI_LEVELS[aiLevelInput.value] || AI_LEVELS.normal;
  setAiThinking(true);
  updateStatus(`${playerLabel(currentPlayer)}（${config.label}）思考中...`);
  clearTimeout(aiTimer);
  const delay = randomInt(config.thinkDelay[0], config.thinkDelay[1]);
  aiTimer = setTimeout(() => {
    try {
      if (gameOver) { setAiThinking(false); return; }
      const aiColor = currentPlayer;
      let move = null;
      try {
        move = chooseAiMove(config, aiColor);
      } catch (e) {
        console.error("[AI] chooseAiMove threw:", e);
      }
      // 後備：暴力掃描第一個空位
      if (!move) {
        outer: for (let r = 0; r < BOARD_SIZE; r++) {
          for (let c = 0; c < BOARD_SIZE; c++) {
            if (!boardState[r][c]) { move = { row: r, col: c }; break outer; }
          }
        }
      }
      setAiThinking(false);
      if (!move) {
        gameOver = true;
        finalizeGame(null);
        return;
      }
      const ok = commitMove(move.row, move.col, aiColor);
      if (!ok) console.warn("[AI] commitMove failed for", move);
    } catch (e) {
      console.error("[AI] turn failed:", e);
      setAiThinking(false);
      updateStatus("⚠ 電腦回合發生錯誤，請按重新開始");
    }
  }, delay);
}

function setAiThinking(v) {
  aiThinking = v;
  intersections.style.pointerEvents = v ? "none" : "auto";
}

function chooseAiMove(config, aiColor) {
  // Opening book: 第一手中央; 第二手鄰近
  if (moveHistory.length === 0) {
    const c = Math.floor(BOARD_SIZE / 2);
    return { row: c, col: c };
  }
  if (moveHistory.length === 1) {
    const last = moveHistory[0];
    const offsets = [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]];
    const [dr, dc] = offsets[Math.floor(Math.random() * offsets.length)];
    const r = clamp(last.row + dr, 0, BOARD_SIZE - 1);
    const c = clamp(last.col + dc, 0, BOARD_SIZE - 1);
    if (!boardState[r][c]) return { row: r, col: c };
  }

  const oppColor = opp(aiColor);
  const candidates = generateCandidateMoves(2)
    .filter(m => isLegalCandidate(m.row, m.col, aiColor));
  if (candidates.length === 0) return null;

  // 立即勝
  const winNow = findWinningMove(candidates, aiColor);
  if (winNow) return winNow;
  // 必須擋
  const mustBlock = findWinningMove(candidates, oppColor);
  if (mustBlock && Math.random() > config.blockErr) return mustBlock;

  // 評分
  const scored = candidates
    .map(c => ({ ...c, score: scoreMove(c.row, c.col, aiColor) }))
    .sort((a, b) => b.score - a.score);

  if (config.lookahead > 0) {
    return alphaBetaPick(scored, config, aiColor);
  }
  return pickByDifficulty(scored, config);
}

function pickByDifficulty(scored, config) {
  const pool = scored.slice(0, Math.min(config.randomTop, scored.length));
  let pick = pool[Math.floor(Math.random() * pool.length)];
  if (scored.length > pool.length && Math.random() < config.mistake) {
    const idx = pool.length + Math.floor(Math.random() * Math.min(5, scored.length - pool.length));
    pick = scored[idx];
  }
  return { row: pick.row, col: pick.col };
}

function scoreMove(row, col, aiColor) {
  const oppColor = opp(aiColor);
  const attack = analyzeMoveThreat(boardState, BOARD_SIZE, row, col, aiColor, { renjuBlack: forbiddenOn });
  const defense = analyzeMoveThreat(boardState, BOARD_SIZE, row, col, oppColor, { renjuBlack: forbiddenOn });
  if (attack.forbidden) return -Infinity;
  return attack.score * 1.25
    + defense.score * 1.15
    + potential(row, col, aiColor) * 1.18
    + potential(row, col, oppColor) * 1.22
    + centerBias(row, col);
}

function potential(row, col, color) {
  if (boardState[row][col]) return -Infinity;
  let total = 0, strongest = 0;
  for (const [dx, dy] of DIRECTIONS) {
    const v = lineScore(row, col, dx, dy, color);
    total += v;
    if (v > strongest) strongest = v;
  }
  return total + strongest * 0.5;
}

function lineScore(row, col, dx, dy, color) {
  const f = countDir(row, col, dx, dy, color);
  const b = countDir(row, col, -dx, -dy, color);
  const stones = f.count + b.count + 1;
  const open = (f.open ? 1 : 0) + (b.open ? 1 : 0);
  if (stones >= 5) return PATTERN.FIVE;
  if (stones === 4 && open === 2) return PATTERN.LIVE_FOUR;
  if (stones === 4 && open === 1) return PATTERN.FOUR;
  if (stones === 3 && open === 2) return PATTERN.LIVE_THREE;
  if (stones === 3 && open === 1) return PATTERN.THREE;
  if (stones === 2 && open === 2) return PATTERN.LIVE_TWO;
  if (stones === 2 && open === 1) return PATTERN.TWO;
  if (stones === 1 && open === 2) return PATTERN.ONE;
  return 1;
}

function countDir(r0, c0, dx, dy, color) {
  let count = 0, r = r0 + dy, c = c0 + dx;
  while (isInside(r, c) && boardState[r][c] === color) { count++; r += dy; c += dx; }
  return { count, open: isInside(r, c) && boardState[r][c] === null };
}

function findWinningMove(cands, color) {
  for (const m of cands) {
    if (!isLegalCandidate(m.row, m.col, color)) continue;
    boardState[m.row][m.col] = color;
    const w = checkWinFast(m.row, m.col, color);
    boardState[m.row][m.col] = null;
    if (w) return m;
  }
  return null;
}

function generateCandidateMoves(radius) {
  if (moveHistory.length === 0) {
    const c = Math.floor(BOARD_SIZE / 2);
    return [{ row: c, col: c }];
  }
  const seen = new Set();
  const out = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (!boardState[r][c]) continue;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nr = r + dy, nc = c + dx;
          if (!isInside(nr, nc) || boardState[nr][nc]) continue;
          const k = nr * BOARD_SIZE + nc;
          if (seen.has(k)) continue;
          seen.add(k);
          out.push({ row: nr, col: nc });
        }
      }
    }
  }
  return out;
}

function centerBias(row, col) {
  const c = (BOARD_SIZE - 1) / 2;
  const d = Math.abs(row - c) + Math.abs(col - c);
  return (BOARD_SIZE * 2 - d) * 4;
}

/* alpha-beta 簡化版：對 top-K 候選展開 */
function alphaBetaPick(scoredMoves, config, aiColor) {
  const sample = scoredMoves.slice(0, Math.min(config.topK, scoredMoves.length));
  let best = null;
  let bestScore = -Infinity;
  const depth = config.lookahead;
  for (const m of sample) {
    boardState[m.row][m.col] = aiColor;
    let val;
    if (checkWinFast(m.row, m.col, aiColor)) val = PATTERN.FIVE;
    else val = -negamax(depth - 1, -1e12, 1e12, opp(aiColor));
    boardState[m.row][m.col] = null;
    if (val > bestScore) { bestScore = val; best = m; }
  }
  return best ? { row: best.row, col: best.col } : pickByDifficulty(scoredMoves, config);
}

function negamax(depth, alpha, beta, sideToMove) {
  if (depth === 0) return staticEval(sideToMove);
  const cands = generateCandidateMoves(1);
  if (cands.length === 0) return 0;
  const ranked = cands
    .map(c => ({ ...c, s: scoreMove(c.row, c.col, sideToMove) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 8);
  let val = -1e12;
  for (const m of ranked) {
    boardState[m.row][m.col] = sideToMove;
    let s;
    if (checkWinFast(m.row, m.col, sideToMove)) s = PATTERN.FIVE - (10 - depth);
    else s = -negamax(depth - 1, -beta, -alpha, opp(sideToMove));
    boardState[m.row][m.col] = null;
    if (s > val) val = s;
    if (val > alpha) alpha = val;
    if (alpha >= beta) break;
  }
  return val;
}

function staticEval(side) {
  // 全棋盤掃描 4 方向，從 side 視角回傳 (myScore - opScore)
  let myScore = 0, opScore = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = boardState[r][c];
      if (!cell) continue;
      for (const [dx, dy] of DIRECTIONS) {
        // 只在連續同色 run 起點計分
        const pr = r - dy, pc = c - dx;
        if (isInside(pr, pc) && boardState[pr][pc] === cell) continue;
        let count = 1, rr = r + dy, cc = c + dx;
        while (isInside(rr, cc) && boardState[rr][cc] === cell) { count++; rr += dy; cc += dx; }
        const endA = isInside(rr, cc) && boardState[rr][cc] === null;
        const endB = isInside(pr, pc) && boardState[pr][pc] === null;
        const open = (endA?1:0) + (endB?1:0);
        const v = patternValue(count, open);
        if (cell === side) myScore += v; else opScore += v;
      }
    }
  }
  return myScore - opScore;
}

function patternValue(stones, open) {
  if (stones >= 5) return PATTERN.FIVE;
  if (stones === 4 && open === 2) return PATTERN.LIVE_FOUR;
  if (stones === 4 && open === 1) return PATTERN.FOUR;
  if (stones === 3 && open === 2) return PATTERN.LIVE_THREE;
  if (stones === 3 && open === 1) return PATTERN.THREE;
  if (stones === 2 && open === 2) return PATTERN.LIVE_TWO;
  if (stones === 2 && open === 1) return PATTERN.TWO;
  return 1;
}

/* ---------- 11. 計時 ---------- */
function startTimer() {
  stopTimer();
  if (perMoveSeconds <= 0) {
    blackTimerValue.textContent = "--";
    whiteTimerValue.textContent = "--";
    return;
  }
  timerRemain.black = perMoveSeconds;
  timerRemain.white = perMoveSeconds;
  activeTimerColor = currentPlayer;
  refreshTimerUi();
  timerInterval = setInterval(tickTimer, 1000);
}

function restartTurnTimer(color) {
  if (perMoveSeconds <= 0) return;
  activeTimerColor = color;
  timerRemain[color] = perMoveSeconds;
  refreshTimerUi();
}

function tickTimer() {
  if (gameOver) return;
  timerRemain[activeTimerColor]--;
  if (timerRemain[activeTimerColor] <= 5 && timerRemain[activeTimerColor] > 0) {
    playTick();
  }
  if (timerRemain[activeTimerColor] <= 0) {
    gameOver = true;
    finalizeGame(opp(activeTimerColor));
    bubble(`⏰ ${activeTimerColor === "black" ? "黑" : "白"}棋超時，判負`);
  }
  refreshTimerUi();
}

function refreshTimerUi() {
  blackTimerValue.textContent = perMoveSeconds > 0 ? `${timerRemain.black}s` : "--";
  whiteTimerValue.textContent = perMoveSeconds > 0 ? `${timerRemain.white}s` : "--";
  blackTimerEl.classList.toggle("active", activeTimerColor === "black" && perMoveSeconds > 0);
  whiteTimerEl.classList.toggle("active", activeTimerColor === "white" && perMoveSeconds > 0);
  blackTimerEl.classList.toggle("urgent", perMoveSeconds > 0 && timerRemain.black <= 5);
  whiteTimerEl.classList.toggle("urgent", perMoveSeconds > 0 && timerRemain.white <= 5);
}

function stopTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  blackTimerEl.classList.remove("active", "urgent");
  whiteTimerEl.classList.remove("active", "urgent");
}

/* ---------- 12. 重新開始 ---------- */
function resetGame(opts = {}) {
  clearTimeout(aiTimer);
  setAiThinking(false);
  boardState = createEmptyBoard(BOARD_SIZE);
  moveHistory = [];
  redoStack = [];
  replayIndex = null;
  lastMoveCell = null;
  winningCells = [];
  gameOver = false;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const p = pointRefs[r][c];
      p.classList.remove("occupied", "last-move", "winning", "hint-spot");
      p.style.removeProperty("--stone-stack");
      p.replaceChildren();
      p.setAttribute("aria-label", `第 ${r+1} 列 第 ${c+1} 行 空位`);
    }
  }
  currentPlayer = "black";
  if (mode === "pve") {
    if (humanColor === "random") humanColor = Math.random() < 0.5 ? "black" : "white";
    updateStatus(`黑棋先手（${humanColor === "black" ? "你" : "電腦"}）`);
    if (humanColor === "white") setTimeout(startAiTurn, 200);
  } else if (mode === "pvp") {
    updateStatus("黑棋先手（玩家 1）");
  } else if (mode === "online") {
    updateStatus(currentPlayer === onlineColor ? "輪到你（黑棋）" : "等待對手（黑棋）");
  } else if (mode === "puzzle") {
    if (currentPuzzle) loadPuzzle(currentPuzzle);
  } else if (mode === "daily") {
    startDailyChallenge();
  }
  if (perMoveSeconds > 0) startTimer();
  saveOngoing();
  refreshReplayUi();
}

/* ---------- 13. 音效 (WebAudio) ---------- */
function ensureAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch { audioCtx = null; }
  }
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
}
function playClick() {
  if (!soundOn) return;
  ensureAudio(); if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(820, t);
  osc.frequency.exponentialRampToValueAtTime(180, t + 0.07);
  g.gain.setValueAtTime(0.18, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
  osc.connect(g).connect(audioCtx.destination);
  osc.start(t); osc.stop(t + 0.15);
}
function playWin() {
  if (!soundOn) return;
  ensureAudio(); if (!audioCtx) return;
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((f, i) => {
    const t = audioCtx.currentTime + i * 0.13;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    osc.connect(g).connect(audioCtx.destination);
    osc.start(t); osc.stop(t + 0.55);
  });
}
function playTick() {
  if (!soundOn) return;
  ensureAudio(); if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.frequency.value = 1400;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.12, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  osc.connect(g).connect(audioCtx.destination);
  osc.start(t); osc.stop(t + 0.1);
}

/* ---------- 14. 旁白 / 提示氣泡 ---------- */
function bubble(msg, ms = 2200) {
  commentaryBubble.hidden = false;
  commentaryBubble.textContent = msg;
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => { commentaryBubble.hidden = true; }, ms);
}

function showCommentary(row, col, color) {
  let liveThrees = 0, liveFours = 0, fours = 0;
  for (const [dx, dy] of DIRECTIONS) {
    const f = countDir(row, col, dx, dy, color);
    const b = countDir(row, col, -dx, -dy, color);
    const stones = f.count + b.count + 1;
    const open = (f.open?1:0) + (b.open?1:0);
    if (stones === 3 && open === 2) liveThrees++;
    if (stones === 4 && open === 2) liveFours++;
    if (stones === 4 && open >= 1) fours++;
  }
  const who = color === "black" ? "黑棋" : "白棋";
  if (liveFours >= 1) bubble(`${who}活四！下一手致勝 🔥`);
  else if (fours >= 2) bubble(`${who}雙四！致命攻擊 ⚔️`);
  else if (liveThrees >= 2) bubble(`${who}雙活三！漂亮 ✨`);
  else if (liveThrees === 1) bubble(`${who}活三 ↗`);
}

/* ---------- 15. 戰績 / 成就 ---------- */
function loadStats() {
  try {
    const raw = localStorage.getItem("gomoku.stats");
    if (raw) stats = { ...stats, ...JSON.parse(raw) };
  } catch {}
}
function saveStats() {
  try { localStorage.setItem("gomoku.stats", JSON.stringify(stats)); } catch {}
  refreshStats();
}
function refreshStats() {
  $("statBlack").textContent = stats.black;
  $("statWhite").textContent = stats.white;
  $("statDraw").textContent = stats.draw;
  $("statStreak").textContent = stats.streak;
  populateAchievements();
}
function unlockAchievement(id) {
  if (stats.achievements.includes(id)) return;
  stats.achievements.push(id);
  saveStats();
  const a = ACHIEVEMENTS.find(x => x.id === id);
  if (a) bubble(`🎉 解鎖成就「${a.name}」`, 2800);
}
function populateAchievements() {
  const ul = $("achievements");
  ul.innerHTML = "";
  ACHIEVEMENTS.forEach(a => {
    const got = stats.achievements.includes(a.id);
    const li = document.createElement("li");
    if (!got) li.classList.add("locked");
    li.innerHTML = `<span><span class="achv-icon">${a.icon}</span> ${a.name}</span><small>${got ? "已解鎖" : a.desc}</small>`;
    ul.appendChild(li);
  });
}

/* ---------- 16. 設定持久化 ---------- */
function loadPersistedSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem("gomoku.settings") || "{}");
    if (raw.theme) document.body.dataset.theme = raw.theme;
    if (raw.skin) document.body.dataset.skin = raw.skin;
    if (raw.weather) document.body.dataset.weather = raw.weather;
    if (raw.boardSize) BOARD_SIZE = raw.boardSize;
    if (typeof raw.sound === "boolean") soundOn = raw.sound;
    if (raw.aiLevel) aiLevelInput.value = raw.aiLevel;
    if (raw.mode) mode = raw.mode;
    if (raw.humanColor) humanColor = raw.humanColor;
    if (typeof raw.forbidden === "boolean") forbiddenOn = raw.forbidden;
    if (raw.timer != null) perMoveSeconds = raw.timer;
  } catch {}
  CELL_RATIO = (1 - MARGIN_RATIO * 2) / (BOARD_SIZE - 1);
  HOTSPOT_RATIO = CELL_RATIO * 1.0;
  boardState = createEmptyBoard(BOARD_SIZE);
  // sync UI
  if (themeSelect) themeSelect.value = document.body.dataset.theme;
  if (skinSelect) skinSelect.value = document.body.dataset.skin;
  if (weatherSelect) weatherSelect.value = document.body.dataset.weather;
  if (boardSizeSelect) boardSizeSelect.value = BOARD_SIZE;
  if (modeSelect) modeSelect.value = mode;
  if (forbiddenToggle) forbiddenToggle.checked = forbiddenOn;
  if (timerModeSelect) timerModeSelect.value = String(perMoveSeconds);
  if (soundToggle) soundToggle.checked = soundOn;
  document.body.dataset.mode = mode;
  document.querySelectorAll('input[name="playerColor"]').forEach(r => r.checked = (r.value === humanColor));
}
function saveSettings() {
  const data = {
    theme: document.body.dataset.theme,
    skin: document.body.dataset.skin,
    weather: document.body.dataset.weather,
    boardSize: BOARD_SIZE,
    sound: soundOn,
    aiLevel: aiLevelInput.value,
    mode,
    humanColor,
    forbidden: forbiddenOn,
    timer: perMoveSeconds,
  };
  try { localStorage.setItem("gomoku.settings", JSON.stringify(data)); } catch {}
}

function saveOngoing() {
  if (mode === "puzzle" || mode === "online") return;
  try {
    localStorage.setItem("gomoku.session", JSON.stringify({
      size: BOARD_SIZE, mode, humanColor, history: moveHistory, gameOver,
    }));
  } catch {}
}

/* ---------- 17. 棋譜匯出 / 匯入 / 分享 ---------- */
function coordLabel(row, col) {
  return `${COLORS[col]}${row + 1}`;
}
function parseCoord(token) {
  const m = /^([A-Sa-s])(\d{1,2})$/.exec(token.trim());
  if (!m) return null;
  const col = COLORS.indexOf(m[1].toUpperCase());
  const row = parseInt(m[2], 10) - 1;
  if (col < 0 || row < 0 || row >= BOARD_SIZE || col >= BOARD_SIZE) return null;
  return { row, col };
}
function exportGame() {
  if (moveHistory.length === 0) return bubble("尚未開始的棋局");
  const text = moveHistory.map(m => coordLabel(m.row, m.col)).join(" ");
  navigator.clipboard?.writeText(text).then(
    () => bubble("📋 已複製棋譜到剪貼簿"),
    () => prompt("複製失敗，請手動複製：", text)
  );
}
function importGameFromText(text) {
  const tokens = text.trim().split(/[\s,]+/).filter(Boolean);
  resetGame();
  for (const tk of tokens) {
    const c = parseCoord(tk);
    if (!c) { bubble(`座標錯誤：${tk}`); break; }
    const color = moveHistory.length % 2 === 0 ? "black" : "white";
    if (!commitMove(c.row, c.col, color)) { bubble(`重複座標：${tk}`); break; }
    if (gameOver) break;
  }
  bubble(`匯入完成（${moveHistory.length} 步）`);
}
function makeShareUrl() {
  const data = {
    s: BOARD_SIZE,
    m: moveHistory.map(m => [m.row, m.col]),
  };
  const enc = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
  return `${location.origin}${location.pathname}#share=${enc}`;
}
function shareCurrent() {
  if (moveHistory.length === 0) return bubble("還沒下任何一步");
  const url = makeShareUrl();
  navigator.clipboard?.writeText(url).then(
    () => bubble("🔗 分享連結已複製"),
    () => prompt("請手動複製：", url)
  );
}
function maybeLoadFromUrl() {
  const m = location.hash.match(/^#share=(.+)$/);
  if (!m) return;
  try {
    const data = JSON.parse(decodeURIComponent(escape(atob(m[1]))));
    if (data.s) {
      BOARD_SIZE = data.s;
      boardSizeSelect.value = BOARD_SIZE;
      setBoardSize(BOARD_SIZE);
    }
    mode = "pvp";
    modeSelect.value = "pvp";
    document.body.dataset.mode = "pvp";
    for (const [r, c] of data.m) {
      const color = moveHistory.length % 2 === 0 ? "black" : "white";
      commitMove(r, c, color);
      if (gameOver) break;
    }
    bubble(`已載入分享棋譜（${moveHistory.length} 步）`);
  } catch (e) { console.warn("分享連結解析失敗", e); }
}

/* ---------- 18. 回放（步驟瀏覽） ---------- */
function enterReplay(idx) {
  if (snapshotHistory === null) snapshotHistory = moveHistory.slice();
  replayIndex = clamp(idx, 0, snapshotHistory.length);
  // rebuild board
  boardState = createEmptyBoard(BOARD_SIZE);
  moveHistory = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const p = pointRefs[r][c];
      p.classList.remove("occupied","last-move","winning");
      p.style.removeProperty("--stone-stack");
      p.replaceChildren();
    }
  }
  for (let i = 0; i < replayIndex; i++) {
    const m = snapshotHistory[i];
    boardState[m.row][m.col] = m.color;
    placeStone(m.row, m.col, m.color, false);
  }
  if (replayIndex > 0) {
    const last = snapshotHistory[replayIndex - 1];
    setLastMove(last.row, last.col);
  } else {
    setLastMove(null, null);
  }
  refreshReplayUi();
  if (replayIndex === snapshotHistory.length) {
    moveHistory = snapshotHistory.slice();
    snapshotHistory = null;
    replayIndex = null;
  }
}
function refreshReplayUi() {
  const total = (snapshotHistory || moveHistory).length;
  const cur = replayIndex == null ? total : replayIndex;
  $("replayPos").textContent = total ? `${cur}/${total}` : "--/--";
}

/* ---------- 19. 殘局解謎 ---------- */
function buildPuzzleList() {
  const sel = $("puzzleSelect");
  sel.innerHTML = "";
  PUZZLES.forEach((p, i) => {
    const o = document.createElement("option");
    o.value = i;
    o.textContent = `${i + 1}. ${p.name}（${p.size}×${p.size}）`;
    sel.appendChild(o);
  });
}
function loadPuzzle(idx) {
  currentPuzzle = idx;
  const p = PUZZLES[idx];
  if (!p) return;
  if (p.size !== BOARD_SIZE) {
    BOARD_SIZE = p.size;
    boardSizeSelect.value = String(p.size);
    setBoardSize(p.size);
  } else {
    setBoardSize(p.size);
  }
  for (const [color, r, c] of p.setup) {
    boardState[r][c] = color;
    placeStone(r, c, color, false);
  }
  moveHistory = []; // 解謎不計入歷史
  currentPlayer = p.turn;
  gameOver = false;
  $("puzzleHint").textContent = `${p.hint}（剩 ${p.target} 步）`;
  $("puzzleStars").textContent = "";
  updateStatus(`解謎：${playerLabel(p.turn)} 先`);
}
function handlePuzzleMove(row, col) {
  const p = PUZZLES[currentPuzzle];
  if (!p) return;
  if (boardState[row][col]) return;
  if (!commitMove(row, col, currentPlayer)) return;
  // 已勝
  if (gameOver) {
    $("puzzleStars").textContent = "⭐⭐⭐";
    $("puzzleHint").textContent = "✅ 完美解出！";
    unlockAchievement("puzzle_solved");
    return;
  }
  // 還沒勝 — 讓 AI 對手回應
  setTimeout(() => {
    if (gameOver) return;
    const aiColor = currentPlayer; // 已切換
    const move = chooseAiMove(AI_LEVELS.hard, aiColor);
    if (move) commitMove(move.row, move.col, aiColor);
  }, 350);
}

/* ---------- 20. 每日挑戰 ---------- */
function dateSeed(date = new Date()) {
  const d = `${date.getFullYear()}${date.getMonth()}${date.getDate()}`;
  let h = 0;
  for (let i = 0; i < d.length; i++) h = (h * 31 + d.charCodeAt(i)) >>> 0;
  return h;
}
function seededRandom(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xFFFFFFFF; };
}
function startDailyChallenge() {
  setBoardSize(15);
  const seed = dateSeed();
  const rnd = seededRandom(seed);
  // AI 先手隨機一個小範圍開局
  const c = Math.floor(BOARD_SIZE / 2);
  const dr = Math.floor(rnd() * 3) - 1;
  const dc = Math.floor(rnd() * 3) - 1;
  commitMove(c + dr, c + dc, "white");
  humanColor = "black";
  currentPlayer = "black";
  updateStatus(`每日挑戰（黑棋你）— ${new Date().toLocaleDateString()}`);
  bubble(`今日挑戰開始 🌅`);
}
function handleDailyHumanMove(row, col) {
  if (currentPlayer !== humanColor) return;
  if (!commitMove(row, col, humanColor)) return;
  if (gameOver) return;
  setTimeout(() => {
    if (gameOver) return;
    const move = chooseAiMove(AI_LEVELS.hard, "white");
    if (move) commitMove(move.row, move.col, "white");
  }, 350);
}

/* ---------- 21. 線上對戰 (PeerJS) ---------- */
function ensurePeerLib() {
  return typeof window.Peer !== "undefined";
}
function startHosting() {
  if (!ensurePeerLib()) return setOnlineStatus("PeerJS 載入失敗");
  if (onlinePeer) onlinePeer.destroy();
  onlinePeer = new Peer();
  onlinePeer.on("open", id => {
    setOnlineStatus(`房號：${id}（複製給朋友）`);
    navigator.clipboard?.writeText(id).catch(() => {});
    onlineColor = "black";
  });
  onlinePeer.on("connection", conn => attachOnlineConn(conn, "host"));
  onlinePeer.on("error", e => setOnlineStatus(`PeerJS 錯誤：${e.type}`));
}
function joinRoom(code) {
  if (!ensurePeerLib()) return setOnlineStatus("PeerJS 載入失敗");
  if (!code) return setOnlineStatus("請輸入房號");
  if (onlinePeer) onlinePeer.destroy();
  onlinePeer = new Peer();
  onlinePeer.on("open", () => {
    const conn = onlinePeer.connect(code);
    attachOnlineConn(conn, "guest");
    onlineColor = "white";
    setOnlineStatus("連線中...");
  });
  onlinePeer.on("error", e => setOnlineStatus(`PeerJS 錯誤：${e.type}`));
}
function attachOnlineConn(conn, role) {
  onlineConn = conn;
  conn.on("open", () => {
    setOnlineStatus(`已連線（你是${onlineColor === "black" ? "黑" : "白"}棋）`);
    mode = "online";
    modeSelect.value = "online";
    document.body.dataset.mode = "online";
    resetGame();
  });
  conn.on("data", data => {
    if (data.type === "move") {
      commitMove(data.row, data.col, data.color);
    } else if (data.type === "reset") {
      resetGame();
    }
  });
  conn.on("close", () => setOnlineStatus("對手已離線"));
  conn.on("error", () => setOnlineStatus("連線錯誤"));
}
function handleOnlineHumanMove(row, col) {
  if (!onlineConn || !onlineColor) return;
  if (currentPlayer !== onlineColor) return;
  if (!commitMove(row, col, onlineColor)) return;
  onlineConn.send({ type:"move", row, col, color: onlineColor });
}
function setOnlineStatus(msg) {
  $("onlineStatus").textContent = msg;
}

/* ---------- 22. 視角 / 自動旋轉 ---------- */
function applyRotation() {
  rotation.zoom = clamp(rotation.zoom, Number(zoomRange.min), Number(zoomRange.max));
  board3d.style.transform =
    `rotateX(${rotation.pitch}deg) rotateY(${rotation.yaw}deg) scale(${rotation.zoom})`;
}
function refreshZoomLimit() {
  const mobile = window.matchMedia("(max-width: 980px)").matches;
  const min = mobile ? 0.78 : 0.65;
  const max = mobile ? 1.00 : 1.45;
  zoomRange.min = String(min);
  zoomRange.max = String(max);
  const nextZoom = clamp(rotation.zoom, min, max);
  if (rotation.zoom !== nextZoom) {
    rotation.zoom = nextZoom;
    syncControls();
  }
}
function syncControls() {
  yawRange.value = normalizeAngle(rotation.yaw).toFixed(1);
  pitchRange.value = rotation.pitch.toFixed(1);
  zoomRange.value = rotation.zoom.toFixed(2);
}
function startAutoRotateLoop() {
  const tick = () => {
    if (rotation.autoSpin && !dragState.active) {
      rotation.yaw = normalizeAngle(rotation.yaw + 0.35);
      yawRange.value = rotation.yaw.toFixed(1);
      applyRotation();
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
function applyViewPreset(name) {
  const p = {
    flat:  { yaw: 0,   pitch: 0,   zoom: 1.0 },
    slant: { yaw: 24,  pitch: 38,  zoom: 1.05 },
    top:   { yaw: 0,   pitch: 80,  zoom: 1.0 },
    fpv:   { yaw: 12,  pitch: 65,  zoom: 1.25 },
  }[name];
  if (!p) return;
  Object.assign(rotation, p);
  syncControls();
  applyRotation();
}

/* ---------- 23. 天氣 / 撒花 ---------- */

function startWeatherLoop() {
  if (weatherStarted) return;
  weatherStarted = true;
  resizeCanvases();
  window.addEventListener("resize", resizeCanvases);
  const tick = () => {
    drawWeather();
    drawConfetti();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
function resizeCanvases() {
  for (const cv of [weatherCanvas, confettiCanvas]) {
    cv.width = cv.clientWidth * devicePixelRatio;
    cv.height = cv.clientHeight * devicePixelRatio;
  }
}
function spawnWeather() {
  weatherParticles = [];
  const kind = document.body.dataset.weather;
  if (kind === "none") return;
  const W = weatherCanvas.width, H = weatherCanvas.height;
  const count = kind === "stars" ? 80 : 90;
  for (let i = 0; i < count; i++) {
    weatherParticles.push({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * (kind === "rain" ? 0.5 : 1.2),
      vy: (kind === "rain" ? 7 : kind === "stars" ? 0 : 1.5) + Math.random() * 1.5,
      r: kind === "rain" ? 1 : kind === "stars" ? 1 + Math.random()*2 : 2 + Math.random()*4,
      a: Math.random() * Math.PI * 2,
      tw: Math.random() * 0.04 + 0.01,
    });
  }
}
function drawWeather() {
  const ctx = weatherCanvas.getContext("2d");
  ctx.clearRect(0, 0, weatherCanvas.width, weatherCanvas.height);
  const kind = document.body.dataset.weather;
  if (kind === "none") return;
  const W = weatherCanvas.width, H = weatherCanvas.height;
  for (const p of weatherParticles) {
    p.x += p.vx; p.y += p.vy; p.a += 0.03;
    if (p.y > H + 10) { p.y = -10; p.x = Math.random() * W; }
    if (p.x > W + 10) p.x = -10;
    if (p.x < -10) p.x = W + 10;
    if (kind === "snow") {
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    } else if (kind === "rain") {
      ctx.strokeStyle = "rgba(180,210,255,0.55)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + 1, p.y + 8);
      ctx.stroke();
    } else if (kind === "sakura") {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.a);
      ctx.fillStyle = "rgba(255,180,200,0.9)";
      ctx.beginPath();
      ctx.ellipse(0, 0, p.r, p.r * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (kind === "stars") {
      const tw = 0.5 + 0.5 * Math.sin(p.a);
      ctx.fillStyle = `rgba(255,255,200,${0.4 + 0.5 * tw})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function burstConfetti() {
  resizeCanvases();
  const W = confettiCanvas.width, H = confettiCanvas.height;
  confettiParticles = [];
  const colors = ["#ff5e5e","#ffd24c","#5cd6a3","#5da7ff","#c97aff","#ff97c4"];
  for (let i = 0; i < 140; i++) {
    confettiParticles.push({
      x: W / 2,
      y: H / 2,
      vx: (Math.random() - 0.5) * 14,
      vy: (Math.random() - 0.9) * 14,
      g: 0.35,
      a: Math.random() * Math.PI * 2,
      va: (Math.random() - 0.5) * 0.3,
      size: 4 + Math.random() * 5,
      color: colors[Math.floor(Math.random() * colors.length)],
      life: 120,
    });
  }
}
function drawConfetti() {
  const ctx = confettiCanvas.getContext("2d");
  ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
  if (confettiParticles.length === 0) return;
  const remain = [];
  for (const p of confettiParticles) {
    p.vy += p.g;
    p.x += p.vx; p.y += p.vy;
    p.a += p.va;
    p.life--;
    if (p.life > 0) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.a);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.45);
      ctx.restore();
      remain.push(p);
    }
  }
  confettiParticles = remain;
}

/* ---------- 24. 事件綁定 ---------- */
function attachEvents() {
  // 模式
  modeSelect.addEventListener("change", () => {
    mode = modeSelect.value;
    document.body.dataset.mode = mode;
    saveSettings();
    if (mode === "puzzle") {
      const idx = Number($("puzzleSelect").value || 0);
      loadPuzzle(idx);
    } else if (mode === "daily") {
      resetGame();
    } else {
      resetGame();
    }
  });

  document.querySelectorAll('input[name="playerColor"]').forEach(r => {
    r.addEventListener("change", () => {
      humanColor = r.value;
      saveSettings();
      if (mode === "pve") resetGame();
    });
  });

  boardSizeSelect.addEventListener("change", () => {
    setBoardSize(Number(boardSizeSelect.value));
    saveSettings();
    resetGame();
  });

  forbiddenToggle.addEventListener("change", () => {
    forbiddenOn = forbiddenToggle.checked;
    saveSettings();
  });

  timerModeSelect.addEventListener("change", () => {
    perMoveSeconds = Number(timerModeSelect.value);
    saveSettings();
    if (perMoveSeconds > 0) startTimer(); else stopTimer();
  });

  // 操作按鈕
  $("resetBtn").addEventListener("click", () => resetGame());
  $("undoBtn").addEventListener("click", undoMove);
  $("redoBtn").addEventListener("click", redoMove);
  $("hintBtn").addEventListener("click", showHint);

  // AI 等級
  aiLevelInput.addEventListener("change", () => {
    saveSettings();
    if (aiThinking) updateStatus(`電腦切換為「${AI_LEVELS[aiLevelInput.value].label}」`);
  });

  // 視角
  yawRange.addEventListener("input", () => { rotation.yaw = +yawRange.value; applyRotation(); });
  pitchRange.addEventListener("input", () => { rotation.pitch = +pitchRange.value; applyRotation(); });
  zoomRange.addEventListener("input", () => { rotation.zoom = +zoomRange.value; applyRotation(); });
  autoSpinInput.addEventListener("change", () => { rotation.autoSpin = autoSpinInput.checked; });
  document.querySelectorAll(".preset[data-preset]").forEach(b => {
    b.addEventListener("click", () => applyViewPreset(b.dataset.preset));
  });

  // 外觀
  themeSelect.addEventListener("change", () => {
    document.body.dataset.theme = themeSelect.value;
    saveSettings();
  });
  skinSelect.addEventListener("change", () => {
    document.body.dataset.skin = skinSelect.value;
    saveSettings();
  });
  weatherSelect.addEventListener("change", () => {
    document.body.dataset.weather = weatherSelect.value;
    saveSettings();
    spawnWeather();
  });
  soundToggle.addEventListener("change", () => {
    soundOn = soundToggle.checked;
    saveSettings();
    if (soundOn) ensureAudio();
  });

  // 戰績
  $("resetStatsBtn").addEventListener("click", () => {
    if (!confirm("確定清除所有戰績與成就？")) return;
    stats = { black:0, white:0, draw:0, streak:0, lastWinner:null, sizesPlayed:[], achievements:[] };
    saveStats();
  });

  // 棋譜
  $("exportBtn").addEventListener("click", exportGame);
  $("shareBtn").addEventListener("click", shareCurrent);
  $("importBtn").addEventListener("click", () => $("importDialog").showModal());
  $("importConfirm").addEventListener("click", () => {
    importGameFromText($("importText").value);
    $("importDialog").close();
  });

  // 回放
  $("replayPrev").addEventListener("click", () => {
    if (snapshotHistory === null) snapshotHistory = moveHistory.slice();
    enterReplay((replayIndex == null ? snapshotHistory.length : replayIndex) - 1);
  });
  $("replayNext").addEventListener("click", () => {
    if (snapshotHistory === null) snapshotHistory = moveHistory.slice();
    enterReplay((replayIndex == null ? snapshotHistory.length : replayIndex) + 1);
  });

  // 解謎
  $("puzzleStart").addEventListener("click", () => {
    mode = "puzzle";
    modeSelect.value = "puzzle";
    document.body.dataset.mode = "puzzle";
    loadPuzzle(Number($("puzzleSelect").value || 0));
  });

  // 線上
  $("hostBtn").addEventListener("click", startHosting);
  $("joinBtn").addEventListener("click", () => joinRoom($("joinCode").value.trim()));

  // 安裝
  $("installBtn").addEventListener("click", handleInstallClick);

  // 拖曳旋轉（延後觸發：要移動 5px 以上才視為拖曳）
  scene.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    if (e.target.closest(".intersection")) return;
    dragState.active = false; // 還未確定要拖
    dragState.pending = true;
    dragState.pointerId = e.pointerId;
    dragState.startX = e.clientX;
    dragState.startY = e.clientY;
    dragState.startYaw = rotation.yaw;
    dragState.startPitch = rotation.pitch;
  });
  scene.addEventListener("pointermove", (e) => {
    if (e.pointerId !== dragState.pointerId) return;
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    if (dragState.pending) {
      if (Math.abs(dx) + Math.abs(dy) < 5) return;
      dragState.pending = false;
      dragState.active = true;
      board3d.classList.add("is-dragging");
      try { scene.setPointerCapture(e.pointerId); } catch {}
    }
    if (!dragState.active) return;
    rotation.yaw = normalizeAngle(dragState.startYaw + dx * 0.45);
    rotation.pitch = clamp(dragState.startPitch - dy * 0.35, -80, 80);
    syncControls();
    applyRotation();
  });
  scene.addEventListener("pointerup", endDrag);
  scene.addEventListener("pointercancel", endDrag);
  scene.addEventListener("wheel", (e) => {
    e.preventDefault();
    rotation.zoom = clamp(rotation.zoom - e.deltaY * 0.0009, Number(zoomRange.min), Number(zoomRange.max));
    syncControls();
    applyRotation();
  }, { passive: false });
  window.addEventListener("resize", () => {
    refreshZoomLimit();
    applyRotation();
  });
  scene.addEventListener("contextmenu", e => e.preventDefault());

  // 第一次點擊解鎖音訊
  document.addEventListener("pointerdown", ensureAudio, { once: true });

  spawnWeather();
}
function endDrag(e) {
  if (e.pointerId !== dragState.pointerId) return;
  dragState.active = false;
  dragState.pending = false;
  dragState.pointerId = null;
  board3d.classList.remove("is-dragging");
  try { if (scene.hasPointerCapture(e.pointerId)) scene.releasePointerCapture(e.pointerId); } catch {}
}

/* ---------- 25. PWA / 安裝 ---------- */
function initPwa() {
  refreshInstallUi();
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    refreshInstallUi();
  });
  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    refreshInstallUi("已安裝完成。");
  });
  if (!("serviceWorker" in navigator)) {
    refreshInstallUi("瀏覽器不支援離線安裝。");
    return;
  }
  if (location.protocol === "file:") {
    refreshInstallUi("請改用本機伺服器或 HTTPS 開啟。");
    return;
  }
  navigator.serviceWorker.register("./service-worker.js").catch(() => {
    refreshInstallUi("安裝功能初始化失敗。");
  });
}
function refreshInstallUi(message) {
  const installBtn = $("installBtn");
  const installHelp = $("installHelp");
  const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  if (standalone) {
    installBtn.hidden = true;
    installHelp.textContent = message ?? "已以 APP 模式開啟。";
    return;
  }
  installBtn.hidden = false;
  if (deferredInstallPrompt) {
    installBtn.disabled = false;
    installHelp.textContent = message ?? "可安裝至主畫面。";
  } else if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
    installBtn.disabled = false;
    installHelp.textContent = message ?? "iOS 請按瀏覽器分享 → 加入主畫面。";
  } else {
    installBtn.disabled = true;
    installHelp.textContent = message ?? "瀏覽器尚未提供安裝提示。";
  }
}
async function handleInstallClick() {
  if (deferredInstallPrompt) {
    const e = deferredInstallPrompt;
    deferredInstallPrompt = null;
    e.prompt();
    await e.userChoice;
    refreshInstallUi();
    return;
  }
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
    alert("iOS 安裝：Safari 分享按鈕 → 加入主畫面。");
  }
}

/* ---------- 26. Utils ---------- */
function createEmptyBoard(n) {
  return Array.from({ length: n }, () => Array(n).fill(null));
}
function ratioAtIndex(i) { return MARGIN_RATIO + CELL_RATIO * i; }
function toPercent(v) { return `${(v * 100).toFixed(6)}%`; }
function isOuter(i) { return i === 0 || i === BOARD_SIZE - 1; }
function clamp(v, mn, mx) { return Math.max(mn, Math.min(mx, v)); }
function normalizeAngle(a) { return ((a % 360) + 360) % 360; }
function isInside(r, c) { return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE; }
function opp(c) { return c === "black" ? "white" : "black"; }
function randomInt(mn, mx) { return Math.floor(Math.random() * (mx - mn + 1)) + mn; }
function playerLabel(color) {
  if (mode === "pve") {
    return color === humanColor ? `${color === "black" ? "黑" : "白"}棋（你）` : `${color === "black" ? "黑" : "白"}棋（電腦）`;
  }
  return color === "black" ? "黑棋" : "白棋";
}
function updateStatus(t) { statusEl.textContent = t; }
