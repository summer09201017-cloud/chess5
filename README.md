# 3D 五子棋

可部署到 GitHub Pages 的 3D 立體感五子棋網頁遊戲。專案是純前端 PWA，不需要後端伺服器。

![3D 五子棋截圖](docs/screenshot.png)

## 功能

- 9×9、13×13、15×15、19×19 棋盤
- 單人對 AI、本機雙人、PeerJS 線上對戰
- 3D 棋盤旋轉、俯仰、縮放與自動旋轉
- 黑棋禁手：長連、雙四、雙三
- 計時、悔棋、重做、AI 提示
- 棋譜匯入、匯出、分享連結與回放
- 殘局解謎、每日挑戰、戰績與成就
- PWA 安裝支援，可加入手機主畫面

## 本機預覽

請不要直接用 `file://` 開啟，PWA 與 ES module 需要本機伺服器或 HTTPS。

```bash
python -m http.server 8000
```

然後開啟：

```text
http://localhost:8000
```

## 測試與檢查

這個專案不需要安裝 npm 套件，直接用 Node.js 內建能力檢查即可。

```bash
npm run lint
npm test
npm run verify
```

目前測試覆蓋：

- JavaScript 語法檢查
- manifest、service worker、README、`.gitignore` 靜態檢查
- 黑棋禁手規則：合法五連、長連、雙四、雙三
- AI 評分使用的威脅分析分數

## 部署

正式站：<https://5-chess.pages.dev>（Cloudflare Pages）

> ⚠ Cloudflare Pages 專案 `5-chess` 是 **direct upload**（不連 Git），
> **推到 GitHub 不會自動上線**，一定要手動部署。

```bash
npm run verify
# 準備一個只放站台檔的目錄：index.html style.css script.js game-rules.js
# manifest.webmanifest service-worker.js icons/
# 不要把 .git / .wrangler / tests / node_modules 傳上去
npx wrangler pages deploy <該目錄> --project-name=5-chess --branch=main --commit-dirty=true
```

改了 `index.html` / `style.css` / `script.js` / `game-rules.js`，
**務必同時 bump `service-worker.js` 的 `CACHE_NAME`**（快取是 cache-first，
不 bump 的話已安裝的 PWA 會一直用舊版），`tests/static.test.mjs` 內的版本號要一起改。

### GitHub Pages（目前未啟用）

`.github/workflows/deploy-pages.yml` 仍在 repo 裡，但這個 repo 的 GitHub Pages
**沒有啟用**，因此該 workflow 自 2026-05-01 起每次推送都會失敗。
那顆紅燈是預期的，不代表專案壞掉；去留見 `roadmap.md`。

## 主要檔案

- `index.html`
- `style.css`
- `script.js`
- `game-rules.js`
- `manifest.webmanifest`
- `service-worker.js`
