import type { GameState, DomainEvent } from '../types';
import { getTileConfig } from './selectors';
import { transferCash } from './economy';
import { CARDS } from '../../data/cards';
import { SeedableRNG } from './rng';
import { GRAPH_CONNECTIONS } from './reducer';

// 取得圖路徑中指定距離內的所有節點 (BFS 輔助)
export function getNodesWithinRange(start: number, maxDistance: number, graph: Record<number, number[]> = GRAPH_CONNECTIONS): number[] {
  const visited = new Set<number>([start]);
  const queue: [number, number][] = [[start, 0]];
  const result: number[] = [];

  while (queue.length > 0) {
    const [current, dist] = queue.shift()!;
    if (dist > 0 && dist <= maxDistance) {
      result.push(current);
    }
    if (dist < maxDistance) {
      const neighbors = graph[current] || [];
      neighbors.forEach(n => {
        if (!visited.has(n)) {
          visited.add(n);
          queue.push([n, dist + 1]);
        }
      });
    }
  }
  return result;
}

// 檢查卡片使用時機
export function validateCardTiming(phase: string, cardId: string): boolean {
  const card = CARDS.find(c => c.id === cardId);
  if (!card) return false;
  
  if (card.timing === '擲骰前') {
    return phase === 'preRoll';
  }
  if (card.timing === '行動階段') {
    return phase === 'action';
  }
  // '任意' 時機在 preRoll 或 action 階段皆可使用
  return phase === 'preRoll' || phase === 'action';
}

