import { describe, it, expect } from 'vitest';
import { gameReducer } from '../engine/reducer';
import { startGameCommand, rollDiceCommand, endTurnCommand } from '../engine/commands';
import { makeAiPreRollDecision, makeAiActionDecision } from '../engine/ai';

describe('桃園 Hero City 引擎壓力模擬與穩定度測試', () => {
  const runSimulation = (maxRounds: number, seed: string) => {
    const options = {
      startingCash: 20000,
      maxRounds,
      aiCount: 3,
      enableQuirks: true,
      enableRaids: true
    };

    // 啟動遊戲
    let result = gameReducer(null, startGameCommand(options, 'izuku_midoriya', seed));
    let state = result.state;
    expect(state).toBeDefined();

    let safetyCounter = 0;
    const maxSteps = 10000; // 防止陷入死循環的保險門檻

    while (state.mode === 'playing' && safetyCounter < maxSteps) {
      safetyCounter++;
      
      const activePlayer = state.players.find(p => p.id === state.activePlayerId)!;

      // 無論是真人口控制還是 AI 控制，在壓力測試中我們都使用 AI 決策來自動推進
      if (state.phase === 'preRoll') {
        const cmd = makeAiPreRollDecision(state, activePlayer.id);
        if (cmd) {
          result = gameReducer(state, cmd);
        } else {
          result = gameReducer(state, rollDiceCommand(activePlayer.id));
        }
      } else if (state.phase === 'action') {
        const cmds = makeAiActionDecision(state, activePlayer.id);
        if (cmds.length > 0) {
          // 執行第一個指令
          result = gameReducer(state, cmds[0]);
        } else {
          // 安全降級：若無決策，強制結束回合
          result = gameReducer(state, endTurnCommand(activePlayer.id));
        }
      } else {
        // 其他過渡階段 (例如被停回合狀態)，手動發送 END_TURN 強制前進
        result = gameReducer(state, endTurnCommand(activePlayer.id));
      }

      expect(result.error).toBeUndefined();
      state = result.state;

      // 驗證狀態不包含 NaN 或 Invalid values
      state.players.forEach(p => {
        expect(Number.isNaN(p.cash)).toBe(false);
        expect(Number.isInteger(p.cash)).toBe(true);
        expect(p.cash).not.toBeNull();
      });

      state.tiles.forEach(t => {
        expect(Number.isNaN(t.level)).toBe(false);
      });
    }

    // 確保遊戲最終一定可以分出勝負（破產淘汰或達上限）
    expect(state.mode).toBe('finished');
    expect(safetyCounter).toBeLessThan(maxSteps);
    
    // 輸出戰績資訊
    console.log(`[STRESS TEST] Seed ${seed} completed in ${state.round - 1} rounds (${safetyCounter} reduction steps)`);
  };

  it('應成功模擬 30 回合對局且數據無異常', () => {
    runSimulation(30, 'stress_seed_30');
  });

  it('應成功模擬 180 回合超長壓力局且數據無異常', () => {
    runSimulation(180, 'stress_seed_180');
  });
});
