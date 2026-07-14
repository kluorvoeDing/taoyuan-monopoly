# AGENTS.md — 桃園 Hero City 大富翁

給 AI 代理（Antigravity / Claude Code / Codex 等）的專案工作守則。動手前請整份讀完，**「不可破壞的約定」一節違反的話，遊戲會直接壞掉**。

## 專案概觀

桃園主題回合制大富翁網頁遊戲：56 格自由拓撲棋盤（非傳統口字型）、4 名玩家（1 人 + 最多 3 AI）、角色個性天賦、事件/手牌/亂入機制、Firebase Firestore 線上多人。部署於 Vercel（taoyuan-monopoly.vercel.app）。

技術棧：Vite 8 + React 19 + TypeScript + Zustand + CSS Modules + Firebase。

## 常用指令

```bash
npm run dev                    # 開發伺服器（http://localhost:5173）
npm run build                  # tsc -b + vite build（提交前必須通過）
npm test                       # vitest（engine/simulation/strategy，基準：10/10 通過）
npm run lint                   # oxlint
node scripts/board-layout.mjs  # 棋盤座標產生＋零重疊驗證（改棋盤佈局的唯一入口）
```

## 架構地圖

```
src/
├── game/engine/     # 純函數遊戲引擎（reducer 模式：dispatch command → 新 state + DomainEvent[]）
│   ├── reducer.ts   # 主 reducer；GRAPH_CONNECTIONS（棋盤拓撲 = 遊戲邏輯的一部分）
│   ├── ai.ts        # AI 決策；turnMachine.ts 回合狀態機；其餘依檔名分工
│   └── ...          # abilities / cards / economy / effects / events / rng / selectors
├── game/types/      # 全部型別定義
├── game/firebase.ts # Firestore 多人連線
├── game/tests/      # vitest 引擎測試
├── data/            # 靜態設定：tiles（56 格內容）/ characters / cards / events / districts / raids
├── store/gameStore.ts  # Zustand；單機與多人「兩條 dispatch 路徑」都在這裡
├── components/
│   ├── Board/       # 棋盤渲染：Board.tsx（座標+縮放+棋子）、Tile.tsx（六角格卡片）
│   ├── Dashboard/   # CenterDashboard.tsx = 整個 HUD＋情報 ticker＋手牌＋側欄（單一大元件）
│   ├── GameSetup/   # 開局設定畫面
│   └── Multiplayer/ # 多人大廳
└── styles/          # variables.css（設計 token）、global.css
```

引擎（`src/game/`）與 UI（`src/components/`）嚴格分離：引擎不碰 DOM，UI 不寫遊戲規則。新遊戲機制先寫進 engine ＋補測試，再接 UI。

## 不可破壞的約定（違反 = 出狀況）

### 1. 棋盤座標 ≠ 棋盤拓撲，兩者分開管理

- **拓撲**（哪格連哪格）：`src/game/engine/reducer.ts` 的 `GRAPH_CONNECTIONS`。這是遊戲邏輯，移動/分岔/AI 全靠它。
- **視覺座標**：`src/components/Board/Board.tsx` 的 `NODE_COORDINATES`（1600×900 設計畫布上的百分比）。
- **絕對不要手改 `NODE_COORDINATES` 的數值。** 它由 `scripts/board-layout.mjs` 產生並驗證（任兩格零重疊、連線不穿過非端點格、不出界）。要調佈局：改腳本裡的 `P` 座標表 → `node scripts/board-layout.mjs` → 驗證通過後把輸出貼回 `Board.tsx`。
- **新增/刪除格子**時必須同步四處：`GRAPH_CONNECTIONS`（拓撲）、`src/data/tiles.ts`（格子內容）、`scripts/board-layout.mjs`（座標＋重跑驗證）、`Board.tsx`（貼回輸出）。
- 格子尺寸 96×108 寫死在兩處：`Tile.module.css` 的 `.tile` 與佈局腳本的 `TILE_W/TILE_H`。改任一邊都要同步另一邊並重跑驗證。
- 設計畫布 1600×900 寫死在兩處：`Board.tsx` 的縮放計算與 `Board.module.css` 的 `.gridContainer`。

