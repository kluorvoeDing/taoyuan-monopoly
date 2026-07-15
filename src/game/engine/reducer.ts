import type { GameState, PlayerState, TileState, GameCommand, CommandResult, DomainEvent } from '../types';
import { SeedableRNG } from './rng';
import { 
  calculatePurchasePrice, 
  calculateUpgradeCost, 
  calculateRent, 
  calculateNetWorth, 
  getTileConfig, 
  getZoneProgress, 
  getPlayerEffectValue, 
  LEVEL_NAMES
} from './selectors';
import { giveCash, payCash, transferCash } from './economy';
import { applyCardEffect, drawCard } from './cards';
import { applyAbility } from './abilities';
import { triggerFate } from './events';
import { endTurn } from './turnMachine';
import { CHARACTERS } from '../../data/characters';
import { TILES } from '../../data/tiles';
import { RAIDS } from '../../data/raids';
import { DISTRICTS } from '../../data/districts';

const ENGINE_VERSION = '1.0.0';

export const GRAPH_CONNECTIONS: Record<number, number[]> = {
  0: [1],
  1: [2],
  2: [3],
  3: [4],
  4: [5],
  5: [9, 6],
  6: [5, 7],
  7: [6, 8],
  8: [7, 55],
  9: [10],
  10: [11],
  11: [12],
  12: [13],
  13: [14],
  14: [15],
  15: [16],
  16: [17],
  17: [18],
  18: [22, 23],
  19: [20, 54],
  20: [19, 21],
  21: [20, 23],
  22: [24],
  23: [21, 18],
  24: [25],
  25: [26],
  26: [27],
  27: [28],
  28: [29],
  29: [30],
  30: [31],
  31: [32, 34],
  32: [33],
  33: [37],
  34: [31, 35],
  35: [34, 36],
  36: [35, 53],
  37: [38],
  38: [39],
  39: [40],
  40: [41],
  41: [42],
  42: [43],
  43: [44],
  44: [45, 48],
  45: [46],
  46: [47],
  47: [51],
  48: [44, 49],
  49: [48, 50],
  50: [49, 52],
  51: [0],
  52: [50, 54],
  53: [36, 54],
  54: [55, 53, 52, 19],
  55: [8, 54]
};

export function getReachableDestinations(
  startId: number,
  steps: number,
  graph: Record<number, number[]> = GRAPH_CONNECTIONS
): number[] {
  interface QueueEntry {
    node: number;
    path: number[];
  }
  let queue: QueueEntry[] = [{ node: startId, path: [startId] }];
  
  for (let i = 0; i < steps; i++) {
    const nextQueue: QueueEntry[] = [];
    for (const { node, path } of queue) {
      const neighbors = graph[node] || [];
      for (const n of neighbors) {
        if (path.length >= 2 && n === path[path.length - 2]) {
          continue;
        }
        nextQueue.push({
          node: n,
          path: [...path, n]
        });
      }
    }
    queue = nextQueue;
  }
  
  const destinations = new Set<number>();
  for (const { node } of queue) {
    destinations.add(node);
  }
  return Array.from(destinations);
}

export function getValidNextDirections(
  position: number,
  lastPosition: number | undefined,
  graph: Record<number, number[]> = GRAPH_CONNECTIONS
): number[] {
  const neighbors = graph[position] || [];
  if (lastPosition === undefined) {
    return neighbors;
  }
  return neighbors.filter(n => n !== lastPosition);
}

export function simulatePath(
  startNode: number,
  lastPosition: number | undefined,
  steps: number,
  rng: any,
  nextHeadingNode?: number,
  graph: Record<number, number[]> = GRAPH_CONNECTIONS,
  tilesState?: TileState[],
  bypassRoadblock?: boolean
): { path: number[]; crossedStart: boolean } {
  const path: number[] = [startNode];
  let current = startNode;
  let prev = lastPosition;
  let crossedStart = false;

  for (let i = 0; i < steps; i++) {
    const neighbors = graph[current] || [];
    const validNeighbors = prev !== undefined ? neighbors.filter(n => n !== prev) : neighbors;

    if (validNeighbors.length === 0) {
      break;
    }

    let nextNode: number;
    if (i === 0 && nextHeadingNode !== undefined && validNeighbors.includes(nextHeadingNode)) {
      nextNode = nextHeadingNode;
    } else if (validNeighbors.length === 1) {
      nextNode = validNeighbors[0];
    } else {
      const idx = rng.range(0, validNeighbors.length - 1);
      nextNode = validNeighbors[idx];
    }

    if (nextNode === 0) {
      crossedStart = true;
    }

    path.push(nextNode);
    prev = current;
    current = nextNode;

    // 路障檢測：如果路經此格有路障，強迫在此格停下 (除非擁有蛙吹梅雨被動並成功觸發跳過)
    if (tilesState) {
      const tState = tilesState.find(t => t.id === nextNode);
      if (tState && tState.statuses.hasRoadblock) {
        if (!bypassRoadblock) {
          break;
        }
      }
    }
  }

  return { path, crossedStart };
}

export function pathCrossesStart(
  startId: number,
  destId: number,
  steps: number,
  graph: Record<number, number[]> = GRAPH_CONNECTIONS
): boolean {
  interface QueueEntry {
    node: number;
    path: number[];
  }
  let queue: QueueEntry[] = [{ node: startId, path: [startId] }];
  
  for (let i = 0; i < steps; i++) {
    const nextQueue: QueueEntry[] = [];
    for (const { node, path } of queue) {
      const neighbors = graph[node] || [];
      for (const n of neighbors) {
        if (path.length >= 2 && n === path[path.length - 2]) {
          continue;
        }
        nextQueue.push({
          node: n,
          path: [...path, n]
        });
      }
    }
    queue = nextQueue;
  }
  
  for (const { node, path } of queue) {
    if (node === destId) {
      if (path.slice(1).includes(0)) {
        return true;
      }
    }
  }
  return false;
}

