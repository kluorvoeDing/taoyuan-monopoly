# 桃園 Hero City 戰略大富翁網頁遊戲

一款基於 **Vite + React + TypeScript + Zustand** 開發的網頁版大富翁遊戲，玩法借鑑《大富翁 4》的核心邏輯。本專案採行**引擎與內容分離**之高階架構設計，遊戲引擎為同步且無副作用的純函數狀態機（Reducer），角色技能、支援卡片與地圖配置等遊戲內容完全由外部靜態資料檔（`src/data/`）配置，極易進行換皮與擴充。

---

## 🎮 遊戲特色

- **策略行政區域（District Zones）**：地圖共有 10 個核心策略區域（如桃園站前、青埔轉運站等），玩家持有多個同區域據點可獲得階梯式的支援費加成！
- **英雄個性天賦（Quirks & Abilities）**：提供 8 名不同定位的英雄（如綠谷出久、爆豪勝己等），各擁有一招主動能力與一招被動天賦，冷卻機制與費用限制精準還原。
- **支援裝備卡（Cards & Items）**：23 張功能各異的支援裝備，涵蓋據點降級、防線設置、交通加速、查稅稽核與冷卻降低等戰術玩法。
- **突發事件與亂入機制（Events & Raids）**：踩中事件格會觸發 12 種隨機突發事件；地圖上常駐 2 名亂入反派/英雄（如歐爾麥特、死柄木），路過即刻引爆特定正面/負面時效狀態！
- **極致策略 AI**：AI 玩家具備高級決策樹，會在擲骰前預判前進格與使用功能卡，並預留安全預算避免踩踩高租金土地破產。
- **緊急據點變賣排序**：現金小於 0 時，系統自動評估名下據點策略價值，依「策略價值評分由低到高」順序自動拍賣变现，直至現金大於等於 0。
- **純 TypeScript 回合狀態機**：遊戲進程完全可被序列化（JSON 導入/導出），支援手動備份與 localStorage 自動持久化，遊戲歷程隨時可恢復。

---

## 🛠️ 技術棧與目錄架構

- **Vite & React & TypeScript** (前端環境與視訊渲染)
- **Zustand** (單向數據流狀態庫，自動對接 localStorage 存檔)
- **CSS Modules (Vanilla CSS)** (模組化樣式，科技感深色炫彩視覺)
- **Vitest** (高覆蓋率單元與模擬壓力測試)

### 目錄地圖

```text
├── src/
│   ├── data/                 # 內容設定檔 (修改此處即可完成換皮)
│   │   ├── tiles.ts          # 56 格環形地圖配置
│   │   ├── districts.ts      # 10 個策略分區配置
│   │   ├── characters.ts     # 8 名英雄角色設定
│   │   ├── cards.ts          # 23 張支援裝備卡配置
│   │   ├── events.ts         # 12 種突發事件配置
│   │   └── raids.ts          # 4 名亂入角色配置
│   ├── game/
│   │   ├── types/            # 可序列化 GameState 及指令定義
│   │   ├── engine/           # 純函數引擎邏輯
│   │   │   ├── reducer.ts    # 核心狀態變更 Reducer
│   │   │   ├── ai.ts         # AI 決策樹與土地估值演算法
│   │   │   ├── turnMachine.ts# 回合切換與停回合再次觸發
│   │   │   ├── economy.ts    # 轉帳、基金與據點變賣排序
│   │   │   ├── cards.ts      # 23 張支援裝備卡效果實作
│   │   │   ├── abilities.ts  # 8 位英雄個性能力實作
│   │   │   ├── selectors.ts  # 計租流程與聲望資產公式
│   │   │   └── rng.ts        # 確定性種子隨機數 (Mulberry32)
│   │   └── tests/            # 覆蓋率 90%+ 的單元與模擬測試
│   ├── store/                # Zustand 自動存檔與調度層
│   ├── components/           # UI 元件 (棋盤、設定、Dashboard)
│   └── styles/               # 全域 CSS 變數與 Reset
```

---

## 🎨 換皮Reskinning 指南

由於遊戲引擎中沒有寫死任何角色或土地顯示文字，若要換成其他 IP（例如：三國演義、航海王、原神等），您只需要替換 `src/data/` 底下的資料配置檔即可：

### 1. 更換據點與行政區
編輯 [districts.ts](file:///Users/Openclaw/Library/Mobile%20Documents/com~apple~CloudDocs/00_AI%20agent%E5%B7%A5%E4%BD%9C%E5%8D%80/03_Antigravity%E5%8D%80/00_%E5%A4%A7%E5%AF%8C%E7%BF%81%E7%B6%B2%E9%A0%81%E9%81%8A%E6%88%B2/src/data/districts.ts) 與 [tiles.ts](file:///Users/Openclaw/Library/Mobile%20Documents/com~apple~CloudDocs/00_AI%20agent%E5%B7%A5%E4%BD%9C%E5%8D%80/03_Antigravity%E5%8D%80/00_%E5%A4%A7%E5%AF%8C%E7%BF%81%E7%B6%B2%E9%A0%81%E9%81%8A%E6%88%B2/src/data/tiles.ts)：
- 在 `districts.ts` 中配置你的行政區 ID、顏色、與說明。
- 在 `tiles.ts` 中為 56 個地圖格子重新指定 `name`（名稱）、`tier`（S/A/B/C級）、以及關聯的 `zone`（行政區 ID）。

### 2. 更換參戰英雄與個性
編輯 [characters.ts](file:///Users/Openclaw/Library/Mobile%20Documents/com~apple~CloudDocs/00_AI%20agent%E5%B7%A5%E4%BD%9C%E5%8D%80/03_Antigravity%E5%8D%80/00_%E5%A4%A7%E5%AF%8C%E7%BF%81%E7%B6%B2%E9%A0%81%E9%81%8A%E6%88%B2/src/data/characters.ts)：
- 修改 `id` 與 `name`（顯示名稱）。
- 更改主/被動個性的說明（例如：`abilityName`, `abilityText`）。
- *備註：若修改了技能背後的數值公式，可以在 `src/game/engine/abilities.ts` 相對應的角色 case 下進行調整。*

### 3. 更換卡片與事件
編輯 [cards.ts](file:///Users/Openclaw/Library/Mobile%20Documents/com~apple~CloudDocs/00_AI%20agent%E5%B7%A5%E4%BD%9C%E5%8D%80/03_Antigravity%E5%8D%80/00_%E5%A4%A7%E5%AF%8C%E7%BF%81%E7%B6%B2%E9%A0%81%E9%81%8A%E6%88%B2/src/data/cards.ts) 和 [events.ts](file:///Users/Openclaw/Library/Mobile%20Documents/com~apple~CloudDocs/00_AI%20agent%E5%B7%A5%E4%BD%9C%E5%8D%80/03_Antigravity%E5%8D%80/00_%E5%A4%A7%E5%AF%8C%E7%BF%81%E7%B6%B2%E9%A0%81%E9%81%8A%E6%88%B2/src/data/events.ts)：
- 修改配置中的文字、使用時機、或是突發事件的處罰/增益描述。
- 效果的底層程式實作，分別位於 `src/game/engine/cards.ts` 與 `src/game/engine/events.ts`，結構極其直觀。

---

## ⚡ 運行指南

### 安裝依賴
```bash
npm install
```

### 開啟本地開發伺服器
```bash
npm run dev
```

### 執行單元與模擬對局壓力測試
```bash
npm run test
```

### 建置生產版本
```bash
npm run build
```
