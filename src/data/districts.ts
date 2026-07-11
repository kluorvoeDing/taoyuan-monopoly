export interface DistrictConfig {
  name: string;
  description: string;
  color: string;
}

export const DISTRICTS: Record<string, DistrictConfig> = {
  taoyuan_core: {
    name: "桃園核心區",
    description: "市中心高人流巡邏網，支援費收益最強。",
    color: "#8b4ed6"
  },
  arts_admin: {
    name: "藝文行政區",
    description: "行政與文化活動密集，穩定中高收益。",
    color: "#b65aa4"
  },
  luzhu_airport: {
    name: "蘆竹大園航空區",
    description: "航空城、機場與國際救援線。",
    color: "#2d6cdf"
  },
  qingpu_transit: {
    name: "青埔交通區",
    description: "高鐵、捷運與新興開發帶，戰略價值高。",
    color: "#1c7c82"
  },
  zhongli_life: {
    name: "中壢生活區",
    description: "中壢核心生活圈，穩定收益型區域。",
    color: "#2f9d55"
  },
  pingzhen_industry: {
    name: "平鎮工業區",
    description: "工業與住宅混合，價格中低但容易串聯。",
    color: "#a55b28"
  },
  mountain_south: {
    name: "龍潭楊梅山線區",
    description: "南桃園山線防災網，低價擴張區。",
    color: "#8269bf"
  },
  daxi_bade: {
    name: "大溪八德新鎮區",
    description: "觀光與新市鎮混合，中期擴建價值高。",
    color: "#db4c40"
  },
  guishan_medtech: {
    name: "龜山醫療科技區",
    description: "A7、長庚與科技醫療生活圈，高價防守區。",
    color: "#c08c16"
  },
  coast_defense: {
    name: "海線防災區",
    description: "觀音、新屋與海岸防災線，低價成套區。",
    color: "#607d3b"
  }
};
export type DistrictId = keyof typeof DISTRICTS;
