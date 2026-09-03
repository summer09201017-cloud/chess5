/* puzzle-solver.js — 五子棋殘局解題器(純函式、零 DOM;瀏覽器與 Node 共用)
 *
 * 規則:自由規則 —— 五連「或以上」即勝、無禁手。
 *       這與 script.js 解謎模式的 commitMove → checkWinFull(cells.length >= 5) 完全一致;
 *       解謎不套用黑棋禁手(handlePuzzleMove 走的是 commitMove,不是 playMoveLocal)。
 *
 * 術語(全檔統一):
 *   完成點 = 空點,己方落子後立刻成五(含以上)
 *   四     = 落子後至少有 1 個完成點;活四 / 雙四 = ≥2 個完成點(對手擋不住)
 *   活三   = 落子後「存在一手能做出 ≥2 個完成點」(下一手就能做出活四)
 *
 * 核心 = 威脅空間搜尋(threat-space search):
 *   攻方只走「威脅手」(四、活三),或被迫去擋守方的四;
 *   守方只能:立刻成五 / 擋掉唯一完成點 / 走能破掉活三的擋點 / 反衝四。
 *   守方的「悄悄手」救不了活三:活三→活四→成五之間守方沒有空手,除非反衝四;
 *   反衝三也沒用(攻方直接做活四,守方擋一邊、另一邊成五)。
 *   ⇒ 守方選項集是完備的,搜尋結果是「對任何防守都必勝」的證明。
 *
 * VCF(opts.vcfOnly = true)= 攻方只走四:守方每一步都被迫,樹是一條線,證明精確且極快。
 *
 * 深度 depth = 攻方總落子數(含最後成五那一手、含被迫去擋守方四的那一手)。
 * 這就是 UI 上「剩 N 步」的 N —— 對任何防守,最多 N 步一定贏。
 *
 * 搜尋法 = 單趟分支定界(不是迭代加深):attackerMin 回「最少幾步必勝」、defenderMax 回
 * 「守方最頑強時攻方還要幾步」;找到 d 步解之後其餘分支只用 d-1 當上限繼續找更短的。
 * 無解局面只掃一棵樹(迭代加深要掃 maxDepth 棵),生成題庫時大多是無解局面,差很多。
 */

export const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];   // [dr, dc]
const ABORT = Symbol("solver-abort");
const INF = Infinity;

export function other(color) { return color === "black" ? "white" : "black"; }

export function createBoard(size) {
  return Array.from({ length: size }, () => Array(size).fill(null));
}

/** setup 格式沿用 script.js 的 PUZZLES:[["black", row, col], ...] */
export function boardFromSetup(size, setup) {
  const board = createBoard(size);
  for (const [color, r, c] of setup) board[r][c] = color;
  return board;
}

export function boardKey(board) {
  return board.map(row => row.map(c => c === "black" ? "X" : c === "white" ? "O" : ".").join("")).join("/");
}

function inside(size, r, c) { return r >= 0 && r < size && c >= 0 && c < size; }

function sideCount(board, size, r, c, dr, dc, color) {
  let n = 0, rr = r + dr, cc = c + dc;
  while (inside(size, rr, cc) && board[rr][cc] === color) { n++; rr += dr; cc += dc; }
  return n;
}

/** (r,c) 視為 color(已落或假設落),沿四線任一線連成 ≥5 即勝 */
export function isWinAt(board, size, r, c, color) {
  for (const [dr, dc] of DIRS) {
    if (1 + sideCount(board, size, r, c, dr, dc, color) + sideCount(board, size, r, c, -dr, -dc, color) >= 5) return true;
  }
  return false;
}

/** 某一線 ±4 窗內己方子數(不含中心) —— 只做預篩,成四至少要 3 顆、成活三至少 2 顆 */
function windowCount(board, size, r, c, dr, dc, color) {
  let n = 0;
  for (let o = -4; o <= 4; o++) {
    if (o === 0) continue;
    const rr = r + dr * o, cc = c + dc * o;
    if (inside(size, rr, cc) && board[rr][cc] === color) n++;
  }
  return n;
}
function maxWindow(board, size, r, c, color) {
  let m = 0;
  for (const [dr, dc] of DIRS) {
    const w = windowCount(board, size, r, c, dr, dc, color);
    if (w > m) m = w;
  }
  return m;
}