// 執行大富翁4卡片效果的純函數
export function applyCardEffect(
  state: GameState,
  playerId: string,
  cardId: string,
  payload?: any
): { state: GameState; events: DomainEvent[]; error?: string } {
  let events: DomainEvent[] = [];
  let nextState = { ...state };

  const player = nextState.players.find(p => p.id === playerId);
  if (!player) return { state, events, error: '找不到該玩家' };

  // 1. 驗證玩家手牌中是否有此卡
  const cardIndex = player.cards.indexOf(cardId);
  if (cardIndex === -1) {
    return { state, events, error: `玩家手牌中無此卡片: ${cardId}` };
  }

  // 2. 驗證使用時機
  if (!validateCardTiming(nextState.phase, cardId)) {
    return { state, events, error: '目前階段無法使用此卡片' };
  }

  // 檢查是否卡片被抹消封印
  if (player.statusEffects.some(e => e.kind === 'cardsSealed')) {
    return { state, events, error: '你的卡牌使用目前正處於「被抹消封印」狀態，無法使用！' };
  }


  // 3. 根據卡片 ID 執行不同效果
  switch (cardId) {
    // ================= 遙控骰子 =================
    case 'remote_dice': {
      const diceVal = Number(payload?.diceValue);
      if (!diceVal || diceVal < 1 || diceVal > 6) {
        return { state, events, error: '指定骰子點數必須在 1 到 6 之間' };
      }
      
      nextState.players = nextState.players.map(p => {
        if (p.id === playerId) {
          return {
            ...p,
            statusEffects: [...p.statusEffects, { name: `指定骰子: ${diceVal}`, duration: 1, kind: 'nextDice', value: diceVal }]
          };
        }
        return p;
      });
      events.push({
        type: 'CARD_USE',
        playerId,
        cardId,
        message: `${player.name} 使用「遙控骰子」，指定下一次擲骰點數為 ${diceVal} 點。`
      });
      break;
    }

    // ================= 烏龜卡 =================
    case 'turtle_card': {
      const targetPlayerId = payload?.targetPlayerId;
      if (!targetPlayerId) {
        return { state, events, error: '未指定目標玩家' };
      }
      const target = nextState.players.find(p => p.id === targetPlayerId);
      if (!target || target.isBankrupt) {
        return { state, events, error: '目標玩家不存在或已破產' };
      }

      nextState.players = nextState.players.map(p => {
        if (p.id === targetPlayerId) {
          return {
            ...p,
            statusEffects: [...p.statusEffects, { name: '烏龜狀態', duration: 3, kind: 'turtleLimit', value: 1 }]
          };
        }
        return p;
      });
      events.push({
        type: 'CARD_USE',
        playerId,
        cardId,
        message: `${player.name} 對 ${target.name} 使用「烏龜卡」，使其在接下來 3 回合內每次擲骰移動只能前進 1 格。`
      });
      break;
    }

    // ================= 路障 =================
    case 'roadblock': {
      const targetTileId = payload?.targetTileId;
      if (targetTileId === undefined) {
        return { state, events, error: '未指定路障放置位置' };
      }
      const validTiles = getNodesWithinRange(player.position, 8, GRAPH_CONNECTIONS);
      if (!validTiles.includes(targetTileId)) {
        return { state, events, error: '路障必須放置在周圍 8 格範圍內的據點' };
      }

      nextState.tiles = nextState.tiles.map(t => {
        if (t.id === targetTileId) {
          return { ...t, statuses: { ...t.statuses, hasRoadblock: true } };
        }
        return t;
      });
      events.push({
        type: 'CARD_USE',
        playerId,
        cardId,
        tileId: targetTileId,
        message: `${player.name} 使用「路障」，在【${getTileConfig(targetTileId).name}】放置了阻擋路障。`
      });
      break;
    }

    // ================= 停留卡 =================
    case 'stay_card': {
      nextState.players = nextState.players.map(p => {
        if (p.id === playerId) {
          return {
            ...p,
            statusEffects: [...p.statusEffects, { name: '原地停留', duration: 1, kind: 'stayDeploy', value: 1 }]
          };
        }
        return p;
      });
      events.push({
        type: 'CARD_USE',
        playerId,
        cardId,
        message: `${player.name} 使用「停留卡」，本回合不進行骰子移動，原地再次觸發所在格。`
      });
      break;
    }

    // ================= 免稅卡 =================
    case 'rent_free': {
      nextState.players = nextState.players.map(p => {
        if (p.id === playerId) {
          // 免稅卡：減免 rentPayDiscount 100%
          return {
            ...p,
            statusEffects: [...p.statusEffects, { name: '免租狀態', duration: 99, kind: 'rentPayDiscount', value: 1.0 }]
          };
        }
        return p;
      });
      events.push({
        type: 'CARD_USE',
        playerId,
        cardId,
        message: `${player.name} 使用「免稅卡」，下次抵達他人據點時將可完全免除過路租金。`
      });
      break;
    }

    // ================= 漲價卡 =================
    case 'rent_boost': {
      const targetTileId = payload?.targetTileId;
      if (targetTileId === undefined) {
        return { state, events, error: '未指定目標土地' };
      }
      const tile = nextState.tiles.find(t => t.id === targetTileId);
      if (!tile || tile.ownerId !== playerId || getTileConfig(targetTileId).type !== 'land') {
        return { state, events, error: '必須指定自己名下的據點' };
      }
      
      nextState.tiles = nextState.tiles.map(t => {
        if (t.id === targetTileId) {
          return { ...t, statuses: { ...t.statuses, rentBoostOnce: 2.0 } }; // 2.0 倍漲價
        }
        return t;
      });
      events.push({
        type: 'CARD_USE',
        playerId,
        cardId,
        tileId: targetTileId,
        message: `${player.name} 對據點 ${getTileConfig(targetTileId).name} 使用「漲價卡」，下一次收租支援費加倍 (×2.0)。`
      });
      break;
    }

    // ================= 拆除卡 =================
    case 'demolish': {
      const targetTileId = payload?.targetTileId;
      if (targetTileId === undefined) {
        return { state, events, error: '未指定目標據點' };
      }
      const tile = nextState.tiles.find(t => t.id === targetTileId);
      const config = getTileConfig(targetTileId);
      if (!tile || !tile.ownerId || tile.ownerId === playerId || config.type !== 'land') {
        return { state, events, error: '必須指定對手名下的地產據點' };
      }

      const owner = nextState.players.find(p => p.id === tile.ownerId)!;

      nextState.tiles = nextState.tiles.map(t => {
        if (t.id === targetTileId) {
          if (t.statuses.guardRounds > 0) {
            events.push({
              type: 'CARD_USE_DEFENDED',
              playerId,
              tileId: targetTileId,
              message: `🛡️ ${owner.name} 的據點 ${config.name} 啟動防護罩，完全抵消了 ${player.name} 的「拆除卡」！`
            });
            nextState.stats.defenseSuccess += 1;
            return { ...t, statuses: { ...t.statuses, guardRounds: 0 } };
          } else {
            if (t.level > 0) {
              const prevLevel = t.level;
              events.push({
                type: 'CARD_USE_DEMOLISH',
                playerId,
                tileId: targetTileId,
                message: `💥 ${player.name} 使用「拆除卡」，強行將 ${owner.name} 的據點 ${config.name} 自 L${prevLevel} 拆除降級為 L${prevLevel - 1}。`
              });
              nextState.stats.damageUses += 1;
              return { ...t, level: (t.level - 1) as any };
            } else {
              events.push({
                type: 'CARD_USE_DISABLE',
                playerId,
                tileId: targetTileId,
                message: `📴 ${player.name} 使用「拆除卡」，使 ${owner.name} 的空據點 ${config.name} 陷入停擺一次（下次抵達免租金）。`
              });
              nextState.stats.damageUses += 1;
              return { ...t, statuses: { ...t.statuses, rentDisabledOnce: true } };
            }
          }
        }
        return t;
      });
      break;
    }

    // ================= 查稅卡 =================
    case 'tax_check': {
      const targetPlayerId = payload?.targetPlayerId;
      if (!targetPlayerId || targetPlayerId === playerId) {
        return { state, events, error: '必須指定其他生存的競爭特工' };
      }
      const target = nextState.players.find(p => p.id === targetPlayerId);
      if (!target || target.isBankrupt) {
        return { state, events, error: '目標對手已出局或不存在' };
      }

      const taxAmount = Math.min(5000, Math.round(target.cash * 0.08)); // 收取 8%
      if (taxAmount > 0) {
        const result = transferCash(nextState, targetPlayerId, playerId, taxAmount, `查稅卡扣繳（來自 ${player.name}）`);
        nextState = result.state;
        events = [...events, ...result.events];
      } else {
        events.push({
          type: 'CARD_USE',
          playerId,
          cardId,
          message: `${player.name} 對 ${target.name} 使用「查稅卡」，但目標特工身無分文，查稅無果。`
        });
      }
      break;
    }

    // ================= 防護罩卡 =================
    case 'site_guard': {
      const targetTileId = payload?.targetTileId;
      if (targetTileId === undefined) {
        return { state, events, error: '未指定目標土地' };
      }
      const tile = nextState.tiles.find(t => t.id === targetTileId);
      if (!tile || tile.ownerId !== playerId || getTileConfig(targetTileId).type !== 'land') {
        return { state, events, error: '必須指定自己名下的據點' };
      }

      nextState.tiles = nextState.tiles.map(t => {
        if (t.id === targetTileId) {
          nextState.stats.defenseUses += 1;
          return { ...t, statuses: { ...t.statuses, guardRounds: 3 } };
        }
        return t;
      });
      events.push({
        type: 'CARD_USE',
        playerId,
        cardId,
        tileId: targetTileId,
        message: `${player.name} 使用「防護罩卡」，為己方據點 ${getTileConfig(targetTileId).name} 籠罩防護屏障，可抵禦 3 回合破壞。`
      });
      break;
    }

    // ================= 工程車卡 =================
    case 'support_repair': {
      const targetTileId = payload?.targetTileId;
      if (targetTileId === undefined) {
        return { state, events, error: '未指定目標土地' };
      }
      const tile = nextState.tiles.find(t => t.id === targetTileId);
      if (!tile) {
        return { state, events, error: '目標格子不存在' };
      }

      nextState.tiles = nextState.tiles.map(t => {
        if (t.id === targetTileId) {
          return {
            ...t,
            statuses: {
              ...t.statuses,
              disruptedRounds: 0,
              rentDisabledOnce: false,
              hasRoadblock: false // 額外清除路障
            }
          };
        }
        return t;
      });
      events.push({
        type: 'CARD_USE',
        playerId,
        cardId,
        tileId: targetTileId,
        message: `${player.name} 派送「工程車卡」，清除【${getTileConfig(targetTileId).name}】上的路障阻礙與干擾擺爛狀態。`
      });
      break;
    }

    // ================= 購地卡 =================
    case 'provisional_license': {
      nextState.players = nextState.players.map(p => {
        if (p.id === playerId) {
          return {
            ...p,
            landActionUsed: false,
            provisionalLicenseUsed: true
          };
        }
        return p;
      });

      events.push({
        type: 'CARD_USE',
        playerId,
        cardId,
        message: `${player.name} 使用「購地卡」，本回合地產買賣擴建權重置，可再次進行一次地產操作！`
      });
      break;
    }

    // ================= 人壽保險卡 =================
    case 'crisis_pr': {
      nextState.players = nextState.players.map(p => {
        if (p.id === playerId) {
          return {
            ...p,
            statusEffects: [...p.statusEffects, { name: '人壽保險', duration: 99, kind: 'cancelNegativeFateCount', value: 1 }]
          };
        }
        return p;
      });
      events.push({
        type: 'CARD_USE',
        playerId,
        cardId,
        message: `${player.name} 使用「人壽保險卡」，自動掛載一次突發負面事件扣款抵扣額。`
      });
      break;
    }

    // ================= 均富卡 =================
    case 'first_aid': {
      const alivePlayers = nextState.players.filter(p => !p.isBankrupt);
      const totalCash = alivePlayers.reduce((sum, p) => sum + p.cash, 0);
      const splitCash = Math.round(totalCash / alivePlayers.length);

      nextState.players = nextState.players.map(p => {
        if (!p.isBankrupt) {
          return { ...p, cash: splitCash };
        }
        return p;
      });

      events.push({
        type: 'CARD_USE',
        playerId,
        cardId,
        message: `🕊️ ${player.name} 震撼啟動「均富卡」！所有在場特工財產重新公有分配，每人均分現金 $${splitCash.toLocaleString("zh-Hant-TW")}！`
      });
      break;
    }

    // ================= 機車卡 =================
    case 'motorcycle_card': {
      nextState.players = nextState.players.map(p => {
        if (p.id === playerId) {
          return {
            ...p,
            statusEffects: [...p.statusEffects, { name: '機車狀態', duration: 3, kind: 'motorcycleLimit', value: 2 }]
          };
        }
        return p;
      });
      events.push({
        type: 'CARD_USE',
        playerId,
        cardId,
        message: `${player.name} 使用「機車卡」，跨上機車，接下來 3 回合內每次移動可投擲 2 顆骰子！`
      });
      break;
    }

    default:
      return { state, events, error: '未知的卡片 ID' };
  }

  // 4. 卡片使用成功，從手牌中扣除該卡片
  nextState.players = nextState.players.map(p => {
    if (p.id === playerId) {
      const isLucky = p.characterId === 'kyoka_jiro' && Math.random() < 0.20;
      if (isLucky) {
        events.push({
          type: 'CARD_USE',
          playerId,
          cardId,
          message: `🎧 耳郎響香啟動被動「耳機插孔」！音爆回響下，本次卡片「${CARDS.find(c => c.id === cardId)?.name || cardId}」使用未被消耗！`
        });
        return p;
      }
      const remainingCards = [...p.cards];
      remainingCards.splice(cardIndex, 1);
      return { ...p, cards: remainingCards };
    }
    return p;
  });

  // 增加統計數據
  nextState.stats.cardUses += 1;

  return {
    state: nextState,
    events
  };
}

