export const RULE_DIRECTIONS = [[1, 0], [0, 1], [1, 1], [1, -1]];

export function createRuleBoard(size) {
  return Array.from({ length: size }, () => Array(size).fill(null));
}

export function analyzeForbiddenMove(board, size, row, col) {
  const threat = analyzeMoveThreat(board, size, row, col, "black", { renjuBlack: true });
  if (!threat.valid) return { ...threat, forbidden: false, reason: "invalid" };

  if (threat.overline) {
    return { ...threat, forbidden: true, reason: "long-line", label: "長連" };
  }
  if (threat.exactFive) {
    return { ...threat, forbidden: false, reason: "exact-five", label: "五連" };
  }
  if (threat.fourThreats >= 2) {
    return { ...threat, forbidden: true, reason: "double-four", label: "雙四" };
  }
  if (threat.openThrees >= 2) {
    return { ...threat, forbidden: true, reason: "double-three", label: "雙三" };
  }
  return { ...threat, forbidden: false, reason: "legal", label: "合法" };
}

export function analyzeMoveThreat(board, size, row, col, color, options = {}) {
  const renjuBlack = options.renjuBlack === true;
  if (!isInside(size, row, col) || board[row][col]) {
    return emptyThreat({ valid: false });
  }

  board[row][col] = color;
  try {
    let exactFive = false;
    let overline = false;
    let immediateWins = 0;
    let fourThreats = 0;
    let openThrees = 0;

    for (const [dx, dy] of RULE_DIRECTIONS) {
      const run = runLengthThrough(board, size, row, col, dx, dy, color);
      if (run === 5) {
        exactFive = true;
        immediateWins += 1;
      } else if (run > 5) {
        overline = true;
        if (!(renjuBlack && color === "black")) immediateWins += 1;
      }

      if (hasWinningCompletion(board, size, row, col, dx, dy, color, renjuBlack)) {
        fourThreats += 1;
      }
      if (hasOpenThreePotential(board, size, row, col, dx, dy, color, renjuBlack)) {
        openThrees += 1;
      }
    }

    const forbidden = color === "black" && renjuBlack
      && (overline || (!exactFive && (fourThreats >= 2 || openThrees >= 2)));

    return {
      valid: true,
      exactFive,
      overline,
      immediateWins,
      fourThreats,
      openThrees,
      forbidden,
      score: threatScore({ exactFive, overline, immediateWins, fourThreats, openThrees, forbidden }, color, renjuBlack),
    };
  } finally {
    board[row][col] = null;
  }
}

function emptyThreat(extra = {}) {
  return {
    valid: true,
    exactFive: false,
    overline: false,
    immediateWins: 0,
    fourThreats: 0,
    openThrees: 0,
    forbidden: false,
    score: Number.NEGATIVE_INFINITY,
    ...extra,
  };
}

function threatScore(threat, color, renjuBlack) {
  if (threat.forbidden) return -10_000_000;
  if (threat.exactFive || threat.immediateWins > 0) return 1_500_000;
  if (threat.overline && !(renjuBlack && color === "black")) return 1_200_000;
  return threat.fourThreats * 120_000 + threat.openThrees * 18_000;
}

function hasWinningCompletion(board, size, row, col, dx, dy, color, renjuBlack) {
  for (let offset = -5; offset <= 5; offset += 1) {
    if (offset === 0) continue;
    const r = row + dy * offset;
    const c = col + dx * offset;
    if (!isInside(size, r, c) || board[r][c]) continue;

    board[r][c] = color;
    const run = runLengthThrough(board, size, r, c, dx, dy, color);
    board[r][c] = null;

    if (color === "black" && renjuBlack) {
      if (run === 5) return true;
    } else if (run >= 5) {
      return true;
    }
  }
  return false;
}

function hasOpenThreePotential(board, size, row, col, dx, dy, color, renjuBlack) {
  for (let offset = -4; offset <= 4; offset += 1) {
    if (offset === 0) continue;
    const r = row + dy * offset;
    const c = col + dx * offset;
    if (!isInside(size, r, c) || board[r][c]) continue;

    board[r][c] = color;
    const overline = color === "black" && renjuBlack
      && runLengthThrough(board, size, r, c, dx, dy, color) > 5;
    const openFour = !overline && hasOpenFourSegment(board, size, row, col, offset, dx, dy, color);
    board[r][c] = null;

    if (openFour) return true;
  }
  return false;
}

function hasOpenFourSegment(board, size, row, col, addedOffset, dx, dy, color) {
  for (let start = -3; start <= 0; start += 1) {
    const end = start + 3;
    if (!(start <= 0 && 0 <= end) || !(start <= addedOffset && addedOffset <= end)) continue;

    let ok = true;
    for (let offset = start; offset <= end; offset += 1) {
      const r = row + dy * offset;
      const c = col + dx * offset;
      if (!isInside(size, r, c) || board[r][c] !== color) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;

    const before = cellAt(board, size, row + dy * (start - 1), col + dx * (start - 1));
    const after = cellAt(board, size, row + dy * (end + 1), col + dx * (end + 1));
    if (before === null && after === null) return true;
  }
  return false;
}

function runLengthThrough(board, size, row, col, dx, dy, color) {
  return 1
    + countSide(board, size, row, col, dx, dy, color)
    + countSide(board, size, row, col, -dx, -dy, color);
}

function countSide(board, size, row, col, dx, dy, color) {
  let count = 0;
  let r = row + dy;
  let c = col + dx;
  while (isInside(size, r, c) && board[r][c] === color) {
    count += 1;
    r += dy;
    c += dx;
  }
  return count;
}

function cellAt(board, size, row, col) {
  return isInside(size, row, col) ? board[row][col] : "wall";
}

function isInside(size, row, col) {
  return row >= 0 && row < size && col >= 0 && col < size;
}
