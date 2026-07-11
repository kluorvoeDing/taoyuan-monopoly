import type { GameState, TileState, GameCommand } from '../types';
import { 
  getTileConfig, 
  calculatePurchasePrice, 
  calculateUpgradeCost, 
  getZoneProgress,
  getZoneTiles,
  calculateRent
} from './selectors';
import { scoreTileForPlayer } from './economy';
import { SeedableRNG } from './rng';
import { getNodesWithinRange } from './cards';
import { GRAPH_CONNECTIONS } from './reducer';

// 判斷某土地是否為威脅玩家完成整套的「阻擋點」
export function isBlockingTile(state: GameState, aiPlayerId: string, tileId: number): boolean {
  const tileState = state.tiles.find(t => t.id === tileId);
  const config = getTileConfig(tileId);
  
  if (!tileState || config.type !== 'land' || !config.zone || tileState.ownerId) {
    return false;
  }

  // 檢查是否有對手在該區擁有 (總數 - 1) 的土地（即只差這一塊就完成整區）
  return state.players
    .filter(p => p.id !== aiPlayerId && !p.isBankrupt)
    .some(p => {
      const progress = getZoneProgress(state, p.id, config.zone!);
      return progress.total > 0 && progress.owned === progress.total - 1;
    });
}

// AI 專用的土地評估分數（加入阻擋分）
export function scoreTileForAI(state: GameState, aiPlayerId: string, tileId: number): number {
  let score = scoreTileForPlayer(state, aiPlayerId, tileId);
  if (isBlockingTile(state, aiPlayerId, tileId)) {
    score += 80; // 阻擋點額外 +80 分
  }
  return score;
}

// 找出 AI 擁有的最高策略價值據點
export function findBestOwnedTile(state: GameState, playerId: string): TileState | null {
  const owned = state.tiles.filter(t => t.ownerId === playerId);
  if (owned.length === 0) return null;

  return owned.sort((a, b) => {
    return scoreTileForAI(state, playerId, b.id) - scoreTileForAI(state, playerId, a.id);
  })[0];
}

// 找出敵方威脅最大（或價值最高）的據點
export function findBestEnemyTile(state: GameState, aiPlayerId: string, options: { needLevel?: boolean } = {}): TileState | null {
  let candidates = state.tiles.filter(t => t.ownerId && t.ownerId !== aiPlayerId);
  if (options.needLevel) {
    candidates = candidates.filter(t => t.level > 0);
  }

  if (candidates.length === 0) return null;

  return candidates.sort((a, b) => {
    const ownerA = state.players.find(p => p.id === a.ownerId)!;
    const ownerB = state.players.find(p => p.id === b.ownerId)!;
    
    const configA = getTileConfig(a.id);
    const configB = getTileConfig(b.id);

    // 檢查對方是否只差一格成套
    const threatA = getZoneProgress(state, ownerA.id, configA.zone!).owned >= getZoneTiles(configA.zone!).length - 1 ? 120 : 0;
    const threatB = getZoneProgress(state, ownerB.id, configB.zone!).owned >= getZoneTiles(configB.zone!).length - 1 ? 120 : 0;

    const scoreA = scoreTileForAI(state, ownerA.id, a.id) + threatA;
    const scoreB = scoreTileForAI(state, ownerB.id, b.id) + threatB;

    return scoreB - scoreA; // 降序排序，取最大值
  })[0];
}

// ================= AI 決策主邏輯 =================