// 初始化地圖格狀態
function createInitialTiles(): TileState[] {
  return TILES.map(tile => ({
    id: tile.id,
    level: 0,
    statuses: {
      guardRounds: 0,
      disruptedRounds: 0,
      rentDisabledOnce: false,
      rentBoostOnce: null
    }
  }));
}

// 建立初始隨機亂入點
function spawnInitialRaids(state: GameState, rng: SeedableRNG): GameState {
  if (!state.options.enableRaids) return state;
  let nextState = { ...state };
  
  const spawns = [...nextState.raidSpawns];
  while (spawns.length < 2) {
    const occupied = new Set(nextState.players.map(p => p.position));
    const existing = new Set(spawns.map(g => g.tileId));
    
    // 排除起點 (ID 0)、有玩家踩著的格子以及已有亂入的格子
    const candidates = nextState.tiles
      .filter(t => t.id !== 0 && !occupied.has(t.id) && !existing.has(t.id))
      .map(t => t.id);

    if (candidates.length === 0) break;

    const tileId = candidates[rng.range(0, candidates.length - 1)];
    const raid = RAIDS[rng.range(0, RAIDS.length - 1)];
    spawns.push({ tileId, raidId: raid.id });
  }

  return {
    ...nextState,
    raidSpawns: spawns
  };
}

// 補充亂入點的輔助函式 (踩中後補充)
export function ensureRaidSpawns(state: GameState, events: DomainEvent[]): GameState {
  if (!state.options.enableRaids) return state;
  let nextState = { ...state };
  const rng = new SeedableRNG(nextState.rngState || 'default');
  
  const spawns = [...nextState.raidSpawns];
  while (spawns.length < 2) {
    const occupied = new Set(nextState.players.filter(p => !p.isBankrupt).map(p => p.position));
    const existing = new Set(spawns.map(g => g.tileId));
    
    const candidates = nextState.tiles
      .filter(t => t.id !== 0 && !occupied.has(t.id) && !existing.has(t.id))
      .map(t => t.id);

    if (candidates.length === 0) break;

    const tileId = candidates[rng.range(0, candidates.length - 1)];
    const raid = RAIDS[rng.range(0, RAIDS.length - 1)];
    spawns.push({ tileId, raidId: raid.id });
    
    events.push({
      type: 'RAID_SPAWN',
      tileId,
      message: `⚡ 傳來異能波動！「${raid.name}」已降臨在地圖 ${getTileConfig(tileId).name}。`
    });
  }

  nextState.raidSpawns = spawns;
  nextState.rngState = rng.getStateString();
  return nextState;
}

// 💀 死柄木弔被動技能：進駐或升級據點後，相鄰對手據點有 15% 機率下降 1 級
function triggerShigarakiPassive(
  state: GameState,
  playerId: string,
  tileId: number,
  events: DomainEvent[]
): GameState {
  let nextState = { ...state };
  const player = nextState.players.find(p => p.id === playerId);
  if (!player || player.characterId !== 'shigaraki') return nextState;

  const neighbors = GRAPH_CONNECTIONS[tileId] || [];
  let rng = new SeedableRNG(nextState.rngState || 'default');

  nextState.tiles = nextState.tiles.map(t => {
    if (neighbors.includes(t.id) && t.ownerId && t.ownerId !== playerId && t.level > 1) {
      const isLucky = rng.range(1, 100) <= 15; // 15% 機率觸發
      if (isLucky) {
        const opponent = nextState.players.find(p => p.id === t.ownerId)!;
        const config = getTileConfig(t.id);
        const nextLevel = t.level - 1;
        events.push({
          type: 'TILE_STATUS_EXPIRED',
          tileId: t.id,
          message: `💀 死柄木弔啟動被動「崩壞」！相鄰對手 ${opponent.name} 的據點【${config.name}】結構瓦解，等級下降至 Level ${nextLevel}！`
        });
        return { ...t, level: nextLevel as any };
      }
    }
    return t;
  });

  nextState.rngState = rng.getStateString();
  return nextState;
}