// 抽卡輔助函數
export function drawCard(
  state: GameState,
  playerId: string,
  count: number,
  reason: string
): { state: GameState; events: DomainEvent[] } {
  let events: DomainEvent[] = [];
  let nextState = { ...state };
  
  const player = nextState.players.find(p => p.id === playerId);
  if (!player || player.isBankrupt) return { state, events };

  // 八百萬百被動：20% 機率多抽一張
  let actualCount = count;
  if (player.characterId === 'momo_yaoyorozu') {
    const rng = new SeedableRNG(nextState.rngState || 'default');
    const isLucky = rng.range(1, 100) <= 20;
    nextState.rngState = rng.getStateString();
    if (isLucky) {
      actualCount += 1;
      events.push({
        type: 'ABILITY_PASSIVE',
        playerId,
        message: `🛠️ ${player.name} 發動八百萬百被動個性「創造」，多抽 1 張支援裝備！`
      });
    }
  }

  const rng = new SeedableRNG(nextState.rngState || 'default');
  const maxHandSize = 5;

  nextState.players = nextState.players.map(p => {
    if (p.id === playerId) {
      const cards = [...p.cards];
      for (let i = 0; i < actualCount; i++) {
        const card = CARDS[rng.range(0, CARDS.length - 1)];
        if (cards.length >= maxHandSize) {
          events.push({
            type: 'CARD_DISCARDED',
            playerId,
            cardId: card.id,
            message: `🗂️ ${p.name} 在「${reason}」抽到「${card.name}」，但手牌已滿 (${maxHandSize}張)，遺憾丟棄。`
          });
        } else {
          cards.push(card.id);
          events.push({
            type: 'CARD_DRAWN',
            playerId,
            cardId: card.id,
            message: `🗂️ ${p.name} 在「${reason}」獲得支援裝備「${card.name}」。`
          });
        }
      }
      return { ...p, cards };
    }
    return p;
  });

  nextState.rngState = rng.getStateString();
  return {
    state: nextState,
    events
  };
}