// 1. AI 擲骰前決策 (是否使用指定步數卡片)
export function makeAiPreRollDecision(state: GameState, playerId: string): GameCommand | null {
  const player = state.players.find(p => p.id === playerId);
  if (!player || player.isBankrupt || player.control !== 'ai') return null;

  const currentPos = player.position;

  // 評估前方 1~6 格的落點評分
  const targetsAhead: { step: number; tileId: number; score: number }[] = [];
  for (let step = 1; step <= 6; step++) {
    const nextId = (currentPos + step) % state.tiles.length;
    const config = getTileConfig(nextId);
    
    if (config.type === 'land') {
      const tileState = state.tiles.find(t => t.id === nextId)!;
      // 如果是無主地、自己地、或是對手的阻擋點，才列入考慮
      if (!tileState.ownerId || tileState.ownerId === playerId || isBlockingTile(state, playerId, nextId)) {
        targetsAhead.push({
          step,
          tileId: nextId,
          score: scoreTileForAI(state, playerId, nextId)
        });
      }
    }
  }

  // 排序得出最佳落點
  targetsAhead.sort((a, b) => b.score - a.score);
  const best = targetsAhead[0];

  if (best && best.score >= 50) {
    // 最佳落點在 1~6 步，且有遙控骰子卡
    if (player.cards.includes('remote_dice')) {
      return { type: 'USE_CARD', playerId, cardId: 'remote_dice', payload: { diceValue: best.step } };
    }
  }

  // 機車卡：若有機車卡且未在騎乘狀態，30% 機率直接使用
  if (player.cards.includes('motorcycle_card') && !player.statusEffects.some(e => e.kind === 'motorcycleLimit')) {
    const rng = new SeedableRNG(state.rngState || 'default');
    if (rng.range(1, 10) <= 3) {
      return { type: 'USE_CARD', playerId, cardId: 'motorcycle_card' };
    }
  }

  return null;
}

