import type { GameState, DomainEvent } from '../types';
import { 
  getTileConfig, 
  getZoneProgress, 
  TILE_PRICE_BY_TIER 
} from './selectors';

// 輔助函式：計算土地對玩家的策略評分（用於 AI 決策與緊急拍賣排序）
// 分數越高表示策略價值越高，應優先保留。拍賣時應優先出售分數低的土地。
export function scoreTileForPlayer(state: GameState, playerId: string, tileId: number): number {
  const tileState = state.tiles.find(t => t.id === tileId);
  const config = getTileConfig(tileId);
  if (!tileState || config.type !== 'land' || !config.tier || !config.zone) return 0;

  // 級別基礎分：S 50, A 36, B 24, C 16
  const tierScore = { S: 50, A: 36, B: 24, C: 16 }[config.tier] || 10;
  
  const progress = getZoneProgress(state, playerId, config.zone);
  // 自己在該區已持有數 × 18
  let score = tierScore + progress.owned * 18;

  // 即將完成整區時額外 +70
  if (progress.owned === progress.total - 1) {
    score += 70;
  }

  // 加上房屋等級的評估 (每級 +20 分)
  score += tileState.level * 20;

  return score;
}

// 增加玩家現金的純函數
export function giveCash(state: GameState, playerId: string, amount: number, reason: string): { state: GameState, events: DomainEvent[] } {
  const events: DomainEvent[] = [];
  const nextPlayers = state.players.map(p => {
    if (p.id === playerId) {
      const newCash = p.cash + amount;
      // 這裡由於是 map，所以 calculateNetWorth 內用的還是舊的 state，
      // 但我們可以用純資料更新來推算或重新評估。
      const pUpdate = { ...p, cash: newCash };
      
      events.push({
        type: 'CASH_GAIN',
        playerId,
        amount,
        message: `${p.name} 獲得預算 ${amount.toLocaleString("zh-Hant-TW")}（${reason}）`
      });
      return pUpdate;
    }
    return p;
  });

  return {
    state: { ...state, players: nextPlayers },
    events
  };
}

// 處理扣款與緊急據點收回拍賣的純函數
export function payCash(state: GameState, playerId: string, amount: number, reason: string): { state: GameState, events: DomainEvent[] } {
  let events: DomainEvent[] = [];
  let nextState = { ...state };
  
  const player = nextState.players.find(p => p.id === playerId);
  if (!player) return { state, events };

  // 1. 先扣減現金
  nextState.players = nextState.players.map(p => {
    if (p.id === playerId) {
      events.push({
        type: 'CASH_LOSS',
        playerId,
        amount,
        message: `${p.name} 支付費用 ${amount.toLocaleString("zh-Hant-TW")}（${reason}）`
      });
      return { ...p, cash: p.cash - amount };
    }
    return p;
  });

  // 2. 檢查現金是否低於 0，若是則觸發緊急據點回收
  let activePlayer = nextState.players.find(p => p.id === playerId)!;
  if (activePlayer.cash < 0 && !activePlayer.isBankrupt) {
    // 找出名下所有土地，並計算在扣減前的策略價值（避免隨拍賣變更）
    const ownedTiles = nextState.tiles.filter(t => t.ownerId === playerId);
    
    // 計算每塊地的評分，並由低到高排序
    const sortedTilesToSell = ownedTiles
      .map(t => ({
        tile: t,
        score: scoreTileForPlayer(nextState, playerId, t.id)
      }))
      .sort((a, b) => a.score - b.score); // 升序：低策略價值優先出售

    for (const item of sortedTilesToSell) {
      if (activePlayer.cash >= 0) break; // 已補足現金則停止拍賣

      const tile = item.tile;
      const config = getTileConfig(tile.id);
      if (!config.tier) continue;

      const basePrice = TILE_PRICE_BY_TIER[config.tier];
      // 單一據點回收金 = 土地基礎價格 × 50% + 建築等級 × 土地基礎價格 × 25%
      const recoupValue = Math.round(basePrice * 0.50 + tile.level * basePrice * 0.25);

      // 執行售出
      nextState.tiles = nextState.tiles.map(t => {
        if (t.id === tile.id) {
          return {
            ...t,
            ownerId: undefined,
            level: 0,
            statuses: {
              guardRounds: 0,
              disruptedRounds: 0,
              rentDisabledOnce: false,
              rentBoostOnce: null
            }
          };
        }
        return t;
      });

      nextState.players = nextState.players.map(p => {
        if (p.id === playerId) {
          activePlayer = { ...p, cash: p.cash + recoupValue };
          return activePlayer;
        }
        return p;
      });

      events.push({
        type: 'TILE_RECOUP',
        playerId,
        tileId: tile.id,
        amount: recoupValue,
        message: `${activePlayer.name} 現金不足，緊急撤收據點 ${config.name}（回收價 ${recoupValue.toLocaleString("zh-Hant-TW")}）`
      });
    }

    // 3. 若拍賣完名下所有據點後，現金仍低於 0，玩家停業 (Bankrupt)
    if (activePlayer.cash < 0) {
      nextState = bankruptPlayer(nextState, playerId, events);
    }
  }

  return {
    state: nextState,
    events
  };
}

