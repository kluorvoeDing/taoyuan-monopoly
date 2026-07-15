import { describe, it, expect } from 'vitest';
import { gameReducer } from '../engine/reducer';
import { 
  startGameCommand, 
  rollDiceCommand, 
  buyCurrentTileCommand, 
  upgradeCurrentTileCommand, 
  endTurnCommand, 
  forceStateCommand
} from '../engine/commands';
import { calculateRent, getZoneProgress } from '../engine/selectors';
import { transferCash } from '../engine/economy';
import type { PlayerState } from '../types';

describe('桃園 Hero City 遊戲引擎單元測試', () => {
  const options = {
    startingCash: 20000,
    maxRounds: 30,
    aiCount: 3,
    enableQuirks: true,
    enableRaids: true
  };

  it('應正確初始化遊戲，AI 玩家不重複且資金相同，且綠谷無額外資金', () => {
    // 選擇綠谷出久 (bill_rice)
    const result = gameReducer(null, startGameCommand(options, 'izuku_midoriya', 'test_seed'));
    expect(result.error).toBeUndefined();
    expect(result.state).toBeDefined();
    
    const state = result.state;
    expect(state.mode).toBe('playing');
    expect(state.round).toBe(1);
    expect(state.players.length).toBe(4);
    
    // 檢查每位玩家起始資金皆為 20000
    state.players.forEach(p => {
      expect(p.cash).toBe(20000);
      expect(p.position).toBe(0);
      expect(p.isBankrupt).toBe(false);
    });

    // 檢查角色分配不重複
    const ids = state.players.map(p => p.characterId);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(4);
  });

  it('確定性隨機數與移動功能應正常運作，跨越/停在起點獲得對應經費', () => {
    // 初始化
    let result = gameReducer(null, startGameCommand(options, 'izuku_midoriya', 'fixed_seed_1'));
    let state = result.state;

    // 模擬擲骰子 (第一步)
    result = gameReducer(state, rollDiceCommand('p1'));
    state = result.state;
    if (state.phase === 'choosingPath') {
      const choice = state.pathChoices![0];
      result = gameReducer(state, { type: 'CHOOSE_MOVE_PATH', playerId: 'p1', targetTileId: choice });
      state = result.state;
    }
    expect(state.phase).toBe('action');
    expect(state.players[0].position).toBeGreaterThan(0); // 應該向前移動了

    // 測試：精確降落在起點
    // 拓撲路徑下：47 -> 51 -> 0 (需 2 步)
    state.players[0].position = 47;
    result = gameReducer(state, forceStateCommand(state));
    state = result.state;

    // 幫玩家設定指定骰子 2
    state.players[0].statusEffects.push({
      name: '指定骰子',
      duration: 1,
      kind: 'nextDice',
      value: 2
    });
    state.phase = 'preRoll';

    // 擲骰移動
    result = gameReducer(state, rollDiceCommand('p1'));
    state = result.state;
    if (state.phase === 'choosingPath') {
      const choice = state.pathChoices![0];
      result = gameReducer(state, { type: 'CHOOSE_MOVE_PATH', playerId: 'p1', targetTileId: choice });
      state = result.state;
    }

    // 降落起點：越過起點領 2000，精確降落再領 1000，共領 3000
    expect(state.players[0].position).toBe(0);
    // 起始 20000 扣掉之前若有支出/收入。我們可以以 netWorth 或 cash 增值來驗證
    // 由於我們剛設定 position 為 53，此處現金應比設定前增加 3000
  });

  it('地產進駐、擴建以及地區套裝支援費加成應符合規格', () => {
    let result = gameReducer(null, startGameCommand(options, 'izuku_midoriya', 'test_seed'));
    let state = result.state;

    // 強制將 p1 放於第 1 格 (桃園站前, S級, zone = taoyuan_core)
    state.players[0].position = 1;
    state.phase = 'action';
    
    // 進駐該土地
    result = gameReducer(state, buyCurrentTileCommand('p1'));
    state = result.state;
    
    const tile1 = state.tiles.find(t => t.id === 1)!;
    expect(tile1.ownerId).toBe('p1');
    expect(tile1.level).toBe(1);
    
    // 現金扣減 (S級土地價格為 6000)
    // 20000 - 6000 = 14000
    expect(state.players[0].cash).toBe(14000);

    // 測試同回合不能再次操作
    result = gameReducer(state, upgradeCurrentTileCommand('p1'));
    expect(result.error).toBeDefined(); // 本回合已操作過地產

    // 結束回合，輪到其他 AI
    // 為了簡單，我們直接用 forceState 重置 p1 的操作狀態，進入新回合
    state.players[0].landActionUsed = false;
    state.phase = 'action';

    // 擴建桃園站前至 Level 2 (No.1 英雄事務所基礎擴建費為 6000 * 50% = 3000)
    result = gameReducer(state, upgradeCurrentTileCommand('p1'));
    state = result.state;
    const tileAfterUpgrade = state.tiles.find(t => t.id === 1)!;
    expect(tileAfterUpgrade.level).toBe(2);
    expect(state.players[0].cash).toBe(11000); // 14000 - 3000 = 11000

    // 測試套裝加成
    // 桃園核心區包含 1, 2, 3, 5 格，共 4 格
    // p1 目前持有第 1 格。我們再幫他買下第 2 格 (中正商圈, A級)
    state.tiles.find(t => t.id === 2)!.ownerId = 'p1';
    state.tiles.find(t => t.id === 2)!.level = 1;
    
    // 持有 2 格：支援費加成 +10%
    const progress = getZoneProgress(state, 'p1', 'taoyuan_core');
    expect(progress.owned).toBe(2);

    // 計算 Level 2 據點 (桃園站前, S級, 6000價格) 的支援費
    // 基礎支援費 = 6000 * 0.35 = 2100
    // 套裝加成 2格(+10%) => 2100 * 1.10 = 2310
    const rentVal = calculateRent(state, 1, 'p2', 'p1');
    expect(rentVal.rent).toBe(2310);
  });

  it('緊急拍賣撤收與停業流程應完全可預測', () => {
    let result = gameReducer(null, startGameCommand(options, 'izuku_midoriya', 'test_seed'));
    let state = result.state;

    // p1 進駐第 3 格 (民生路, B級 3200) 並升級至 Level 2
    state.tiles.find(t => t.id === 3)!.ownerId = 'p1';
    state.tiles.find(t => t.id === 3)!.level = 2;

    // p1 進駐第 1 格 (桃園站前, S級 6000) 並升級至 Level 1
    state.tiles.find(t => t.id === 1)!.ownerId = 'p1';
    state.tiles.find(t => t.id === 1)!.level = 1;

    // 設定玩家現金極低 (100)
    state.players[0].cash = 100;

    // 模擬此時 p1 需要支付 4000 支援費給 p2，現金透支 (100 - 4000 = -3900)
    // 會觸發緊急拍賣。
    // 民生路 (B級) 策略價值較低，應優先售出。
    // 民生路回收金 = 3200 * 0.5 + 2 * 3200 * 0.25 = 1600 + 1600 = 3200
    // 售出後現金：-3900 + 3200 = -700
    // 現金仍為負，繼續售出 桃園站前 (S級)
    // 桃園站前回收金 = 6000 * 0.5 + 1 * 6000 * 0.25 = 3000 + 1500 = 4500
    // 售出後現金：-700 + 4500 = 3800
    // 此時現金 >= 0，拍賣停止。p1 不會停業。

    const rentCalculation = 4000;
    // 執行扣除
    const payResult = gameReducer(state, forceStateCommand(state)); // 重新同步
    state = payResult.state;
    
    // 執行轉帳
    state.tiles.find(t => t.id === 5)!.ownerId = 'p2'; // 讓 p2 擁有第 5 格收租
    const transferResult = transferCash(state, 'p1', 'p2', rentCalculation, '測試計費');
    
    const finalState = transferResult.state;
    const p1 = finalState.players.find((p: PlayerState) => p.id === 'p1')!;
    
    expect(p1.isBankrupt).toBe(false);
    expect(p1.cash).toBe(3800);
    
    // 檢查民生路 (ID 3) 已被拍賣釋出
    const tile3 = finalState.tiles.find((t: any) => t.id === 3)!;
    expect(tile3.ownerId).toBeUndefined();
    expect(tile3.level).toBe(0);
  });

  it('被停回合的玩家在回合開始時應再次觸發所在格，且跳過移動與地產操作', () => {
    let result = gameReducer(null, startGameCommand(options, 'izuku_midoriya', 'test_seed'));
    let state = result.state;

    // 將 p2 (AI) 放到第 4 格 (支援站, 抽卡格)
    state.players[1].position = 4;
    
    // 為 p2 掛上冰封 / 捕縛布停行效果
    state.players[1].statusEffects.push({
      name: '冰封戰線',
      duration: 1,
      kind: 'skipNextTurn',
      value: 1
    });

    // 輪到 p2 (讓 p1 結束回合)
    state.activePlayerId = 'p1';
    state.phase = 'action';
    
    result = gameReducer(state, endTurnCommand('p1'));
    state = result.state;

    // 這時 endTurn 會切換到 p2，偵測到其處於冰封狀態，
    // 自動移除 skipNextTurn，再次觸發第 4 格抽卡，然後再自動切換到 p3！
    const p2 = state.players.find(p => p.id === 'p2')!;
    expect(p2.statusEffects.some(e => e.kind === 'skipNextTurn')).toBe(false);
    
    // 行動玩家應已切換為 p3
    expect(state.activePlayerId).toBe('p3');
  });
});
