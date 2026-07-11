window.TAOFUWENG_DISTRICTS = {
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

window.TAOFUWENG_TILES = [
  { id: 0, name: "英雄總部", subtitle: "桃園車站", type: "start" },

  { id: 1, name: "桃園站前", subtitle: "市中心巡邏據點", type: "land", district: "桃園區", zone: "taoyuan_core", tier: "S" },
  { id: 2, name: "中正商圈", subtitle: "高人流警戒區", type: "land", district: "桃園區", zone: "taoyuan_core", tier: "A" },
  { id: 3, name: "民生路", subtitle: "舊城生活據點", type: "land", district: "桃園區", zone: "taoyuan_core", tier: "B" },
  { id: 4, name: "支援站", subtitle: "抽取支援裝備", type: "card" },
  { id: 5, name: "火車站商圈", subtitle: "通勤支援區", type: "land", district: "桃園區", zone: "taoyuan_core", tier: "A" },
  { id: 6, name: "突發事件", subtitle: "城市異常通報", type: "fate" },

  { id: 7, name: "藝文特區", subtitle: "市民救援示範區", type: "land", district: "桃園區", zone: "arts_admin", tier: "S" },
  { id: 8, name: "中路重劃", subtitle: "新興事務所區", type: "land", district: "桃園區", zone: "arts_admin", tier: "A" },
  { id: 9, name: "市府周邊", subtitle: "行政支援節點", type: "land", district: "桃園區", zone: "arts_admin", tier: "A" },
  { id: 10, name: "慈文路", subtitle: "住宅防災網", type: "land", district: "桃園區", zone: "arts_admin", tier: "B" },
  { id: 11, name: "支援基金", subtitle: "城市基金抽選", type: "lottery" },
  { id: 12, name: "南崁", subtitle: "通勤熱區巡邏點", type: "land", district: "蘆竹區", zone: "luzhu_airport", tier: "A" },
  { id: 13, name: "大竹", subtitle: "住宅防災據點", type: "land", district: "蘆竹區", zone: "luzhu_airport", tier: "B" },
  { id: 14, name: "機場捷運", subtitle: "快速支援通道", type: "traffic" },

  { id: 15, name: "桃園機場", subtitle: "國際英雄支援站", type: "traffic" },
  { id: 16, name: "大園市區", subtitle: "機場生活圈據點", type: "land", district: "大園區", zone: "luzhu_airport", tier: "B" },
  { id: 17, name: "航空城", subtitle: "國際救援開發區", type: "land", district: "大園區", zone: "luzhu_airport", tier: "A" },
  { id: 18, name: "菓林", subtitle: "航空外圍巡邏點", type: "land", district: "大園區", zone: "luzhu_airport", tier: "C" },
  { id: 19, name: "高鐵桃園", subtitle: "機動支援轉運站", type: "traffic" },
  { id: 20, name: "青埔 A18", subtitle: "高速機動訓練區", type: "land", district: "中壢區", zone: "qingpu_transit", tier: "S" },
  { id: 21, name: "青埔商圈", subtitle: "新興市民服務帶", type: "land", district: "中壢區", zone: "qingpu_transit", tier: "A" },

  { id: 22, name: "支援站", subtitle: "抽取支援裝備", type: "card" },
  { id: 23, name: "青塘園", subtitle: "公共安全示範區", type: "land", district: "中壢區", zone: "qingpu_transit", tier: "A" },
  { id: 24, name: "棒球園區", subtitle: "大型活動戒備區", type: "land", district: "中壢區", zone: "qingpu_transit", tier: "B" },
  { id: 25, name: "A21 環北", subtitle: "捷運支援站", type: "traffic" },
  { id: 26, name: "中壢前站", subtitle: "高人流巡邏區", type: "land", district: "中壢區", zone: "zhongli_life", tier: "A" },
  { id: 27, name: "中壢後站", subtitle: "後站防衛線", type: "land", district: "中壢區", zone: "zhongli_life", tier: "B" },
  { id: 28, name: "突發事件", subtitle: "城市異常通報", type: "fate" },

  { id: 29, name: "內壢", subtitle: "生活圈巡邏點", type: "land", district: "中壢區", zone: "zhongli_life", tier: "B" },
  { id: 30, name: "元智大學", subtitle: "校園支援據點", type: "land", district: "中壢區", zone: "zhongli_life", tier: "B" },
  { id: 31, name: "過嶺", subtitle: "新興重劃據點", type: "land", district: "中壢區", zone: "zhongli_life", tier: "B" },
  { id: 32, name: "支援基金", subtitle: "城市基金抽選", type: "lottery" },
  { id: 33, name: "平鎮公所", subtitle: "行政支援據點", type: "land", district: "平鎮區", zone: "pingzhen_industry", tier: "B" },
  { id: 34, name: "山仔頂", subtitle: "工業區警戒點", type: "land", district: "平鎮區", zone: "pingzhen_industry", tier: "C" },
  { id: 35, name: "新勢公園", subtitle: "市民避難節點", type: "land", district: "平鎮區", zone: "pingzhen_industry", tier: "C" },

  { id: 36, name: "支援站", subtitle: "抽取支援裝備", type: "card" },
  { id: 37, name: "龍潭市區", subtitle: "山區救援據點", type: "land", district: "龍潭區", zone: "mountain_south", tier: "C" },
  { id: 38, name: "龍科園區", subtitle: "科技防災節點", type: "land", district: "龍潭區", zone: "mountain_south", tier: "B" },
  { id: 39, name: "楊梅市區", subtitle: "郊區巡邏據點", type: "land", district: "楊梅區", zone: "mountain_south", tier: "C" },
  { id: 40, name: "埔心", subtitle: "鐵路生活圈據點", type: "land", district: "楊梅區", zone: "mountain_south", tier: "C" },
  { id: 41, name: "突發事件", subtitle: "城市異常通報", type: "fate" },
  { id: 42, name: "大溪老街", subtitle: "觀光巡邏區", type: "land", district: "大溪區", zone: "daxi_bade", tier: "B" },

  { id: 43, name: "埔頂重劃", subtitle: "溪東開發防災點", type: "land", district: "大溪區", zone: "daxi_bade", tier: "B" },
  { id: 44, name: "八德重劃", subtitle: "新市鎮防災據點", type: "land", district: "八德區", zone: "daxi_bade", tier: "A" },
  { id: 45, name: "高城", subtitle: "邊界警戒點", type: "land", district: "八德區", zone: "daxi_bade", tier: "B" },
  { id: 46, name: "A8 長庚", subtitle: "醫療緊急支援站", type: "traffic" },
  { id: 47, name: "龜山市區", subtitle: "醫療支援生活圈", type: "land", district: "龜山區", zone: "guishan_medtech", tier: "A" },
  { id: 48, name: "A7 重劃", subtitle: "新世代英雄基地", type: "land", district: "龜山區", zone: "guishan_medtech", tier: "S" },
  { id: 49, name: "支援站", subtitle: "抽取支援裝備", type: "card" },

  { id: 50, name: "林口長庚圈", subtitle: "醫療英雄聯防區", type: "land", district: "龜山區", zone: "guishan_medtech", tier: "A" },
  { id: 51, name: "華亞科技園", subtitle: "科技支援據點", type: "land", district: "龜山區", zone: "guishan_medtech", tier: "A" },
  { id: 52, name: "草漯", subtitle: "海線防災據點", type: "land", district: "觀音區", zone: "coast_defense", tier: "C" },
  { id: 53, name: "觀音工業", subtitle: "工安警戒區", type: "land", district: "觀音區", zone: "coast_defense", tier: "C" },
  { id: 54, name: "新屋市區", subtitle: "海岸巡邏據點", type: "land", district: "新屋區", zone: "coast_defense", tier: "C" },
  { id: 55, name: "永安漁港", subtitle: "海岸救援前線", type: "land", district: "新屋區", zone: "coast_defense", tier: "C" }
];
