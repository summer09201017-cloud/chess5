# CLAUDE.md — 3D 五子棋(chess5)

給下一手 AI 的專案說明。**先讀這份,再動手。**

## 這是什麼

純前端 PWA 五子棋,**無建置步驟**(沒有 npm 套件、沒有 bundler)——改完檔案直接就是產物。
- GitHub:`summer09201017-cloud/chess5`
- 線上正式站:<https://5-chess.pages.dev>(Cloudflare Pages)—— **唯一正式網址**
- 舊網址 <https://5-chess.netlify.app> 已於 2026-09-01 掛 301 轉址到 pages.dev,
  Netlify 端自動建置已停(`stop_builds`)。**留置一個月後再刪站**(照 netlify-to-cloudflare-migrate 慣例);
  還原點:Netlify deploy `6a96a4c9f62e310008e8a2a4`。

## 現況(2026-09-04)

### 已完成
- 9/13/15/19 四種盤面、單人對 AI(4 難度)、本機雙人、PeerJS 線上對戰、殘局解謎、每日挑戰
- 3D 棋盤旋轉/俯仰/縮放/自動旋轉、四種主題、五種棋子皮膚、四種天氣
- 黑棋禁手(長連/雙四/雙三)、計時、悔棋/重做、AI 提示、棋譜匯入匯出/分享/回放、戰績成就
- PWA 可安裝、離線可玩
- **2026-09-01 修好「落子對不到十字交叉線」**(見下面「本機地雷」第 1 條)
- **2026-09-02 殘局解謎重做**(使用者原話「只有 8 題,太少題目,又太簡單」):
  - 題庫 **67 題、四級**(入門 16・進階 16・高手 20・大師 15;黑先 34 / 白先 33),最深 7 步;由 `scripts/gen-puzzles.mjs` 自我對弈生成、
    每題經 `puzzle-solver.js` 證明(N 步必勝且 N-1 步殺不了、正解首手數已記錄),`tests/puzzles.test.mjs` **每次 npm test 逐題重證**
  - 玩法真的變成解謎:「剩 N 步」會遞減、對手走解題器算出的**最頑強防守**(不再借會犯錯的 hard 檔)、
    走錯立刻判失敗(對手回應後剩下步數內已無必勝)、可重試;守備題答錯對手會把連殺演出來
  - 三級星等只記最佳(`gomoku.puzzles`)、分級進度、`?puzzle=<id>` 深連結(老師投影全班同一題)、🔗 複製題目連結
  - 舊版 8 題的病:「剩 N 步」從不遞減、對手 `AI_LEVELS.hard`、答錯不判負 ⇒ 其實只是「從一個局面跟電腦下」
- **2026-09-03 每日挑戰改題庫制 + 補題模式**:
  - 每日挑戰 = 每天一組 3 題階梯(暖身→標準→挑戰),`daily-picker.js` 用本地日期 → FNV → 從題庫抽,**全世界同一組、零後端**;
    解題流程完全共用解謎那一套,只差題目來源與進度(`gomoku.daily`,只留 60 天,**三題全破才算破了今天**、可跳題),
    `?daily` 深連結;成就 🥇 每日金牌(三題全一次過)、📅 七日不斷。舊的「日期種子開局 + 跟 hard AI 下一局」已拆掉
  - 題目 id 改成**內容雜湊**(`vcf3-a1b2c3`):重生或補題都不會讓玩家的「已解」跑到別題身上
  - `npm run puzzles:more -- <seed>` 補題:保留現有每一題,只補配額還缺的桶;每次生成/補題記在 `PUZZLE_META.runs`
  - 題庫現況 **84 題**(入門 16・進階 18・高手 27・大師 23;黑先 43 / 白先 41;最深 7 步;守備題進階 8・高手 8・大師 7)
  - **0903 交接場**:守備配額 6/4/4 → 8/8/8 後補題 +9;「加題不是換種子」見地雷 15
  - **0904 接續上一盤**:`gomoku.session` 補上讀取半邊(⟳ 鈕,只有真的有棋局可接時才出現)
    + 修掉「載入已下完的棋譜會偷加勝場」的計分污染 + 開機狀態列說謊。SW **v15**。見地雷 14/16

### 待做
見 `roadmap.md`。

## 一檔一責