/** color 每顆子四條線 ±4 內的所有空點(去重,回傳整數索引 r*size+c)。
 *  任何「color 落子後會改變線型」的點都在這裡面,所以成五點 / 四 / 活三的候選只掃這些,
 *  不必全盤 N² 掃。回傳整數而不是 [r,c] 是為了少配置幾千個小陣列(搜尋熱點)。 */
let markBuf = null;
function nearCells(board, size, color) {
  const n = size * size;
  if (!markBuf || markBuf.length < n) markBuf = new Uint8Array(n); else markBuf.fill(0, 0, n);
  const out = [];
  for (let r = 0; r < size; r++) {
    const row = board[r];
    for (let c = 0; c < size; c++) {
      if (row[c] !== color) continue;
      for (const [dr, dc] of DIRS) {
        for (let o = -4; o <= 4; o++) {
          if (o === 0) continue;
          const rr = r + dr * o, cc = c + dc * o;
          if (!inside(size, rr, cc) || board[rr][cc] !== null) continue;
          const k = rr * size + cc;
          if (!markBuf[k]) { markBuf[k] = 1; out.push(k); }
        }
      }
    }
  }
  return out;
}

/** 全盤:color 立刻成五的所有空點 */
export function winningCells(board, size, color) {
  const out = [];
  for (const k of nearCells(board, size, color)) {
    const r = (k / size) | 0, c = k % size;
    if (maxWindow(board, size, r, c, color) < 4) continue;
    if (isWinAt(board, size, r, c, color)) out.push([r, c]);
  }
  return out;
}

/** (r,c) 已落 color:經過它四條線 ±4 內、color 落子後「沿該線」成五的空點數(= 這一手做出的完成點數)。
 *  ★ 前提:color 在落這手之前沒有任何完成點(呼叫端都先檢查過 winningCells)——
 *    那麼新完成點的五連一定經過 (r,c),只需沿著 (r,c)→e 那條線數,不必四線全查。 */
export function completionsThrough(board, size, r, c, color) {
  let n = 0;
  for (const [dr, dc] of DIRS) {
    for (let o = -4; o <= 4; o++) {
      if (o === 0) continue;
      const rr = r + dr * o, cc = c + dc * o;
      if (!inside(size, rr, cc) || board[rr][cc] !== null) continue;
      if (1 + sideCount(board, size, rr, cc, dr, dc, color) + sideCount(board, size, rr, cc, -dr, -dc, color) >= 5) n++;
    }
  }
  return n;
}

/** (r,c) 已落 color:只沿 (dr,dc) 這一條線、±4 內 color 落子即沿線成五的空點數(活三預判用) */
function completionsAlong(board, size, r, c, dr, dc, color) {
  let n = 0;
  for (let o = -4; o <= 4; o++) {
    if (o === 0) continue;
    const rr = r + dr * o, cc = c + dc * o;
    if (!inside(size, rr, cc) || board[rr][cc] !== null) continue;
    if (1 + sideCount(board, size, rr, cc, dr, dc, color) + sideCount(board, size, rr, cc, -dr, -dc, color) >= 5) n++;
  }
  return n;
}

/** (r,c) 已落 color:是否存在下一手 e 能「沿同一線」做出 ≥2 完成點(= 這一手做出了活三)
 *  ★ 刻意只看同一線:跨線的三四組合會漏掉,但那只影響「找不找得到」,不影響證明的正確性
 *   (守方選項集用的是完整版 completionsThrough / fourMoves)。 */