// 核心 Reducer 進入點
export function gameReducer(state: GameState | null, command: GameCommand): CommandResult {
  let events: DomainEvent[] = [];

  // ================= 1. 處理 START_GAME =================
  if (command.type === 'START_GAME') {
    const seed = command.rngSeed || Math.random().toString(36).substring(2, 10);
    const rng = new SeedableRNG(seed);

    const { options, characterId } = command;
    const humanChar = CHARACTERS.find(c => c.id === characterId) || CHARACTERS[0];
    
    // 隨機選擇 AI 角色（不可與真人重複）
    const remainingChars = CHARACTERS.filter(c => c.id !== humanChar.id);
    const shuffledChars = rng.shuffle(remainingChars);
    const aiChars = shuffledChars.slice(0, options.aiCount);

    const players: PlayerState[] = [
      {
        id: 'p1',
        name: humanChar.name,
        characterId: humanChar.id,
        control: 'human',
        cash: options.startingCash,
        position: 0,
        cards: [],
        statusEffects: [],
        isBankrupt: false,
        cooldowns: { [humanChar.id]: 0 },
        landActionUsed: false,
        provisionalLicenseUsed: false
      },
      ...aiChars.map((char, index) => ({
        id: `p${index + 2}`,
        name: char.name,
        characterId: char.id,
        control: 'ai' as const,
        cash: options.startingCash,
        position: 0,
        cards: [],
        statusEffects: [],
        isBankrupt: false,
        cooldowns: { [char.id]: 0 },
        landActionUsed: false,
        provisionalLicenseUsed: false
      }))
    ];

    let initialState: GameState = {
      version: ENGINE_VERSION,
      mode: 'playing',
      round: 1,
      maxRounds: options.maxRounds,
      activePlayerId: 'p1',
      phase: 'preRoll',
      options,
      players,
      tiles: createInitialTiles(),
      globalEffects: [],
      raidSpawns: [],
      lotteryPool: 0,
      eventLog: [],
      stats: {
        cardUses: 0,
        routeUses: 0,
        defenseUses: 0,
        defenseSuccess: 0,
        damageUses: 0,
        completedSets: 0
      },
      rngState: rng.getStateString(),
      priceIndex: 1.0
    };

    // 補充亂入點
    initialState = spawnInitialRaids(initialState, rng);

    events.push({
      type: 'GAME_STARTED',
      message: `🎮 桃園 Hero City 網頁版大富翁開始！起始支援預算 ${options.startingCash.toLocaleString("zh-Hant-TW")}｜總局數限制 ${options.maxRounds} 回合。`
    });

    return {
      state: initialState,
      events
    };
  }

  // 若尚未初始化，無法執行其他命令
  if (!state) {
    return {
      state: null as any,
      events,
      error: '遊戲尚未開始，請先發送 START_GAME 命令'
    };
  }

  let nextState = { ...state };

  // ================= 2. 處理 FORCE_STATE (載入存檔) =================
  if (command.type === 'FORCE_STATE') {
    events.push({
      type: 'STATE_RESTORED',
      message: '⚙️ 已載入舊存檔，遊戲狀態已成功同步。'
    });
    return {
      state: command.state,
      events
    };
  }

  // ================= 3. 處理 SELECT_TILE =================
  if (command.type === 'SELECT_TILE') {
    nextState.selectedTileId = command.tileId;
    return {
      state: nextState,
      events
    };
  }

  // 驗證發動命令的玩家是否為當前行動者 (買地擴建、擲骰等必須是當前玩家)
  if ('playerId' in command && command.playerId !== state.activePlayerId) {
    return {
      state,
      events,
      error: `現在是 ${state.players.find(p => p.id === state.activePlayerId)?.characterId} 的回合，非指定玩家的行動時間。`
    };
  }

  const activePlayer = nextState.players.find(p => p.id === state.activePlayerId)!;

  // ================= 4. 處理 ROLL_DICE =================
  if (command.type === 'ROLL_DICE') {
    if (nextState.phase !== 'preRoll') {
      return { state, events, error: '目前不處於擲骰前階段' };
    }

    const rng = new SeedableRNG(nextState.rngState || 'default');
    let dice = 0;

    // 檢查是否有指定骰子效果 (remote_dice / 遙控骰子)
    const nextDiceEffect = activePlayer.statusEffects.find(e => e.kind === 'nextDice');
    const hasTurtle = activePlayer.statusEffects.find(e => e.kind === 'turtleLimit');
    const hasMotorcycle = activePlayer.statusEffects.find(e => e.kind === 'motorcycleLimit');

    if (nextDiceEffect) {
      dice = nextDiceEffect.value;
      nextState.players = nextState.players.map(p => {
        if (p.id === activePlayer.id) {
          return {
            ...p,
            statusEffects: p.statusEffects.filter(e => e !== nextDiceEffect)
          };
        }
        return p;
      });
      events.push({
        type: 'DICE_ROLLED_FIXED',
        playerId: activePlayer.id,
        message: `🎯 ${activePlayer.name} 使用遙控骰子，指定移動 ${dice} 點。`
      });
    } else if (hasTurtle) {
      dice = 1;
      events.push({
        type: 'DICE_ROLLED',
        playerId: activePlayer.id,
        message: `🐢 ${activePlayer.name} 受到烏龜狀態影響，本回合只能前進 1 格。`
      });
    } else if (hasMotorcycle) {
      const d1 = rng.range(1, 6);
      const d2 = rng.range(1, 6);
      dice = d1 + d2;
      events.push({
        type: 'DICE_ROLLED',
        playerId: activePlayer.id,
        message: `🏍️ ${activePlayer.name} 騎乘機車投擲雙骰：${d1} + ${d2} = ${dice} 點。`
      });
    } else {
      // 隨機擲骰，需檢查骰子限制 (低速限定 1~3, 高速限定 4~6, 相澤老師/演習限制上限 3)
      let min = 1;
      let max = 6;

      // 檢查低速巡邏 (限定 1-3)
      const lowSpeed = activePlayer.statusEffects.find(e => e.kind === 'diceLimitRange');
      if (lowSpeed) {
        max = lowSpeed.value; // 3
        // 移除該一次性效果
        nextState.players = nextState.players.map(p => {
          if (p.id === activePlayer.id) {
            return { ...p, statusEffects: p.statusEffects.filter(e => e !== lowSpeed) };
          }
          return p;
        });
      }

      // 檢查高速支援 (限定 4-6)
      const highSpeed = activePlayer.statusEffects.find(e => e.kind === 'diceLimitRangeMin');
      if (highSpeed) {
        min = highSpeed.value; // 4
        // 移除該一次性效果
        nextState.players = nextState.players.map(p => {
          if (p.id === activePlayer.id) {
            return { ...p, statusEffects: p.statusEffects.filter(e => e !== highSpeed) };
          }
          return p;
        });
      }

      // 檢查個人/全域點數上限 (如相澤老師巡場上限 3, 演習上限 3)
      const personalLimit = getPlayerEffectValue(activePlayer, 'diceLimit');
      const globalLimit = nextState.globalEffects.find(e => e.kind === 'diceLimitAll')?.value || 0;
      
      const limit = personalLimit > 0 ? personalLimit : (globalLimit > 0 ? globalLimit : 0);
      if (limit > 0 && max > limit) {
        max = limit;
      }

      dice = rng.range(min, max);
      events.push({
        type: 'DICE_ROLLED',
        playerId: activePlayer.id,
        message: `🎲 ${activePlayer.name} 擲出了 ${dice} 點。`
      });
    }

    nextState.rngState = rng.getStateString(); // 更新 RNG 狀態

    // 執行步數路徑模擬 (隨機分支選擇，首步符合已選 heading)
    let headingNode = activePlayer.nextHeadingNode;
    const validDirs = getValidNextDirections(activePlayer.position, activePlayer.lastPosition, GRAPH_CONNECTIONS);
    if (headingNode === undefined && validDirs.length > 1) {
      const idx = rng.range(0, validDirs.length - 1);
      headingNode = validDirs[idx];
    }

    const isFroppy = activePlayer.characterId === 'froppy';
    const bypassRoadblock = isFroppy && rng.range(1, 100) <= 50;

    const { path, crossedStart } = simulatePath(
      activePlayer.position,
      activePlayer.lastPosition,
      dice,
      rng,
      headingNode,
      GRAPH_CONNECTIONS,
      nextState.tiles,
      bypassRoadblock
    );

    if (isFroppy && bypassRoadblock) {
      // 檢查是否中途有路障被跳過 (不含起點和終點)
      let bypassed = false;
      for (let idx = 1; idx < path.length; idx++) {
        const node = path[idx];
        const tState = nextState.tiles.find(t => t.id === node);
        if (tState && tState.statuses.hasRoadblock && idx < path.length - 1) {
          bypassed = true;
        }
      }
      if (bypassed) {
        events.push({
          type: 'EVENT',
          playerId: activePlayer.id,
          message: `🐸 蛙吹梅雨啟動被動「蛙」，以 50% 概率成功跳過路障，未受攔截！`
        });
      }
    }

    const targetDest = path[path.length - 1];
    const prevPos = path.length >= 2 ? path[path.length - 2] : activePlayer.lastPosition;

    nextState.lastMovePath = { playerId: activePlayer.id, path };

    // 檢測路障觸發
    const landedTile = nextState.tiles.find(t => t.id === targetDest);
    if (landedTile && landedTile.statuses.hasRoadblock) {
      nextState.tiles = nextState.tiles.map(t => {
        if (t.id === targetDest) {
          return { ...t, statuses: { ...t.statuses, hasRoadblock: false } };
        }
        return t;
      });
      events.push({
        type: 'ROADBLOCK_TRIGGERED',
        playerId: activePlayer.id,
        message: `🚧 嗶波！${activePlayer.name} 在路上被路障攔截，強制停在【${getTileConfig(targetDest).name}】！路障已消耗。`
      });
    }

    const passSalary = Math.round(2000 * Math.sqrt(nextState.priceIndex || 1.0));

    nextState.players = nextState.players.map(p => {
      if (p.id === activePlayer.id) {
        let updatedPlayer = { 
          ...p, 
          position: targetDest, 
          lastPosition: prevPos,
          nextHeadingNode: undefined
        };
        if (crossedStart) {
          updatedPlayer.cash += passSalary;
          events.push({
            type: 'CASH_GAIN',
            playerId: p.id,
            amount: passSalary,
            message: `🏢 ${p.name} 經過英雄總部，獲得巡邏經費 ${passSalary.toLocaleString("zh-Hant-TW")}！`
          });
        }
        return updatedPlayer;
      }
      return p;
    });

    // 解析落點效果
    nextState.phase = 'resolvingMove';
    const landResult = handleLanding(nextState, activePlayer.id, events);
    nextState = landResult.state;
    events = [...events, ...landResult.events];
    nextState.phase = 'action';

    return {
      state: nextState,
      events
    };
  }

  // ================= 4.5. 處理 CHOOSE_MOVE_PATH =================
  if (command.type === 'CHOOSE_MOVE_PATH') {
    if (nextState.phase !== 'choosingPath') {
      return { state, events, error: '目前不處於路線選擇階段' };
    }
    if (!nextState.pathChoices || !nextState.pathChoices.includes(command.targetTileId)) {
      return { state, events, error: '非法的路線選擇目標格' };
    }

    const targetDest = command.targetTileId;
    const lastDice = nextState.lastDiceValue || 1;
    const crossed = pathCrossesStart(activePlayer.position, targetDest, lastDice, GRAPH_CONNECTIONS);
    
    nextState.players = nextState.players.map(p => {
      if (p.id === activePlayer.id) {
        let updatedPlayer = { ...p, position: targetDest };
        if (crossed) {
          updatedPlayer.cash += 2000;
          events.push({
            type: 'CASH_GAIN',
            playerId: p.id,
            amount: 2000,
            message: `🏢 ${p.name} 經過英雄總部，獲得巡邏經費 2,000！`
          });
        }
        return updatedPlayer;
      }
      return p;
    });

    // 清除路線選擇狀態
    delete nextState.pathChoices;
    delete nextState.lastDiceValue;

    // 解析落點效果
    nextState.phase = 'resolvingMove';
    const landResult = handleLanding(nextState, activePlayer.id, events);
    nextState = landResult.state;
    events = [...events, ...landResult.events];
    
    // 落點處理完畢後，進入行動階段
    nextState.phase = 'action';

    return {
      state: nextState,
      events
    };
  }

  // ================= 4.6. 處理 CHOOSE_NEXT_HEADING =================
  if (command.type === 'CHOOSE_NEXT_HEADING') {
    const validDirs = getValidNextDirections(activePlayer.position, activePlayer.lastPosition, GRAPH_CONNECTIONS);
    if (!validDirs.includes(command.targetTileId)) {
      return { state, events, error: '非列在前進方向候選的相鄰節點' };
    }

    nextState.players = nextState.players.map(p => {
      if (p.id === activePlayer.id) {
        return { ...p, nextHeadingNode: command.targetTileId };
      }
      return p;
    });

    events.push({
      type: 'HEADING_CHANGED',
      playerId: activePlayer.id,
      message: `🧭 ${activePlayer.name} 已鎖定下一次行動的初始前進方向為【${getTileConfig(command.targetTileId).name}】。`
    });

    return {
      state: nextState,
      events
    };
  }

  // ================= 5. 處理 BUY_CURRENT_TILE =================
  if (command.type === 'BUY_CURRENT_TILE') {
    if (nextState.phase !== 'action') {
      return { state, events, error: '目前不處於行動階段，無法進行地產買賣' };
    }
    const tileState = nextState.tiles.find(t => t.id === activePlayer.position)!;
    const config = getTileConfig(activePlayer.position);

    if (tileState.ownerId) {
      return { state, events, error: '該據點已被進駐' };
    }
    if (config.type !== 'land') {
      return { state, events, error: '該格子不可進駐' };
    }
    if (activePlayer.landActionUsed) {
      return { state, events, error: '本回合已進行過地產操作' };
    }

    const price = calculatePurchasePrice(nextState, activePlayer, activePlayer.position);
    if (activePlayer.cash < price) {
      return { state, events, error: '支援預算不足，無法進駐該據點' };
    }

    // 扣款與進駐
    const payResult = payCash(nextState, activePlayer.id, price, `進駐據點 ${config.name}`);
    nextState = payResult.state;
    events = [...events, ...payResult.events];

    // 更新地產所有權
    nextState.tiles = nextState.tiles.map(t => {
      if (t.id === activePlayer.position) {
        return { ...t, ownerId: activePlayer.id, level: 1 as any }; // 初始為等級 1 (臨時據點)
      }
      return t;
    });

    nextState.players = nextState.players.map(p => {
      if (p.id === activePlayer.id) {
        return { ...p, landActionUsed: true };
      }
      return p;
    });

    events.push({
      type: 'TILE_PURCHASED',
      playerId: activePlayer.id,
      tileId: activePlayer.position,
      amount: price,
      message: `🏢 ${activePlayer.name} 正式進駐據點 ${config.name}（等級 1 / 臨時據點）。`
    });

    // 💀 死柄木弔被動：進駐據點觸發崩壞
    nextState = triggerShigarakiPassive(nextState, activePlayer.id, activePlayer.position, events);

    // 檢查是否完成套裝 ( district completion )
    if (config.zone) {
      const progress = getZoneProgress(nextState, activePlayer.id, config.zone);
      if (progress.complete) {
        nextState.stats.completedSets += 1;
        events.push({
          type: 'DISTRICT_COMPLETED',
          playerId: activePlayer.id,
          message: `👑 狂賀！${activePlayer.name} 完成了策略區域【${DISTRICTS[config.zone].name}】的全區據點進駐！套裝加成生效！`
        });
      }
    }

    return {
      state: nextState,
      events
    };
  }

  // ================= 6. 處理 UPGRADE_CURRENT_TILE =================
  if (command.type === 'UPGRADE_CURRENT_TILE') {
    if (nextState.phase !== 'action') {
      return { state, events, error: '目前不處於行動階段，無法擴建據點' };
    }
    const tileState = nextState.tiles.find(t => t.id === activePlayer.position)!;
    const config = getTileConfig(activePlayer.position);

    if (tileState.ownerId !== activePlayer.id) {
      return { state, events, error: '你只能擴建自己名下的據點' };
    }
    if (tileState.level >= 4) {
      return { state, events, error: '該據點已擴建至最高等級 (No.1 英雄事務所)' };
    }
    if (activePlayer.landActionUsed) {
      return { state, events, error: '本回合已進行過地產操作' };
    }

    const cost = calculateUpgradeCost(nextState, activePlayer.id, activePlayer.position);
    if (activePlayer.cash < cost) {
      return { state, events, error: '支援預算不足，無法擴建該據點' };
    }

    // 判定擴建提升的等級 (爆豪勝己主動一次升2級)
    const hasBlast = activePlayer.statusEffects.some(e => e.kind === 'blastUpgrade');
    const levelGain = hasBlast ? Math.min(2, 4 - tileState.level) : 1;

    // 扣款與升級
    const payResult = payCash(nextState, activePlayer.id, cost, `擴建據點 ${config.name}`);
    nextState = payResult.state;
    events = [...events, ...payResult.events];

    // 更新地產等級
    nextState.tiles = nextState.tiles.map(t => {
      if (t.id === activePlayer.position) {
        return { ...t, level: (t.level + levelGain) as any };
      }
      return t;
    });

    nextState.players = nextState.players.map(p => {
      if (p.id === activePlayer.id) {
        // 若使用了爆破施工，移除該一次性效果
        let statusEffects = p.statusEffects;
        if (hasBlast) {
          statusEffects = statusEffects.filter(e => e.kind !== 'blastUpgrade');
        }
        // 如果手牌裡有 'support_item' 裝備卡折價效果，也要在擴建後移除
        statusEffects = statusEffects.filter(e => e.kind !== 'upgradeDiscount');

        return {
          ...p,
          landActionUsed: true,
          statusEffects
        };
      }
      return p;
    });

    const nextLevel = tileState.level + levelGain;
    events.push({
      type: 'TILE_UPGRADED',
      playerId: activePlayer.id,
      tileId: activePlayer.position,
      amount: cost,
      message: `🧱 ${activePlayer.name} 將據點 ${config.name} 擴建升級至 Level ${nextLevel}（${LEVEL_NAMES[nextLevel]}）。`
    });

    // 💀 死柄木弔被動：升級據點觸發崩壞
    nextState = triggerShigarakiPassive(nextState, activePlayer.id, activePlayer.position, events);

    return {
      state: nextState,
      events
    };
  }

  // ================= 7. 處理 USE_CARD =================
  if (command.type === 'USE_CARD') {
    const cardResult = applyCardEffect(nextState, command.playerId, command.cardId, command.payload);
    if (cardResult.error) {
      return { state, events: [], error: cardResult.error };
    }
    nextState = cardResult.state;
    events = [...events, ...cardResult.events];

    return {
      state: nextState,
      events
    };
  }

  // ================= 8. 處理 USE_ABILITY =================
  if (command.type === 'USE_ABILITY') {
    const abilityResult = applyAbility(nextState, command.playerId, command.payload);
    if (abilityResult.error) {
      return { state, events: [], error: abilityResult.error };
    }
    nextState = abilityResult.state;
    events = [...events, ...abilityResult.events];

    return {
      state: nextState,
      events
    };
  }

  // ================= 9. 處理 END_TURN =================
  if (command.type === 'END_TURN') {
    // 檢查當前玩家是否有被冰封 / 捕縛布停行之效果
    // 正式的停回合會在下一個玩家回合開始時執行。我們在 `turnMachine.endTurn` 的切換玩家後，
    // 立即在新玩家的回合開始時，如果該新玩家具有 skipNextTurn 效果，就自動對其觸發。
    const turnResult = endTurn(nextState);
    nextState = turnResult.state;
    events = [...events, ...turnResult.events];

    // 檢查是否有贏家或回合數上限，決定遊戲是否結束
    nextState = checkGameOver(nextState, events);

    // 進入下一位玩家的回合
    const nextPlayer = nextState.players.find(p => p.id === nextState.activePlayerId)!;

    // 檢查下一位玩家是否被停回合 (skipNextTurn)
    const isFrozen = nextPlayer.statusEffects.some(e => e.kind === 'skipNextTurn');
    if (nextState.mode !== 'finished' && isFrozen) {
      if (nextPlayer.characterId === 'eraser_head') {
        // 抹消被動：免疫停行
        nextState.players = nextState.players.map(p => {
          if (p.id === nextPlayer.id) {
            return {
              ...p,
              statusEffects: p.statusEffects.filter(e => e.kind !== 'skipNextTurn')
            };
          }
          return p;
        });
        events.push({
          type: 'EVENT',
          playerId: nextPlayer.id,
          message: `👁️ 相澤消太啟動被動「抹消」，直接無視並消除了停步限制！`
        });
      } else {
        events.push({
          type: 'PLAYER_FROZEN_TURN',
          playerId: nextPlayer.id,
          message: `🥶 輪到 ${nextPlayer.name}，但其處於冰封/捕縛狀態！跳過本次移動與地產操作，只觸發當前所在格。`
        });

        // 1. 移除該 skipNextTurn 效果
        nextState.players = nextState.players.map(p => {
          if (p.id === nextPlayer.id) {
            return {
              ...p,
              statusEffects: p.statusEffects.filter(e => e.kind !== 'skipNextTurn')
            };
          }
          return p;
        });

        // 2. 再次觸發當前格子效果
        nextState.phase = 'resolvingEffect';
        const landResult = handleLanding(nextState, nextPlayer.id, events);
        nextState = landResult.state;
        events = [...events, ...landResult.events];

        // 3. 處理完畢，玩家本回合不得移動或買地，再次自動結算回合
        // 為了防範遞迴失控，我們直接利用 endTurn 切換至下個玩家
        const recurResult = endTurn(nextState);
        nextState = recurResult.state;
        events = [...events, ...recurResult.events];
        nextState = checkGameOver(nextState, events);
      }
    }

    return {
      state: nextState,
      events
    };
  }

  return {
    state,
    events,
    error: '未知的 Command 類型'
  };
}