// 轉帳純函數 (從 payer 支付給 owner)
export function transferCash(
  state: GameState,
  fromId: string,
  toId: string,
  amount: number,
  reason: string
): { state: GameState, events: DomainEvent[] } {
  // 先自付款方扣款 (處理付款方可能面臨的拍賣與停業)
  const payResult = payCash(state, fromId, amount, reason);
  let nextState = payResult.state;
  let events = [...payResult.events];

  // 檢查付款方是否在扣款後停業
  const payer = nextState.players.find(p => p.id === fromId)!;
  
  // 收款金額：若付款方中途停業，收款方拿到的金額為「付款方在停業前所能支付的所有現金（即扣款前的現金 + 拍賣所得）」
  // 如果未停業，則是全額 amount。如果停業了，則是其所能支付的上限（即 payer 扣款前加上所有變賣所得，此時 payer.cash 應為負值，
  // 說明扣了這筆錢之後即使賣光也還不起，那麼收款方只能拿到他賣光後的極限金額，即 amount + payer.cash）
  let actualReceived = amount;
  if (payer.isBankrupt) {
    // 比如原本 payer 有 1000 現金，變賣土地得 2000，共 3000。要付 5000。
    // 扣除後 cash = -4000。變賣完後 cash = -2000 => 宣告破產。
    // 代表他其實只付得出 3000。所以收款方實際收到的金額是 5000 + (-2000) = 3000。
    actualReceived = amount + payer.cash; // 這裡 payer.cash 在 payCash 後會是負數（停業處理前）
    if (actualReceived < 0) actualReceived = 0;
  }

  // 支付給收款方
  if (actualReceived > 0) {
    const receiveResult = giveCash(nextState, toId, actualReceived, `來自 ${payer.name} 的委託費`);
    nextState = receiveResult.state;
    events = [...events, ...receiveResult.events];
  }

  return {
    state: nextState,
    events
  };
}

// 處理停業 (破產) 的內部純函數
function bankruptPlayer(state: GameState, playerId: string, events: DomainEvent[]): GameState {
  const player = state.players.find(p => p.id === playerId);
  if (!player) return state;

  events.push({
    type: 'BANKRUPT',
    playerId,
    message: `❌ ${player.name} 宣告停業！名下所有據點釋出，手牌與狀態清空。`
  });

  const nextPlayers = state.players.map(p => {
    if (p.id === playerId) {
      return {
        ...p,
        cash: 0,
        cards: [],
        statusEffects: [],
        isBankrupt: true
      };
    }
    return p;
  });

  // 釋出所有屬於該玩家的土地
  const nextTiles = state.tiles.map(t => {
    if (t.ownerId === playerId) {
      return {
        ...t,
        ownerId: undefined,
        level: 0 as 0, // 強制斷言
        statuses: {
          guardRounds: 0,
          disruptedRounds: 0,
          rentDisabledOnce: false,
          rentBoostOnce: null
        }
      };
    }
    return t;
  });

  return {
    ...state,
    players: nextPlayers,
    tiles: nextTiles
  };
}
