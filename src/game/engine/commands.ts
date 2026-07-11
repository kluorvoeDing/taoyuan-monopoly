import type { GameCommand, GameOptions, GameState } from '../types';

// 命令建立輔助函式 (Action Creators)

export function startGameCommand(options: GameOptions, characterId: string, rngSeed?: string): GameCommand {
  return {
    type: 'START_GAME',
    options,
    characterId,
    rngSeed
  };
}

export function rollDiceCommand(playerId: string): GameCommand {
  return {
    type: 'ROLL_DICE',
    playerId
  };
}

export function useAbilityCommand(playerId: string, payload?: any): GameCommand {
  return {
    type: 'USE_ABILITY',
    playerId,
    payload
  };
}

export function useCardCommand(playerId: string, cardId: string, payload?: any): GameCommand {
  return {
    type: 'USE_CARD',
    playerId,
    cardId,
    payload
  };
}

export function buyCurrentTileCommand(playerId: string): GameCommand {
  return {
    type: 'BUY_CURRENT_TILE',
    playerId
  };
}

export function upgradeCurrentTileCommand(playerId: string): GameCommand {
  return {
    type: 'UPGRADE_CURRENT_TILE',
    playerId
  };
}

export function endTurnCommand(playerId: string): GameCommand {
  return {
    type: 'END_TURN',
    playerId
  };
}

export function selectTileCommand(tileId: number): GameCommand {
  return {
    type: 'SELECT_TILE',
    tileId
  };
}

export function forceStateCommand(state: GameState): GameCommand {
  return {
    type: 'FORCE_STATE',
    state
  };
}

// 基礎命令驗證邏輯
export function validateCommand(state: GameState, command: GameCommand): { valid: boolean; error?: string } {
  // 檢查是否處於遊玩中狀態
  if (state.mode !== 'playing' && command.type !== 'START_GAME' && command.type !== 'FORCE_STATE') {
    return { valid: false, error: '遊戲目前不處於遊玩狀態' };
  }

  // 驗證行動玩家
  if ('playerId' in command) {
    if (command.playerId !== state.activePlayerId) {
      return { valid: false, error: '非該玩家的行動回合' };
    }
  }

  return { valid: true };
}
