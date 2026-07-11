import type { GameState, DomainEvent } from '../types';
import { payCash } from './economy';
import { getTileConfig } from './selectors';
import { drawCard } from './cards'; // 雖然 drawCard 是卡片內的輔助，但我們可以共用抽卡

// 檢查角色個性主動能力是否可使用（CD 是否為 0，資金是否足夠）
export function canUseAbility(state: GameState, playerId: string): { canUse: boolean; error?: string } {
  const player = state.players.find(p => p.id === playerId);
  if (!player) return { canUse: false, error: '找不到該玩家' };
  
  if (player.isBankrupt) return { canUse: false, error: '已停業玩家無法使用能力' };

  // 只能在自己的回合的 preRoll 或 action 階段使用主動個性
  if (state.activePlayerId !== playerId) {
    return { canUse: false, error: '只能在自己的回合使用個性' };
  }

  const charId = player.characterId;
  const currentCD = player.cooldowns[charId] || 0;
  if (currentCD > 0) {
    return { canUse: false, error: `個性能力冷卻中，還需等待 ${currentCD} 回合` };
  }

  // 檢查成本
  let cost = 0;
  if (charId === 'bill_rice') cost = 800; // 綠谷全覆蓋衝刺 800
  if (charId === 'musk_bite') cost = 600; // 飯田互聯爆發 600
  if (charId === 'jay_turn') cost = 600;  // 八百萬道具創造 600

  if (player.cash < cost) {
    return { canUse: false, error: `支援預算不足，無法支付個性成本 ${cost.toLocaleString("zh-Hant-TW")}` };
  }

  return { canUse: true };
}