// 2. AI 行動階段決策 (買地、擴建、技能、卡牌)
export function makeAiActionDecision(state: GameState, playerId: string): GameCommand[] {
  const commands: GameCommand[] = [];
  const player = state.players.find(p => p.id === playerId);
  if (!player || player.isBankrupt || player.control !== 'ai') return commands;

  // 模擬決策過程中的臨時變量（因為指令是一起返回的，我們要估計現金流變動）
  let estimatedCash = player.cash;
  let handCards = [...player.cards];
  let landActionUsed = player.landActionUsed;
  let provisionalLicenseUsed = player.provisionalLicenseUsed;

  // 2.1 優先自我救急 (例如：均富卡、路障、烏龜卡)
  if (handCards.includes('first_aid')) {
    const alivePlayers = state.players.filter(p => !p.isBankrupt);
    const avgCash = alivePlayers.reduce((sum, p) => sum + p.cash, 0) / alivePlayers.length;
    // 如果 AI 現金低於均值很多，使用均富卡
    if (player.cash < avgCash * 0.8) {
      commands.push({ type: 'USE_CARD', playerId, cardId: 'first_aid' });
      handCards = handCards.filter(c => c !== 'first_aid');
      estimatedCash = avgCash; // 預計均分後的現金
    }
  }

  if (handCards.includes('turtle_card')) {
    // 尋找一個活著的對手施加烏龜狀態
    const opponent = state.players.find(p => p.id !== playerId && !p.isBankrupt);
    if (opponent) {
      commands.push({ type: 'USE_CARD', playerId, cardId: 'turtle_card', payload: { targetPlayerId: opponent.id } });
      handCards = handCards.filter(c => c !== 'turtle_card');
    }
  }

  if (handCards.includes('roadblock')) {
    // 在自己周圍 8 格範圍內，尋找是否有對手的高級地盤
    const inRange = getNodesWithinRange(player.position, 8, GRAPH_CONNECTIONS);
    const opponentLandInRange = state.tiles.filter(t => t.ownerId && t.ownerId !== playerId && inRange.includes(t.id));
    if (opponentLandInRange.length > 0) {
      const targetTileId = opponentLandInRange[0].id;
      commands.push({ type: 'USE_CARD', playerId, cardId: 'roadblock', payload: { targetTileId } });
      handCards = handCards.filter(c => c !== 'roadblock');
    }
  }

  // 2.2 使用擴建折扣卡
  if (handCards.includes('support_item')) {
    // 如果當前格子是自己的據點且能擴建，使用裝備卡折價
    const tileState = state.tiles.find(t => t.id === player.position)!;
    if (tileState.ownerId === playerId && tileState.level < 4) {
      commands.push({ type: 'USE_CARD', playerId, cardId: 'support_item' });
      handCards = handCards.filter(c => c !== 'support_item');
    }
  }

  // 2.3 主動干擾與防禦卡牌決策
  // 防禦卡：site_guard (自己最高分據點若未被防守，進行防守)
  if (handCards.includes('site_guard')) {
    const bestOwn = findBestOwnedTile(state, playerId);
    if (bestOwn && bestOwn.statuses.guardRounds <= 0 && scoreTileForAI(state, playerId, bestOwn.id) > 70) {
      commands.push({ type: 'USE_CARD', playerId, cardId: 'site_guard', payload: { targetTileId: bestOwn.id } });
      handCards = handCards.filter(c => c !== 'site_guard');
    }
  }

  // 攻擊卡：demolish (對手即將成套或高等級據點進行拆除)
  if (handCards.includes('demolish')) {
    const targetEnemy = findBestEnemyTile(state, playerId);
    if (targetEnemy) {
      const owner = state.players.find(p => p.id === targetEnemy.ownerId)!;
      const config = getTileConfig(targetEnemy.id);
      const isThreat = getZoneProgress(state, owner.id, config.zone!).owned >= getZoneTiles(config.zone!).length - 1;
      
      if (isThreat || targetEnemy.level >= 2) {
        commands.push({ type: 'USE_CARD', playerId, cardId: 'demolish', payload: { targetTileId: targetEnemy.id } });
        handCards = handCards.filter(c => c !== 'demolish');
      }
    }
  }

  // 攻擊卡：media_storm (對手據點輿論干擾)
  if (handCards.includes('media_storm')) {
    const targetEnemy = findBestEnemyTile(state, playerId, { needLevel: true });
    if (targetEnemy && targetEnemy.statuses.disruptedRounds <= 0) {
      commands.push({ type: 'USE_CARD', playerId, cardId: 'media_storm', payload: { targetTileId: targetEnemy.id } });
      handCards = handCards.filter(c => c !== 'media_storm');
    }
  }

  // 維修卡：support_repair (自己當前踩著的格子或自己被干擾/停擺的據點進行維修)
  if (handCards.includes('support_repair')) {
    // 尋找自己名下被干擾或停擺的據點
    const brokenTile = state.tiles.find(t => t.ownerId === playerId && (t.statuses.disruptedRounds > 0 || t.statuses.rentDisabledOnce));
    if (brokenTile) {
      commands.push({ type: 'USE_CARD', playerId, cardId: 'support_repair', payload: { targetTileId: brokenTile.id } });
      handCards = handCards.filter(c => c !== 'support_repair');
    }
  }

  // 2.4 角色個性主動能力決策
  // 八百萬百主動創造裝備：CD 為 0 且手牌不滿、資金高於 7000
  const charCD = player.cooldowns[player.characterId] || 0;
  if (charCD === 0 && player.characterId === 'jay_turn' && estimatedCash > 7000 && handCards.length < 5) {
    commands.push({ type: 'USE_ABILITY', playerId });
    estimatedCash -= 600;
  }

  // 麗日御茶子主動零重力：CD 為 0，隨時可用
  if (charCD === 0 && player.characterId === 'jolin_zero') {
    commands.push({ type: 'USE_ABILITY', playerId });
  }

  // 切島銳兒郎主動硬化防禦：CD 為 0，隨時可用
  if (charCD === 0 && player.characterId === 'lin_mansion') {
    commands.push({ type: 'USE_ABILITY', playerId });
  }

  // 奮進人主動烈焰排名戰：CD 為 0，名下至少有據點
  if (charCD === 0 && player.characterId === 'jobs_think') {
    const owned = state.tiles.filter(t => t.ownerId === playerId);
    if (owned.length > 0) {
      commands.push({ type: 'USE_ABILITY', playerId });
    }
  }

  // 2.5 當前地圖格交互 (進駐與擴建)
  const currentTileState = state.tiles.find(t => t.id === player.position)!;
  const currentConfig = getTileConfig(player.position);

  if (currentConfig.type === 'land') {
    // A. 進駐無主土地
    if (!currentTileState.ownerId) {
      const price = calculatePurchasePrice(state, player, player.position);
      const score = scoreTileForAI(state, playerId, player.position);
      const blocksOpponent = isBlockingTile(state, playerId, player.position);
      
      // 保留款門檻：阻擋點保留 1200，高價值保留 2500，普通保留 4500
      const reserve = blocksOpponent ? 1200 : (score > 100 ? 2500 : 4500);
      
      if (estimatedCash > price + reserve) {
        commands.push({ type: 'BUY_CURRENT_TILE', playerId });
        estimatedCash -= price;
        landActionUsed = true;
      }
    }

    // B. 擴建己方土地
    if (currentTileState.ownerId === playerId && currentTileState.level < 4 && !landActionUsed) {
      const cost = calculateUpgradeCost(state, playerId, player.position);
      const score = scoreTileForAI(state, playerId, player.position);
      
      // 高策略價值據點保留 2500，其餘保留 5500
      const reserve = score > 120 ? 2500 : 5500;
      
      if (estimatedCash > cost + reserve) {
        // 如果有爆豪主動個性且冷卻完畢，配合擴建使用
        if (charCD === 0 && player.characterId === 'gou_lift') {
          commands.push({ type: 'USE_ABILITY', playerId }); // 先開個性「爆破施工」
          commands.push({ type: 'UPGRADE_CURRENT_TILE', playerId }); // 再升級 (連升 2 級)
          estimatedCash -= Math.round(cost * 1.45);
        } else {
          commands.push({ type: 'UPGRADE_CURRENT_TILE', playerId });
          estimatedCash -= cost;
        }
        landActionUsed = true;
      }
    }
  }

  // 2.6 使用臨時執照再行動一次
  if (landActionUsed && handCards.includes('provisional_license') && !provisionalLicenseUsed) {
    // 檢查當前格子是否是自己的土地且未滿級，如果是，用臨時執照重置後再度擴建
    if (currentTileState.ownerId === playerId && currentTileState.level < 4) {
      const cost = calculateUpgradeCost(state, playerId, player.position);
      const score = scoreTileForAI(state, playerId, player.position);
      const reserve = score > 120 ? 2500 : 5500;
      
      if (estimatedCash > cost + reserve) {
        commands.push({ type: 'USE_CARD', playerId, cardId: 'provisional_license' });
        commands.push({ type: 'UPGRADE_CURRENT_TILE', playerId });
        estimatedCash -= cost;
        provisionalLicenseUsed = true;
      }
    }
  }

  // AI 回合必定以 END_TURN 結尾
  commands.push({ type: 'END_TURN', playerId });

  return commands;
}

