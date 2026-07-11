import type { GameState, DomainEvent } from '../types';
import { payCash, giveCash } from './economy';
import { getTileConfig, calculateNetWorth, getPlayerEffectValue, TILE_PRICE_BY_TIER } from './selectors';
import { EVENTS, type EventConfig } from '../../data/events';
import { SeedableRNG } from './rng';

// 觸發隨機或指定突發事件的純函數
export function triggerFate(
  state: GameState,
  playerId: string,
  customEventId?: string
): { state: GameState; events: DomainEvent[] } {
  let events: DomainEvent[] = [];
  let nextState = { ...state };

  const player = nextState.players.find(p => p.id === playerId);
  if (!player) return { state, events };

  // 1. 挑選事件
  let event: EventConfig | undefined;
  if (customEventId) {
    event = EVENTS.find(e => e.id === customEventId);
  } else {
    // 使用 seedable RNG 隨機抽取
    const rng = new SeedableRNG(nextState.rngState || 'default');
    const index = rng.range(0, EVENTS.length - 1);
    event = EVENTS[index];
    nextState.rngState = rng.getStateString(); // 更新 RNG 狀態
  }

  if (!event) return { state, events };

  events.push({
    type: 'EVENT_TRIGGERED',
    playerId,
    message: `📢 ${player.name} 觸發突發事件「${event.name}」：${event.description}`
  });

  // 2. 檢查危機公關抵銷 (負面事件)
  const prCount = getPlayerEffectValue(player, 'cancelNegativeFateCount');
  if (event.negative && prCount > 0) {
    // 扣除一次危機公關效果
    nextState.players = nextState.players.map(p => {
      if (p.id === playerId) {
        // 從 statusEffects 中移除一個 cancelNegativeFateCount
        const effects = [...p.statusEffects];
        const idx = effects.findIndex(e => e.kind === 'cancelNegativeFateCount');
        if (idx !== -1) {
          effects.splice(idx, 1);
        }
        return { ...p, statusEffects: effects };
      }
      return p;
    });

    events.push({
      type: 'EVENT_DEFENDED',
      playerId,
      message: `🛡️ ${player.name} 的危機公關發揮作用，成功抵銷了「${event.name}」的所有負面效果！`
    });

    return { state: nextState, events };
  }

  // 3. 處理不同類型的事件效果
  switch (event.type) {
    case 'cash': {
      // 增減自身現金 (amount 可以為正或負)
      if (event.amount && event.amount > 0) {
        const result = giveCash(nextState, playerId, event.amount, event.name);
        nextState = result.state;
        events = [...events, ...result.events];
      } else if (event.amount && event.amount < 0) {
        const result = payCash(nextState, playerId, Math.abs(event.amount), event.name);
        nextState = result.state;
        events = [...events, ...result.events];
      }
      break;
    }

    case 'cash_all': {
      // 全體未停業玩家增減現金
      const activePlayers = nextState.players.filter(p => !p.isBankrupt);
      for (const p of activePlayers) {
        if (event.amount && event.amount > 0) {
          const result = giveCash(nextState, p.id, event.amount, event.name);
          nextState = result.state;
          events = [...events, ...result.events];
        } else if (event.amount && event.amount < 0) {
          const result = payCash(nextState, p.id, Math.abs(event.amount), event.name);
          nextState = result.state;
          events = [...events, ...result.events];
        }
      }
      break;
    }

    case 'global_rent': {
      // 全體委託支援費增減比例，持續 3 回合
      if (event.value && event.duration) {
        nextState.globalEffects.push({
          name: event.name,
          duration: event.duration,
          kind: 'rentAll',
          value: event.value
        });
        events.push({
          type: 'GLOBAL_EFFECT_ADDED',
          message: `📢 全域效果：全體委託支援費將 ${event.value > 0 ? '增加' : '降低'} ${Math.round(Math.abs(event.value) * 100)}%，持續 ${event.duration} 輪。`
        });
      }
      break;
    }

    case 'upgrade_discount_all': {
      // 全體擴建費折價，持續 3 回合
      if (event.value && event.duration) {
        nextState.globalEffects.push({
          name: event.name,
          duration: event.duration,
          kind: 'upgradeDiscountAll',
          value: event.value
        });
        events.push({
          type: 'GLOBAL_EFFECT_ADDED',
          message: `📢 全域效果：全體據點擴建費用降低 ${Math.round(event.value * 100)}%，持續 ${event.duration} 輪。`
        });
      }
      break;
    }

    case 'dice_limit_all': {
      // 所有玩家點數上限，持續 1 回合
      if (event.value && event.duration) {
        nextState.globalEffects.push({
          name: event.name,
          duration: event.duration,
          kind: 'diceLimitAll',
          value: event.value
        });
        events.push({
          type: 'GLOBAL_EFFECT_ADDED',
          message: `📢 全域效果：所有玩家移動點數上限限制為 ${event.value}，持續 ${event.duration} 輪。`
        });
      }
      break;
    }

    case 'cash_if_own_land': {
      // 名下有土地的玩家扣除規費
      const ownedCount = nextState.tiles.filter(t => t.ownerId === playerId).length;
      if (ownedCount === 0) {
        events.push({
          type: 'EVENT_NO_EFFECT',
          playerId,
          message: `📢 ${player.name} 名下沒有任何據點，免予支付事務所維修費。`
        });
      } else if (event.amount && event.amount < 0) {
        const result = payCash(nextState, playerId, Math.abs(event.amount), event.name);
        nextState = result.state;
        events = [...events, ...result.events];
      }
      break;
    }

    case 'damage_highest_land': {
      // 破壞名下最高價值（最高等級/最高基礎價格）的土地
      const owned = nextState.tiles
        .filter(t => t.ownerId === playerId)
        .sort((a, b) => {
          const configA = getTileConfig(a.id);
          const configB = getTileConfig(b.id);
          const priceA = configA.tier ? TILE_PRICE_BY_TIER[configA.tier] : 0;
          const priceB = configB.tier ? TILE_PRICE_BY_TIER[configB.tier] : 0;
          return b.level - a.level || priceB - priceA;
        });

      if (owned.length === 0) {
        events.push({
          type: 'EVENT_NO_EFFECT',
          playerId,
          message: `📢 ${player.name} 名下沒有據點可被襲擊，本次安然無恙。`
        });
        break;
      }

      const targetTile = owned[0];
      const targetConfig = getTileConfig(targetTile.id);

      nextState.tiles = nextState.tiles.map(t => {
        if (t.id === targetTile.id) {
          if (t.statuses.guardRounds > 0) {
            events.push({
              type: 'EVENT_DEFENDED',
              playerId,
              tileId: targetTile.id,
              message: `🛡️ ${player.name} 的據點 ${targetConfig.name} 防護罩生效，成功抵銷了敵人襲擊！`
            });
            nextState.stats.defenseSuccess += 1;
            return { ...t, statuses: { ...t.statuses, guardRounds: 0 } };
          }

          nextState.stats.damageUses += 1;

          if (t.level > 0) {
            const nextLevel = (t.level - 1) as any;
            events.push({
              type: 'TILE_DAMAGED',
              playerId,
              tileId: targetTile.id,
              message: `💥 敵人襲擊！${player.name} 的據點 ${targetConfig.name} 從 Level ${t.level} 降至 Level ${nextLevel}！`
            });
            return { ...t, level: nextLevel };
          } else {
            events.push({
              type: 'TILE_DISABLED',
              playerId,
              tileId: targetTile.id,
              message: `💥 敵人襲擊！${player.name} 的空據點 ${targetConfig.name} 陷入停擺一次（下次不收支援費）。`
            });
            return { ...t, statuses: { ...t.statuses, rentDisabledOnce: true } };
          }
        }
        return t;
      });
      break;
    }

    case 'cash_most_land': {
      // 持有據點最多者獲得獎金
      const activePlayers = nextState.players.filter(p => !p.isBankrupt);
      if (activePlayers.length === 0) break;

      // 計算每個人擁有的地產數量
      const playerLandsCount = activePlayers.map(p => ({
        id: p.id,
        count: nextState.tiles.filter(t => t.ownerId === p.id).length
      }));

      // 按地產數量降序
      playerLandsCount.sort((a, b) => b.count - a.count);
      const maxCount = playerLandsCount[0].count;
      
      // 考慮並列第一名
      const winners = playerLandsCount.filter(item => item.count === maxCount && item.count > 0);

      if (winners.length === 0) {
        events.push({
          type: 'EVENT_NO_EFFECT',
          message: '📢 目前棋盤上沒有被進駐的據點，無人能獲得排名獎金。'
        });
      } else if (event.amount) {
        for (const w of winners) {
          const result = giveCash(nextState, w.id, event.amount, event.name);
          nextState = result.state;
          events = [...events, ...result.events];
        }
      }
      break;
    }

    case 'cash_highest_worth_percent': {
      // 聲望最高者支付現金百分比 (event.percent)
      const activePlayers = nextState.players.filter(p => !p.isBankrupt);
      if (activePlayers.length === 0) break;

      const sortedByWorth = [...activePlayers].sort((a, b) => {
        return calculateNetWorth(nextState, b.id) - calculateNetWorth(nextState, a.id);
      });

      const richest = sortedByWorth[0];
      if (event.percent) {
        const penalty = Math.round(richest.cash * event.percent);
        if (penalty > 0) {
          const result = payCash(nextState, richest.id, penalty, event.name);
          nextState = result.state;
          events = [...events, ...result.events];
        } else {
          events.push({
            type: 'EVENT_NO_EFFECT',
            message: `📢 聲望最高的 ${richest.name} 手頭沒有現金，免予支付輿論炎上罰款。`
          });
        }
      }
      break;
    }

    case 'cash_high_tier_owners': {
      // 所有持有 S/A 據點者獲得補助
      const activePlayers = nextState.players.filter(p => !p.isBankrupt);
      let awarded = false;

      for (const p of activePlayers) {
        const hasHighTier = nextState.tiles.some(t => {
          if (t.ownerId !== p.id) return false;
          const config = getTileConfig(t.id);
          return config.tier === 'S' || config.tier === 'A';
        });

        if (hasHighTier && event.amount) {
          const result = giveCash(nextState, p.id, event.amount, event.name);
          nextState = result.state;
          events = [...events, ...result.events];
          awarded = true;
        }
      }

      if (!awarded) {
        events.push({
          type: 'EVENT_NO_EFFECT',
          message: '📢 目前無人持有 S 級或 A 級據點，無人獲得夜間巡邏獎勵。'
        });
      }
      break;
    }
  }

  return {
    state: nextState,
    events
  };
}
