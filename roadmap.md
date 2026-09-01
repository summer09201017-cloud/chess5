# roadmap — 3D 五子棋(chess5)

更新:2026-09-01

## ✅ 已完成(別重做)

- 四種盤面(9/13/15/19)、AI 四難度、本機雙人、PeerJS 線上、殘局解謎、每日挑戰
- 3D 視角(旋轉/俯仰/縮放/自動旋轉/四種預設視角)、四主題、五皮膚、四天氣
- 黑棋禁手、計時、悔棋/重做、AI 提示、棋譜匯入匯出/分享連結/回放、戰績與成就
- PWA 安裝與離線
- **2026-09-01 棋子對位**:落子對不到十字交叉線、落子先往右下再彈回、滑鼠移過棋子被推走
  → 三者同一根因(全域 `button:hover` 蓋掉交點的置中 transform),已修並實測全盤偏差 0.008px
- **2026-09-01 部署收斂**:網址收斂到 `5-chess.pages.dev`(舊的 netlify.app 掛 301、停止自動建置);
  刪掉從不生效的 GitHub Pages workflow,換成「push → verify → 部署 CF Pages」;
  部署清單改由 `scripts/stage.mjs` 單一真相之源統一管理,並加上 `npm run stage` / `npm run deploy`

## 🔜 待做(按 CP 值 × 開發時間)

| 項目 | ⏱ | ★ | 說明 |
|---|---|---|---|
| **在 GitHub 加兩個 secret** | 5 分 | ★★★ | `CLOUDFLARE_API_TOKEN`(權限 Account → Cloudflare Pages → Edit)與 `CLOUDFLARE_ACCOUNT_ID`。加完之後 push 就會自動部署到 pages.dev;**沒加之前 CI 是綠的、只跑驗證,得繼續用 `npm run deploy` 手動出版**。★ 只有使用者能做(金鑰不經 AI) |
| 一個月後刪掉 Netlify 站 | 5 分 | ★★ | 2026-10-01 之後。轉址掛滿一個月再刪(照 netlify-to-cloudflare-migrate 慣例)。還原點:Netlify deploy `6a96a4c9f62e310008e8a2a4` |
| SW 版號自動化 | 20 分 | ★★ | `CACHE_NAME` 與 `tests/static.test.mjs` 兩處硬編,要人記得同時改。改成測試只驗格式 `gomoku-pwa-v\d+`,再加一個 pre-push 檢查「殼層檔有動就必須 bump」 |
| 對位迴歸測試 | 40 分 | ★★ | 把這次的 Playwright 量測(全盤交點 vs 格線、hover 三態)收成 `tests/alignment.mjs`,避免再有人用 transform 做定位而沒人發現 |
| 手機觸控落子放大鏡 | 60 分 | ★★ | 手機上棋子直徑約 16px,手指會蓋住目標。按住時在上方顯示放大預覽,放開才落子 |
| 線上對戰斷線重連 | 90 分 | ★ | 現在 PeerJS 斷了就結束,只顯示「對手已離線」。可存房號+棋譜,重連後續盤 |

## 🚫 刻意不做

- **改用框架 / 加建置步驟**:目前是零相依、無 bundler,改完即產物,對「教會電腦、非技術同工」最好維護。加了 Vite 只會多一層要維護的東西。
- **後端 / 帳號系統**:線上對戰走 PeerJS P2P,不存任何個資,也就沒有帳號、資料庫、隱私問題要處理。要排行榜再來重新評估。
- **接 play-stats 統計**:這站不在教會遊戲艦隊的統計盤內。若日後要進大廳再一併接。
