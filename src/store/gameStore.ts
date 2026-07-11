import { create } from 'zustand';
import type { GameState, GameCommand, GameOptions } from '../game/types';
import { gameReducer } from '../game/engine/reducer';

interface GameStore {
  state: GameState | null;
  logs: string[];
  
  // 建立新遊戲
  startGame: (options: GameOptions, characterId: string, rngSeed?: string) => void;
  
  // 發送命令給遊戲引擎
  dispatch: (command: GameCommand) => { success: boolean; error?: string };
  
  // 匯出存檔 (回傳 JSON 字串)
  exportState: () => string;
  
  // 匯入存檔
  importState: (json: string) => { success: boolean; error?: string };
  
  // 重置遊戲
  resetGame: () => void;

  // 目標選擇暫存狀態
  targetSelection: {
    type: 'tile' | 'player' | 'value';
    source: 'card' | 'ability';
    itemId?: string; // cardId 或 characterId
    validIds: any[]; // 允許的 ID 列表 (例如有效的土地 id 陣列)
    prompt: string;  // 顯示給使用者的指示
  } | null;
  setTargetSelection: (selection: {
    type: 'tile' | 'player' | 'value';
    source: 'card' | 'ability';
    itemId?: string;
    validIds: any[];
    prompt: string;
  } | null) => void;

  // 控制台收合狀態
  isConsoleMinimized: boolean;
  setConsoleMinimized: (min: boolean) => void;
}

const LOCAL_STORAGE_SAVE_KEY = 'hero-city.save.v1';
const LOCAL_STORAGE_SETTINGS_KEY = 'hero-city.settings.v1';

// 讀取初始存檔 (如果有的話)
function getInitialState(): GameState | null {
  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_SAVE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (err) {
    console.error('無法載入舊存檔:', err);
  }
  return null;
}

export const useGameStore = create<GameStore>((set, get) => ({
  state: getInitialState(),
  logs: [],
  targetSelection: null,
  setTargetSelection: (selection) => set({ targetSelection: selection }),
  isConsoleMinimized: true,
  setConsoleMinimized: (min) => set({ isConsoleMinimized: min }),

  startGame: (options, characterId, rngSeed) => {
    // 儲存設定到 localStorage
    try {
      localStorage.setItem(LOCAL_STORAGE_SETTINGS_KEY, JSON.stringify(options));
    } catch (e) {
      console.error(e);
    }

    const startCmd: GameCommand = { type: 'START_GAME', options, characterId, rngSeed };
    const result = gameReducer(null, startCmd);
    
    if (result.state) {
      // 寫入自動存檔
      try {
        localStorage.setItem(LOCAL_STORAGE_SAVE_KEY, JSON.stringify(result.state));
      } catch (e) {
        console.error(e);
      }

      set({
        state: result.state,
        logs: result.events.map(e => e.message)
      });
    }
  },

  dispatch: (command) => {
    const currentState = get().state;
    // START_GAME 特殊處理
    if (command.type === 'START_GAME') {
      get().startGame(command.options, command.characterId, command.rngSeed);
      return { success: true };
    }

    if (!currentState) {
      return { success: false, error: '遊戲尚未啟動' };
    }

    const result = gameReducer(currentState, command);
    
    if (result.error) {
      return { success: false, error: result.error };
    }

    if (result.state) {
      // 寫入自動存檔
      try {
        localStorage.setItem(LOCAL_STORAGE_SAVE_KEY, JSON.stringify(result.state));
      } catch (e) {
        console.error(e);
      }

      // 將新產生的事件，加入 state.eventLog 與 logs
      const nextEventLogs = [...result.state.eventLog];
      
      result.events.forEach(e => {
        const timestamp = new Date().toLocaleTimeString("zh-Hant-TW", { hour12: false });
        
        // 壓入地圖引擎自帶日誌
        nextEventLogs.unshift({
          id: Math.random().toString(36).substring(2, 9),
          timestamp,
          message: e.message,
          type: e.type as any,
          playerId: e.playerId,
          cashChange: e.amount
        });
      });

      // 限制日誌上限為 120 筆
      if (nextEventLogs.length > 120) {
        nextEventLogs.splice(120);
      }

      const finalState = {
        ...result.state,
        eventLog: nextEventLogs
      };

      // 再次自動更新 localStorage 存檔
      try {
        localStorage.setItem(LOCAL_STORAGE_SAVE_KEY, JSON.stringify(finalState));
      } catch (e) {
        console.error(e);
      }

      set({
        state: finalState,
        logs: [...result.events.map(ev => ev.message), ...get().logs].slice(0, 100)
      });

      return { success: true };
    }

    return { success: false, error: '狀態更新無效' };
  },

  exportState: () => {
    const currentState = get().state;
    if (!currentState) return '';
    return JSON.stringify(currentState, null, 2);
  },

  importState: (json) => {
    try {
      const parsed = JSON.parse(json);
      if (parsed && parsed.version && parsed.players && parsed.tiles) {
        // 使用 FORCE_STATE 同步狀態
        const result = gameReducer(parsed, { type: 'FORCE_STATE', state: parsed });
        if (result.state) {
          localStorage.setItem(LOCAL_STORAGE_SAVE_KEY, JSON.stringify(result.state));
          set({
            state: result.state,
            logs: ['⚙️ 已從外部 JSON 檔案成功載入遊戲存檔！']
          });
          return { success: true };
        }
      }
      return { success: false, error: '存檔格式無效，必須包含 version、players 與 tiles' };
    } catch (e) {
      return { success: false, error: `JSON 解析失敗: ${(e as Error).message}` };
    }
  },

  resetGame: () => {
    try {
      localStorage.removeItem(LOCAL_STORAGE_SAVE_KEY);
    } catch (e) {
      console.error(e);
    }
    set({ state: null, logs: [] });
  }
}));

// 獲取最後一次開局設定
export function getLastSettings(): GameOptions {
  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_SETTINGS_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error(e);
  }
  return {
    startingCash: 20000,
    maxRounds: 30,
    aiCount: 3,
    enableQuirks: true,
    enableRaids: true
  };
}
