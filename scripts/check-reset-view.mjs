// 🔬 「🎥 重置視角」真瀏覽器驗收(2026-09-14 使用者拍板「五子棋補一顆重置視角」)。
// 跑法:py -m http.server 8797(另一個視窗)→ node scripts/check-reset-view.mjs
//      (或 CHECK_URL=線上網址 node scripts/check-reset-view.mjs)
// 守:①鈕在左欄「視角」區看得到 ②用滑桿把 yaw/pitch/zoom 轉歪 ⇒ 按重置 ⇒ 三個值回到開場(0/0/1.0)、自動旋轉關掉
//     ③全螢幕工具列的「🎥 視角」代按鈕存在且代按得動(進沉浸模式後轉歪再按)④零 pageerror。
// ★ 一律真點擊(page.click)、真拖滑桿(fill + dispatch input 等同使用者拖);不在 evaluate 裡呼叫 resetView。
import { chromium } from "playwright-core";

const URL = process.env.CHECK_URL || "http://localhost:8797";
let browser = null;
for (const channel of ["msedge", "chrome"]) {
  try { browser = await chromium.launch({ channel, headless: true }); break; }
  catch { /* 換下一個 channel */ }
}
if (!browser) { console.error("找不到系統 Edge/Chrome"); process.exit(1); }

let pass = 0, fail = 0;
const ok = (cond, msg, note = "") => {
  if (cond) { pass++; console.log("  ✓ " + msg); }
  else { fail++; console.error("  ✗ " + msg + (note ? " → " + note : "")); }
};

const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(URL + "/?v=" + Date.now(), { waitUntil: "domcontentloaded" });
/* ⚠ 「視角」是收著的 <details>,鈕在 DOM 裡但不可見 ⇒ 等 attached 就好,可見性在 ① 真的展開後才驗 */
await page.waitForSelector("#resetViewBtn", { state: "attached", timeout: 20000 });
await page.waitForFunction(() => document.getElementById("yawRange") && document.getElementById("board3d"), null, { timeout: 20000 });
await page.waitForTimeout(500);

/** 把滑桿當使用者拖:設值 + 發 input(和真拖曳走同一條 listener) */
const slide = (id, v) => page.locator("#" + id).evaluate((el, val) => { el.value = String(val); el.dispatchEvent(new Event("input", { bubbles: true })); }, v);
const read = () => page.evaluate(() => ({
  yaw: +document.getElementById("yawRange").value, pitch: +document.getElementById("pitchRange").value,
  zoom: +document.getElementById("zoomRange").value, spin: document.getElementById("autoSpin").checked,
  transform: document.getElementById("board3d").style.transform,
}));

console.log("\n── ① 鈕在、看得到 ──");
{
  // 「視角」是 <details>,可能收著 ⇒ 先展開(真點 summary)
  const det = page.locator("details:has(#resetViewBtn)");
  if (!(await det.evaluate((d) => d.open))) await det.locator("summary").click();
  const box = await page.locator("#resetViewBtn").boundingBox();
  ok(box !== null && box.height >= 30, "★ 左欄「視角」區有「🎥 重置視角」鈕且看得到", box ? JSON.stringify(box) : "沒有版面");
}

console.log("\n── ② 轉歪 ⇒ 重置 ⇒ 回開場 ──");
{
  await slide("yawRange", 137);
  await slide("pitchRange", 44);
  await slide("zoomRange", 1.3);
  await page.locator("#autoSpin").check();
  await page.waitForTimeout(150);
  const before = await read();
  /* 自動旋轉開著 ⇒ 這 150ms 內 yaw 會從 137 再轉幾度,所以只驗「≥ 137、還在轉」,不驗剛好等於 */
  ok(before.yaw >= 137 && before.pitch === 44 && Math.abs(before.zoom - 1.3) < 1e-6 && before.spin,
    "轉歪了(yaw ≥ 137 / pitch 44 / zoom 1.3 / 自動旋轉開)", JSON.stringify(before));
  await page.click("#resetViewBtn");
  await page.waitForTimeout(400);   // 自動旋轉若沒關,這 400ms 會把 yaw 又轉走
  const after = await read();
  ok(after.yaw === 0 && after.pitch === 0 && Math.abs(after.zoom - 1) < 1e-6,
    "★★ 按重置後 yaw/pitch/zoom 回到開場 0 / 0 / 1.0", JSON.stringify(after));
  ok(after.spin === false, "★ 自動旋轉一起關掉(不然重置完又轉走)", String(after.spin));
  ok(/rotateX\(0deg\) rotateY\(0deg\) scale\(1\)/.test(after.transform), "★ 棋盤真的畫回正視(transform 0/0/1)", after.transform);
}

console.log("\n── ③ 全螢幕工具列的「🎥 視角」代按鈕 ──");
{
  const proxy = page.locator('#immersiveHud button[data-proxy="resetViewBtn"]');
  ok(await proxy.count() === 1, "★ 工具列裡有代按鈕", String(await proxy.count()));
  await slide("yawRange", 90);
  await page.waitForTimeout(100);
  /* 工具列平常不顯示(進沉浸模式才會);代按只是 dispatch click 到原鈕,這裡用 DOM click 觸發代按鏈本身。
     ⚠ 這顆不是 pointer 事件驅動的鈕(監聽 click),所以 DOM click 就是它真正走的路。 */
  await proxy.evaluate((b) => b.click());
  await page.waitForTimeout(200);
  const r = await read();
  ok(r.yaw === 0 && r.pitch === 0, "★ 代按鈕按下去也回得到開場", JSON.stringify(r));
}
ok(errors.length === 0, "整段零 pageerror", errors.join(" | "));

await browser.close();
console.log("\n" + (fail === 0 ? "🟢" : "🔴") + ` reset-view:${pass} 過 / ${fail} 失敗\n`);
process.exit(fail === 0 ? 0 : 1);