function makesOpenThree(board, size, r, c, color) {
  for (const [dr, dc] of DIRS) {
    if (windowCount(board, size, r, c, dr, dc, color) < 2) continue;
    for (let o = -4; o <= 4; o++) {
      if (o === 0) continue;
      const rr = r + dr * o, cc = c + dc * o;
      if (!inside(size, rr, cc) || board[rr][cc] !== null) continue;
      board[rr][cc] = color;
      const n = completionsAlong(board, size, rr, cc, dr, dc, color);
      board[rr][cc] = null;
      if (n >= 2) return true;
    }
  }
  return false;
}

/** 落子後至少 1 個完成點的所有空點(= 能衝四的點) */
export function fourMoves(board, size, color) {
  const out = [];
  for (const k of nearCells(board, size, color)) {
    const r = (k / size) | 0, c = k % size;
    if (maxWindow(board, size, r, c, color) < 3) continue;
    board[r][c] = color;
    const n = completionsThrough(board, size, r, c, color);
    board[r][c] = null;
    if (n >= 1) out.push([r, c]);
  }
  return out;
}

/** 攻方威脅手:先「≥2 完成點」(下一手必勝)、再一般四、再活三(vcfOnly 時不含活三) */
export function threatMoves(board, size, color, vcfOnly) {
  const big = [], fours = [], threes = [];
  for (const k of nearCells(board, size, color)) {
    const r = (k / size) | 0, c = k % size;
    const w = maxWindow(board, size, r, c, color);
    if (w < 2) continue;
    board[r][c] = color;
    const comp = w >= 3 ? completionsThrough(board, size, r, c, color) : 0;
    if (comp >= 2) big.push([r, c]);
    else if (comp === 1) fours.push([r, c]);
    else if (!vcfOnly && makesOpenThree(board, size, r, c, color)) threes.push([r, c]);
    board[r][c] = null;
  }
  return big.concat(fours, threes);
}

/**
 * 守方(= other(attacker))此刻的所有合理選項。
 *  kind: "defenderWins" 守方可立刻成五 / "mustBlock" 攻方有完成點(unstoppable=≥2)
 *        / "threat" 攻方有活三(moves = 擋點 ∪ 反衝四) / "noThreat" 攻方沒有威脅
 */
export function defenderOptions(board, size, attacker) {
  const defender = other(attacker);
  const defWins = winningCells(board, size, defender);
  if (defWins.length) return { kind: "defenderWins", moves: defWins };
  const attWins = winningCells(board, size, attacker);
  if (attWins.length) return { kind: "mustBlock", moves: attWins, unstoppable: attWins.length >= 2 };

  // E = 攻方下一手就能做出 ≥2 完成點的空點(活三的「成活四點」)
  const E = [];
  for (const k of nearCells(board, size, attacker)) {
    const r = (k / size) | 0, c = k % size;
    if (maxWindow(board, size, r, c, attacker) < 3) continue;
    board[r][c] = attacker;
    const n = completionsThrough(board, size, r, c, attacker);
    board[r][c] = null;
    if (n >= 2) E.push([r, c]);
  }
  if (!E.length) return { kind: "noThreat", moves: [], threats: E };

  // 擋點候選:E 各點四條線 ±4 內(含 E 本身)的空點;守方走上去後,E 每一點都降到 ≤1 完成點才算擋住
  const cand = new Map();
  for (const [er, ec] of E) {
    cand.set(er * size + ec, [er, ec]);
    for (const [dr, dc] of DIRS) {
      for (let o = -4; o <= 4; o++) {
        const rr = er + dr * o, cc = ec + dc * o;
        if (inside(size, rr, cc) && board[rr][cc] === null) cand.set(rr * size + cc, [rr, cc]);
      }
    }
  }
  const moves = [];
  const seen = new Set();
  for (const [k, b] of cand) {
    board[b[0]][b[1]] = defender;
    let ok = true;
    for (const [er, ec] of E) {
      if (board[er][ec] !== null) continue;             // 擋點就是 E 本身
      board[er][ec] = attacker;
      const n = completionsThrough(board, size, er, ec, attacker);
      board[er][ec] = null;
      if (n >= 2) { ok = false; break; }
    }
    board[b[0]][b[1]] = null;
    if (ok) { moves.push(b); seen.add(k); }
  }
  for (const f of fourMoves(board, size, defender)) {
    const k = f[0] * size + f[1];
    if (!seen.has(k)) { moves.push(f); seen.add(k); }
  }
  // 沒有任何一點擋得住、也沒有反衝四(例如雙活三):守方隨便走都一樣 —— 用「佔掉 E 的某一點」代表,
  // 讓搜尋仍然實際走下去驗證步數。★ 不能回空陣列:空陣列會讓 defenderMax 的 for 迴圈空轉、
  // 直接回 0 = 「還沒證明就宣布必勝」(首版真的踩到:把 4 步殺回報成 3 步)。
  const unstoppable = moves.length === 0;
  if (unstoppable) for (const e of E) moves.push(e);
  return { kind: "threat", moves, threats: E, unstoppable };
}

