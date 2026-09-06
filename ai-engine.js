/* ai-engine.js — 對局 AI 引擎(純函式、零 DOM;瀏覽器與 Node 共用)
 *
 * 由來(2026-09-06):使用者照「💡 提示」下棋卻輸了——提示走的是大師檔,而大師只是候選點打分 + 3 層淺搜,
 *   只擋「下一手就成五」,看不見對手活三→活四的連環殺,也不會找自己的連續衝四。
 *
 * 分層決策(每一層都比下一層更確定,找到就回,不往下算):
 *   ① 成五            自己有完成點 → 直接贏
 *   ② 擋五            對手有完成點 → 必擋(≥2 個擋不住,盡力擋一個)
 *   ③ VCF 必勝        連續衝四逼到成五(借 puzzle-solver 的威脅空間搜尋,vcfOnly)
 *   ④ 破對手 VCF      對手若換他走就有連續衝四 → 只在「走了之後對手沒有 VCF」的點裡挑
 *   ⑤ VCT 必勝        含活三的威脅連殺(同一支解題器,不限 vcfOnly)
 *   ⑥ 擋活三 / 破連殺  對手此刻有活三 → 候選 = 擋點 ∪ 反衝四;對手有 VCT → 只留能破掉的點
 *   ⑦ 深算            alpha-beta 疊代加深(有時間預算),候選依線型分數排序;節點內先看雙方完成點
 *
 * 規則:自由規則(五連或以上即勝),與 script.js 對局的 commitMove → checkWinFull 一致。
 *   黑棋禁手(renjuBlack)只管「黑不能走禁手點」:候選一律過 analyzeForbiddenMove;
 *   ★ 解題器的證明是自由規則的,黑棋開禁手時它可能靠禁手點取勝 ⇒ 黑+禁手時**不用**③⑤ 攻擊層(守的那半仍準:白沒有禁手)。
 *
 * 回傳 { row, col, reason } —— reason 是給提示氣泡念的一句話,不是給程式判斷的。
 * 零相依;解題器與規則模組都是純函式,會把盤面改回原狀(這裡的搜尋也是:mutate → 還原,不用例外中斷)。
 */
import { winningCells, fourMoves, solve, defenderOptions, isWinAt, other } from "./puzzle-solver.js";
import { analyzeForbiddenMove } from "./game-rules.js";

export const ENGINE_DEFAULTS = {
  renjuBlack: false,
  timeBudgetMs: 900,   // 整手上限(含所有層);瀏覽器主執行緒會凍這麼久,大師檔的思考延遲本來就 0.4~0.9 秒
  vcfDepth: 12,        // 連續衝四最多算幾手(攻方落子數)
  vctDepth: 7,         // 含活三的連殺最多算幾手
  vcfBudget: 30000,    // 解題器節點預算(每次 solve)
  vctBudget: 90000,
  rootWidth: 12,       // 深算根節點候選數
  innerWidth: 8,       // 深算內層候選數
  maxDepth: 4,         // 深算最深幾層(疊代加深,時間到就停)
};

const DIRS4 = [[0, 1], [1, 0], [1, 1], [1, -1]];   // [dr, dc]
const WIN = 1e9;
const INF = Infinity;

/* ── 線型分數(給深算與候選排序用;戰術由解題器負責,這裡只要「方向感」對) ── */
const S = { five: 1e7, open4: 1e6, four: 1e5, open3: 5e4, bopen3: 4e4, three: 5e3, open2: 1500, bopen2: 1200, two: 300, one: 20 };
/* 依序比對、比對到的字元換成 x 避免重複計分;字串:1=己 2=敵 0=空 #=牆 */
const PATTERNS = [
  [/11111/g, "five"],
  [/011110/g, "open4"],
  [/11110|01111|11011|10111|11101/g, "four"],
  [/001110|011100/g, "open3"],
  [/010110|011010/g, "bopen3"],
  [/1110|0111|1101|1011/g, "three"],
  [/001100|011000|000110/g, "open2"],
  [/010100|001010|010010/g, "bopen2"],
  [/11|101/g, "two"],
];