| 檔案 | 責任 |
|---|---|
| `index.html` | 版面骨架、左側控制面板、`<dialog>`。**無內嵌 JS** |
| `style.css` | 全部樣式。棋盤幾何在 `.board-3d` / `.grid-line` / `.intersection` / `.stone` |
| `script.js` | 遊戲主體(ES module):建盤、落子、AI、計時、線上、PWA 註冊 |
| `game-rules.js` | 純函式規則(禁手判定、威脅分析),對局 AI 用 |
| `puzzle-solver.js` | 殘局解題器(純函式、零 DOM):威脅空間搜尋 / VCF。生成、測試、瀏覽器端判定**同一支** |
| `puzzles.js` | 殘局題庫(**自動產生,不要手改**;改 `scripts/gen-puzzles.mjs` 再 `npm run puzzles` / 補題 `npm run puzzles:more -- <seed>`)。含 `PUZZLE_META.runs` 生成歷史 |
| `daily-picker.js` | 每日挑戰抽題(純函式):本地日期 → FNV → 三段階梯各抽一題,全世界同一組 |
| `service-worker.js` | PWA 快取。`CACHE_NAME` **改任何殼層檔就要 bump**;`CORE_ASSETS` 含 puzzle-solver.js / puzzles.js / daily-picker.js |
| `scripts/gen-puzzles.mjs` | 題庫生成器:自我對弈 → 解題器證明 → 分級挑題 → 寫 puzzles.js(種子+局數決定,可重現) |
| `scripts/smoke-puzzles.mjs` | 解謎流程真瀏覽器冒煙(Playwright,借 Desktop/hfpc-sparks-hub 的;不在 npm test 裡) |
| `scripts/smoke-resume.mjs` | 接續上一盤真瀏覽器冒煙(15 項;同樣借 Playwright、不在 npm test 裡)。**動 `replaying` / `commitMove` / 開機序列就要跑它** |
| `tests/` | `game-rules.test.mjs`(規則)+ `puzzle-solver.test.mjs`(解題器)+ `puzzles.test.mjs`(**逐題重證**)+ `daily-picker.test.mjs`(每日抽題掃 400 天)+ `static.test.mjs`(靜態字串) |

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
6. **部署清單的單一真相之源是 `scripts/stage.mjs`**,不要另外手抄一份要上傳哪些檔。
   它同時會檢查 `service-worker.js` 的 CORE_ASSETS 每一項都真的在 `.deploy/` 裡
   (少一個 → 安裝時 `cache.addAll` 整批失敗 → PWA 靜默地不再離線可玩)。
7. **`puzzles.js` 不要手改。** 每題都由解題器證明過、`npm test` 每次重證;手擺的題目直覺錯誤率實測七成
   (這輪我手算「活四怕反衝四」就是錯的,被解題器抓出來)。要更多/更難的題:改 `scripts/gen-puzzles.mjs` 的 `TIERS` 配額,
   `npm run puzzles` 重生(約 12 分鐘;預算是**局數**不是秒數,才可重現)。改了 `puzzle-solver.js` 也要重跑測試——舊題可能不再成立。
8. **`script.js` 第 19 節(解謎)不放 module 層 `const`。** 第 4 節 init 在檔案前面就會呼叫 `buildPuzzleList()`,
   那時第 19 節的 `const` 還在 TDZ,整支模組會炸(同檔頭「這些必須在 top-level 就 hoist 完成」那條)。函式宣告可以,`const` 不行。
9. **解謎的對手不准借 `AI_LEVELS.hard`**(會故意犯錯、帶隨機)—— 一律走 `puzzleBestDefence`;`tests/static.test.mjs` 釘死了。
   每日挑戰(第 20 節)用 hard 是刻意的難度設計,不在此限。
10. 解謎採**自由規則**(五連或以上即勝、無禁手),與 `commitMove → checkWinFull` 一致;禁手開關在解謎裡刻意不生效,
    解題器也照這個規則證明。要改規則兩邊要一起改、題庫要重生。
11. **這台機器(agape250,Node 24.13.0 Windows)呼叫 `fs.rmSync(x, {recursive:true})` 或 `fs.cpSync(dir, dst, {recursive:true})`
    會讓 node 整個崩潰**(exit 0xC0000409,連刪不存在的目錄也崩、什麼都不印,shell 只看到 exit 127)。
    `npm run stage` 因此靜默失敗、`.deploy/` 是舊的或缺 icons/、部署會把壞版推上去。
    已改用 `fs/promises` 的 `rm` + 自己遞迴 `copyFileSync`;新腳本要刪/複製目錄一律照這個寫。
    ★ 驗法:`node scripts/stage.mjs; echo $?` 一定要看到「✅ .deploy/ 已備妥」那行,只看 exit code 不夠(npm 會吃掉)。
12. **題目 id 是局面的內容雜湊,不是序號。** 玩家進度(`gomoku.puzzles` / `gomoku.daily`)都用 id 當鍵;
    `tests/puzzles.test.mjs` 會重算雜湊比對。要加題用 `npm run puzzles:more -- <seed>`(保留現有、只補缺),
    全部重生(`npm run puzzles`)也不會改變沒動過的題的 id。**不要手改 setup、不要手編 id。**
13. **每日挑戰與解謎共用第 19 節的流程**,分歧只在 `mode === "daily"` 幾個點(`puzzleEls()` 寫到哪個面板、
    `dailyState` 決定題目、`recordDailySolve` 記進度)。要改解題流程改第 19 節一處就好;不要為每日另寫一套。
