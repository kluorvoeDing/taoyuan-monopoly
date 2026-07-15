import { describe, it, expect } from 'vitest';
import { gameReducer } from '../engine/reducer';
import { 
  startGameCommand, 
  useCardCommand,
  useAbilityCommand
} from '../engine/commands';
import { makeAiPreRollDecision, makeAiActionDecision } from '../engine/ai';

describe('桃園 Hero City 策略系統與 AI 決策測試', () => {
  const options = {
    startingCash: 20000,
    maxRounds: 30,
    aiCount: 3,
    enableQuirks: true,
    enableRaids: true
  };

  it('應正確處置角色個性主動技能使用與 CD 冷卻限制', () => {
    let result = gameReducer(null, startGameCommand(options, 'izuku_midoriya', 'test_seed'));
    let state = result.state;

    // 綠谷出久的主動能力：指定骰子點數為 1 到 6。消耗 800，CD 為 5。
    // 首先測試 CD 為 0 時可以使用
    expect(state.players[0].cooldowns['izuku_midoriya']).toBe(0);

    // 呼叫主動個性命令，設定點數為 4
    result = gameReducer(state, useAbilityCommand('p1', { diceValue: 4 }));
    state = result.state;
    expect(result.error).toBeUndefined();

    // 驗證 CD 已設為 5，且扣款了 800 現金
    const p1 = state.players[0];
    expect(p1.cooldowns['izuku_midoriya']).toBe(5);
    expect(p1.cash).toBe(20000 - 800);

    // 驗證身上有指定骰子 nextDice 效果 (值為 4)
    expect(p1.statusEffects.some(e => e.kind === 'nextDice' && e.value === 4)).toBe(true);

    // 測試在 CD 大於 0 時再次使用應報錯
    const failedResult = gameReducer(state, useAbilityCommand('p1', { diceValue: 1 }));
    expect(failedResult.error).toBeDefined(); // 個性能力冷卻中
  });

  it('應正確處理卡片使用效果與驗證 (以 site_guard 據點防線與 demolish 死柄木接觸為例)', () => {
    let result = gameReducer(null, startGameCommand(options, 'izuku_midoriya', 'test_seed'));
    let state = result.state;

    // 讓 p1 擁有第 1 格土地，並在手牌加上 site_guard
    state.tiles.find(t => t.id === 1)!.ownerId = 'p1';
    state.tiles.find(t => t.id === 1)!.level = 1;
    state.players[0].cards.push('site_guard');
    state.phase = 'action';

    // 使用據點防線：指定據點 1 進行防禦 3 輪
    result = gameReducer(state, useCardCommand('p1', 'site_guard', { targetTileId: 1 }));
    state = result.state;
    expect(result.error).toBeUndefined();

    const tile1 = state.tiles.find(t => t.id === 1)!;
    expect(tile1.statuses.guardRounds).toBe(3); // 防禦設定成功
    expect(state.players[0].cards.includes('site_guard')).toBe(false); // 卡片已被扣除

    // 讓對手 p2 (AI) 使用破壞卡「demolish」攻擊 p1 的防守地產
    state.players[1].cards.push('demolish');
    state.activePlayerId = 'p2';
    
    // 使用破壞卡
    result = gameReducer(state, useCardCommand('p2', 'demolish', { targetTileId: 1 }));
    state = result.state;
    expect(result.error).toBeUndefined();

    // 檢查防禦生效：防守回合歸 0，地產等級依然為 1 (未被降級)
    const updatedTile1 = state.tiles.find(t => t.id === 1)!;
    expect(updatedTile1.statuses.guardRounds).toBe(0);
    expect(updatedTile1.level).toBe(1);

    // p2 再次使用破壞卡「demolish」攻擊已經無防禦的地產 1
    state.players[1].cards.push('demolish');
    result = gameReducer(state, useCardCommand('p2', 'demolish', { targetTileId: 1 }));
    state = result.state;

    // 檢查地產被降級：Level 1 -> 0
    const damagedTile1 = state.tiles.find(t => t.id === 1)!;
    expect(damagedTile1.level).toBe(0);
  });

  it('AI 決策模組應能正常產生行動方案，支援現金預留與前進位移評量', () => {
    let result = gameReducer(null, startGameCommand(options, 'izuku_midoriya', 'test_seed'));
    let state = result.state;

    // 模擬 AI 玩家的回合
    state.activePlayerId = 'p2'; // AI
    state.phase = 'preRoll';
    state.players[1].cards.push('remote_dice'); // 給他一張遙控骰子卡
    
    // 前方第 2 格 (中正商圈) 是高分地產，看 AI 是否會使用遙控骰子
    state.players[1].position = 0; // 起點
    
    const preRollCommand = makeAiPreRollDecision(state, 'p2');
    expect(preRollCommand).not.toBeNull();
    expect(preRollCommand!.type).toBe('USE_CARD');
    expect((preRollCommand as any).cardId).toBe('remote_dice');
    expect((preRollCommand as any).payload.diceValue).toBe(1);

    // 模擬行動階段決策
    state.phase = 'action';
    state.players[1].cash = 12000;
    
    // AI 站在無主土地 (第 1 格)，進駐價 6000，現金 12000。
    // 進駐評估：分數 50 (不滿 100)，保留金 4500。
    // 現金 12000 > 6000 + 4500 = 10500 => AI 應決定買下。
    state.players[1].position = 1;
    
    const actionCommands = makeAiActionDecision(state, 'p2');
    expect(actionCommands.length).toBeGreaterThan(0);
    expect(actionCommands.some(cmd => cmd.type === 'BUY_CURRENT_TILE')).toBe(true);
    expect(actionCommands[actionCommands.length - 1].type).toBe('END_TURN');
  });
});