function scoreLine(str) {
  if (!str.includes("1")) return 0;
  let s = str, total = 0;
  for (const [re, key] of PATTERNS) {
    if (!s.includes("1")) break;
    s = s.replace(re, (m) => { total += S[key]; return "x".repeat(m.length); });
  }
  return total;
}

function ch(cell, me) { return cell === null ? "0" : cell === me ? "1" : "2"; }

/** 全盤四方向所有線的字串(兩端補牆) */
function boardLines(board, size, me) {
  const out = [];
  for (let r = 0; r < size; r++) { let s = "#"; for (let c = 0; c < size; c++) s += ch(board[r][c], me); out.push(s + "#"); }
  for (let c = 0; c < size; c++) { let s = "#"; for (let r = 0; r < size; r++) s += ch(board[r][c], me); out.push(s + "#"); }
  for (let k = -(size - 5); k <= size - 5; k++) {          // 主對角:r - c = k
    let s = "#"; for (let r = 0; r < size; r++) { const c = r - k; if (c >= 0 && c < size) s += ch(board[r][c], me); } out.push(s + "#");
  }
  for (let k = 4; k <= 2 * size - 6; k++) {                // 反對角:r + c = k
    let s = "#"; for (let r = 0; r < size; r++) { const c = k - r; if (c >= 0 && c < size) s += ch(board[r][c], me); } out.push(s + "#");
  }
  return out;
}

/** 靜態評估:輪到 side 走。己方線型 − 1.1×敵方線型(守方偏重:同樣的三,對手的比較急) */
export function evaluate(board, size, side) {
  const op = other(side);
  let mine = 0, theirs = 0;
  for (const s of boardLines(board, size, side)) mine += scoreLine(s);
  for (const s of boardLines(board, size, op)) theirs += scoreLine(s);
  return mine - theirs * 1.1;
}

/** 經過 (r,c) 的四條線(以 me 視角)——候選排序用 */
function lineThrough(board, size, r, c, dr, dc, me) {
  let s = "#";
  let rr = r, cc = c;
  while (rr - dr >= 0 && rr - dr < size && cc - dc >= 0 && cc - dc < size) { rr -= dr; cc -= dc; }
  while (rr >= 0 && rr < size && cc >= 0 && cc < size) { s += ch(board[rr][cc], me); rr += dr; cc += dc; }
  return s + "#";
}

/** 這一點對 side 的價值:己方落這裡的線型 + 對方落這裡的線型(擋掉的價值)+ 靠中心 */
export function moveHeuristic(board, size, r, c, side) {
  const op = other(side);
  let att = 0, def = 0;
  board[r][c] = side;
  for (const [dr, dc] of DIRS4) att += scoreLine(lineThrough(board, size, r, c, dr, dc, side));
  board[r][c] = op;
  for (const [dr, dc] of DIRS4) def += scoreLine(lineThrough(board, size, r, c, dr, dc, op));
  board[r][c] = null;
  const mid = (size - 1) / 2;
  return att * 1.05 + def + (size - Math.abs(r - mid) - Math.abs(c - mid)) * 2;
}

function inside(size, r, c) { return r >= 0 && r < size && c >= 0 && c < size; }

/** 空點且(黑+禁手時)不是禁手點 */
function makeLegal(board, size, renjuBlack) {
  return (r, c, color) => {
    if (!inside(size, r, c) || board[r][c] !== null) return false;
    if (renjuBlack && color === "black" && analyzeForbiddenMove(board, size, r, c).forbidden) return false;
    return true;
  };
}

