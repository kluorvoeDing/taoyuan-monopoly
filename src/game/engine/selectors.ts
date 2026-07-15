import type { GameState, PlayerState, TileState } from '../types';
import { TILES, type TileConfig } from '../../data/tiles';

// 各級土地基礎價格
export const TILE_PRICE_BY_TIER = {
  S: 6000,
  A: 4500,
  B: 3200,
  C: 2200
};

// 建築等級費率 (Level 0 ~ 4)
export const RENT_RATE_BY_LEVEL = [0.1, 0.2, 0.35, 0.55, 0.8];
export const LEVEL_NAMES = ["空據點", "臨時據點", "英雄事務所", "大型事務所", "No.1 英雄事務所"];

// 取得某格的靜態設定
export function getTileConfig(tileId: number): TileConfig {
  return TILES.find(t => t.id === tileId) || TILES[0];
}

// 計算玩家的聲望資產 (Net Worth)
export function calculateNetWorth(state: GameState, playerId: string): number {
  const player = state.players.find(p => p.id === playerId);
  if (!player) return 0;
  if (player.isBankrupt) return 0;

  const ownedTiles = state.tiles.filter(t => t.ownerId === playerId);
  const landValue = ownedTiles.reduce((sum, t) => {
    const config = getTileConfig(t.id);
    const basePrice = config.tier ? TILE_PRICE_BY_TIER[config.tier] : 0;
    return sum + basePrice;
  }, 0);

  const buildingValue = ownedTiles.reduce((sum, t) => {
    const config = getTileConfig(t.id);
    const basePrice = config.tier ? TILE_PRICE_BY_TIER[config.tier] : 0;
    return sum + (t.level * basePrice * 0.35);
  }, 0);

  return Math.round(player.cash + landValue + buildingValue);
}

// 取得某策略區域內的所有土地
export function getZoneTiles(zoneId: string): TileConfig[] {
  return TILES.filter(t => t.type === 'land' && t.zone === zoneId);
}

// 取得某玩家在某區域內擁有的土地
export function getPlayerZoneTiles(state: GameState, playerId: string, zoneId: string): TileState[] {
  const zoneTileIds = getZoneTiles(zoneId).map(t => t.id);
  return state.tiles.filter(t => zoneTileIds.includes(t.id) && t.ownerId === playerId);
}

// 計算玩家在某區的套裝進度
export interface ZoneProgress {
  owned: number;
  total: number;
  complete: boolean;
}

export function getZoneProgress(state: GameState, playerId: string, zoneId: string): ZoneProgress {
  const totalTiles = getZoneTiles(zoneId).length;
  const ownedTiles = getPlayerZoneTiles(state, playerId, zoneId).length;
  return {
    owned: ownedTiles,
    total: totalTiles,
    complete: totalTiles > 0 && ownedTiles === totalTiles
  };
}

// 計算某區的支援費套裝加成比例
export function getZoneRentBonus(state: GameState, ownerId: string, zoneId?: string): number {
  if (!zoneId || !ownerId) return 0;
  const { owned, complete } = getZoneProgress(state, ownerId, zoneId);
  if (complete) return 0.50; // 整區完成: +50%
  if (owned >= 4) return 0.30; // 持有4格以上但未整區: +30%
  if (owned >= 3) return 0.18; // 持有3格: +18%
  if (owned >= 2) return 0.10; // 持有2格: +10%
  return 0;
}

// 計算某區的擴建費折價比例
export function getZoneUpgradeDiscount(state: GameState, playerId: string, zoneId?: string): number {
  if (!zoneId || !playerId) return 0;
  const { owned, complete } = getZoneProgress(state, playerId, zoneId);
  if (complete) return 0.20; // 整區完成: -20%
  if (owned >= 4) return 0.15; // 持有4格以上但未整區: -15%
  if (owned >= 3) return 0.10; // 持有3格: -10%
  return 0;
}

// 取得玩家個人擁有的某種 TimedEffect 累計值
export function getPlayerEffectValue(player: PlayerState, effectKind: string): number {
  return player.statusEffects
    .filter(e => e.kind === effectKind)
    .reduce((sum, e) => sum + e.value, 0);
}

// 計算進駐 (購買) 土地價格
export function calculatePurchasePrice(state: GameState, player: PlayerState, tileId: number): number {
  const config = getTileConfig(tileId);
  if (config.type !== 'land' || !config.tier) return 0;

  let price = TILE_PRICE_BY_TIER[config.tier];
  
  // 切島銳兒郎被動：C級土地進駐費 -8%
  if (player.characterId === 'eijiro_kirishima' && config.tier === 'C') {
    price = price * 0.92;
  }

  // 加上物價指數通貨膨脹
  price = price * (state.priceIndex || 1.0);

  return Math.round(price);
}

