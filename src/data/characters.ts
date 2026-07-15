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
  },
  {
    id: "all_might",
    name: "歐爾麥特",
    quirk: "One For All",
    abilityName: "德州粉碎",
    abilityText: "被動：踩到對手據點時，有 20% 機率不付過路費。主動：每 6 回合免除下一次抵達他人據點時的全部支援費，支付 1,000 特訓費。"
  },
  {
    id: "eraser_head",
    name: "相澤消太",
    quirk: "抹消",
    abilityName: "抹消視線",
    abilityText: "被動：免疫輿論干擾（停步狀態）與據點停擺。主動：每 5 回合封印指定對手的主動個性技能與卡牌使用，持續 2 回合，支付 500 精神費。"
  },
  {
    id: "froppy",
    name: "蛙吹梅雨",
    quirk: "蛙",
    abilityName: "蛙類跳躍",
    abilityText: "被動：踩到路障時有 50% 機率直接跳過而不被攔截。主動：每 4 回合可跳躍前進前方 2 格或 3 格，支付 400 體力費。"
  },
  {
    id: "tsukuyomi",
    name: "常闇踏陰",
    quirk: "黑影",
    abilityName: "深淵暗軀",
    abilityText: "被動：升級據點時，物價膨脹對自己升級的負面成本影響降低 15%。主動：每 5 回合使周圍 3 格內的一處對手據點停擺 1 回合，支付 500 精神費。"
  },
  {
    id: "chargebolt",
    name: "上鳴電氣",
    quirk: "帶電",
    abilityName: "無差別放電",
    abilityText: "被動：抵達交通格時額外獲得 500 發電補助。主動：每 5 回合使所有其他玩家下回合只能前進 1 格，但自己下回合會被封印卡片，支付 600 電費。"
  },
  {
    id: "earphone_jack",
    name: "耳郎響香",
    quirk: "耳機插孔",
    abilityName: "心跳音爆",
    abilityText: "被動：使用卡牌時有 20% 機率不消耗該卡牌。主動：每 4 回合震碎指定據點的防護罩（消除其防守狀態），支付 400 音波費。"
  },
  {
    id: "shigaraki",
    name: "死柄木弔",
    quirk: "崩壞",
    abilityName: "崩壞之手",
    abilityText: "被動：進駐或升級據點後，有 15% 機率使相鄰的對手據點等級下降 1 級。主動：每 6 回合使指定據點等級下降 1 級，最低為等級 1，支付 800 意志費。"
  },
  {
    id: "dabi",
    name: "茶毘",
    quirk: "蒼炎",
    abilityName: "煉獄蒼炎",
    abilityText: "被動：他人支付給自己的租金增加 10%。主動：每 5 回合點燃指定玩家，使其下一次支付支援費時額外增付 30% 蒼炎費，支付 500 火力費。"
  }
];
