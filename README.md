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

推送到 `main` 之後，`.github/workflows/deploy-cloudflare.yml` 會先跑 `npm run verify`，
再用 wrangler 部署到 Cloudflare Pages。

要在本機手動出一版：

```bash
npm run deploy      # = verify → stage → wrangler pages deploy .deploy
```

`npm run stage` 會把要上線的檔案整理進 `.deploy/`。
**哪些檔案會上線，一律以 `scripts/stage.mjs` 為準**，不要另外手抄清單。

改了 `index.html` / `style.css` / `script.js` / `game-rules.js`，
**務必同時 bump `service-worker.js` 的 `CACHE_NAME`**（快取是 cache-first，
不 bump 的話已安裝的 PWA 會一直用舊版），`tests/static.test.mjs` 內的版本號要一起改。

### 啟用自動部署需要的設定

到 repo 的 `Settings → Secrets and variables → Actions` 新增兩個 secret：

| Secret | 內容 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token，權限選 `Account → Cloudflare Pages → Edit` |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 儀表板網址裡那串 32 位十六進位 |

**還沒設好之前，CI 仍然是綠的**——部署那一步會自動跳過，只跑驗證。

### 舊網址

`https://5-chess.netlify.app` 已於 2026-09-01 改為 301 轉址到 pages.dev，
Netlify 端的自動建置已停止。舊連結與已安裝的舊 PWA 靠這個轉址繼續可用。

## 主要檔案

- `index.html`
- `style.css`
- `script.js`
- `game-rules.js`
- `manifest.webmanifest`
- `service-worker.js`