// 計算擴建價格
export function calculateUpgradeCost(state: GameState, playerId: string, tileId: number): number {
  const player = state.players.find(p => p.id === playerId);
  if (!player) return 0;

  const config = getTileConfig(tileId);
  if (config.type !== 'land' || !config.tier) return 0;

  const basePrice = TILE_PRICE_BY_TIER[config.tier];
  const baseCost = basePrice * 0.5; // 基礎擴建費 = 土地基礎價格 × 50%

  let discount = 0;

  // 1. 爆豪勝己被動：擴建費 -10%
  if (player.characterId === 'katsuki_bakugo') {
    discount += 0.10;
  }

  // 2. 奮進人被動懲罰：No.1 英雄事務所建設費 +20% (從 Lv3 升到 Lv4 時)
  let costMultiplier = 1.0;
  const tileState = state.tiles.find(t => t.id === tileId);
  if (player.characterId === 'endeavor_enji_todoroki' && tileState && tileState.level === 3) {
    costMultiplier = 1.2;
  }

  // 3. 地區套裝折扣
  if (config.zone) {
    discount += getZoneUpgradeDiscount(state, playerId, config.zone);
  }

  // 4. 支援科裝備卡（主動狀態折扣，下一次擴建 -25%）
  // 檢查玩家手牌中是否有臨時的擴建折扣效果
  const blastDiscount = getPlayerEffectValue(player, 'upgradeDiscount');
  discount += blastDiscount;

  // 5. 全域效果折扣
  const globalDiscount = state.globalEffects
    .filter(e => e.kind === 'upgradeDiscountAll')
    .reduce((sum, e) => sum + e.value, 0);
  discount += globalDiscount;

  // 6. 亂入折扣（例如：支援科爆改亂入，個人 upgradeDiscount）
  // 備註：在 player.statusEffects 中，支援科爆改會掛上 upgradeDiscount: 0.50
  
  let priceIndex = state.priceIndex || 1.0;
  if (player.characterId === 'fumikage_tokoyami' && priceIndex > 1.0) {
    priceIndex = 1.0 + (priceIndex - 1.0) * 0.85;
  }

  let finalCost = baseCost * costMultiplier * (1 - discount) * priceIndex;

  // 限制：最低有效擴建費不得低於基礎擴建費的 10%
  const minCost = baseCost * 0.10 * priceIndex;
  if (finalCost < minCost) {
    finalCost = minCost;
  }

  return Math.round(finalCost);
}

// 模擬/計算抵達土地據點的支援費 (Rent)
export interface RentCalculationResult {
  rent: number;
  notes: string[];
}

