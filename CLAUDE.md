# CLAUDE.md — 3D 五子棋(chess5)

給下一手 AI 的專案說明。**先讀這份,再動手。**

## 這是什麼

純前端 PWA 五子棋,**無建置步驟**(沒有 npm 套件、沒有 bundler)——改完檔案直接就是產物。
- GitHub:`summer09201017-cloud/chess5`
- 線上正式站:<https://5-chess.pages.dev>(Cloudflare Pages)

## 現況(2026-09-01)

### 已完成
- 9/13/15/19 四種盤面、單人對 AI(4 難度)、本機雙人、PeerJS 線上對戰、殘局解謎、每日挑戰
- 3D 棋盤旋轉/俯仰/縮放/自動旋轉、四種主題、五種棋子皮膚、四種天氣
- 黑棋禁手(長連/雙四/雙三)、計時、悔棋/重做、AI 提示、棋譜匯入匯出/分享/回放、戰績成就
- PWA 可安裝、離線可玩
- **2026-09-01 修好「落子對不到十字交叉線」**(見下面「本機地雷」第 1 條)

### 待做
見 `roadmap.md`。

## 一檔一責

| 檔案 | 責任 |
|---|---|
| `index.html` | 版面骨架、左側控制面板、`<dialog>`。**無內嵌 JS** |
| `style.css` | 全部樣式。棋盤幾何在 `.board-3d` / `.grid-line` / `.intersection` / `.stone` |
| `script.js` | 遊戲主體(ES module):建盤、落子、AI、計時、線上、PWA 註冊 |
| `game-rules.js` | 純函式規則(禁手判定、威脅分析)——**唯一被單元測試覆蓋的檔** |
| `service-worker.js` | PWA 快取。`CACHE_NAME` **改任何殼層檔就要 bump** |
| `tests/` | `game-rules.test.mjs`(規則)+ `static.test.mjs`(靜態字串檢查) |

棋盤座標的單一真相:`script.js` 的 `ratioAtIndex()` / `CELL_RATIO` / `MARGIN_RATIO` / `HOTSPOT_RATIO`。

## ⚠ 本機地雷(踩過的,別再踩)

1. **★ 全域 `button` 樣式會打到棋盤交點。**
   `.intersection` 是 `<button>`。`button:hover:not(:disabled)` 的優先序 (0,2,1) 高於 `.intersection` (0,1,0),
   會**整條取代**交點的 `transform`。舊版交點靠 `translate(-50%,-50%)` 置中,於是滑鼠一移上去,
   該格連同棋子往右下跳**半格**(實測 15×15:+20.06 / +19.04 px),移開才復原。
   → 現在:① `button:not(.intersection):hover` ② 交點改 `inset`/負邊距置中,不靠 transform
     ③ `.intersection` 明寫 `transform/filter/transition: none`。
   **新增任何全域 button 樣式前,先想一下棋盤。**
2. **定位不要用 `transform`。** 置中用 `inset: calc((100% - 尺寸)/2)` 或負邊距;
   `transform` 只留給動畫特效,靜止態必須是 `none`。`@keyframes` 若每格都得複寫 `translate(-50%,-50%)`,那就是設計錯了。
3. **格線要以「線中心」對齊座標。** 只設 `left: pos%` 是把線的**左緣**貼上去,整張網格會偏半條線寬(實測 0.78px)。
   現在靠 `margin-left: calc(max(1px,0.24%) * -0.5)` 校正。
4. **改了 `index.html`/`style.css`/`script.js`/`game-rules.js` 就要 bump `service-worker.js` 的 `CACHE_NAME`**,
   否則已安裝的 PWA 永遠吃舊快取(它是 cache-first)。`tests/static.test.mjs` 有硬編版本號,要一起改。
5. **push 到 GitHub 不會上線。** 見下面「部署」。
6. `.github/workflows/deploy-pages.yml` **自 2026-05-01 起每次 push 都失敗**——
   repo 的 GitHub Pages 根本沒啟用(`gh api repos/.../pages` = 404)。紅燈是預期的,不是新壞掉;
   要不要移除見 `roadmap.md`。

## 部署(重要)

Cloudflare Pages 專案 `5-chess` 是 **direct upload**(Git Provider: No)——**push 不會自動部署**。

```bash
npm run verify                      # 先綠
# 只放站台檔,不要把 .git/.wrangler/tests/node_modules 傳上去
npx wrangler pages deploy <乾淨目錄> --project-name=5-chess --branch=main --commit-dirty=true
curl -s "https://5-chess.pages.dev/service-worker.js?b=$(date +%s)" | head -1   # 驗版號
```

## 驗收

```bash
npm run verify        # lint + 單元測試(必須綠)
```
版面/對位類改動**一定要用真瀏覽器量**,而且:
- 量「棋子 vs 格線」,**不要只量「棋子 vs 它所屬的交點」**——兩者會一起位移,量出來永遠是 0,會誤判沒問題。
- hover 類問題要量**三態**:hover 前 / hover 中 / 移開後,並印 `getComputedStyle(el).transform`。
