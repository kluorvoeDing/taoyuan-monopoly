export type GameMode = 'setup' | 'playing' | 'finished';
export type TurnPhase = 'preRoll' | 'resolvingMove' | 'choosingPath' | 'action' | 'resolvingEffect';

export interface GameOptions {
  startingCash: number;
  maxRounds: number;
  aiCount: number;
  enableQuirks: boolean;
  enableRaids: boolean;
}

export interface TimedEffect {
  name: string;
  duration: number; // 剩餘回合數
  kind: string; // 效果類型，例如 'diceLimit' | 'rentIncomeBoost' | 'rentPayPenalty' | 'upgradeDiscount' | 'rentAll' | 'upgradeDiscountAll' | 'diceLimitAll'
  value: number; // 數值倍率或折扣
}

export interface RaidSpawn {
  tileId: number;
  raidId: string; // 亂入角色 ID
}

export interface GameLogEntry {
  id: string;
  timestamp: string;
  message: string;
  type?: 'system' | 'move' | 'transaction' | 'card' | 'ability' | 'event' | 'raid' | 'bankrupt';
  playerId?: string;
  cashChange?: number;
  worthChange?: number;
}

export interface GameStats {
  cardUses: number;
  routeUses: number;
  defenseUses: number;
  defenseSuccess: number;
  damageUses: number;
  completedSets: number;
}

export interface PlayerState {
  id: string; // e.g., 'p1', 'p2'
  name: string; // 玩家顯示名稱
  characterId: string; // e.g., 'bill_rice'
  control: 'human' | 'ai';
  cash: number;
  position: number; // 目前地圖格子 ID (0-55)
  cards: string[]; // 手牌卡片 ID
  statusEffects: TimedEffect[]; // 個人持續效果
  isBankrupt: boolean;
  cooldowns: Record<string, number>; // 個性主動能力冷卻：{'abilityId': CD}
  landActionUsed: boolean; // 每回合限一次地產操作
  provisionalLicenseUsed: boolean; // 臨時執照本回合已使用標記
  lastPosition?: number; // 移步前的起點或上一步的位置，用以判斷移動前進方向，防止回頭
  nextHeadingNode?: number; // 在交叉點預選的下一次前進方向節點
}

export interface TileState {
  id: number; // 0 到 55
  ownerId?: string; // 土地擁有者 ID
  level: 0 | 1 | 2 | 3 | 4; // 建築等級，0 表示空地，4 表示 No.1 英雄事務所
  statuses: {
    guardRounds: number; // 防守賸餘輪數
    disruptedRounds: number; // 干擾賸餘輪數
    rentDisabledOnce: boolean; // 停擺一次
    rentBoostOnce: number | null; // 廣告加成倍率 (如 1.5)，觸發後清除
    hasRoadblock?: boolean; // 是否放置了路障
  };
}

export interface GameState {
  version: string;
  mode: GameMode;
  round: number;
  maxRounds: number;
  activePlayerId: string;
  phase: TurnPhase;
  options: GameOptions;
  players: PlayerState[];
  tiles: TileState[];
  globalEffects: TimedEffect[]; // 全域持續效果
  raidSpawns: RaidSpawn[]; // 目前棋盤上的亂入標記
  lotteryPool: number; // 支援基金池
  eventLog: GameLogEntry[]; // 獨立滾動日誌
  selectedTileId?: number; // UI 目前選中的土地格 ID
  stats: GameStats;
  rngState?: string; // 可序列化的 RNG 種子/狀態
  pathChoices?: number[]; // 分支路線待選終點格 ID
  lastDiceValue?: number; // 上一次骰子擲出的點數
  lastMovePath?: { playerId: string; path: number[] } | null; // 記錄最近移動過渡路徑
  priceIndex: number; // 物價指數 (通貨膨脹率，預設為 1.0)
}

// 核心命令定義
export type GameCommand =
  | { type: 'START_GAME'; options: GameOptions; characterId: string; rngSeed?: string }
  | { type: 'ROLL_DICE'; playerId: string }
  | { type: 'CHOOSE_MOVE_PATH'; playerId: string; targetTileId: number }
  | { type: 'CHOOSE_NEXT_HEADING'; playerId: string; targetTileId: number }
  | { type: 'USE_ABILITY'; playerId: string; payload?: any }
  | { type: 'USE_CARD'; playerId: string; cardId: string; payload?: any }
  | { type: 'BUY_CURRENT_TILE'; playerId: string }
  | { type: 'UPGRADE_CURRENT_TILE'; playerId: string }
  | { type: 'END_TURN'; playerId: string }
  | { type: 'SELECT_TILE'; tileId: number }
  | { type: 'FORCE_STATE'; state: GameState }; // 用於存檔恢復

// 事件模型定義，供統計與日誌追蹤
export interface DomainEvent {
  type: string;
  playerId?: string;
  tileId?: number;
  amount?: number;
  cardId?: string;
  abilityId?: string;
  message: string;
  extra?: any;
}

export interface CommandResult {
  state: GameState;
  events: DomainEvent[];
  error?: string;
}