// 執行角色主動個性能力的純函數
export function applyAbility(
  state: GameState,
  playerId: string,
  payload?: any
): { state: GameState; events: DomainEvent[]; error?: string } {
  const check = canUseAbility(state, playerId);
  if (!check.canUse) {
    return { state, events: [], error: check.error };
  }

  let events: DomainEvent[] = [];
  let nextState = { ...state };
  const player = nextState.players.find(p => p.id === playerId)!;
  const charId = player.characterId;

  // 1. 扣除能力成本
  let cost = 0;
  if (charId === 'bill_rice') cost = 800;
  if (charId === 'musk_bite') cost = 600;
  if (charId === 'jay_turn') cost = 600;

  if (cost > 0) {
    const payResult = payCash(nextState, playerId, cost, `個性「${getAbilityName(charId)}」成本`);
    nextState = payResult.state;
    events = [...events, ...payResult.events];
    
    // 如果因為付 CD 成本導致破產，直接返回
    const checkPlayer = nextState.players.find(p => p.id === playerId)!;
    if (checkPlayer.isBankrupt) {
      return { state: nextState, events };
    }
  }

  // 2. 根據不同角色執行個性效果
  switch (charId) {
    case 'bill_rice': {
      // 綠谷出久：指定下一次移動點數 1～6
      const diceVal = Number(payload?.diceValue);
      if (!diceVal || diceVal < 1 || diceVal > 6) {
        return { state, events: [], error: '指定骰子點數必須在 1 到 6 之間' };
      }

      nextState.players = nextState.players.map(p => {
        if (p.id === playerId) {
          return {
            ...p,
            statusEffects: [...p.statusEffects, { name: '指定骰子', duration: 1, kind: 'nextDice', value: diceVal }],
            cooldowns: { ...p.cooldowns, [charId]: 5 } // CD = 5
          };
        }
        return p;
      });

      events.push({
        type: 'ABILITY_USE',
        playerId,
        abilityId: charId,
        message: `⚡ ${player.name} 發動個性「全覆蓋衝刺」，消耗 800，指定下一次移動點數為 ${diceVal} 點！`
      });
      break;
    }

    case 'musk_bite': {
      // 飯田天哉：下一次固定 6 點
      nextState.players = nextState.players.map(p => {
        if (p.id === playerId) {
          return {
            ...p,
            statusEffects: [...p.statusEffects, { name: '指定骰子', duration: 1, kind: 'nextDice', value: 6 }],
            cooldowns: { ...p.cooldowns, [charId]: 4 } // CD = 4
          };
        }
        return p;
      });

      events.push({
        type: 'ABILITY_USE',
        playerId,
        abilityId: charId,
        message: `🏃 ${player.name} 發動個性「互聯爆發」，消耗 600，下一次擲骰將固定為 6 點！`
      });
      break;
    }

    case 'jay_turn': {
      // 八百萬百：創造 1 張支援裝備卡 (抽一張卡，並配合被動 20% 機率多抽 1 張)
      events.push({
        type: 'ABILITY_USE',
        playerId,
        abilityId: charId,
        message: `🛠️ ${player.name} 發動個性「道具創造」，消耗 600 材料費進行裝備創造！`
      });

      // 抽卡
      const drawResult = drawCard(nextState, playerId, 1, '個性「道具創造」');
      nextState = drawResult.state;
      events = [...events, ...drawResult.events];

      // 設定冷卻
      nextState.players = nextState.players.map(p => {
        if (p.id === playerId) {
          return {
            ...p,
            cooldowns: { ...p.cooldowns, [charId]: 4 } // CD = 4
          };
        }
        return p;
      });
      break;
    }

    case 'jolin_zero': {
      // 麗日御茶子：取得 1 次支援費 -50% 的漂浮狀態
      nextState.players = nextState.players.map(p => {
        if (p.id === playerId) {
          return {
            ...p,
            statusEffects: [...p.statusEffects, { name: '零重漂浮', duration: 99, kind: 'rentPayDiscount', value: 0.50 }],
            cooldowns: { ...p.cooldowns, [charId]: 4 } // CD = 4
          };
        }
        return p;
      });

      events.push({
        type: 'ABILITY_USE',
        playerId,
        abilityId: charId,
        message: `🌸 ${player.name} 發動個性「零重漂浮」，下次抵達他人據點時支援費降低 50%。`
      });
      break;
    }

    case 'gou_lift': {
      // 爆豪勝己：下一次擴建可連升 2 級，但擴建費 × 1.45
      nextState.players = nextState.players.map(p => {
        if (p.id === playerId) {
          return {
            ...p,
            statusEffects: [...p.statusEffects, { name: '爆破施工', duration: 99, kind: 'blastUpgrade', value: 1 }],
            cooldowns: { ...p.cooldowns, [charId]: 5 } // CD = 5
          };
        }
        return p;
      });

      events.push({
        type: 'ABILITY_USE',
        playerId,
        abilityId: charId,
        message: `💥 ${player.name} 發動個性「爆破施工」，本回合下一次據點擴建可連升最多 2 級，但擴建費增加 45%！`
      });
      break;
    }

    case 'huang_smoke': {
      // 轟焦凍：指定一名玩家停 1 回合，該玩家下回合會再次觸發所在格
      const targetPlayerId = payload?.targetPlayerId;
      if (!targetPlayerId || targetPlayerId === playerId) {
        return { state: nextState, events: [], error: '必須選擇其他仍在遊戲中的玩家為目標' };
      }
      const target = nextState.players.find(p => p.id === targetPlayerId);
      if (!target || target.isBankrupt) {
        return { state: nextState, events: [], error: '目標玩家無效或已停業' };
      }

      nextState.players = nextState.players.map(p => {
        if (p.id === playerId) {
          return { ...p, cooldowns: { ...p.cooldowns, [charId]: 5 } }; // CD = 5
        }
        if (p.id === targetPlayerId) {
          // 掛上 skipNextTurn 停行效果
          return {
            ...p,
            statusEffects: [...p.statusEffects, { name: '冰封戰線停行', duration: 1, kind: 'skipNextTurn', value: 1 }]
          };
        }
        return p;
      });

      events.push({
        type: 'ABILITY_USE',
        playerId,
        abilityId: charId,
        message: `❄️ ${player.name} 發動個性「冰封戰線」，指定將 ${target.name} 冰凍停行 1 回合！其下回合將再次觸發所在格。`
      });
      break;
    }

    case 'jobs_think': {
      // 奮進人：自己最高級據點下次支援費 × 1.5
      // 找出玩家名下最高等級的據點
      const ownedTiles = nextState.tiles.filter(t => t.ownerId === playerId);
      if (ownedTiles.length === 0) {
        return { state: nextState, events: [], error: '你名下必須至少擁有一處據點土地才能發動此個性' };
      }

      // 排序找出最高 Level 且不為 No.1 英雄事務所的，或者就是最高級的據點
      const highestTile = ownedTiles.sort((a, b) => b.level - a.level)[0];
      const config = getTileConfig(highestTile.id);

      nextState.tiles = nextState.tiles.map(t => {
        if (t.id === highestTile.id) {
          return { ...t, statuses: { ...t.statuses, rentBoostOnce: 1.5 } };
        }
        return t;
      });

      nextState.players = nextState.players.map(p => {
        if (p.id === playerId) {
          return { ...p, cooldowns: { ...p.cooldowns, [charId]: 5 } }; // CD = 5
        }
        return p;
      });

      events.push({
        type: 'ABILITY_USE',
        playerId,
        abilityId: charId,
        message: `🔥 ${player.name} 發動個性「烈焰排名戰」，使名下最高級據點 ${config.name} (Level ${highestTile.level}) 的下次支援費乘 1.5 倍！`
      });
      break;
    }

    case 'lin_mansion': {
      // 切島銳兒郎：3 個自己的回合內支付支援費 -20%
      nextState.players = nextState.players.map(p => {
        if (p.id === playerId) {
          return {
            ...p,
            statusEffects: [...p.statusEffects, { name: '硬化防守', duration: 3, kind: 'rentPayDefenceDiscount', value: 0.20 }],
            cooldowns: { ...p.cooldowns, [charId]: 4 } // CD = 4
          };
        }
        return p;
      });

      events.push({
        type: 'ABILITY_USE',
        playerId,
        abilityId: charId,
        message: `🛡️ ${player.name} 發動個性「硬化防守」，在接下來 3 個自己的回合內，支付支援費降低 20%。`
      });
      break;
    }

    default:
      return { state, events: [], error: '未知的角色個性 ID' };
  }

  return {
    state: nextState,
    events
  };
}

// 輔助函式：取得能力名稱
function getAbilityName(charId: string): string {
  const names: Record<string, string> = {
    bill_rice: '全覆蓋衝刺',
    musk_bite: '互聯爆發',
    jay_turn: '道具創造',
    jolin_zero: '零重漂浮',
    gou_lift: '爆破施工',
    huang_smoke: '冰封戰線',
    jobs_think: '烈焰排名戰',
    lin_mansion: '硬化防守'
  };
  return names[charId] || '未知個性';
}