export function calculateRent(
  state: GameState,
  tileId: number,
  payerId: string,
  ownerId: string,
  options: { simulate: boolean; customSeed?: number } = { simulate: false }
): RentCalculationResult {
  const payer = state.players.find(p => p.id === payerId);
  const owner = state.players.find(p => p.id === ownerId);
  const tileState = state.tiles.find(t => t.id === tileId);
  const config = getTileConfig(tileId);

  if (!payer || !owner || !tileState || !config.tier) {
    return { rent: 0, notes: [] };
  }

  const notes: string[] = [];

  // 基礎費率：土地基礎價格 × 建築等級費率 × 物價指數
  const basePrice = TILE_PRICE_BY_TIER[config.tier];
  const rate = RENT_RATE_BY_LEVEL[tileState.level];
  let rent = basePrice * rate * (state.priceIndex || 1.0);

  // 1. 全域支援費效果 (例如：英雄排名上升 +10%, 輿論冷卻 -10%)
  let globalMultiplier = 1.0;
  state.globalEffects.forEach(effect => {
    if (effect.kind === 'rentAll') {
      globalMultiplier += effect.value;
      notes.push(`${effect.name} ${effect.value > 0 ? '+' : ''}${Math.round(effect.value * 100)}%`);
    }
  });
  rent *= globalMultiplier;

  // 2. 土地擁有者角色被動
  // 轟焦凍被動：S 級據點支援費 +8%
  if (owner.characterId === 'shoto_todoroki' && config.tier === 'S') {
    rent *= 1.08;
    notes.push("轟焦凍半冷半燃被動 +8%");
  }
  // 奮進人被動：No.1 英雄事務所 (Level 4) 支援費 +20%
  if (owner.characterId === 'endeavor_enji_todoroki' && tileState.level === 4) {
    rent *= 1.20;
    notes.push("奮進人烈焰排名戰被動 +20%");
  }
  // 茶毘被動：自己據點過路費收益 +10%
  if (owner.characterId === 'dabi') {
    rent *= 1.10;
    notes.push("茶毘蒼炎被動 +10%");
  }

  // 3. 地區套裝加成
  if (config.zone) {
    const zoneBonus = getZoneRentBonus(state, ownerId, config.zone);
    if (zoneBonus > 0) {
      rent *= (1 + zoneBonus);
      notes.push(`套裝加成 +${Math.round(zoneBonus * 100)}%`);
    }
  }

  // 4. 據點干擾或停擺
  if (tileState.statuses.rentDisabledOnce && owner.characterId !== 'shota_aizawa') {
    // 停擺一次：支援費為 0
    if (!options.simulate) {
      // 這裡不直接修改 state，在 reducer 觸發時才清除該標記
    }
    notes.push("據點停擺");
    return { rent: 0, notes };
  }

  if (tileState.statuses.disruptedRounds > 0 && owner.characterId !== 'shota_aizawa') {
    rent *= 0.60; // 據點干擾：支援費 × 0.6
    notes.push("據點干擾 -40%");
  }

  // 5. 擁有者的亂入／狀態收益加成
  // 歐爾麥特亂入：收取支援費 +50%
  const ownerIncomeBoost = getPlayerEffectValue(owner, 'rentIncomeBoost');
  if (ownerIncomeBoost > 0) {
    rent *= (1 + ownerIncomeBoost);
    notes.push(`歐爾麥特站台 +${Math.round(ownerIncomeBoost * 100)}%`);
  }

  // 6. 支付者的亂入／狀態懲罰
  // 敵聯合亂入：支付支援費 +50%
  const payerPayPenalty = getPlayerEffectValue(payer, 'rentPayPenalty');
  if (payerPayPenalty > 0) {
    rent *= (1 + payerPayPenalty);
    notes.push(`敵聯合威脅 +${Math.round(payerPayPenalty * 100)}%`);
  }

  // 7. 一次性英雄廣告看板 (擁有者使用卡片)：下一次收費 × 1.5
  if (tileState.statuses.rentBoostOnce) {
    const multiplier = tileState.statuses.rentBoostOnce;
    rent *= multiplier;
    notes.push(`廣告看板 ×${multiplier}`);
  }

  // 8. 一次性無重力漂浮 (支付者使用卡片)：下一次支付 -50%
  // 備註：在 player.statusEffects 中掛上 rentPayDiscount: 0.5
  const payerRentFreeDiscount = getPlayerEffectValue(payer, 'rentPayDiscount');
  if (payerRentFreeDiscount > 0) {
    rent *= (1 - payerRentFreeDiscount);
    notes.push(`無重力漂浮 -${Math.round(payerRentFreeDiscount * 100)}%`);
  }

  // 9. 硬化防守、敵人預警等支付折扣
  // 切島銳兒郎主動：3回合內支付費 -20%
  // 敵人預警卡片效果：2回合內支付費 -20%
  const payerDefenceDiscount = getPlayerEffectValue(payer, 'rentPayDefenceDiscount');
  if (payerDefenceDiscount > 0) {
    rent *= (1 - payerDefenceDiscount);
    notes.push(`防禦折扣 -${Math.round(payerDefenceDiscount * 100)}%`);
  }

  // 10. 麗日御茶子被動：支付支援費時 20% 機率再打 8 折
  if (payer.characterId === 'ochaco_uraraka') {
    // 為了支持確定性模擬，我們可以用一個自定義種子或預設隨機
    const isLucky = options.simulate 
      ? (options.customSeed !== undefined ? (options.customSeed % 100 < 20) : false)
      : Math.random() < 0.20;
    
    if (isLucky) {
      rent *= 0.80;
      notes.push("麗日御茶子 20% 機率打 8 折");
    }
  }

  // 11. 歐爾麥特被動：支付支援費時 20% 機率直接免單
  if (payer.characterId === 'all_might') {
    const isLucky = options.simulate 
      ? (options.customSeed !== undefined ? (options.customSeed % 100 < 20) : false)
      : Math.random() < 0.20;
    
    if (isLucky) {
      rent = 0;
      notes.push("歐爾麥特 One For All 被動：免付過路費！");
    }
  }

  // 四捨五入為整數
  rent = Math.round(rent);
  if (rent < 0) rent = 0;

  return { rent, notes };
}
