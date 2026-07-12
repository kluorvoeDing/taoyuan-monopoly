import { create } from 'zustand';
import type { GameState, GameCommand, GameOptions } from '../game/types';
import { gameReducer } from '../game/engine/reducer';
import { makeAiPreRollDecision, makeAiActionDecision, makeAiPathDecision } from '../game/engine/ai';
import { CHARACTERS } from '../data/characters';
import { doc, setDoc, getDoc, updateDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../game/firebase';

interface GameStore {
  state: GameState | null;
  logs: string[];
  
  // 多人連線狀態
  isMultiplayer: boolean;
  roomId: string | null;
  myPlayerId: string | null;
  multiplayerRole: 'host' | 'guest' | null;
  onlinePlayers: any[];
  roomStatus: 'waiting' | 'playing' | 'finished' | null;

  // 建立新遊戲 (單機)
  startGame: (options: GameOptions, characterId: string, rngSeed?: string) => void;
  
  // 發送命令給遊戲引擎
  dispatch: (command: GameCommand) => { success: boolean; error?: string };
  
  // 多人連線操作
  createOnlineRoom: (nickname: string, characterId: string, options: GameOptions) => Promise<string>;
  joinOnlineRoom: (roomId: string, nickname: string, characterId: string) => Promise<{ success: boolean; error?: string }>;
  setReady: (ready: boolean) => Promise<void>;
  startMultiplayerGame: () => Promise<void>;
  quitRoom: () => void;
  listenToRoom: (roomId: string) => void;
  handleHostAILogic: (gameState: GameState) => Promise<void>;
  dispatchOnline: (command: GameCommand) => Promise<{ success: boolean; error?: string }>;

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

  // 多人連線初始狀態
  isMultiplayer: false,
  roomId: null,
  myPlayerId: null,
  multiplayerRole: null,
  onlinePlayers: [],
  roomStatus: null,

  startGame: (options, characterId, rngSeed) => {
    try {
      localStorage.setItem(LOCAL_STORAGE_SETTINGS_KEY, JSON.stringify(options));
    } catch (e) {
      console.error(e);
    }

    const startCmd: GameCommand = { type: 'START_GAME', options, characterId, rngSeed };
    const result = gameReducer(null, startCmd);
    
    if (result.state) {
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

  createOnlineRoom: async (nickname, characterId, options) => {
    const roomId = Math.random().toString(36).substring(2, 6).toUpperCase();
    const myPlayerId = 'p1';
    
    const initialPlayers = [
      { id: 'p1', name: nickname, characterId, isReady: true, isAi: false, lastActiveTime: Date.now() }
    ];

    const initialRoomData = {
      roomId,
      status: 'waiting',
      hostId: 'p1',
      players: initialPlayers,
      options,
      gameState: null,
      lastAction: null,
      updatedAt: serverTimestamp()
    };

    await setDoc(doc(db, 'rooms', roomId), initialRoomData);

    set({
      isMultiplayer: true,
      roomId,
      myPlayerId,
      multiplayerRole: 'host',
      onlinePlayers: initialPlayers,
      roomStatus: 'waiting'
    });

    get().listenToRoom(roomId);
    return roomId;
  },

  joinOnlineRoom: async (roomId, nickname, characterId) => {
    const roomRef = doc(db, 'rooms', roomId.toUpperCase());
    const snap = await getDoc(roomRef);
    if (!snap.exists()) {
      return { success: false, error: '該房間號不存在' };
    }

    const data = snap.data();
    if (data.status !== 'waiting') {
      return { success: false, error: '該對局已經開始或已結束' };
    }

    const players = data.players || [];
    if (players.length >= 4) {
      return { success: false, error: '該房間人數已滿' };
    }

    const myPlayerId = `p${players.length + 1}`;
    const newPlayer = {
      id: myPlayerId,
      name: nickname,
      characterId,
      isReady: false,
      isAi: false,
      lastActiveTime: Date.now()
    };

    const updatedPlayers = [...players, newPlayer];
    await updateDoc(roomRef, { players: updatedPlayers });

    set({
      isMultiplayer: true,
      roomId: roomId.toUpperCase(),
      myPlayerId,
      multiplayerRole: 'guest',
      onlinePlayers: updatedPlayers,
      roomStatus: 'waiting'
    });

    get().listenToRoom(roomId.toUpperCase());
    return { success: true };
  },

  setReady: async (ready) => {
    const { roomId, myPlayerId, isMultiplayer } = get();
    if (!isMultiplayer || !roomId || !myPlayerId) return;

    const roomRef = doc(db, 'rooms', roomId);
    const snap = await getDoc(roomRef);
    if (!snap.exists()) return;

    const players = snap.data().players || [];
    const updatedPlayers = players.map((p: any) => {
      if (p.id === myPlayerId) {
        return { ...p, isReady: ready };
      }
      return p;
    });

    await updateDoc(roomRef, { players: updatedPlayers });
  },

  startMultiplayerGame: async () => {
    const { roomId, multiplayerRole, isMultiplayer, onlinePlayers } = get();
    if (!isMultiplayer || !roomId || multiplayerRole !== 'host') return;

    const roomRef = doc(db, 'rooms', roomId);
    const snap = await getDoc(roomRef);
    if (!snap.exists()) return;

    const roomData = snap.data();
    const options = roomData.options;

    const playersForGame: any[] = [];
    
    onlinePlayers.forEach((p) => {
      playersForGame.push({
        id: p.id,
        name: p.name,
        characterId: p.characterId,
        control: 'human',
        cash: options.startingCash,
        position: 0,
        cards: [],
        statusEffects: [],
        isBankrupt: false,
        cooldowns: { [p.characterId]: 0 },
        landActionUsed: false,
        provisionalLicenseUsed: false
      });
    });

    const availableAiChars = ['jobs_think', 'lin_mansion', 'gou_lift', 'huang_smoke', 'jolin_zero', 'jay_turn', 'musk_bite', 'bill_rice'].filter(
      cid => !onlinePlayers.some(p => p.characterId === cid)
    );

    const neededAi = 4 - onlinePlayers.length;
    const finalOnlinePlayers = [...onlinePlayers];

    for (let i = 0; i < neededAi; i++) {
      const charId = availableAiChars[i] || 'jobs_think';
      const aiId = `p${playersForGame.length + 1}`;
      const charConfig = CHARACTERS.find(c => c.id === charId)!;
      
      playersForGame.push({
        id: aiId,
        name: `${charConfig.name} (AI)`,
        characterId: charId,
        control: 'ai',
        cash: options.startingCash,
        position: 0,
        cards: [],
        statusEffects: [],
        isBankrupt: false,
        cooldowns: { [charId]: 0 },
        landActionUsed: false,
        provisionalLicenseUsed: false
      });

      finalOnlinePlayers.push({
        id: aiId,
        name: `${charConfig.name} (AI)`,
        characterId: charId,
        isReady: true,
        isAi: true,
        lastActiveTime: Date.now()
      });
    }

    const startCmd: GameCommand = {
      type: 'START_GAME',
      options: {
        ...options,
        aiCount: neededAi
      },
      characterId: onlinePlayers[0].characterId,
      rngSeed: `online_${roomId}_${Date.now()}`
    };

    const initResult = gameReducer(null, startCmd);
    if (!initResult.state) return;

    const finalGameState = {
      ...initResult.state,
      players: playersForGame
    };

    await updateDoc(roomRef, {
      status: 'playing',
      players: finalOnlinePlayers,
      gameState: finalGameState,
      updatedAt: serverTimestamp()
    });
  },

  listenToRoom: (roomId: string) => {
    if ((window as any).firestoreUnsubscribe) {
      (window as any).firestoreUnsubscribe();
    }

    const unsub = onSnapshot(doc(db, 'rooms', roomId), (docSnap) => {
      if (!docSnap.exists()) return;
      const data = docSnap.data();

      set({
        onlinePlayers: data.players || [],
        roomStatus: data.status
      });

      if (data.status === 'playing' && data.gameState) {
        set({
          state: data.gameState,
          logs: data.gameState.eventLog ? data.gameState.eventLog.map((l: any) => l.message) : []
        });

        const isHost = get().multiplayerRole === 'host';
        if (isHost) {
          get().handleHostAILogic(data.gameState);
        }
      }
    });

    (window as any).firestoreUnsubscribe = unsub;
  },

  handleHostAILogic: async (gameState: GameState) => {
    const { roomId, multiplayerRole } = get();
    if (multiplayerRole !== 'host' || !roomId) return;

    const activePlayer = gameState.players.find(p => p.id === gameState.activePlayerId);
    if (!activePlayer || gameState.mode === 'finished') return;

    const isAi = activePlayer.control === 'ai';

    if (isAi) {
      const roomRef = doc(db, 'rooms', roomId);
      if ((window as any).aiTimeoutId) return;
      
      (window as any).aiTimeoutId = setTimeout(async () => {
        (window as any).aiTimeoutId = null;
        
        const latestDoc = await getDoc(roomRef);
        if (!latestDoc.exists()) return;
        const currentGameState = latestDoc.data().gameState;
        if (!currentGameState || currentGameState.activePlayerId !== activePlayer.id) return;

        if (currentGameState.phase === 'preRoll') {
          const preRollCmd = makeAiPreRollDecision(currentGameState, activePlayer.id);
          const cmd = preRollCmd || { type: 'ROLL_DICE', playerId: activePlayer.id };
          get().dispatchOnline(cmd);
        } else if (currentGameState.phase === 'choosingPath') {
          const pathDecision = makeAiPathDecision(currentGameState, activePlayer.id);
          if (pathDecision) {
            get().dispatchOnline(pathDecision);
          }
        } else if (currentGameState.phase === 'action') {
          const actionCmds = makeAiActionDecision(currentGameState, activePlayer.id);
          let tempState = currentGameState;
          const eventsList: any[] = [];
          
          for (const command of actionCmds) {
            const res = gameReducer(tempState, command);
            if (res.state) {
              tempState = res.state;
              eventsList.push(...res.events);
            }
          }

          await updateDoc(roomRef, {
            gameState: tempState,
            updatedAt: serverTimestamp()
          });
        }
      }, 1000);
    }
  },

  dispatchOnline: async (command: GameCommand) => {
    const { roomId, isMultiplayer, state } = get();
    if (!isMultiplayer || !roomId || !state) return { success: false };

    const roomRef = doc(db, 'rooms', roomId);
    const result = gameReducer(state, command);
    if (result.error) {
      return { success: false, error: result.error };
    }

    if (result.state) {
      const nextEventLogs = [...result.state.eventLog];
      result.events.forEach(e => {
        const timestamp = new Date().toLocaleTimeString("zh-Hant-TW", { hour12: false });
        nextEventLogs.unshift({
          id: Math.random().toString(36).substring(2, 9),
          timestamp,
          message: e.message,
          type: e.type as any,
          playerId: e.playerId,
          cashChange: e.amount
        });
      });

      if (nextEventLogs.length > 120) {
        nextEventLogs.splice(120);
      }

      const finalState = {
        ...result.state,
        eventLog: nextEventLogs
      };

      await updateDoc(roomRef, {
        gameState: finalState,
        lastAction: command,
        updatedAt: serverTimestamp()
      });

      return { success: true };
    }

    return { success: false, error: '狀態更新無效' };
  },

  quitRoom: () => {
    if ((window as any).firestoreUnsubscribe) {
      (window as any).firestoreUnsubscribe();
      (window as any).firestoreUnsubscribe = null;
    }
    set({
      isMultiplayer: false,
      roomId: null,
      myPlayerId: null,
      multiplayerRole: null,
      onlinePlayers: [],
      roomStatus: null,
      state: null,
      logs: []
    });
  },

  dispatch: (command) => {
    // START_GAME 特殊處理
    if (command.type === 'START_GAME') {
      get().startGame(command.options, command.characterId, command.rngSeed);
      return { success: true };
    }

    // 多人連線模式
    if (get().isMultiplayer) {
      get().dispatchOnline(command);
      return { success: true };
    }

    const currentState = get().state;
    if (!currentState) {
      return { success: false, error: '遊戲尚未啟動' };
    }

    const result = gameReducer(currentState, command);
    if (result.error) {
      return { success: false, error: result.error };
    }

    if (result.state) {
      try {
        localStorage.setItem(LOCAL_STORAGE_SAVE_KEY, JSON.stringify(result.state));
      } catch (e) {
        console.error(e);
      }

      const nextEventLogs = [...result.state.eventLog];
      
      result.events.forEach(e => {
        const timestamp = new Date().toLocaleTimeString("zh-Hant-TW", { hour12: false });
        nextEventLogs.unshift({
          id: Math.random().toString(36).substring(2, 9),
          timestamp,
          message: e.message,
          type: e.type as any,
          playerId: e.playerId,
          cashChange: e.amount
        });
      });

      if (nextEventLogs.length > 120) {
        nextEventLogs.splice(120);
      }

      const finalState = {
        ...result.state,
        eventLog: nextEventLogs
      };

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
    if (get().isMultiplayer) {
      get().quitRoom();
      return;
    }
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
