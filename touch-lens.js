/* 🔍 touch-lens.js —— 手機觸控「按住看放大、放開才落子」放大鏡(棋類共用件;2026-09-05 立)
   由來:五子棋手機上棋子直徑約 16px、圍棋 9 路也只有 ~30px,手指一按就把目標蓋住 ——
   老師/孩子常按到隔壁那格。與其把棋盤放大(放不下),不如在手指上方開一個放大框:
   看得到「我現在指著哪一格、旁邊是什麼」,放開才落子;拖到別格再放,落的是最後那格。

   ★ 正本:hfpc-claude-skills/plugins/hfpc-skills/skills/canvas-touch-targets/assets/touch-lens.js
     各棋 repo(chess5 / hfpc-joshua-land …)是**逐位元副本**;改這裡再搬過去,別在副本上分岔。
   ★ 只管畫面:一顆 position:fixed 的圓形放大框(小畫布 + 一行標籤)。不碰任何規則、不決定何時落子、
     不攔任何事件 —— 呼叫端在 pointerdown/move/up 自己叫 show/move/hide。桌機滑鼠不需要(呼叫端用 pointerType 擋)。
   ★ 零相依、零美術檔;reduced-motion 無關(沒有動畫)。

   用法:
     import { createTouchLens } from './touch-lens.js'
     const lens = createTouchLens({
       size: 120,                              // 放大框直徑(CSS px;≥ 96 才看得清)
       offsetY: 88,                            // 放大框中心在手指上方幾 px(手指要蓋不到它)
       label: (t) => `第 ${t.r + 1} 列・第 ${t.c + 1} 行`,   // 一行字(可省)
       paint: (ctx, t, w, h) => { … },         // 在 w×h 的小畫布上畫「目標與鄰格」(可省;沒給就只有標籤)
     })
     lens.show(target, clientX, clientY)      // 按下:target 是呼叫端自己的座標物件,原樣回傳給 label/paint
     lens.move(target, clientX, clientY)      // 拖動
     lens.hide()                              // 放開 / 取消
     lens.destroy()                           // 嵌入關收工時移除 DOM(獨立站不必) */
export function createTouchLens(opts = {}) {
  const size = Math.max(64, Number(opts.size) || 120);
  const offsetY = Number.isFinite(opts.offsetY) ? opts.offsetY : 88;
  const labelFn = typeof opts.label === 'function' ? opts.label : null;
  const paintFn = typeof opts.paint === 'function' ? opts.paint : null;
  const dpr = Math.max(1, Math.min(3, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1));

  const root = document.createElement('div');
  root.className = 'touch-lens';
  root.setAttribute('aria-hidden', 'true');   // 純視覺回饋;讀屏使用者靠原本的按鈕/aria-label
  root.style.cssText = [
    'position:fixed', 'left:0', 'top:0', 'z-index:2147483000', 'pointer-events:none',
    `width:${size}px`, `height:${size}px`, 'border-radius:50%',
    'box-shadow:0 6px 24px rgba(0,0,0,.45), 0 0 0 3px rgba(255,255,255,.9), 0 0 0 5px rgba(0,0,0,.35)',
    'background:#f3ead6', 'overflow:hidden', 'display:none',
    'transform:translate(-50%,-50%)', 'will-change:left,top',
  ].join(';');
  const cv = document.createElement('canvas');
  cv.width = Math.round(size * dpr); cv.height = Math.round(size * dpr);
  cv.style.cssText = `width:${size}px;height:${size}px;display:block`;
  root.appendChild(cv);
  const tag = document.createElement('div');
  tag.style.cssText = [
    'position:absolute', 'left:0', 'right:0', 'bottom:0', 'padding:3px 0 6px', 'text-align:center',
    'font:700 13px/1.2 system-ui,-apple-system,"Noto Sans TC","PingFang TC",sans-serif',
    'color:#fff', 'background:rgba(0,0,0,.55)', 'letter-spacing:.02em', 'white-space:nowrap',
  ].join(';');
  root.appendChild(tag);
  (document.body || document.documentElement).appendChild(root);

  let shown = false;
  function place(x, y) {
    // 放大框放在手指上方;貼近螢幕頂時改放下方(不然被切掉一半)
    const half = size / 2;
    let cx = Math.min(Math.max(x, half + 4), (window.innerWidth || 0) - half - 4);
    let cy = y - offsetY;
    if (cy - half < 4) cy = y + offsetY;
    root.style.left = cx + 'px';
    root.style.top = cy + 'px';
  }
  function draw(target) {
    if (labelFn) { try { tag.textContent = String(labelFn(target) ?? ''); } catch (_) { tag.textContent = ''; } }
    tag.style.display = tag.textContent ? '' : 'none';
    if (!paintFn) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    try { paintFn(ctx, target, size, size); } catch (_) { /* 放大框壞了不能影響落子 */ }
  }
  return {
    show(target, x, y) { draw(target); place(x, y); if (!shown) { root.style.display = 'block'; shown = true; } },
    move(target, x, y) { if (!shown) return this.show(target, x, y); draw(target); place(x, y); },
    hide() { if (shown) { root.style.display = 'none'; shown = false; } },
    destroy() { this.hide(); root.remove(); },
    get visible() { return shown; },
    el: root,
  };
}

/* 附贈:棋盤類最常用的「目標 + 鄰格」小畫法。呼叫端給一個 stoneAt(r, c) 回 'black' | 'white' | null | undefined(出界),
   這裡畫 3×3(cells 可調)的格線、星點與棋子,中央那格加一圈目標環。zero-dep,純 2D。 */
export function paintBoardNeighborhood(ctx, w, h, { r, c }, stoneAt, opts = {}) {
  const cells = (Number(opts.cells) | 0) || 3;
  const half = (cells - 1) / 2;
  const cell = Math.min(w, h) / (cells + 0.6);
  const ox = w / 2 - half * cell, oy = h / 2 - half * cell;
  ctx.fillStyle = opts.bg || '#e9d5a8';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = opts.line || '#6b4423';
  ctx.lineWidth = Math.max(1, cell * 0.06);
  for (let i = 0; i < cells; i++) {
    const rr = r - half + i, cc = c - half + i;
    // 出界的行列不畫線(讓孩子看得出「這裡是邊」)
    if (stoneAt(rr, c) !== undefined) { ctx.beginPath(); ctx.moveTo(ox - cell * 0.3, oy + i * cell); ctx.lineTo(ox + (cells - 1) * cell + cell * 0.3, oy + i * cell); ctx.stroke(); }
    if (stoneAt(r, cc) !== undefined) { ctx.beginPath(); ctx.moveTo(ox + i * cell, oy - cell * 0.3); ctx.lineTo(ox + i * cell, oy + (cells - 1) * cell + cell * 0.3); ctx.stroke(); }
  }
  for (let i = 0; i < cells; i++) for (let j = 0; j < cells; j++) {
    const rr = r - half + i, cc = c - half + j;
    const s = stoneAt(rr, cc);
    if (s === undefined) continue;
    const x = ox + j * cell, y = oy + i * cell;
    if (s === 'black' || s === 'white' || s === 1 || s === 2) {
      ctx.beginPath(); ctx.arc(x, y, cell * 0.42, 0, Math.PI * 2);
      ctx.fillStyle = (s === 'black' || s === 1) ? '#1a1a1a' : '#f7f7f7';
      ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.stroke();
    }
  }
  // 目標環:中央那格
  ctx.beginPath(); ctx.arc(w / 2, h / 2, cell * 0.5, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(2, cell * 0.12); ctx.strokeStyle = opts.ring || '#e0453a'; ctx.stroke();
}