// 3. AI 路線選擇決策
export function makeAiPathDecision(state: GameState, playerId: string): GameCommand | null {
  const player = state.players.find(p => p.id === playerId);
  if (!player || player.isBankrupt || player.control !== 'ai' || !state.pathChoices || state.pathChoices.length === 0) {
    return null;
  }

  // 評估每個待選格子的策略價值
  const choices = state.pathChoices.map(tileId => {
    const config = getTileConfig(tileId);
    let score = scoreTileForAI(state, playerId, tileId);
    
    // 如果是他人土地，且需要付過路費，分數扣減
    const tileState = state.tiles.find(t => t.id === tileId)!;
    if (config.type === 'land' && tileState.ownerId && tileState.ownerId !== playerId) {
      const rentResult = calculateRent(state, tileId, playerId, tileState.ownerId);
      score -= rentResult.rent * 0.1;
    }
    
    // 起點、支援站、彩票格加分
    if (config.type === 'start') score += 50;
    if (config.type === 'card') score += 40;
    if (config.type === 'lottery') score += 30;

    return { tileId, score };
  });

  // 降序排序，取最高分
  choices.sort((a, b) => b.score - a.score);
  return {
    type: 'CHOOSE_MOVE_PATH',
    playerId,
    targetTileId: choices[0].tileId
  };
}
