import type { GameState, PlayerState, TimedEffect, DomainEvent } from '../types';

// 為玩家添加一個持續狀態效果
export function addPlayerEffect(
  player: PlayerState,
  effect: Omit<TimedEffect, 'duration'> & { duration: number }
): PlayerState {
  // 若有相同 kind 的效果，可選擇覆蓋或疊加。這裡我們採用「同類型效果覆蓋，以時間長/數值大者優先」的策略，
  // 或簡單地直接追加。在原型中是直接 push。我們採用直接追加，計算時 selectors 會加總。
  return {
    ...player,
    statusEffects: [...player.statusEffects, effect]
  };
}

// 減少玩家個人的狀態回合數（在玩家回合結束時進行）
export function decrementPlayerEffects(player: PlayerState): PlayerState {
  const nextEffects = player.statusEffects
    .map(e => ({ ...e, duration: e.duration - 1 }))
    .filter(e => e.duration > 0);

  return {
    ...player,
    statusEffects: nextEffects
  };
}

// 減少全域狀態回合數（在一整輪結束時進行）
export function decrementGlobalEffects(state: GameState, events: DomainEvent[]): GameState {
  const nextGlobalEffects = state.globalEffects
    .map(e => ({ ...e, duration: e.duration - 1 }))
    .filter(e => {
      if (e.duration <= 0) {
        events.push({
          type: 'GLOBAL_EFFECT_EXPIRED',
          message: `📢 全域效果「${e.name}」已結束。`
        });
        return false;
      }
      return true;
    });

  return {
    ...state,
    globalEffects: nextGlobalEffects
  };
}

// 減少地圖格據點防守、干擾等狀態回合數（在一整輪結束時進行）
export function decrementTileEffects(state: GameState, events: DomainEvent[]): GameState {
  const nextTiles = state.tiles.map(tile => {
    let guard = tile.statuses.guardRounds;
    let disrupted = tile.statuses.disruptedRounds;

    if (guard > 0) {
      guard -= 1;
      if (guard === 0) {
        events.push({
          type: 'TILE_STATUS_EXPIRED',
          tileId: tile.id,
          message: `🛡️ 據點 ${tile.id} 的「防守狀態」已到期失效。`
        });
      }
    }

    if (disrupted > 0) {
      disrupted -= 1;
      if (disrupted === 0) {
        events.push({
          type: 'TILE_STATUS_EXPIRED',
          tileId: tile.id,
          message: `📢 據點 ${tile.id} 的「干擾狀態」已解除，恢復正常支援費。`
        });
      }
    }

    return {
      ...tile,
      statuses: {
        ...tile.statuses,
        guardRounds: guard,
        disruptedRounds: disrupted
      }
    };
  });

  return {
    ...state,
    tiles: nextTiles
  };
}
