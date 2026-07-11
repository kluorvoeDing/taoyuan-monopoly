export interface EventConfig {
  id: string;
  name: string;
  description: string;
  type:
    | 'cash'
    | 'cash_all'
    | 'global_rent'
    | 'upgrade_discount_all'
    | 'dice_limit_all'
    | 'cash_if_own_land'
    | 'damage_highest_land'
    | 'cash_most_land'
    | 'cash_highest_worth_percent'
    | 'cash_high_tier_owners';
  amount?: number;
  value?: number;
  duration?: number;
  percent?: number;
  negative?: boolean;
}

export const EVENTS: EventConfig[] = [
  { id: "hero_license_fee", name: "臨時執照規費", description: "臨時英雄執照續期，支付規費 1000。", type: "cash", target: "self", amount: -1000, negative: true } as any,
  { id: "civilian_thanks", name: "市民感謝金", description: "巡邏時順手救了差點遲到的上班族，獲得感謝金 800。", type: "cash", target: "self", amount: 800 } as any,
  { id: "hero_ranking_heat", name: "英雄排名上升", description: "區域英雄曝光度提升，全體委託支援費 +10%，持續 3 回合。", type: "global_rent", value: 0.1, duration: 3 },
  { id: "public_opinion_cool", name: "輿論冷卻", description: "市民質疑英雄收費太貴，全體委託支援費 -10%，持續 3 回合。", type: "global_rent", value: -0.1, duration: 3 },
  { id: "support_budget", name: "支援科補助", description: "支援科通過新裝備預算，所有未停業玩家獲得 800。", type: "cash_all", amount: 800 },
  { id: "agency_repair", name: "事務所維修", description: "名下最高級英雄事務所被要求補強防災設施，支付 1200。", type: "cash_if_own_land", amount: -1200, negative: true },

  { id: "villain_attack", name: "敵人襲擊", description: "敵人突襲，自己名下一塊最高級據點降 1 級；防禦可抵銷。", type: "damage_highest_land", negative: true },
  { id: "ranking_bonus", name: "英雄排名獎金", description: "持有據點最多的玩家獲得 1500 支援預算。", type: "cash_most_land", amount: 1500 },
  { id: "public_backlash", name: "輿論炎上", description: "聲望最高的玩家被檢討過度商業化，支付 8% 支援預算。", type: "cash_highest_worth_percent", percent: 0.08, negative: true },
  { id: "support_upgrade", name: "支援科爆改週", description: "所有玩家下一次擴建費 -20%，持續 3 回合。", type: "upgrade_discount_all", value: 0.2, duration: 3 },
  { id: "training_drill", name: "臨時演習", description: "所有玩家移動點數只能 1～3，持續 1 回合。", type: "dice_limit_all", value: 3, duration: 1, negative: true },
  { id: "night_patrol", name: "夜間巡邏成功", description: "所有持有 S / A 級據點的玩家獲得 500 支援預算。", type: "cash_high_tier_owners", amount: 500 }
];
export type EventId = typeof EVENTS[number]['id'];
