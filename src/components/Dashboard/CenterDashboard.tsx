import React, { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import { getTileConfig, calculatePurchasePrice, calculateUpgradeCost, calculateNetWorth, calculateRent } from '../../game/engine/selectors';
import { CHARACTERS } from '../../data/characters';
import { CARDS } from '../../data/cards';
import { DISTRICTS } from '../../data/districts';
import { makeAiPreRollDecision, makeAiActionDecision, makeAiPathDecision } from '../../game/engine/ai';
import { getValidNextDirections, GRAPH_CONNECTIONS } from '../../game/engine/reducer';
import { getNodesWithinRange } from '../../game/engine/cards';
import styles from './CenterDashboard.module.css';

const getCardIcon = (cardId: string) => {
  switch (cardId) {
    case "remote_dice": return "🎯";        // 遙控骰子
    case "turtle_card": return "🐢";        // 烏龜卡
    case "roadblock": return "🚧";          // 路障
    case "stay_card": return "📍";          // 停留卡
    case "rent_free": return "🎈";          // 免稅卡
    case "rent_boost": return "📢";         // 漲價卡
    case "demolish": return "💥";           // 拆除卡
    case "tax_check": return "📊";          // 查稅卡
    case "site_guard": return "🛡️";         // 防護罩卡
    case "support_repair": return "🔧";     // 工程車卡
    case "provisional_license": return "🪪"; // 購地卡
    case "crisis_pr": return "📣";          // 人壽保險卡
    case "first_aid": return "🕊️";          // 均富卡
    case "motorcycle_card": return "🏍️";    // 機車卡
    default: return "🎴";
  }
};

const renderAvatar = (characterId: string, size: number = 32) => {
  let x = 0;
  let y = 0;
  switch (characterId) {
    case 'bill_rice': x = 0; y = 0; break;
    case 'gou_lift': x = 33.33; y = 0; break;
    case 'huang_smoke': x = 66.66; y = 0; break;
    case 'jolin_zero': x = 100; y = 0; break;
    case 'musk_bite': x = 0; y = 33.33; break;
    case 'jobs_think': x = 33.33; y = 66.66; break;
    case 'lin_mansion': x = 66.66; y = 66.66; break;
    case 'jay_turn': x = 100; y = 66.66; break;
    case 'all_might': x = 33.33; y = 33.33; break;
    case 'eraser_head': x = 66.66; y = 33.33; break;
    case 'froppy': x = 100; y = 33.33; break;
    case 'tsukuyomi': x = 0; y = 66.66; break;
    case 'chargebolt': x = 0; y = 100; break;
    case 'earphone_jack': x = 33.33; y = 100; break;
    case 'shigaraki': x = 66.66; y = 100; break;
    case 'dabi': x = 100; y = 100; break;
  }
  return (
    <div 
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '50%',
        backgroundImage: `url(/avatars.jpg)`,
        backgroundSize: '400% 400%',
        backgroundPosition: `${x}% ${y}%`,
        border: '2px solid var(--border-color)',
        flexShrink: 0,
        boxSizing: 'border-box'
      }} 
    />
  );
};

const formatLogMessage = (msg: string) => {
  let cleanMsg = msg;
  cleanMsg = cleanMsg
    .replace(/經過桃園車站英雄總部，獲得巡邏經費 2,000！/, "經過起點 +2,000")
    .replace(/經過英雄總部，獲得巡邏經費 2,000！/, "經過起點 +2,000")
    .replace(/擲出了 (\d+) 點。/, "🎲 擲出 $1 點")
    .replace(/進入第 (\d+) 回合 \/ 上限 (\d+) 回合/, "🏁 第 $1 / $2 回合")
    .replace(/支付費用 ([\d,]+)/g, "支付 -$1")
    .replace(/獲得 ([\d,]+)/g, "獲得 +$1")
    .replace(/桃園機場 交通費/g, "機場費")
    .replace(/國際英雄支援站 交通費/g, "機場費")
    .replace(/快速支援通道 交通費/g, "捷運費")
    .replace(/捷運支援站 交通費/g, "捷運費")
    .replace(/醫療緊急支援站 交通費/g, "醫療費")
    .replace(/機動支援轉轉站 交通費/g, "高鐵費")
    .replace(/機動支援轉運站 交通費/g, "高鐵費");

  const charColors: Record<string, string> = {
    '綠谷出久': 'var(--player-1, #16A34A)',
    '爆豪勝己': 'var(--player-2, #F59E0B)',
    '轟焦凍': 'var(--player-3, #2563EB)',
    '麗日御茶子': 'var(--player-4, #EC4899)',
    '飯田天哉': '#2563EB',
    '奮進人': '#EF4444',
    '切島銳兒郎': '#B91C1C',
    '八百萬百': '#8B5CF6',
    '歐爾麥特': '#D97706',
    '相澤消太': '#4B5563',
    '蛙吹梅雨': '#059669',
    '常闇踏陰': '#4338CA',
    '上鳴電氣': '#EAB308',
    '耳郎響香': '#DB2777',
    '死柄木弔': '#0284C7',
    '茶毘': '#1E1B4B'
  };

  const tokens = cleanMsg.split(/(綠谷出久|爆豪勝己|轟焦凍|麗日御茶子|飯田天哉|奮進人|切島銳兒郎|八百萬百|歐爾麥特|相澤消太|蛙吹梅雨|常闇踏陰|上鳴電氣|耳郎響香|死柄木弔|茶毘|[\+\-][\d,]+)/);
  return tokens.map((token, i) => {
    if (charColors[token]) {
      return <strong key={i} style={{ color: charColors[token] }}>{token}</strong>;
    }
    if (token.startsWith('+')) {
      return <span key={i} style={{ color: '#16A34A', fontWeight: 'bold' }}>{token}</span>;
    }
    if (token.startsWith('-')) {
      return <span key={i} style={{ color: '#DC2626', fontWeight: 'bold' }}>{token}</span>;
    }
    return token;
  });
};

