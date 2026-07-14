/**
 * 棋盤佈局產生與零重疊驗證腳本
 *
 * 用法: node scripts/board-layout.mjs
 *
 * 在 1600x900 設計畫布上定義 56 個據點的像素座標（外環 39 格 + 四條旋臂各 4 格 + 中央樞紐 54），
 * 驗證三個硬性條件後輸出可直接貼入 Board.tsx 的 NODE_COORDINATES 百分比座標：
 *   1. 任兩格的矩形佔位 (TILE_W x TILE_H + 最小間距 GAP) 完全不重疊
 *   2. 每條拓撲連線不得穿過任何非端點格子的六角形範圍
 *   3. 所有格子完整落在畫布安全邊界內
 *
 * 拓撲 (GRAPH_CONNECTIONS) 與遊戲邏輯完全不動，此處僅是視覺座標。
 */

const CANVAS_W = 1600;
const CANVAS_H = 900;
const TILE_W = 96;
const TILE_H = 108;
const GAP = 8;        // 任兩格矩形間的最小硬性間距
const EDGE_MARGIN = 8; // 畫布安全邊界

// ---- 拓撲（與 src/game/engine/reducer.ts 的 GRAPH_CONNECTIONS 同步，勿改） ----
const GRAPH = {
  0: [1], 1: [2], 2: [3], 3: [4], 4: [5], 5: [9, 6], 6: [5, 7], 7: [6, 8],
  8: [7, 55], 9: [10], 10: [11], 11: [12], 12: [13], 13: [14], 14: [15],
  15: [16], 16: [17], 17: [18], 18: [22, 23], 19: [20, 54], 20: [19, 21],
  21: [20, 23], 22: [24], 23: [21, 18], 24: [25], 25: [26], 26: [27],
  27: [28], 28: [29], 29: [30], 30: [31], 31: [32, 34], 32: [33], 33: [37],
  34: [31, 35], 35: [34, 36], 36: [35, 53], 37: [38], 38: [39], 39: [40],
  40: [41], 41: [42], 42: [43], 43: [44], 44: [45, 48], 45: [46], 46: [47],
  47: [51], 48: [44, 49], 49: [48, 50], 50: [49, 52], 51: [0], 52: [50, 54],
  53: [36, 54], 54: [55, 53, 52, 19], 55: [8, 54],
};

// ---- 座標（像素，畫布 1600x900）：外環四邊 + 風車四旋臂 + 中央樞紐 ----
const P = {
  // 底邊（左→右，y=830 直排）
  47: [70, 830], 51: [191.7, 830], 0: [313.3, 830], 1: [435, 830],
  2: [556.7, 830], 3: [678.3, 830], 4: [800, 830], 5: [921.7, 830],
  9: [1043.3, 830], 10: [1165, 830], 11: [1286.7, 830], 12: [1408.3, 830],
  13: [1530, 830],
  // 右邊（下→上，x 交錯 1530/1426 之字排）
  14: [1426, 700], 15: [1530, 595], 16: [1426, 490], 17: [1530, 385],
  18: [1426, 280], 22: [1530, 175], 24: [1426, 70],
  // 頂邊（右→左，y=70 直排）
  25: [1313, 70], 26: [1200, 70], 27: [1087, 70], 28: [974, 70],
  29: [861, 70], 30: [748, 70], 31: [635, 70], 32: [522, 70],
  33: [409, 70], 37: [296, 70], 38: [183, 70], 39: [70, 70],
  // 左邊（上→下，x 交錯 174/70 之字排）
  40: [174, 190], 41: [70, 281], 42: [174, 372], 43: [70, 462],
  44: [174, 553], 45: [70, 644], 46: [174, 706],
  // 下旋臂 5→6→7→8→55→54（向左掃入中心）
  6: [770, 710], 7: [620, 660], 8: [510, 540], 55: [640, 470],
  // 上旋臂 31→34→35→36→53→54（下旋臂 180° 旋轉對稱）
  34: [830, 190], 35: [980, 240], 36: [1090, 360], 53: [960, 430],
  // 左旋臂 44→48→49→50→52→54（向上掃入中心）
  48: [280, 470], 49: [360, 330], 50: [520, 300], 52: [660, 350],
  // 右旋臂 18→23→21→20→19→54（向下掃入中心）
  23: [1300, 395], 21: [1190, 510], 20: [1080, 600], 19: [940, 550],
  // 中央樞紐
  54: [800, 450],
};

// ---- 驗證 ----
const ids = Object.keys(P).map(Number).sort((a, b) => a - b);
let errors = [];

// 0. 完整性
if (ids.length !== 56 || ids.some((id, i) => id !== i)) {
  errors.push(`節點數量/編號不完整: ${ids.length} 個`);
}

// 1. 邊界
for (const id of ids) {
  const [x, y] = P[id];
  if (x - TILE_W / 2 < EDGE_MARGIN || x + TILE_W / 2 > CANVAS_W - EDGE_MARGIN ||
      y - TILE_H / 2 < EDGE_MARGIN || y + TILE_H / 2 > CANVAS_H - EDGE_MARGIN) {
    errors.push(`節點 ${id} 超出畫布安全邊界: (${x}, ${y})`);
  }
}