// ================= 行動與落點內部處理純函數 =================


// 處理落點效果的純函數，包含 Raid 踩踏、各種格子功能 (轉帳、抽卡、命運、交通、彩票)
function handleLanding(
  state: GameState,
  playerId: string,
  events: DomainEvent[],
  depth: number = 0
): { state: GameState; events: DomainEvent[] } {
  // 防範交通連鎖移動遞迴過深
  if (depth > 8) {
    events.push({
      type: 'ERROR',
      message: '🚨 系統偵測到交通連鎖移動過深，已自動中止連鎖。'
    });
    return { state, events };
  }

  let nextState = { ...state };
  const player = nextState.players.find(p => p.id === playerId)!;
  const tileState = nextState.tiles.find(t => t.id === player.position)!;
  const config = getTileConfig(player.position);

  // 1. 處理隨機亂入標記 (Raid Overlay)
  const spawnIndex = nextState.raidSpawns.findIndex(s => s.tileId === player.position);
  if (spawnIndex !== -1) {
    const spawn = nextState.raidSpawns[spawnIndex];
    const raidConfig = RAIDS.find(r => r.id === spawn.raidId)!;

    // 將亂入效果加入玩家 statusEffects
    nextState.players = nextState.players.map(p => {
      if (p.id === playerId) {
        return {
          ...p,
          statusEffects: [
            ...p.statusEffects,
            { name: raidConfig.name, duration: raidConfig.duration, kind: raidConfig.kind, value: raidConfig.value }
          ]
        };
      }
      return p;
    });

    // 移除該亂入點
    const nextSpawns = [...nextState.raidSpawns];
    nextSpawns.splice(spawnIndex, 1);
    nextState.raidSpawns = nextSpawns;

    events.push({
      type: 'RAID_TRIGGERED',
      playerId,
      message: `💥 ${player.name} 迎面撞見了 ${raidConfig.name}！受到其能力影響（${raidConfig.description}，持續 ${raidConfig.duration} 回合）。`
    });

    // 重新生成隨機亂入點
    nextState = ensureRaidSpawns(nextState, events);
  }

  // 2. 根據格子類型處理
  switch (config.type) {
    case 'start': {
      // 精確停在英雄總部額外獲得 1000 (隨物價指數開根號膨脹)
      const landStartAmount = Math.round(1000 * Math.sqrt(nextState.priceIndex || 1.0));
      const result = giveCash(nextState, playerId, landStartAmount, '精確抵達英雄總部');
      nextState = result.state;
      events = [...events, ...result.events];
      break;
    }

    case 'land': {
      // 處理土地
      if (!tileState.ownerId) {
        events.push({
          type: 'TILE_LAND_UNOWNED',
          tileId: player.position,
          message: `📢 ${player.name} 抵達無主據點 ${config.name}，可花費 ${calculatePurchasePrice(nextState, player, player.position).toLocaleString("zh-Hant-TW")} 預算進行進駐。`
        });
      } else if (tileState.ownerId === playerId) {
        events.push({
          type: 'TILE_LAND_OWN',
          tileId: player.position,
          message: `📢 ${player.name} 抵達自己名下的據點 ${config.name}。`
        });
      } else {
        // 對手土地：需要計算並支付支援費
        const owner = nextState.players.find(p => p.id === tileState.ownerId)!;
        if (!owner.isBankrupt) {
          const rentResult = calculateRent(nextState, player.position, playerId, owner.id);
          
          if (rentResult.rent > 0) {
            const transferResult = transferCash(
              nextState, 
              playerId, 
              owner.id, 
              rentResult.rent, 
              `支付 ${owner.name} 的據點 ${config.name} 支援費`
            );
            nextState = transferResult.state;
            events = [...events, ...transferResult.events];

            // 扣除一次性使用的「無重力漂浮」/「廣告看板」效果
            nextState = consumeOneShotRentEffects(nextState, playerId, player.position);
          } else {
            events.push({
              type: 'RENT_FREE',
              playerId,
              message: `📢 ${player.name} 抵達 ${owner.name} 的據點 ${config.name}，但由於狀態影響，本次支援費為 0。`
            });
            // 停擺與漂浮一次性效果仍然被消耗
            nextState = consumeOneShotRentEffects(nextState, playerId, player.position);
          }
        }
      }
      break;
    }

    case 'card': {
      // 抽卡 (Jay 八百萬被動: 20% 機率多抽一張)
      const drawResult = drawCard(nextState, playerId, 1, '抵達支援站');
      nextState = drawResult.state;
      events = [...events, ...drawResult.events];
      break;
    }

    case 'fate': {
      // 命運事件
      const fateResult = triggerFate(nextState, playerId);
      nextState = fateResult.state;
      events = [...events, ...fateResult.events];
      break;
    }

    case 'traffic': {
      // 交通格處理
      // 檢查是否擁有「免費交通」效果 (airport_express / traffic_dispatch 放置)
      const hasFreeTraffic = player.statusEffects.some(e => e.kind === 'freeTrafficOnce');
      if (hasFreeTraffic) {
        // 消耗免費交通效果
        nextState.players = nextState.players.map(p => {
          if (p.id === playerId) {
            return {
              ...p,
              statusEffects: p.statusEffects.filter(e => e.kind !== 'freeTrafficOnce')
            };
          }
          return p;
        });
        events.push({
          type: 'TRAFFIC_LAND',
          playerId,
          message: `📢 ${player.name} 抵達交通格 ${config.name}，由於使用交通工具，免付交通費。`
        });
      } else {
        // 支付標準交通費：300 
        let fee = 300;
        // 飯田天哉被動：交通費 +20% (即 360)
        if (player.characterId === 'musk_bite') {
          fee = Math.round(fee * 1.20);
        }

        const payResult = payCash(nextState, playerId, fee, `支付 ${config.name} 交通費`);
        nextState = payResult.state;
        events = [...events, ...payResult.events];

        // 上鳴電氣被動：抵達交通格額外獲得 500 發電補助
        if (player.characterId === 'chargebolt') {
          const giveResult = giveCash(nextState, playerId, 500, '帶電被動發電補助');
          nextState = giveResult.state;
          events = [...events, ...giveResult.events];
          events.push({
            type: 'EVENT',
            playerId,
            message: `⚡ 上鳴電氣啟動帶電被動！獲得 500 發電補助。`
          });
        }

        // 飯田天哉被動：抵達交通格後額外前進 2 格，且觸發新格
        const updatedPlayer = nextState.players.find(p => p.id === playerId)!;
        if (player.characterId === 'musk_bite' && !updatedPlayer.isBankrupt) {
          events.push({
            type: 'TRAFFIC_BOOST',
            playerId,
            message: `🏃 飯田天哉啟動引擎被動！從交通格額外前進 2 格。`
          });
          
          // 前進 2 格 (不重複發放起點經費)
          nextState.players = nextState.players.map(p => {
            if (p.id === playerId) {
              return { ...p, position: (p.position + 2) % nextState.tiles.length };
            }
            return p;
          });

          // 遞迴解析新落點
          const recurResult = handleLanding(nextState, playerId, events, depth + 1);
          nextState = recurResult.state;
          events = [...events, ...recurResult.events];
        }
      }
      break;
    }

    case 'lottery': {
      // 支援基金 (彩票) 格
      // 正式重製規則：參加費 500。現金足夠時扣除 500 (池子加 500)。
      // 20% 機率中獎，中獎者拿走池子 70%。
      if (player.cash >= 500) {
        // 扣除 500 參加費
        const payResult = payCash(nextState, playerId, 500, '投入支援基金');
        nextState = payResult.state;
        events = [...events, ...payResult.events];
        
        nextState.lotteryPool += 500;

        const rng = new SeedableRNG(nextState.rngState || 'default');
        const isWinner = rng.range(1, 100) <= 20; // 20% 中獎率
        nextState.rngState = rng.getStateString();

        if (isWinner) {
          const prize = Math.round(nextState.lotteryPool * 0.70);
          nextState.lotteryPool -= prize;
          
          const winResult = giveCash(nextState, playerId, prize, '支援基金大獎');
          nextState = winResult.state;
          events = [...events, ...winResult.events];

          events.push({
            type: 'LOTTERY_WIN',
            playerId,
            amount: prize,
            message: `🎉 幸運爆棚！${player.name} 抽中支援基金大獎！獲得獎金 ${prize.toLocaleString("zh-Hant-TW")}！`
          });
        } else {
          events.push({
            type: 'LOTTERY_MISS',
            playerId,
            message: `📢 ${player.name} 未能抽中基金大獎。目前基金池累積金額為 ${nextState.lotteryPool.toLocaleString("zh-Hant-TW")}。`
          });
        }
      } else {
        events.push({
          type: 'LOTTERY_SKIP',
          playerId,
          message: `📢 ${player.name} 支援預算不足 500，無法參與本次支援基金抽選。`
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

// 消耗一次性租金相關狀態效果的輔助純函數
function consumeOneShotRentEffects(state: GameState, payerId: string, tileId: number): GameState {
  let nextState = { ...state };
  
  // 1. 消耗土地狀態中的 rentBoostOnce 與 rentDisabledOnce
  nextState.tiles = nextState.tiles.map(t => {
    if (t.id === tileId) {
      return {
        ...t,
        statuses: {
          ...t.statuses,
          rentDisabledOnce: false, // 停擺一次性消耗
          rentBoostOnce: null // 廣告一次性消耗
        }
      };
    }
    return t;
  });

  // 2. 消耗付款方身上的一次性減免效果 (無重力漂浮 rentPayDiscount)
  nextState.players = nextState.players.map(p => {
    if (p.id === payerId) {
      const idx = p.statusEffects.findIndex(e => e.kind === 'rentPayDiscount');
      if (idx !== -1) {
        const effects = [...p.statusEffects];
        effects.splice(idx, 1);
        return { ...p, statusEffects: effects };
      }
    }
    return p;
  });

  return nextState;
}

// 檢查遊戲結束的純函數
function checkGameOver(state: GameState, events: DomainEvent[]): GameState {
  if (state.mode === 'finished') return state;

  const alivePlayers = state.players.filter(p => !p.isBankrupt);

  // 1. 判定停業淘汰
  if (alivePlayers.length <= 1) {
    const winner = alivePlayers[0] || state.players[0];
    events.push({
      type: 'GAME_OVER',
      message: `🏆 遊戲結束！因其餘對手皆告停業，由【${winner.name}】取得最終勝利！`
    });
    return {
      ...state,
      mode: 'finished'
    };
  }

  // 2. 判定超過最大回合數
  if (state.round > state.maxRounds) {
    // 依聲望資產排序
    const ranking = [...state.players]
      .filter(p => !p.isBankrupt)
      .sort((a, b) => calculateNetWorth(state, b.id) - calculateNetWorth(state, a.id));

    const winner = ranking[0];
    events.push({
      type: 'GAME_OVER',
      message: `🏆 遊戲已達 ${state.maxRounds} 回合上限！由【${winner.name}】榮登 No.1 英雄！結算聲望資產：`
    });

    ranking.forEach((p, idx) => {
      events.push({
        type: 'GAME_RESULT_RANK',
        message: `第 ${idx + 1} 名: ${p.name}（聲望資產 ${calculateNetWorth(state, p.id).toLocaleString("zh-Hant-TW")}）`
      });
    });

    return {
      ...state,
      mode: 'finished'
    };
  }

  return state;
}