/** 任一顆子周圍 radius 內的空點(去重) */
export function nearEmpty(board, size, radius) {
  const seen = new Set();
  const out = [];
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    if (board[r][c] === null) continue;
    for (let dr = -radius; dr <= radius; dr++) for (let dc = -radius; dc <= radius; dc++) {
      const rr = r + dr, cc = c + dc;
      if (!inside(size, rr, cc) || board[rr][cc] !== null) continue;
      const k = rr * size + cc;
      if (!seen.has(k)) { seen.add(k); out.push([rr, cc]); }
    }
  }
  return out;
}

function countStones(board, size) {
  let n = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (board[r][c] !== null) n++;
  return n;
}

function ranked(board, size, side, cells, legal, width) {
  const scored = [];
  for (const [r, c] of cells) {
    if (!legal(r, c, side)) continue;
    scored.push({ r, c, h: moveHeuristic(board, size, r, c, side) });
  }
  scored.sort((a, b) => b.h - a.h);
  return width ? scored.slice(0, width) : scored;
}

function pickBest(board, size, side, cells, legal) {
  const rk = ranked(board, size, side, cells, legal, 1);
  return rk.length ? [rk[0].r, rk[0].c] : null;
}

/* ── 深算:alpha-beta + 疊代加深(時間到就停,採上一層的結果) ── */
class Deep {
  constructor(board, size, legal, opts, deadline) {
    this.board = board; this.size = size; this.legal = legal; this.opts = opts;
    this.deadline = deadline; this.timedOut = false; this.nodes = 0;
  }
  negamax(depth, alpha, beta, side, ply) {
    const { board, size } = this;
    if ((++this.nodes & 31) === 0 && Date.now() > this.deadline) this.timedOut = true;
    if (this.timedOut) return 0;
    const myWins = winningCells(board, size, side).filter(([r, c]) => this.legal(r, c, side));
    if (myWins.length) return WIN - ply;
    const opWins = winningCells(board, size, other(side));
    if (opWins.length >= 2) return -(WIN - ply - 1);
    if (depth <= 0) return evaluate(board, size, side);
    let cands;
    if (opWins.length === 1) cands = this.legal(opWins[0][0], opWins[0][1], side) ? [{ r: opWins[0][0], c: opWins[0][1] }] : [];
    else cands = ranked(board, size, side, nearEmpty(board, size, 1), this.legal, this.opts.innerWidth);
    if (!cands.length) return -(WIN - ply - 1);
    let best = -INF;
    for (const m of cands) {
      board[m.r][m.c] = side;
      const v = -this.negamax(depth - 1, -beta, -alpha, other(side), ply + 1);
      board[m.r][m.c] = null;
      if (this.timedOut) return 0;
      if (v > best) best = v;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }
  /** 回 { move:[r,c], depth } */
  run(side, cands) {
    const { board } = this;
    let best = cands[0], bestDepth = 0;
    for (let depth = 2; depth <= this.opts.maxDepth; depth++) {
      let iterBest = null, iterVal = -INF, alpha = -INF;
      for (const m of cands) {
        board[m.r][m.c] = side;
        const v = -this.negamax(depth - 1, -INF, -alpha, other(side), 1);
        board[m.r][m.c] = null;
        if (this.timedOut) break;
        if (v > iterVal) { iterVal = v; iterBest = m; }
        if (v > alpha) alpha = v;
      }
      if (this.timedOut) break;
      best = iterBest || best; bestDepth = depth;
      if (iterVal >= WIN - 20 || iterVal <= -(WIN - 20)) break;   // 已看到必勝/必敗,不必再深
    }
    return { move: [best.r, best.c], depth: bestDepth, nodes: this.nodes };
  }
}

/**
 * 主入口(大師檔 / 💡 提示)。board 會被暫時改動、一定還原(無例外路徑)。
 * @returns {{row:number,col:number,reason:string}|null}  null = 沒有可走的點
 */
export function chooseBestMove(board, size, color, options = {}) {
  return decide(board, size, color, { ...ENGINE_DEFAULTS, ...options }, "full");
}

/**
 * 只守不攻(困難檔用,0906 使用者拍板):①成五 ②擋五 ④破對手 VCF ⑥擋活三 / 破對手 VCT——**有威脅才回一手**;
 * 沒有威脅回 null ⇒ 呼叫端走自己原本的路(舊打分 + 故意犯錯)。結果是「不會漏擋、但仍會犯錯」,孩子還是贏得了。
 * 預算預設 400ms(比大師短:它只跑守的那幾層)。
 */
export function chooseDefensiveMove(board, size, color, options = {}) {
  return decide(board, size, color, { ...ENGINE_DEFAULTS, timeBudgetMs: 400, ...options }, "defend");
}

function decide(board, size, color, opts, mode) {
  const full = mode === "full";
  const t0 = Date.now();
  const deadline = t0 + opts.timeBudgetMs;
  const timeLeft = () => deadline - Date.now();
  const me = color, op = other(color);
  const legal = makeLegal(board, size, opts.renjuBlack);
  const attackOk = full && !(opts.renjuBlack && me === "black");   // 黑+禁手:解題器的證明可能靠禁手點,不拿來攻;defend 模式本來就不攻
  const out = (m, reason) => ({ row: m[0], col: m[1], reason });

  /* 開局(只有 full;defend 沒東西可守,回 null 讓舊路開局) */
  const stones = countStones(board, size);
  const mid = Math.floor(size / 2);
  if (stones <= 1) {
    if (!full) return null;
    if (stones === 0) return legal(mid, mid, me) ? out([mid, mid], "開局取天元") : null;
    let first = null;
    for (let r = 0; r < size && !first; r++) for (let c = 0; c < size; c++) if (board[r][c] !== null) { first = [r, c]; break; }
    const opts8 = [[1, 1], [1, -1], [-1, 1], [-1, -1], [0, 1], [0, -1], [1, 0], [-1, 0]]
      .map(([dr, dc]) => [first[0] + dr, first[1] + dc])
      .filter(([r, c]) => legal(r, c, me))
      .sort((a, b) => (Math.abs(a[0] - mid) + Math.abs(a[1] - mid)) - (Math.abs(b[0] - mid) + Math.abs(b[1] - mid)));
    if (opts8.length) return out(opts8[0], "開局貼著第一手");
  }

  /* ① 成五 */
  const myWins = winningCells(board, size, me).filter(([r, c]) => legal(r, c, me));
  if (myWins.length) return out(myWins[0], "這一手成五");

  /* ② 擋五 */
  const opWins = winningCells(board, size, op);
  if (opWins.length) {
    const blocks = opWins.filter(([r, c]) => legal(r, c, me));
    if (blocks.length) {
      const m = blocks.length === 1 ? blocks[0] : pickBest(board, size, me, blocks, legal);
      return out(m, opWins.length >= 2 ? "對手有兩個成五點,擋得住一個算一個" : "對手下一手就成五,必須擋");
    }
  }

  /* ③ 自己的 VCF(只有 full) */
  if (attackOk && timeLeft() > opts.timeBudgetMs * 0.35) {
    const r = solve(board, size, me, opts.vcfDepth, { vcfOnly: true, budget: opts.vcfBudget, deadline });
    if (r.depth != null && r.move && legal(r.move[0], r.move[1], me)) return out(r.move, `連續衝四,${r.depth} 手內必勝`);
  }

  /* ④ 破對手的 VCF:對手若換他走就有連續衝四 */
  let restricted = null, restrictedReason = "";
  if (timeLeft() > opts.timeBudgetMs * 0.3) {
    const theirs = solve(board, size, op, opts.vcfDepth, { vcfOnly: true, budget: opts.vcfBudget, deadline });
    if (theirs.depth != null) {
      const saves = [];
      const cands = nearEmpty(board, size, 2).filter(([r, c]) => legal(r, c, me));
      for (const [r, c] of cands) {
        if (timeLeft() < opts.timeBudgetMs * 0.15) break;
        board[r][c] = me;
        let ok;
        if (isWinAt(board, size, r, c, me)) ok = true;
        else {
          const again = solve(board, size, op, theirs.depth + 2, { vcfOnly: true, budget: Math.min(opts.vcfBudget, 12000), deadline });
          ok = again.depth == null && !again.aborted;
        }
        board[r][c] = null;
        if (ok) saves.push([r, c]);
      }
      // depth 2 = 對手下一手就能做出活四(=他現在有活三);更深才是真的一串衝四
      if (saves.length) { restricted = saves; restrictedReason = theirs.depth <= 2 ? "對手活三,必須擋或反衝四" : `對手有連續衝四(${theirs.depth} 手),先破掉`; }
    }
  }

  /* ⑤ 自己的 VCT(含活三;只有 full) */
  if (!restricted && attackOk && timeLeft() > opts.timeBudgetMs * 0.45) {
    const r = solve(board, size, me, opts.vctDepth, { budget: opts.vctBudget, deadline });
    if (r.depth != null && r.move && legal(r.move[0], r.move[1], me)) return out(r.move, `活三連殺,${r.depth} 手內必勝`);
  }

  /* ⑥ 對手此刻的活三(擋點 ∪ 反衝四);或對手有 VCT ⇒ 只留能破掉的點 */
  if (!restricted) {
    const od = defenderOptions(board, size, op);
    if (od.kind === "threat") {
      const cands = od.moves.filter(([r, c]) => legal(r, c, me));
      if (cands.length) { restricted = cands; restrictedReason = od.unstoppable ? "對手雙活三,盡力擋" : "對手活三,必須擋或反衝四"; }
    }
  }
  if (!restricted && timeLeft() > opts.timeBudgetMs * 0.4) {
    const theirs = solve(board, size, op, Math.max(3, opts.vctDepth - 2), { budget: Math.min(opts.vctBudget, 40000), deadline });
    if (theirs.depth != null) {
      const saves = [];
      const top = ranked(board, size, me, nearEmpty(board, size, 2), legal, opts.rootWidth);
      for (const own of fourMoves(board, size, me)) if (legal(own[0], own[1], me) && !top.some((t) => t.r === own[0] && t.c === own[1])) top.push({ r: own[0], c: own[1], h: 0 });
      for (const m of top) {
        if (timeLeft() < opts.timeBudgetMs * 0.15) break;
        board[m.r][m.c] = me;
        let ok;
        if (isWinAt(board, size, m.r, m.c, me)) ok = true;
        else {
          const again = solve(board, size, op, theirs.depth + 1, { budget: 40000, deadline });
          ok = again.depth == null && !again.aborted;   // 預算用完(aborted)= 證不了有破 → 不算破
        }
        board[m.r][m.c] = null;
        if (ok) saves.push([m.r, m.c]);
      }
      if (saves.length) { restricted = saves; restrictedReason = "對手有活三連殺,先破掉"; }
    }
  }

  /* defend 模式:沒有任何威脅 ⇒ 交回呼叫端的舊路 */
  if (!full && !restricted) return null;

  /* ⑦ 深算 */
  const pool = restricted || nearEmpty(board, size, 2);
  let cands = ranked(board, size, me, pool, legal, opts.rootWidth);
  if (!cands.length && full) cands = ranked(board, size, me, nearEmpty(board, size, 3), legal, opts.rootWidth);
  if (!cands.length) {
    if (!full) return null;
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (legal(r, c, me)) return out([r, c], "只剩這裡能下");
    return null;
  }
  if (cands.length === 1) return out([cands[0].r, cands[0].c], restrictedReason || "只有一個合理的點");
  const remain = Math.max(60, timeLeft());
  const deep = new Deep(board, size, legal, opts, Date.now() + remain);
  const res = deep.run(me, cands);
  return out(res.move, restrictedReason || (res.depth >= 3 ? `往後算了 ${res.depth} 手` : "局面評估"));
}