export const CenterDashboard: React.FC = () => {
  const state = useGameStore(store => store.state);
  const dispatch = useGameStore(store => store.dispatch);
  
  const targetSelection = useGameStore(store => store.targetSelection);
  const setTargetSelection = useGameStore(store => store.setTargetSelection);
  
  const exportState = useGameStore(store => store.exportState);
  const importState = useGameStore(store => store.importState);
  const resetGame = useGameStore(store => store.resetGame);

  const [autoPlayAi, setAutoPlayAi] = useState<boolean>(true);
  const [showJsonModal, setShowJsonModal] = useState<boolean>(false);
  const [importJsonText, setImportJsonText] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  const [logsCollapsed, setLogsCollapsed] = useState<boolean>(true);
  const [showHandCards, setShowHandCards] = useState<boolean>(false);
  const [selectedProfilePlayerId, setSelectedProfilePlayerId] = useState<string | null>(null);

  // 即時量測 HUD 高度寫入 --hud-height，讓棋盤畫布動態保留頂部空間（折疊情報列絕不遮擋棋盤）。
  // 用 callback ref：HUD 在 state 就緒後才掛載，掛載當下即建立 ResizeObserver。
  const hudObserverRef = useRef<ResizeObserver | null>(null);
  const hudRef = React.useCallback((el: HTMLDivElement | null) => {
    hudObserverRef.current?.disconnect();
    hudObserverRef.current = null;
    if (!el) return;
    const syncHudHeight = () => {
      // HUD 為 fixed top:12px，因此保留高度 = 12px + 面板實際高度
      document.documentElement.style.setProperty('--hud-height', `${12 + el.offsetHeight}px`);
    };
    syncHudHeight();
    const observer = new ResizeObserver(syncHudHeight);
    observer.observe(el);
    hudObserverRef.current = observer;
  }, []);

  // 數位骰子滾動動畫狀態
  const [localDiceRolling, setLocalDiceRolling] = useState(false);
  const [currentDiceFace, setCurrentDiceFace] = useState(1);

  const triggerDiceRoll = (callback: () => void) => {
    setLocalDiceRolling(true);
    let count = 0;
    const interval = setInterval(() => {
      setCurrentDiceFace(Math.floor(Math.random() * 6) + 1);
      count++;
      if (count > 10) { // 滾動 500 毫秒
        clearInterval(interval);
        setLocalDiceRolling(false);
        callback();
      }
    }, 50);
  };

  if (!state) return null;

  const activePlayer = state.players.find(p => p.id === state.activePlayerId)!;
  const isHumanTurn = activePlayer.control === 'human';

  // AI 自動行動時鐘
  useEffect(() => {
    if (state.mode !== 'playing') return;
    if (activePlayer.control !== 'ai') return;
    if (!autoPlayAi) return;
    if (localDiceRolling) return; // 動畫中暫停時鐘

    const timer = setTimeout(() => {
      if (state.phase === 'preRoll') {
        const cmd = makeAiPreRollDecision(state, activePlayer.id);
        if (cmd) {
          dispatch(cmd);
        } else {
          triggerDiceRoll(() => dispatch({ type: 'ROLL_DICE', playerId: activePlayer.id }));
        }
      } else if (state.phase === 'choosingPath') {
        const cmd = makeAiPathDecision(state, activePlayer.id);
        if (cmd) {
          dispatch(cmd);
        }
      } else if (state.phase === 'action') {
        const cmds = makeAiActionDecision(state, activePlayer.id);
        if (cmds.length > 0) {
          dispatch(cmds[0]);
        }
      }
    }, 1000); // 1秒延遲

    return () => clearTimeout(timer);
  }, [state, autoPlayAi, activePlayer.id, dispatch, localDiceRolling]);

  // 手動執行下一步 AI 行動
  const handleAiStep = () => {
    if (localDiceRolling) return;
    if (state.phase === 'preRoll') {
      const cmd = makeAiPreRollDecision(state, activePlayer.id);
      if (cmd) {
        dispatch(cmd);
      } else {
        triggerDiceRoll(() => dispatch({ type: 'ROLL_DICE', playerId: activePlayer.id }));
      }
    } else if (state.phase === 'choosingPath') {
      const cmd = makeAiPathDecision(state, activePlayer.id);
      if (cmd) {
        dispatch(cmd);
      }
    } else if (state.phase === 'action') {
      const cmds = makeAiActionDecision(state, activePlayer.id);
      if (cmds.length > 0) {
        dispatch(cmds[0]);
      }
    }
  };

  // 取得角色設定
  const getCharConfig = (charId: string) => {
    return CHARACTERS.find(c => c.id === charId)!;
  };

  // 玩家被動效果與角色頭像顏色
  const getPlayerColor = (playerId: string) => {
    if (playerId === 'p1') return 'var(--player-1)';
    if (playerId === 'p2') return 'var(--player-2)';
    if (playerId === 'p3') return 'var(--player-3)';
    return 'var(--player-4)';
  };

  // ================= 點擊卡片觸發目標選擇 =================
  const handleCardClick = (cardId: string) => {
    if (!isHumanTurn || state.phase === 'resolvingMove') return;
    
    const card = CARDS.find(c => c.id === cardId)!;
    
    // 檢查卡片使用時機
    if (card.timing === '擲骰前' && state.phase !== 'preRoll') {
      setErrorMessage('該裝備卡只能在「擲骰前」使用！');
      return;
    }
    if (card.timing === '行動階段' && state.phase !== 'action') {
      setErrorMessage('該裝備卡只能在「行動階段」使用！');
      return;
    }

    // 依卡片特性決定是否需要選擇目標
    if (cardId === 'remote_dice') {
      // 遙控骰子：指定 1~6 步數
      setTargetSelection({
        type: 'value',
        source: 'card',
        itemId: cardId,
        validIds: [1, 2, 3, 4, 5, 6],
        prompt: '請選擇遙控骰子指定的移動步數 (1-6 點)'
      });
    } else if (cardId === 'turtle_card') {
      // 烏龜卡：指定任一玩家
      const opponents = state.players.filter(p => p.id !== activePlayer.id && !p.isBankrupt).map(p => p.id);
      setTargetSelection({
        type: 'player',
        source: 'card',
        itemId: cardId,
        validIds: opponents,
        prompt: '請選擇一名對手施加烏龜限制 (3 回合每次移動固定為 1 格)'
      });
    } else if (cardId === 'roadblock') {
      // 路障：指定周圍 8 格內任一格子
      const validTiles = getNodesWithinRange(activePlayer.position, 8, GRAPH_CONNECTIONS);
      setTargetSelection({
        type: 'tile',
        source: 'card',
        itemId: cardId,
        validIds: validTiles,
        prompt: '請點擊地圖上周圍 8 格範圍內的任意格子以放置路障'
      });
    } else if (cardId === 'rent_boost') {
      // 漲價卡：指定己方據點
      const ownTiles = state.tiles
        .filter(t => t.ownerId === activePlayer.id && getTileConfig(t.id).type === 'land')
        .map(t => t.id);
      if (ownTiles.length === 0) {
        setErrorMessage('你目前沒有任何名下據點可使用漲價卡！');
        return;
      }
      setTargetSelection({
        type: 'tile',
        source: 'card',
        itemId: cardId,
        validIds: ownTiles,
        prompt: '請點擊地圖上「自己的據點」以設置過路租金加倍 ×2.0'
      });
    } else if (cardId === 'demolish') {
      // 拆除卡：指定對手地產據點
      const opponentTiles = state.tiles
        .filter(t => t.ownerId && t.ownerId !== activePlayer.id && getTileConfig(t.id).type === 'land')
        .map(t => t.id);
      if (opponentTiles.length === 0) {
        setErrorMessage('地圖上沒有可拆除降級的對手據點！');
        return;
      }
      setTargetSelection({
        type: 'tile',
        source: 'card',
        itemId: cardId,
        validIds: opponentTiles,
        prompt: '請點擊地圖上「對手的據點」以拆除其建築 1 級'
      });
    } else if (cardId === 'site_guard') {
      // 防護罩卡：指定自己土地
      const ownTiles = state.tiles
        .filter(t => t.ownerId === activePlayer.id && getTileConfig(t.id).type === 'land')
        .map(t => t.id);
      if (ownTiles.length === 0) {
        setErrorMessage('你目前沒有任何名下據點可設置防護罩！');
        return;
      }
      setTargetSelection({
        type: 'tile',
        source: 'card',
        itemId: cardId,
        validIds: ownTiles,
        prompt: '請點擊地圖上「自己的據點」設置 3 回合的防護罩'
      });
    } else if (cardId === 'support_repair') {
      // 工程車卡：指定地圖上任意格子 (清除路障或修復)
      const allTileIds = state.tiles.map(t => t.id);
      setTargetSelection({
        type: 'tile',
        source: 'card',
        itemId: cardId,
        validIds: allTileIds,
        prompt: '請點擊地圖上任一格子以清除其路障或修復其狀態'
      });
    } else if (cardId === 'tax_check') {
      // 查稅卡：指定對手玩家
      const opponents = state.players.filter(p => p.id !== activePlayer.id && !p.isBankrupt).map(p => p.id);
      setTargetSelection({
        type: 'player',
        source: 'card',
        itemId: cardId,
        validIds: opponents,
        prompt: '請選擇一名對手特工實施查稅 (索取其 8% 現金，上限 5000)'
      });
    } else {
      // 其他卡片：無須目標，直接使用
      dispatch({
        type: 'USE_CARD',
        playerId: activePlayer.id,
        cardId
      });
    }
  };

  // ================= 點擊主動個性觸發目標選擇 =================
  const handleAbilityClick = () => {
    if (!isHumanTurn) return;
    
    // 檢查 CD 與費用
    const char = getCharConfig(activePlayer.characterId);
    if (activePlayer.cooldowns[char.id] > 0) {
      setErrorMessage(`個性能力【${char.abilityName}】尚在冷卻中！`);
      return;
    }
    const cost = char.id === 'bill_rice' ? 800 : (char.id === 'musk_bite' ? 1200 : (char.id === 'zero_gravity' ? 1000 : (char.id === 'blast_engine' ? 1500 : (char.id === 'freeze_line' ? 2000 : (char.id === 'capture_cloth' ? 1800 : (char.id === 'creative_power' ? 1500 : 2500))))));
    if (activePlayer.cash < cost) {
      setErrorMessage(`支援預算不足！釋放個性需要消耗 $${cost}。`);
      return;
    }

    if (char.id === 'bill_rice') {
      // 綠谷出久：選擇 1~6 點數
      setTargetSelection({
        type: 'value',
        source: 'ability',
        validIds: [1, 2, 3, 4, 5, 6],
        prompt: '請選擇下一次擲骰移動的指定點數 (1 - 6)'
      });
    } else if (char.id === 'musk_bite') {
      // 飯田天哉：選擇自己名下的任一據點直接傳送
      const ownTiles = state.tiles
        .filter(t => t.ownerId === activePlayer.id && getTileConfig(t.id).type === 'land')
        .map(t => t.id);
      if (ownTiles.length === 0) {
        setErrorMessage('你目前名下沒有任何據點可發動「引擎互聯」傳送！');
        return;
      }
      setTargetSelection({
        type: 'tile',
        source: 'ability',
        validIds: ownTiles,
        prompt: '請選擇你名下的任一「據點」作為傳送點，直接超頻移動抵達'
      });
    } else if (char.id === 'blast_engine') {
      // 爆豪勝己：指定自己名下的土地，下一次擴建直接升兩級
      const ownTiles = state.tiles
        .filter(t => t.ownerId === activePlayer.id && getTileConfig(t.id).type === 'land' && t.level < 4)
        .map(t => t.id);
      if (ownTiles.length === 0) {
        setErrorMessage('你名下沒有小於 Level 4 的據點可使用「爆破施工」！');
        return;
      }
      setTargetSelection({
        type: 'tile',
        source: 'ability',
        validIds: ownTiles,
        prompt: '請選擇自己名下的任一「未滿級據點」施加爆破施工加持'
      });
    } else if (char.id === 'freeze_line' || char.id === 'capture_cloth' || char.id === 'all_for_one') {
      // 轟焦凍 / 相澤消太 / AFO：指定對手玩家
      const opponents = state.players.filter(p => p.id !== activePlayer.id && !p.isBankrupt).map(p => p.id);
      setTargetSelection({
        type: 'player',
        source: 'ability',
        validIds: opponents,
        prompt: `請選擇一名競爭對手發動【${char.abilityName}】`
      });
    } else {
      // 麗日御茶子 / 八百萬百：無須目標，直接施放
      dispatch({
        type: 'USE_ABILITY',
        playerId: activePlayer.id
      });
    }
  };

  // ================= 玩家/數值目標確認選擇 =================
  const handlePlayerTargetSelect = (targetPlayerId: string) => {
    if (!targetSelection) return;
    
    if (targetSelection.source === 'card') {
      dispatch({
        type: 'USE_CARD',
        playerId: activePlayer.id,
        cardId: targetSelection.itemId!,
        payload: { targetPlayerId }
      });
    } else {
      dispatch({
        type: 'USE_ABILITY',
        playerId: activePlayer.id,
        payload: { targetPlayerId }
      });
    }
    setTargetSelection(null);
  };

  const handleValueTargetSelect = (val: number) => {
    if (!targetSelection) return;
    if (targetSelection.source === 'card') {
      dispatch({
        type: 'USE_CARD',
        playerId: activePlayer.id,
        cardId: targetSelection.itemId!,
        payload: { diceValue: val }
      });
    } else {
      dispatch({
        type: 'USE_ABILITY',
        playerId: activePlayer.id,
        payload: { diceValue: val }
      });
    }
    setTargetSelection(null);
  };

  // ================= 據點買賣擴建 =================
  const currentTileConfig = getTileConfig(activePlayer.position);
  const currentTileState = state.tiles.find(t => t.id === activePlayer.position)!;
  
  const canBuy = isHumanTurn && 
                 state.phase === 'action' && 
                 currentTileConfig.type === 'land' && 
                 !currentTileState.ownerId && 
                 !activePlayer.landActionUsed && 
                 activePlayer.cash >= calculatePurchasePrice(state, activePlayer, activePlayer.position);
                 
  const canUpgrade = isHumanTurn && 
                     state.phase === 'action' && 
                     currentTileConfig.type === 'land' && 
                     currentTileState.ownerId === activePlayer.id && 
                     currentTileState.level < 4 && 
                     !activePlayer.landActionUsed && 
                     activePlayer.cash >= calculateUpgradeCost(state, activePlayer.id, activePlayer.position);

  // ================= 檔案存檔導入導出 =================
  const handleExportText = () => {
    const text = exportState();
    setImportJsonText(text);
    setShowJsonModal(true);
  };

  const handleImportTextSubmit = () => {
    const res = importState(importJsonText);
    if (res.success) {
      setShowJsonModal(false);
    } else {
      setErrorMessage(res.error || '存檔讀取失敗！');
    }
  };

  const getLastDiceRollFromLogs = (): number | null => {
    if (!state || !state.eventLog) return null;
    for (let i = 0; i < state.eventLog.length; i++) {
      const log = state.eventLog[i];
      const match = log.message.match(/擲出了 (\d+) 點/);
      if (match) {
        return parseInt(match[1], 10);
      }
    }
    return null;
  };

  const validDirs = state ? getValidNextDirections(activePlayer.position, activePlayer.lastPosition, GRAPH_CONNECTIONS) : [];
  const isFork = validDirs.length > 1;
  const isHeadingSelected = activePlayer.nextHeadingNode !== undefined;
  const rollDisabled = isHumanTurn && isFork && !isHeadingSelected;

  const latestLog = state.eventLog[0]?.message || '等待指令通訊中...';
  const profilePlayer = selectedProfilePlayerId ? state.players.find(p => p.id === selectedProfilePlayerId) : null;

  return (
    <>
      {/* 頂部常駐 HUD 行動指揮面板 */}
      <div className={styles.hudContainer} ref={hudRef}>
        {/* 主要 HUD 單排呈現 */}
        <div className={styles.mainRow}>
          {/* 1. 左側：4 人玩家狀態橫排看板 */}
          <div className={styles.playersRow}>
            {state.players.map(p => {
              const char = getCharConfig(p.characterId);
              const isActive = p.id === state.activePlayerId;

              return (
                <div 
                  key={p.id} 
                  className={`${styles.playerCard} ${isActive ? styles.playerCardActive : ''} ${p.isBankrupt ? styles.playerCardBankrupt : ''}`}
                  style={{ 
                    borderLeft: `3px solid ${getPlayerColor(p.id)}`,
                    borderColor: isActive ? getPlayerColor(p.id) : undefined
                  }}
                  onClick={() => setSelectedProfilePlayerId(p.id)}
                  title={`點擊展開【${char.name}】詳細特工報告`}
                >
                  {/* 角色頭像 */}
                  {renderAvatar(p.characterId, 22)}

                  {/* 玩家金流與狀態 */}
                  <div className={styles.playerInfo}>
                    <span className={styles.playerName} title={char.name}>
                      {char.name}
                    </span>
                    {p.isBankrupt ? (
                      <span style={{ fontSize: '8px', color: '#ef4444', fontWeight: 'bold' }}>破產</span>
                    ) : (
                      <span className={styles.playerCash}>
                        ${p.cash.toLocaleString("zh-Hant-TW")}
                      </span>
                    )}
                    {/* CD冷卻指示器 */}
                    {!p.isBankrupt && state.options.enableQuirks && p.cooldowns[char.id] > 0 && (
                      <span className={styles.playerCD}>CD: {p.cooldowns[char.id]}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 2. 中間：主動操作指揮中心 */}
          <div className={styles.actionCenter}>
            {errorMessage && (
              <div style={{
                position: 'absolute',
                top: '70px',
                left: '50%',
                transform: 'translateX(-50%)',
                background: '#fee2e2',
                border: '1px solid #ef4444',
                color: '#b91c1c',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '9.5px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 4px 12px rgba(239, 68, 68, 0.15)',
                zIndex: 200
              }}>
                <span>⚠️ {errorMessage}</span>
                <button 
                  style={{ background: 'transparent', border: 'none', color: '#b91c1c', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', padding: 0 }} 
                  onClick={() => setErrorMessage(null)}
                >
                  ×
                </button>
              </div>
            )}

            {state.mode === 'finished' ? (
              <div style={{ textAlign: 'center', color: '#64748b', fontSize: '10px', fontWeight: 'bold' }}>
                🎉 戰決已分勝負！請點擊右側「重置」開啟新局。
              </div>
            ) : !isHumanTurn ? (
              /* AI 決策進度提示 */
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ color: 'var(--primary, #f97316)', fontWeight: 800, fontSize: '9.5px' }}>
                  🤖 AI 【{getCharConfig(activePlayer.characterId).name}】決策中...
                </span>
                <label className={styles.aiSwitch}>
                  <input 
                    type="checkbox" 
                    checked={autoPlayAi} 
                    onChange={e => setAutoPlayAi(e.target.checked)} 
                  />
                  自動演化
                </label>
                {!autoPlayAi && (
                  <button className={styles.rollButton} onClick={handleAiStep}>
                    單步
                  </button>
                )}
              </div>
            ) : targetSelection ? (
              /* 行動目標鎖定引導 */
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className={styles.promptBubble}>{targetSelection.prompt}</span>
                <div className={styles.actionButtons}>
                  {targetSelection.type === 'player' && targetSelection.validIds.map(pid => (
                    <button 
                      key={pid} 
                      className={styles.btnAction}
                      style={{ borderColor: getPlayerColor(pid), color: getPlayerColor(pid) }}
                      onClick={() => handlePlayerTargetSelect(pid)}
                    >
                      {getCharConfig(state.players.find(pl => pl.id === pid)!.characterId).name}
                    </button>
                  ))}
                  
                  {targetSelection.type === 'value' && targetSelection.validIds.map(val => (
                    <button 
                      key={val} 
                      className={styles.btnAction}
                      onClick={() => handleValueTargetSelect(val)}
                    >
                      {val}點
                    </button>
                  ))}

                  <button className={`${styles.btnAction} ${styles.btnActionPrimary}`} onClick={() => setTargetSelection(null)}>
                    取消
                  </button>
                </div>
              </div>
            ) : (
              /* 玩家回合行動指令集 */
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {/* 骰子與擲骰 */}
                <div className={styles.diceArea}>
                  <div className={`${styles.diceDisplay} ${localDiceRolling ? styles.diceRolling : ''}`}>
                    {localDiceRolling ? currentDiceFace : (getLastDiceRollFromLogs() || '?')}
                  </div>
                  {state.phase === 'preRoll' ? (
                    <>
                      <button 
                        className={styles.rollButton}
                        disabled={rollDisabled}
                        onClick={() => triggerDiceRoll(() => dispatch({ type: 'ROLL_DICE', playerId: activePlayer.id }))}
                        title={rollDisabled ? "請先在地圖上選擇前進方向" : "擲骰前進"}
                      >
                        🎲 擲骰移動
                      </button>
                      {isFork && !isHeadingSelected && (
                        <div style={{
                          position: 'absolute',
                          top: '-42px',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          background: '#fffbeb',
                          border: '1.5px solid #f59e0b',
                          color: '#b45309',
                          padding: '6px 12px',
                          borderRadius: '8px',
                          fontSize: '10px',
                          fontWeight: 'bold',
                          boxShadow: '0 4px 10px rgba(245, 158, 11, 0.15)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          whiteSpace: 'nowrap',
                          zIndex: 100
                        }}>
                          <span>🧭 請先點擊地圖上亮綠色的相鄰街區以選擇前進方向。</span>
                        </div>
                      )}
                      {isFork && isHeadingSelected && (
                        <div style={{
                          position: 'absolute',
                          top: '-42px',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          background: '#f0fdf4',
                          border: '1.5px solid #10b981',
                          color: '#047857',
                          padding: '6px 12px',
                          borderRadius: '8px',
                          fontSize: '10px',
                          fontWeight: 'bold',
                          boxShadow: '0 4px 10px rgba(16, 185, 129, 0.15)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          whiteSpace: 'nowrap',
                          zIndex: 100
                        }}>
                          <span>🧭 已鎖定方向：往【{getTileConfig(activePlayer.nextHeadingNode!).name}】。可再次點擊地圖切換。</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <button 
                      className={styles.rollButton}
                      disabled={state.phase !== 'action'}
                      onClick={() => dispatch({ type: 'END_TURN', playerId: activePlayer.id })}
                    >
                      結束回合
                    </button>
                  )}
                </div>

                {/* 主要主動操作集 */}
                <div className={styles.actionButtons}>
                  {state.options.enableQuirks && (
                    <button 
                      className={styles.btnAction}
                      disabled={activePlayer.cooldowns[getCharConfig(activePlayer.characterId).id] > 0 || state.phase !== 'action'}
                      onClick={handleAbilityClick}
                      title="釋放角色專屬異能"
                    >
                      ⚡ 能力
                    </button>
                  )}
                  
                  <button 
                    className={styles.btnAction}
                    disabled={!canBuy}
                    onClick={() => dispatch({ type: 'BUY_CURRENT_TILE', playerId: activePlayer.id })}
                  >
                    🏢 購地
                  </button>

                  <button 
                    className={styles.btnAction}
                    disabled={!canUpgrade}
                    onClick={() => dispatch({ type: 'UPGRADE_CURRENT_TILE', playerId: activePlayer.id })}
                  >
                    🧱 擴建
                  </button>

                  {/* 裝備手牌按鈕 */}
                  <button 
                    className={styles.btnAction}
                    disabled={activePlayer.cards.length === 0}
                    onClick={() => setShowHandCards(!showHandCards)}
                    style={{ color: showHandCards ? 'var(--primary, #f97316)' : undefined, borderColor: showHandCards ? 'var(--primary, #f97316)' : undefined }}
                  >
                    🎴 手牌 ({activePlayer.cards.length})
                  </button>
                </div>

                {/* 手牌浮動列表抽屜 */}
                {showHandCards && activePlayer.cards.length > 0 && (
                  <div className={styles.floatingHand}>
                    {activePlayer.cards.map((cardId, index) => {
                      const card = CARDS.find(c => c.id === cardId)!;
                      const timingValid = (card.timing === '擲骰前' && state.phase === 'preRoll') ||
                                           (card.timing === '行動階段' && state.phase === 'action');
                      
                      const cardBorderColor = card.timing === '擲骰前' 
                        ? '#f97316' 
                        : card.timing === '行動階段' 
                          ? '#3b82f6' 
                          : '#8b5cf6';
                      return (
                        <div 
                          key={index}
                          className={`${styles.cardItem} ${!timingValid ? styles.cardItemDisabled : ''}`}
                          style={{ borderColor: timingValid ? cardBorderColor : undefined }}
                          onClick={() => {
                            if (timingValid) {
                              handleCardClick(cardId);
                              setShowHandCards(false);
                            }
                          }}
                          title={`${card.description}\n(使用時機: ${card.timing})`}
                        >
                          <span className={styles.cardName}>
                            {getCardIcon(cardId)} {card.name}
                          </span>
                          <span className={styles.cardDesc}>{card.description}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 3. 右側：存檔與系統功能按鈕 */}
          <div className={styles.utilityArea}>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              marginRight: '8px',
              fontSize: '9px',
              lineHeight: '1.2',
              color: '#475569',
              fontWeight: 500
            }}>
              <div>回合: <strong style={{ color: '#0f172a' }}>{state.round}</strong>/{state.maxRounds}</div>
              <div style={{ color: (state.priceIndex || 1.0) > 1.0 ? '#ea580c' : '#475569' }}>
                物價: <strong>×{(state.priceIndex || 1.0).toFixed(2)}</strong>
              </div>
            </div>
            <button className={styles.btnUtility} onClick={handleExportText} title="複製 JSON 存檔文字">
              💾 導出
            </button>
            
            <button className={styles.btnUtility} onClick={() => { setShowJsonModal(true); setErrorMessage(null); }} title="還原 JSON 存檔">
              🔌 導入
            </button>

            <button 
              className={styles.btnUtility} 
              style={{ color: '#ef4444' }} 
              onClick={() => { if(confirm('確定要清除存檔並重置遊戲嗎？')) resetGame(); }}
              title="重開新局"
            >
              🔄 重置
            </button>
          </div>
        </div>

        {/* 4. 底側：整合單排即時事件通訊 Ticker */}
        <div className={styles.tickerRow} onClick={() => setLogsCollapsed(!logsCollapsed)}>
          <div className={styles.tickerContent}>
            <span className={styles.tickerLabel}>📢 最新情報:</span>
            <span className={styles.tickerText}>{formatLogMessage(latestLog)}</span>
          </div>
          <span className={styles.tickerArrow}>{logsCollapsed ? '展開 ▼' : '收合 ▲'}</span>
        </div>

        {/* 5. 下拉展開的霧面玻璃即時事件通訊 */}
        {!logsCollapsed && (
          <div className={styles.hudLogsDropdown}>
            {state.eventLog.length === 0 ? (
              <span style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '11px' }}>等待異能對決通訊訊號...</span>
            ) : (
              state.eventLog.slice(0, 20).map(log => (
                <div key={log.id} className={styles.dropdownLogEntry}>
                  <span className={styles.dropdownLogTime}>[{log.timestamp}]</span>
                  <span>{formatLogMessage(log.message)}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* JSON 存檔導入導出 Modal */}
      {showJsonModal && (
        <div className={styles.modalOverlay} onClick={() => setShowJsonModal(false)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>存檔傳輸協定</h3>
            <p style={{ fontSize: '10px', color: '#64748b', marginBottom: '8px', marginTop: 0 }}>
              您可以複製下方文字做為存檔，或貼上之前的 JSON 存檔以還原對局狀態：
            </p>
            <textarea
              className={styles.modalTextarea}
              value={importJsonText}
              onChange={e => setImportJsonText(e.target.value)}
              placeholder="請在此貼上 JSON 格式的存檔文字..."
            />
            {errorMessage && <p className={styles.errorText}>⚠️ {errorMessage}</p>}
            <div className={styles.modalButtons}>
              <button className={styles.modalBtn} onClick={() => { setShowJsonModal(false); setErrorMessage(null); }}>
                關閉
              </button>
              <button className={`${styles.modalBtn} ${styles.modalBtnPrimary}`} onClick={handleImportTextSubmit}>
                寫入導入
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 側邊欄詳細看板 Drawer Overlay */}
      {selectedProfilePlayerId && profilePlayer && (
        <div className={styles.sidebarOverlay} onClick={() => setSelectedProfilePlayerId(null)}>
          <div 
            className={`${styles.sidebarDrawer} ${selectedProfilePlayerId ? styles.sidebarDrawerOpen : ''}`}
            onClick={e => e.stopPropagation()}
          >
            <div className={styles.sidebarHeader}>
              <span className={styles.sidebarTitle}>
                🏆 戰略特工詳報
              </span>
              <button className={styles.sidebarCloseBtn} onClick={() => setSelectedProfilePlayerId(null)}>
                ✕
              </button>
            </div>
            
            <div className={styles.sidebarContent}>
              {/* Profile Card Section */}
              <div className={styles.profileSection} style={{ borderLeft: `4px solid ${getPlayerColor(profilePlayer.id)}` }}>
                {renderAvatar(profilePlayer.characterId, 32)}
                <div className={styles.profileText}>
                  <span className={styles.profileCharName}>{getCharConfig(profilePlayer.characterId).name}</span>
                  <span className={styles.profileControl}>
                    特工身分：{profilePlayer.control === 'human' ? '👤 人類玩家' : '🤖 AI 演化體'}
                  </span>
                </div>
              </div>

              {/* Asset & Valuation Section */}
              <div>
                <div className={styles.sidebarSubTitle} style={{ borderLeftColor: getPlayerColor(profilePlayer.id) }}>資產價值估算</div>
                <div className={styles.statsList}>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>當前現金</span>
                    <span className={styles.statValue} style={{ color: '#16a34a' }}>
                      ${profilePlayer.cash.toLocaleString("zh-Hant-TW")}
                    </span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>總資產淨值</span>
                    <span className={styles.statValue}>
                      ${calculateNetWorth(state, profilePlayer.id).toLocaleString("zh-Hant-TW")}
                    </span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>個性天賦</span>
                    <span className={styles.statValue} style={{ color: getPlayerColor(profilePlayer.id), fontWeight: 'bold' }}>
                      {getCharConfig(profilePlayer.characterId).quirk}
                    </span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>天賦技能</span>
                    <span className={styles.statValue} style={{ color: '#f59e0b' }}>
                      {getCharConfig(profilePlayer.characterId).abilityName}
                    </span>
                  </div>
                  <div className={styles.statItem} style={{ gridColumn: 'span 2', flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                    <span className={styles.statLabel}>天賦細節說明</span>
                    <span className={styles.statValue} style={{ fontSize: '10px', color: '#64748b', lineHeight: '1.4', textAlign: 'left', wordBreak: 'break-all' }}>
                      {getCharConfig(profilePlayer.characterId).abilityText}
                    </span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>天賦 CD 狀態</span>
                    <span className={styles.statValue} style={{ color: profilePlayer.cooldowns[getCharConfig(profilePlayer.characterId).id] > 0 ? '#ef4444' : '#10b981' }}>
                      {profilePlayer.cooldowns[getCharConfig(profilePlayer.characterId).id] > 0 ? `${profilePlayer.cooldowns[getCharConfig(profilePlayer.characterId).id]} 回合` : '冷卻完畢 (READY)'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Properties Section */}
              <div>
                <div className={styles.sidebarSubTitle} style={{ borderLeftColor: getPlayerColor(profilePlayer.id) }}>控制據點 ({state.tiles.filter(t => t.ownerId === profilePlayer.id).length})</div>
                {state.tiles.filter(t => t.ownerId === profilePlayer.id).length === 0 ? (
                  <p style={{ fontSize: '9px', color: '#94a3b8', margin: 0 }}>目前未控制任何中繼站或據點。</p>
                ) : (
                  <div className={styles.propertiesList}>
                    {state.tiles.filter(t => t.ownerId === profilePlayer.id).map(tile => {
                      const tConfig = getTileConfig(tile.id);
                      const zoneCol = tConfig.zone ? DISTRICTS[tConfig.zone]?.color : '#cbd5e1';
                      const dummyPayerId = state.players.find(p => p.id !== profilePlayer.id)?.id || 'p1';
                      const rentVal = calculateRent(state, tile.id, dummyPayerId, profilePlayer.id).rent;
                      return (
                        <div key={tile.id} className={styles.propertyCard}>
                          <div className={styles.propertyHeader}>
                            <span className={styles.propertyColorBar} style={{ background: zoneCol }} />
                            <span className={styles.propertyName} title={tConfig.name}>{tConfig.name}</span>
                          </div>
                          <span className={styles.propertyLevel}>
                            等級: L{tile.level} (租金: ${rentVal.toLocaleString("zh-Hant-TW")})
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Status Effects Section */}
              <div>
                <div className={styles.sidebarSubTitle} style={{ borderLeftColor: getPlayerColor(profilePlayer.id) }}>主動增益/減益狀態</div>
                {profilePlayer.statusEffects.length === 0 ? (
                  <p style={{ fontSize: '9px', color: '#94a3b8', margin: 0 }}>無任何附加狀態效果。</p>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {profilePlayer.statusEffects.map((effect, idx) => (
                      <span 
                        key={idx} 
                        style={{
                          fontSize: '8px',
                          border: '1.5px solid #cbd5e1',
                          borderRadius: '4px',
                          padding: '2px 6px',
                          background: '#f8fafc',
                          color: '#475569',
                          fontWeight: 'bold'
                        }}
                      >
                        🧬 {effect.name} ({effect.duration}t)
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default CenterDashboard;
