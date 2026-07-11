export interface CardConfig {
  id: string;
  name: string;
  timing: '擲骰前' | '行動階段' | '任意';
  description: string;
}

export const CARDS: CardConfig[] = [
  { id: "remote_dice", name: "遙控骰子", timing: "擲骰前", description: "指定下一次擲骰移動點數 1～6。精準落地利器。" },
  { id: "turtle_card", name: "烏龜卡", timing: "行動階段", description: "指定任一玩家（含對手），使其 3 回合內每次移動固定為 1 格。" },
  { id: "roadblock", name: "路障", timing: "行動階段", description: "可在自身周圍 8 格範圍內放置一個路障，路過者會被強制停下。" },
  { id: "stay_card", name: "停留卡", timing: "擲骰前", description: "本回合不移動，直接原地再次觸發目前所在格的效果。" },

  { id: "rent_free", name: "免稅卡", timing: "任意", description: "下一次抵達他人據點時免付任何過路費（折扣 -100%）。" },
  { id: "rent_boost", name: "漲價卡", timing: "行動階段", description: "指定自己一塊土地，下一次對手路過此格時租金過路費 ×2.0 倍。" },
  { id: "demolish", name: "拆除卡", timing: "行動階段", description: "拆除指定對手土地建築 1 級（若有防護罩則會優先抵消防護罩）。" },
  { id: "tax_check", name: "查稅卡", timing: "行動階段", description: "指定一名對手，強行收取其當前現金 8% 的稅金（上限 5000）。" },

  { id: "site_guard", name: "防護罩卡", timing: "行動階段", description: "指定自己一塊據點設置 3 回合防護罩，用來抵擋一次拆除或干擾。" },
  { id: "support_repair", name: "工程車卡", timing: "行動階段", description: "清除指定格子的路障，或修復自己據點的干擾與停擺狀態。" },
  { id: "provisional_license", name: "購地卡", timing: "行動階段", description: "重置本回合地產操作標記，使您可以再購買或擴建據點一次。" },
  { id: "crisis_pr", name: "人壽保險卡", timing: "任意", description: "當觸發突發負面罰款事件時，自動消耗此卡片以完全抵消扣款。" },

  { id: "first_aid", name: "均富卡", timing: "行動階段", description: "將所有存活特工特工的現金加總後，平均平分給每個人。" },
  { id: "motorcycle_card", name: "機車卡", timing: "擲骰前", description: "騎乘機車，持續 3 回合，每回合擲骰移動改為投擲 2 顆骰子前進。" }
];

export type CardId = typeof CARDS[number]['id'];
