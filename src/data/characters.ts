export interface CharacterConfig {
  id: string;
  name: string;
  quirk: string;
  abilityName: string;
  abilityText: string;
}

export const CHARACTERS: CharacterConfig[] = [
  {
    id: "bill_rice",
    name: "綠谷出久",
    quirk: "One For All",
    abilityName: "全覆蓋衝刺",
    abilityText: "主動：每 5 回合可指定下一次移動點數 1～6，支付 800 身體負擔費。"
  },
  {
    id: "musk_bite",
    name: "飯田天哉",
    quirk: "引擎",
    abilityName: "互聯爆發",
    abilityText: "被動：踩到交通格後額外前進 2 格，交通費 +20%。主動：每 4 回合可指定下一次移動為 6，支付 600 耗能費。"
  },
  {
    id: "jay_turn",
    name: "八百萬百",
    quirk: "創造",
    abilityName: "道具創造",
    abilityText: "被動：抽支援裝備時 20% 機率多抽 1 張。主動：每 4 回合支付 600 材料費，創造 1 張支援裝備。"
  },
  {
    id: "jolin_zero",
    name: "麗日御茶子",
    quirk: "無重力",
    abilityName: "零重漂浮",
    abilityText: "被動：支付支援費時 20% 機率打 8 折。主動：每 4 回合取得 1 次支援費 -50%。"
  },
  {
    id: "gou_lift",
    name: "爆豪勝己",
    quirk: "爆破",
    abilityName: "爆破施工",
    abilityText: "被動：擴建費 -10%。主動：每 5 回合下一次擴建可連升 2 級，但費用 +45%。"
  },
  {
    id: "huang_smoke",
    name: "轟焦凍",
    quirk: "半冷半燃",
    abilityName: "冰封戰線",
    abilityText: "被動：S 級據點支援費 +8%。主動：每 5 回合指定一名玩家停 1 回合，該玩家下回合會再次觸發所在格。"
  },
  {
    id: "jobs_think",
    name: "奮進人",
    quirk: "烈焰",
    abilityName: "烈焰排名戰",
    abilityText: "被動：No.1 英雄事務所建設費 +20%，支援費 +20%。主動：每 5 回合使自己一塊最高級據點下次支援費 ×1.5。"
  },
  {
    id: "lin_mansion",
    name: "切島銳兒郎",
    quirk: "硬化",
    abilityName: "硬化防守",
    abilityText: "被動：進駐 C 級據點價格 -8%。主動：每 4 回合取得 3 回合硬化防守，支付支援費 -20%。"
  }
];