class Search {
  constructor(board, size, attacker, opts = {}) {
    this.board = board;
    this.size = size;
    this.att = attacker;
    this.def = other(attacker);
    this.vcfOnly = opts.vcfOnly === true;
    this.budget = opts.budget ?? 200000;
    this.nodes = 0;
    this.bestMove = null;   // attackerMin 在根節點找到的最短解第一手
  }

  /** 攻方走,最多 cap 步:回最少幾步必勝(含這一手),> cap 或無解回 INF */
  attackerMin(cap, isRoot = false) {
    if (cap <= 0) return INF;
    if (++this.nodes > this.budget) throw ABORT;
    const { board, size, att, def } = this;
    const attWins = winningCells(board, size, att);
    if (attWins.length) { if (isRoot) this.bestMove = attWins[0]; return 1; }
    if (cap === 1) return INF;
    const defWins = winningCells(board, size, def);
    if (defWins.length >= 2) return INF;
    const moves = defWins.length === 1 ? [defWins[0]] : threatMoves(board, size, att, this.vcfOnly);
    let best = INF;
    for (const m of moves) {
      // 找到 best 步解之後,其餘分支只值得找 ≤ best-1 步的:守方回應後攻方最多還剩 best-2 步
      const sub = best === INF ? cap - 1 : best - 2;
      if (sub <= 0) break;
      board[m[0]][m[1]] = att;
      let d;
      try { d = 1 + this.defenderMax(sub); } finally { board[m[0]][m[1]] = null; }
      if (d < best) { best = d; if (isRoot) this.bestMove = m; if (best === 2) break; }
    }
    return best;
  }

  /** 守方走,攻方之後最多還有 cap 步:回守方最頑強時攻方還需幾步;任一選項擋得住(> cap)就回 INF */
  defenderMax(cap) {
    if (cap <= 0) return INF;
    const { board, size, att, def } = this;
    const opts = defenderOptions(board, size, att);
    if (opts.kind === "defenderWins" || opts.kind === "noThreat") return INF;
    let worst = 0;
    for (const o of opts.moves) {
      board[o[0]][o[1]] = def;
      let d;
      try {
        d = isWinAt(board, size, o[0], o[1], def) ? INF : this.attackerMin(cap);
      } finally { board[o[0]][o[1]] = null; }
      if (d === INF) return INF;
      if (d > worst) worst = d;
    }
    return worst;
  }
}

/**
 * 找最少幾步必勝(單趟分支定界)。
 * 回傳 { depth, move, nodes, aborted }。depth=null 表示 maxDepth 內證明不了(aborted=true 是預算用完,不是「無解」)。
 */
export function solve(board, size, attacker, maxDepth, opts = {}) {
  const s = new Search(board, size, attacker, opts);
  try {
    const d = s.attackerMin(maxDepth, true);
    if (d === INF) return { depth: null, move: null, nodes: s.nodes, aborted: false };
    return { depth: d, move: s.bestMove, nodes: s.nodes, aborted: false };
  } catch (e) {
    if (e === ABORT) return { depth: null, move: null, nodes: s.nodes, aborted: true };
    throw e;
  }
}