### 2. HUD 高度動態同步（`--hud-height`）

HUD 是 `position: fixed` 懸浮層。`CenterDashboard.tsx` 用 ResizeObserver（callback ref 模式）把實際高度寫入 CSS 變數 `--hud-height`，`Board.tsx` 的 `canvasArea` 以 `top: calc(var(--hud-height) + 20px)` 讓位。**不要改回寫死的 px 值**——HUD 在窄視窗會換行變高，寫死就會遮棋盤（這正是上次壞掉的原因）。展開的情報下拉是刻意的覆蓋層（overlay），不推擠棋盤，這是產品決策，不要「修」它。

### 3. 雙 dispatch 路徑必須同步改

`store/gameStore.ts` 有**單機**與**多人（Firestore）**兩條幾乎相同的 dispatch 路徑（事件記錄、eventLog 上限 120 條等邏輯重複存在）。改其中一條時，檢查另一條是否需要同樣的修改。

### 4. CenterDashboard 的 hooks 順序

`CenterDashboard.tsx` 在 `if (!state) return null;`（提前 return）**之前**宣告所有 hooks。新增 hook 必須放在這行之前，否則違反 React hooks 規則直接崩潰。新增需要 DOM 的觀察器請沿用 callback ref 模式（參考 `hudRef`）。

### 5. 存檔相容性

導出/導入功能序列化整個 `GameState` JSON。改動 `GameState` 型別（`src/game/types/`）會讓舊存檔壞掉——新增欄位請給預設值、做防禦性讀取。

## 設計系統（改 UI 時遵守）

- 所有顏色/字型/圓角/陰影用 `src/styles/variables.css` 的 token，**不要硬編碼色票**（尤其不要再引入 `#F97316` 橘色——主色是陶土色 `--primary: #C2410C`，漸層用 `--primary-gradient`）。
- 金額、時間戳、地價、編號一律 `font-family: var(--font-mono)`。
- 字型已載入：Outfit（拉丁）、Noto Sans TC（中文）、IBM Plex Mono（等寬），在 `global.css` 的 Google Fonts import。
- 視覺語言：暖紙底色、霧面玻璃（`backdrop-filter: blur`）面板、六角格卡片、陶土主色＋青瓷輔色（`--secondary`）。新 UI 跟隨此語言。
- CSS Modules per component；動態值（玩家色等）才用 inline style。
- 頭像是 sprite sheet（`public/avatars.jpg`，400% 網格），切片座標在 `Board.tsx` 與 `CenterDashboard.tsx` 兩處重複——新增角色兩處都要加。

## 完工前驗證清單

1. `npm run build` 通過（tsc 型別 + 打包）。
2. `npm test` 10/10 通過；改了引擎就補/改測試。
3. 實際開瀏覽器玩一輪：開局 → 擲骰 → 購地 → 結束回合 → AI 跑完一圈，確認 console 無錯誤。
4. 改了棋盤相關的話：`node scripts/board-layout.mjs` 必須輸出「✅ 驗證通過」。
5. 視窗縮到 1280px 寬確認 HUD 不裁切、棋盤不被遮擋。

## 已知事實（省得重新踩坑）

- `package.json` 的名字 `tmp_vite` 是歷史遺留，別被誤導。
- `src/App.css`、`src/index.css` 是 Vite 腳手架殘留，**沒有被 import**，真正的全域樣式是 `src/styles/global.css`。
- bundle ~789KB 有 chunk 過大警告，屬已知狀態，非你造成的錯誤。
- 事件訊息的美化（改寫文字、上色）在 `CenterDashboard.tsx` 的 `formatLogMessage`；引擎產生的原始訊息不要為了顯示效果去改。
- `.claude/` 目錄是本機工具設定，不入版控。