14. **`replaying` 旗標:任何「把棋譜放回盤上」的路徑都必須包在 `replaySilently()` 裡。**
    `localStorage` 五個鍵現在都是「有寫也有讀」的完整對(`stats`/`settings`/`puzzles`/`daily`/`session`);
    `gomoku.session` 的讀取半邊 2026-09-04 補上了(第 16b 節:`readSession` / `offerResume` / `resumeSession`)。
    ★★ **為什麼需要這個旗標**:重播是走 `commitMove`,而它帶四個副作用——落子音效、旁白氣泡、
    落下動畫,以及**最後一手觸發 `finalizeGame`**。第四個是真的 bug:
    **載入一盤「已下完」的棋譜,本機雙人的勝場數會直接加一**,而那盤棋不是使用者下的。
    現在有三條路徑走重播(匯入棋譜 / 分享連結 / 接續上一盤),`replaySilently()` 把它們全包起來:
    期間**不出聲、不冒泡、不動畫、不計分、不存檔**;`resetGame` 在重播中也不踢 AI、不起鐘、不覆蓋存檔。
    ⇒ **以後再加任何一條重播路徑,一律包 `replaySilently()`**;static test 會數 `replaySilently(` 的出現次數。
    ⚠ `hook localstorage-key-guard` 現在對這支檔仍會提醒「讀了從不寫」——那是它只看單檔的限制,已是誤報。
    ⚠ **計時器刻意不存**:`perMoveSeconds` 是「每一手」的限時、每手都重設 ⇒ 接續回來拿到滿鐘
    本來就對(被打斷、重新輪到你就給完整思考時間)。0903 的卡把它列成第四個地雷,**那是誤判**。

16. **★★ `const` 不會像 `function` 那樣提升到「可用」——開機那段程式碰不到檔案下半部的 `const`。**
    2026-09-04 實錄:`offerResume()` 在開機(約第 148 行)就跑,而 `const RESUMABLE_SIZES` 原本
    宣告在第 16b 節(約第 1030 行)⇒ **TDZ 的 `ReferenceError`**,
    而且它一拋,**開機序列後面那行 `startAiTurn()` 也整個沒跑**。
    ★★ **`npm run verify` 完全綠**(`node --check` 只驗語法、單元測試載不進 DOM 耦合的 `script.js`),
    部署也會全綠,只有**真的開一次瀏覽器**才看得到。
    ⇒ 開機序列(第 4 節)呼叫得到的東西,`const` 一律宣告在第 2 節「狀態」那裡。
15. **加題不是換種子。** 生成器的桶滿了就不再搜那一類(`needKind`),所以配額滿的情況下
    `npm run puzzles:more -- <新種子>` 會在幾秒內誠實回報「新增 0」。要更多題**先調 `TIERS` 的 `want`**。

## 部署

Cloudflare Pages 專案 `5-chess` 是 **direct upload**(不連 Git),所以由
`.github/workflows/deploy-cloudflare.yml` 用 wrangler 推上去。

- **push 到 main → CI 跑 `npm run verify`,再自動部署到 pages.dev。**
  前提是 repo 已設好 secrets `CLOUDFLARE_API_TOKEN` 與 `CLOUDFLARE_ACCOUNT_ID`;
  **沒設好時部署那一步會被跳過、CI 仍是綠的**(只跑驗證),不會留紅燈。
- 本機要手動出一版:`npm run deploy`(= verify → stage → wrangler pages deploy)。

部署後驗版號:
```bash
curl -s "https://5-chess.pages.dev/service-worker.js?b=<隨機數>" | head -1
```

## 驗收

```bash
npm run verify        # lint + 單元測試(必須綠)

# 動了 replaying / commitMove / 開機序列 / localStorage 讀寫 → 一定要再跑真瀏覽器冒煙:
python -m http.server 8765 --bind 127.0.0.1      # 另一個視窗
node scripts/smoke-resume.mjs                    # 接續上一盤(15 項)
node scripts/smoke-puzzles.mjs                   # 解謎流程(23 項)
```
★★ **`npm run verify` 綠 ≠ 開得起來。** `script.js` 與 DOM 耦合、單元測試載不進去,
`node --check` 只驗語法 ⇒ **TDZ 的 ReferenceError、開機序列被中斷、狀態列說謊這三類全部驗不到**
(2026-09-04 三個都真的踩到了,見地雷 16)。
★ 冒煙紅了先問「**是產品錯還是驗法錯**」:0904 那輪連三次紅燈全是驗法寫錯
(4 手後輪黑不是輪白 / 第 9 手成五就 break 所以 9 顆不是 10 顆 /
`page.goto(BASE + "#share=...")` 是**同文件 hash 跳轉不會重跑 script.js**,不 `reload()` 會**假綠**)。
版面/對位類改動**一定要用真瀏覽器量**,而且:
- 量「棋子 vs 格線」,**不要只量「棋子 vs 它所屬的交點」**——兩者會一起位移,量出來永遠是 0,會誤判沒問題。
- hover 類問題要量**三態**:hover 前 / hover 中 / 移開後,並印 `getComputedStyle(el).transform`。