/** depth 步內必勝的「所有」第一手(唯一解檢查用) */
export function winningFirstMoves(board, size, attacker, depth, opts = {}) {
  const s = new Search(board, size, attacker, opts);
  const out = [];
  try {
    const attWins = winningCells(board, size, attacker);
    if (attWins.length) return { moves: attWins, aborted: false, nodes: 0 };
    if (depth <= 1) return { moves: [], aborted: false, nodes: 0 };
    const defWins = winningCells(board, size, s.def);
    if (defWins.length >= 2) return { moves: [], aborted: false, nodes: 0 };
    const moves = defWins.length === 1 ? [defWins[0]] : threatMoves(board, size, attacker, s.vcfOnly);
    for (const m of moves) {
      board[m[0]][m[1]] = attacker;
      let d;
      try { d = 1 + s.defenderMax(depth - 1); } finally { board[m[0]][m[1]] = null; }
      if (d <= depth) out.push(m);
    }
    return { moves: out, aborted: false, nodes: s.nodes };
  } catch (e) {
    if (e === ABORT) return { moves: out, aborted: true, nodes: s.nodes };
    throw e;
  }
}

/** 攻方剛落子、輪守方:攻方是否仍然在 depthLeft 步內必勝(對守方所有選項) */
export function attackStillForced(board, size, attacker, depthLeft, opts = {}) {
  const s = new Search(board, size, attacker, opts);
  try {
    const d = s.defenderMax(depthLeft);
    return { forced: d <= depthLeft, depth: d === INF ? null : d, aborted: false, nodes: s.nodes };
  } catch (e) {
    if (e === ABORT) return { forced: false, depth: null, aborted: true, nodes: s.nodes };
    throw e;
  }
}

/**
 * 守方最頑強的一手:能讓攻方在 depthLeft 步內「沒有」必勝的選項優先;都擋不住就選能撐最久的。
 * 回傳 { move, kind, refutes }。move=null 表示攻方根本沒有威脅(呼叫端自己找一手好棋)。
 */
export function bestDefence(board, size, attacker, depthLeft, opts = {}) {
  const defender = other(attacker);
  const o = defenderOptions(board, size, attacker);
  if (o.kind === "defenderWins") return { move: o.moves[0], kind: o.kind, refutes: true };
  if (o.kind === "noThreat") return { move: null, kind: o.kind, refutes: true };
  let best = null, bestDepth = -1;
  for (const m of o.moves) {
    board[m[0]][m[1]] = defender;
    let d;
    try {
      if (isWinAt(board, size, m[0], m[1], defender)) { return { move: m, kind: "win", refutes: true }; }
      const r = solve(board, size, attacker, depthLeft, opts);
      d = r.depth == null ? INF : r.depth;
    } finally { board[m[0]][m[1]] = null; }
    if (d > bestDepth) { bestDepth = d; best = m; }
  }
  return { move: best, kind: o.kind, refutes: bestDepth === INF };
}

/**
 * 守備題:守方(defender)要走,對手有 threatDepth 步 VCF。
 * 回傳所有「走了之後對手在 threatDepth+margin 步內不再有 VCF」的守方著法。
 * 前提:守方沒有反衝四可用(呼叫端用 fourMoves 保證),所以只有攻方線上 ±4 內的點才可能有用。
 */
export function savingMoves(board, size, defender, threatDepth, margin = 2) {
  const attacker = other(defender);
  const out = [];
  for (const k of nearCells(board, size, attacker)) {
    const r = (k / size) | 0, c = k % size;
    board[r][c] = defender;
    let saves;
    try {
      if (isWinAt(board, size, r, c, defender)) saves = true;
      else {
        const res = solve(board, size, attacker, threatDepth + margin, { vcfOnly: true });
        saves = res.depth == null && !res.aborted;
      }
    } finally { board[r][c] = null; }
    if (saves) out.push([r, c]);
  }
  return out;
}
