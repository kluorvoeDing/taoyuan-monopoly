export interface RaidConfig {
  id: string;
  name: string;
  duration: number; // 持續回合數 (踩到後持續作用的回合數)
  kind: 'rentIncomeBoost' | 'rentPayPenalty' | 'upgradeDiscount' | 'diceLimit';
  value: number; // 效果數值
  description: string;
}

export const RAIDS: RaidConfig[] = [
  {
    id: "all_might",
    name: "歐爾麥特亂入",
    duration: 3,
    kind: "rentIncomeBoost",
    value: 0.5,
    description: "委託支援費收入 +50%。和平的象徵幫你站台。"
  },
  {
    id: "league_villain",
    name: "敵聯合亂入",
    duration: 3,
    kind: "rentPayPenalty",
    value: 0.5,
    description: "支付委託支援費 +50%。危險區域加收支援費。"
  },
  {
    id: "support_course",
    name: "支援科爆改",
    duration: 2,
    kind: "upgradeDiscount",
    value: 0.5,
    description: "事務所擴建費 -50%。支援科幫你做了半套。"
  },
  {
    id: "eraser_head",
    name: "相澤老師巡場",
    duration: 2,
    kind: "diceLimit",
    value: 3,
    description: "移動點數只能 1～3。老師叫你冷靜一點。"
  }
];
export type RaidId = typeof RAIDS[number]['id'];