// 2. 兩兩矩形零重疊（含最小間距 GAP）
let minClearance = Infinity, minPair = null;
for (let i = 0; i < ids.length; i++) {
  for (let j = i + 1; j < ids.length; j++) {
    const [ax, ay] = P[ids[i]];
    const [bx, by] = P[ids[j]];
    const dx = Math.abs(ax - bx), dy = Math.abs(ay - by);
    const clearX = dx - TILE_W, clearY = dy - TILE_H;
    const clearance = Math.max(clearX, clearY);
    if (clearance < minClearance) { minClearance = clearance; minPair = [ids[i], ids[j]]; }
    if (clearX < GAP && clearY < GAP) {
      errors.push(`重疊/過近: 節點 ${ids[i]} (${ax},${ay}) 與 ${ids[j]} (${bx},${by}) — dx=${dx.toFixed(1)}, dy=${dy.toFixed(1)}`);
    }
  }
}

// 3. 連線不穿過非端點格子（以六角形多邊形檢測，外擴 4px）
function hexPolygon(cx, cy, inflate = 0) {
  const w = TILE_W + inflate * 2, h = TILE_H + inflate * 2;
  // clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)
  return [
    [cx, cy - h / 2], [cx + w / 2, cy - h / 4], [cx + w / 2, cy + h / 4],
    [cx, cy + h / 2], [cx - w / 2, cy + h / 4], [cx - w / 2, cy - h / 4],
  ];
}
function segsIntersect(p1, p2, p3, p4) {
  const d = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = d(p3, p4, p1), d2 = d(p3, p4, p2), d3 = d(p1, p2, p3), d4 = d(p1, p2, p4);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}
function pointInPoly(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > pt[1]) !== (yj > pt[1]) &&
        pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function segHitsHex(a, b, hex) {
  for (let i = 0; i < hex.length; i++) {
    if (segsIntersect(a, b, hex[i], hex[(i + 1) % hex.length])) return true;
  }
  return pointInPoly(a, hex) || pointInPoly(b, hex);
}

const edges = [];
const seen = new Set();
for (const [from, tos] of Object.entries(GRAPH)) {
  for (const to of tos) {
    const key = Math.min(from, to) + '-' + Math.max(from, to);
    if (!seen.has(key)) { seen.add(key); edges.push([Number(from), to]); }
  }
}
for (const [a, b] of edges) {
  for (const t of ids) {
    if (t === a || t === b) continue;
    const hex = hexPolygon(P[t][0], P[t][1], 4);
    if (segHitsHex(P[a], P[b], hex)) {
      errors.push(`連線 ${a}→${b} 穿過節點 ${t} 的六角形範圍`);
    }
  }
}

// 4. 連線長度統計（過長的連線視覺上不易追蹤，僅警告）
let maxEdge = 0, maxEdgePair = null;
for (const [a, b] of edges) {
  const len = Math.hypot(P[a][0] - P[b][0], P[a][1] - P[b][1]);
  if (len > maxEdge) { maxEdge = len; maxEdgePair = [a, b]; }
}

// ---- 報告 ----
if (errors.length) {
  console.error(`❌ 驗證失敗，共 ${errors.length} 項:\n` + errors.map(e => '  - ' + e).join('\n'));
  process.exit(1);
}
console.log(`✅ 驗證通過: 56 格零重疊（最小淨空 ${minClearance.toFixed(1)}px，最緊的一對: ${minPair}），連線皆不穿格。`);
console.log(`   最長連線: ${maxEdgePair} = ${maxEdge.toFixed(0)}px`);

// ---- 輸出 Board.tsx 用的百分比座標 ----
const pct = (v, total) => Math.round((v / total) * 10000) / 100;
const GROUPS = [
  ['底邊（左→右）', [47, 51, 0, 1, 2, 3, 4, 5, 9, 10, 11, 12, 13]],
  ['右邊（下→上，之字交錯）', [14, 15, 16, 17, 18, 22, 24]],
  ['頂邊（右→左）', [25, 26, 27, 28, 29, 30, 31, 32, 33, 37, 38, 39]],
  ['左邊（上→下，之字交錯）', [40, 41, 42, 43, 44, 45, 46]],
  ['下旋臂 5→6→7→8→55', [6, 7, 8, 55]],
  ['上旋臂 31→34→35→36→53', [34, 35, 36, 53]],
  ['左旋臂 44→48→49→50→52', [48, 49, 50, 52]],
  ['右旋臂 18→23→21→20→19', [23, 21, 20, 19]],
  ['中央樞紐', [54]],
];
let out = '';
for (const [label, group] of GROUPS) {
  out += `  // ${label}\n`;
  for (const id of group) {
    out += `  ${id}: { x: ${pct(P[id][0], CANVAS_W)}, y: ${pct(P[id][1], CANVAS_H)} },\n`;
  }
}
console.log('\n// ==== 貼入 Board.tsx 的 NODE_COORDINATES 內容 ====\n' + out);
