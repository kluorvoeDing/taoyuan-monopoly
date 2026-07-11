import type { GameState, DomainEvent } from '../types';
import { decrementPlayerEffects, decrementGlobalEffects, decrementTileEffects } from './effects';

// 尋找下一個未停業的玩家 ID
export function getNextPlayerId(state: GameState): string {
  const activeIndex = state.players.findIndex(p => p.id === state.activePlayerId);
  let index = activeIndex;
  
  for (let i = 0; i < state.players.length; i++) {
    index = (index + 1) % state.players.length;
    const player = state.players[index];
    if (!player.isBankrupt) {
      return player.id;
    }
  }
  
  return state.activePlayerId; // 若無其他玩家，回傳自己
}

// 結束當前玩家的回合，處理冷卻、效果衰減並切換玩家
export function endTurn(state: GameState): { state: GameState; events: DomainEvent[] } {
  let events: DomainEvent[] = [];
  let nextState = { ...state };

  const currentPlayer = nextState.players.find(p => p.id === nextState.activePlayerId);
  if (!currentPlayer) return { state, events };

  // 1. 扣減當前玩家的個人能力冷卻 (Cooldowns)
  const nextCooldowns = { ...currentPlayer.cooldowns };
  Object.keys(nextCooldowns).forEach(abilityId => {
    if (nextCooldowns[abilityId] > 0) {
      nextCooldowns[abilityId] -= 1;
    }
  });

  // 2. 扣減當前玩家個人持續狀態 (statusEffects)
  let updatedPlayer = {
    ...currentPlayer,
    cooldowns: nextCooldowns,
    landActionUsed: false, // 重置每回合限一次的地產操作
    provisionalLicenseUsed: false // 重置臨時執照使用次數
  };
  updatedPlayer = decrementPlayerEffects(updatedPlayer);

  // 更新玩家陣列中的當前玩家
  nextState.players = nextState.players.map(p => {
    if (p.id === nextState.activePlayerId) {
      return updatedPlayer;
    }
    return p;
  });

  events.push({
    type: 'TURN_END',
    playerId: nextState.activePlayerId,
    message: `🔄 ${currentPlayer.name} 結束回合。`
  });

  // 3. 判斷是否是一整輪結束 (即當前玩家是玩家陣列中最後一個未停業/或倒數第一位玩家)
  // 在原本的邏輯中，當 `state.currentPlayerIndex === state.players.length - 1` 代表一輪結束，
  // 這裡我們以當前玩家是陣列中最後一位為準，來進行全域狀態與地圖狀態衰減。
  const isLastPlayerInArray = state.players[state.players.length - 1].id === nextState.activePlayerId;
  if (isLastPlayerInArray) {
    // 增加回合數 (Round)与物價指數 (Inflation)
    nextState.round += 1;
    nextState.priceIndex = 1.0 + (nextState.round - 1) * 0.05;
    events.push({
      type: 'ROUND_START',
      message: `📅 進入第 ${nextState.round} 回合 / 上限 ${nextState.maxRounds} 回合`
    });
    if (nextState.priceIndex > 1.0) {
      events.push({
        type: 'INFLATION_INCREASED',
        message: `📈 本輪物價上揚！全域物價指數攀升至 ×${nextState.priceIndex.toFixed(2)}。`
      });
    }

    // 衰減全域持續效果 (globalEffects)
    nextState = decrementGlobalEffects(nextState, events);
    // 衰減地圖狀態 (guardRounds, disruptedRounds)
    nextState = decrementTileEffects(nextState, events);
  }

  // 4. 切換到下一位玩家
  const nextPlayerId = getNextPlayerId(nextState);
  nextState.activePlayerId = nextPlayerId;

  // 5. 初始化新玩家回合的狀態
  nextState.phase = 'preRoll';

  return {
    state: nextState,
    events
  };
}
