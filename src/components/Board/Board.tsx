import React, { useCallback, useState, useEffect, useRef } from 'react';
import { useGameStore } from '../../store/gameStore';
import { Tile } from './Tile';
import { CenterDashboard } from '../Dashboard/CenterDashboard';
import { GRAPH_CONNECTIONS, getValidNextDirections } from '../../game/engine/reducer';
import styles from './Board.module.css';

// 56 個地圖據點的絕對百分比座標（風車星圖：外環四邊 + 四條旋臂捲入中央樞紐）
// 由 scripts/board-layout.mjs 產生並驗證：任兩格零重疊、連線不穿過非端點格子。
// 調整佈局請改該腳本重新產生，勿直接手改數值。
const NODE_COORDINATES: Record<number, { x: number; y: number }> = {
  // 底邊（左→右）
  47: { x: 4.38, y: 92.22 },
  51: { x: 11.98, y: 92.22 },
  0: { x: 19.58, y: 92.22 },
  1: { x: 27.19, y: 92.22 },
  2: { x: 34.79, y: 92.22 },
  3: { x: 42.39, y: 92.22 },
  4: { x: 50, y: 92.22 },
  5: { x: 57.61, y: 92.22 },
  9: { x: 65.21, y: 92.22 },
  10: { x: 72.81, y: 92.22 },
  11: { x: 80.42, y: 92.22 },
  12: { x: 88.02, y: 92.22 },
  13: { x: 95.63, y: 92.22 },

  // 右邊（下→上，之字交錯）
  14: { x: 89.13, y: 77.78 },
  15: { x: 95.63, y: 66.11 },
  16: { x: 89.13, y: 54.44 },
  17: { x: 95.63, y: 42.78 },
  18: { x: 89.13, y: 31.11 },
  22: { x: 95.63, y: 19.44 },
  24: { x: 89.13, y: 7.78 },

  // 頂邊（右→左）
  25: { x: 82.06, y: 7.78 },
  26: { x: 75, y: 7.78 },
  27: { x: 67.94, y: 7.78 },
  28: { x: 60.88, y: 7.78 },
  29: { x: 53.81, y: 7.78 },
  30: { x: 46.75, y: 7.78 },
  31: { x: 39.69, y: 7.78 },
  32: { x: 32.63, y: 7.78 },
  33: { x: 25.56, y: 7.78 },
  37: { x: 18.5, y: 7.78 },
  38: { x: 11.44, y: 7.78 },
  39: { x: 4.38, y: 7.78 },

  // 左邊（上→下，之字交錯）
  40: { x: 10.88, y: 21.11 },
  41: { x: 4.38, y: 31.22 },
  42: { x: 10.88, y: 41.33 },
  43: { x: 4.38, y: 51.33 },
  44: { x: 10.88, y: 61.44 },
  45: { x: 4.38, y: 71.56 },
  46: { x: 10.88, y: 78.44 },

  // 下旋臂 5→6→7→8→55（向左掃入中心）
  6: { x: 48.13, y: 78.89 },
  7: { x: 38.75, y: 73.33 },
  8: { x: 31.88, y: 60 },
  55: { x: 40, y: 52.22 },

  // 上旋臂 31→34→35→36→53（向右掃入中心）
  34: { x: 51.88, y: 21.11 },
  35: { x: 61.25, y: 26.67 },
  36: { x: 68.13, y: 40 },
  53: { x: 60, y: 47.78 },

  // 左旋臂 44→48→49→50→52（向上掃入中心）
  48: { x: 17.5, y: 52.22 },
  49: { x: 22.5, y: 36.67 },
  50: { x: 32.5, y: 33.33 },
  52: { x: 41.25, y: 38.89 },

  // 右旋臂 18→23→21→20→19（向下掃入中心）
  23: { x: 81.25, y: 43.89 },
  21: { x: 74.38, y: 56.67 },
  20: { x: 67.5, y: 66.67 },
  19: { x: 58.75, y: 61.11 },

  // 中央樞紐
  54: { x: 50, y: 50 }
};

export const Board: React.FC = () => {
  const state = useGameStore(store => store.state);
  const dispatch = useGameStore(store => store.dispatch);

  const targetSelection = useGameStore(store => store.targetSelection);
  const setTargetSelection = useGameStore(store => store.setTargetSelection);


  const [visualPositions, setVisualPositions] = useState<Record<string, number>>({});

  // 監聽並觸發一格一格滑動的位移動畫
  useEffect(() => {
    if (!state || !state.lastMovePath) return;
    const { playerId, path } = state.lastMovePath;
    if (!path || path.length <= 1) return;

    let currentIndex = 0;
    setVisualPositions(prev => ({ ...prev, [playerId]: path[0] }));

    const interval = setInterval(() => {
      currentIndex++;
      if (currentIndex < path.length) {
        setVisualPositions(prev => ({ ...prev, [playerId]: path[currentIndex] }));
      } else {
        clearInterval(interval);
      }
    }, 450); // 每 450ms 移動一格

    return () => clearInterval(interval);
  }, [state?.lastMovePath]);

  // 同步靜態或非移動狀態下的實際棋子位置
  useEffect(() => {
    if (!state) return;
    setVisualPositions(prev => {
      const next = { ...prev };
      state.players.forEach(p => {
        const isAnimating = state.lastMovePath && state.lastMovePath.playerId === p.id;
        if (!isAnimating) {
          next[p.id] = p.position;
        }
      });
      return next;
    });
  }, [state?.players, state?.lastMovePath]);

  const [scale, setScale] = useState<number>(1);
  const canvasAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleResize = () => {
      if (!canvasAreaRef.current) return;
      const width = canvasAreaRef.current.clientWidth;
      const height = canvasAreaRef.current.clientHeight;
      // 設計稿固定尺寸為 1600x900，以此進行雙軸等比例適應縮放
      const scaleX = width / 1600;
      const scaleY = height / 900;
      const newScale = Math.min(scaleX, scaleY);
      setScale(Math.max(0.3, newScale)); // 限制最小縮放比例，防止極端狀態
    };

    // 延遲以等待 layout repaint
    const timer = setTimeout(handleResize, 50);

    // 藉由 ResizeObserver 即時響應控制台收合動畫造成的容器高度變化
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && canvasAreaRef.current) {
      observer = new ResizeObserver(() => {
        handleResize();
      });
      observer.observe(canvasAreaRef.current);
    } else {
      window.addEventListener('resize', handleResize);
    }

    return () => {
      clearTimeout(timer);
      if (observer) {
        observer.disconnect();
      } else {
        window.removeEventListener('resize', handleResize);
      }
    };
  }, []);

  if (!state) return null;

  const handleTileClick = useCallback((tileId: number) => {
    const activePlayer = state.players.find(p => p.id === state.activePlayerId)!;

    // 處理在交叉點前進方向選擇點擊
    if (state.phase === 'preRoll' && activePlayer.control === 'human') {
      const validDirs = getValidNextDirections(activePlayer.position, activePlayer.lastPosition, GRAPH_CONNECTIONS);
      if (validDirs.length > 1 && validDirs.includes(tileId)) {
        dispatch({
          type: 'CHOOSE_NEXT_HEADING',
          playerId: state.activePlayerId,
          targetTileId: tileId
        });
        return;
      }
    }

    // 處理路線選擇點擊
    if (state.phase === 'choosingPath' && activePlayer.control === 'human') {
      if (state.pathChoices && state.pathChoices.includes(tileId)) {
        dispatch({
          type: 'CHOOSE_MOVE_PATH',
          playerId: state.activePlayerId,
          targetTileId: tileId
        });
      }
      return;
    }

    if (targetSelection && targetSelection.type === 'tile') {
      if (targetSelection.validIds.includes(tileId)) {
        if (targetSelection.source === 'card') {
          dispatch({
            type: 'USE_CARD',
            playerId: state.activePlayerId,
            cardId: targetSelection.itemId!,
            payload: { targetTileId: tileId }
          });
        } else {
          dispatch({
            type: 'USE_ABILITY',
            playerId: state.activePlayerId,
            payload: { targetTileId: tileId }
          });
        }
        setTargetSelection(null);
      }
    } else {
      dispatch({ type: 'SELECT_TILE', tileId });
    }
  }, [state, targetSelection, dispatch, setTargetSelection]);

  // 獲取玩家棋子位置座標（考量多人在同據點時的環形錯開）
  const getPlayerCoordinates = (playerId: string, position: number) => {
    const base = NODE_COORDINATES[position] || { x: 50, y: 50 };
    const playersAtPos = state.players.filter(p => {
      if (p.isBankrupt) return false;
      const vPos = visualPositions[p.id] !== undefined ? visualPositions[p.id] : p.position;
      return vPos === position;
    });
    const index = playersAtPos.findIndex(p => p.id === playerId);
    if (index === -1 || playersAtPos.length <= 1) return base;
    
    // 計算環形錯開偏移量
    const angle = (index * (360 / playersAtPos.length) * Math.PI) / 180;
    const r = 2.2; // 偏移半徑 (單位為地圖百分比)
    return {
      x: base.x + r * Math.cos(angle),
      y: base.y + r * Math.sin(angle)
    };
  };

  const getPlayerColor = (playerId: string) => {
    if (playerId === 'p1') return 'var(--player-1)';
    if (playerId === 'p2') return 'var(--player-2)';
    if (playerId === 'p3') return 'var(--player-3)';
    if (playerId === 'p4') return 'var(--player-4)';
    return '#cbd5e1';
  };

  // 生成唯一連線邊，避免重複繪製
  const edges: [number, number][] = [];
  const seenEdges = new Set<string>();
  Object.entries(GRAPH_CONNECTIONS).forEach(([fromStr, toIds]) => {
    const fromId = parseInt(fromStr, 10);
    toIds.forEach(toId => {
      const edgeKey = fromId < toId ? `${fromId}-${toId}` : `${toId}-${fromId}`;
      if (!seenEdges.has(edgeKey)) {
        seenEdges.add(edgeKey);
        edges.push([fromId, toId]);
      }
    });
  });

  const activePlayer = state.players.find(p => p.id === state.activePlayerId);
  const choices = state.pathChoices || [];

  // 判斷該邊線是否在此回合分支選擇高亮路徑中
  const isEdgeActive = (from: number, to: number) => {
    if (!activePlayer) return false;

    // 1. 支援 preRoll 階段，交叉點前進方向的高亮連線
    if (state.phase === 'preRoll' && activePlayer.control === 'human') {
      const dirs = getValidNextDirections(activePlayer.position, activePlayer.lastPosition, GRAPH_CONNECTIONS);
      if (dirs.length > 1) {
        const curPos = activePlayer.position;
        if ((from === curPos && dirs.includes(to)) || (to === curPos && dirs.includes(from))) {
          return true;
        }
      }
    }

    // 2. 支援 choosingPath 階段
    if (state.phase !== 'choosingPath') return false;
    const curPos = activePlayer.position;
    
    if ((from === curPos && choices.includes(to)) || (to === curPos && choices.includes(from))) {
      return true;
    }
    if (choices.includes(from) && choices.includes(to)) {
      return true;
    }
    return false;
  };

  return (
    <div className={styles.boardWrapper}>
      {/* 配合下方控制台開展自適應縮放的地圖主要渲染區 */}
      <div
        className={styles.canvasArea}
        ref={canvasAreaRef}
        style={{ top: 'calc(var(--hud-height, 106px) + 20px)', bottom: '12px' }}
      >
        <div 
          className={styles.gridContainer} 
          style={{ transform: `scale(${scale})` }}
        >
          {/* SVG 拓撲連線畫布 */}
          <svg className={styles.svgCanvas}>
            {edges.map(([fromId, toId], idx) => {
              const fromCoord = NODE_COORDINATES[fromId];
              const toCoord = NODE_COORDINATES[toId];
              if (!fromCoord || !toCoord) return null;
              const active = isEdgeActive(fromId, toId);
              return (
                <line
                  key={idx}
                  x1={`${fromCoord.x}%`}
                  y1={`${fromCoord.y}%`}
                  x2={`${toCoord.x}%`}
                  y2={`${toCoord.y}%`}
                  className={`${styles.copperLine} ${active ? styles.copperLineActive : ''}`}
                />
              );
            })}
          </svg>

          {/* 渲染 56 格科技感六角形據點卡片 */}
          {state.tiles.map(tileState => {
            const playersOnTile = state.players.filter(p => {
              if (p.isBankrupt) return false;
              const vPos = visualPositions[p.id] !== undefined ? visualPositions[p.id] : p.position;
              return vPos === tileState.id;
            });
            const raidSpawn = state.raidSpawns.find(s => s.tileId === tileState.id);
            const isSelected = state.selectedTileId === tileState.id;
            
            // 若處於路線選擇階段，高亮分支目的地
            const isPathChoice = state.phase === 'choosingPath' && 
                                 activePlayer?.control === 'human' && 
                                 choices.includes(tileState.id);
            
            // 若處於交叉點選擇前進方向階段，高亮候選相鄰節點
            const isForkChoice = activePlayer && 
                                 state.phase === 'preRoll' && 
                                 activePlayer.control === 'human' && 
                                 (() => {
                                   const dirs = getValidNextDirections(activePlayer.position, activePlayer.lastPosition, GRAPH_CONNECTIONS);
                                   return dirs.length > 1 && dirs.includes(tileState.id);
                                 })();

            const isSelectedHeading = activePlayer && activePlayer.nextHeadingNode === tileState.id;
                                 
            const isValidTarget = (targetSelection?.type === 'tile' && targetSelection.validIds.includes(tileState.id)) || 
                                  isPathChoice || 
                                  isForkChoice;
            const coords = NODE_COORDINATES[tileState.id] || { x: 50, y: 50 };

            return (
              <div 
                key={tileState.id} 
                style={{
                  position: 'absolute',
                  left: `${coords.x}%`,
                  top: `${coords.y}%`,
                  transform: 'translate(-50%, -50%)',
                  zIndex: isSelected ? 12 : isValidTarget ? 11 : 10
                }}
              >
                <Tile
                  tileState={tileState}
                  playersOnTile={playersOnTile}
                  raidSpawn={raidSpawn}
                  isSelected={isSelected || !!isSelectedHeading}
                  isValidTarget={isValidTarget}
                  onClick={handleTileClick}
                />
              </div>
            );
          })}

          {/* 渲染所有存活玩家棋子 (支援一格一格滑動過渡) */}
          {state.players.filter(p => !p.isBankrupt).map(p => {
            const currentVisualPos = visualPositions[p.id] !== undefined ? visualPositions[p.id] : p.position;
            const coords = getPlayerCoordinates(p.id, currentVisualPos);
            const playerColor = getPlayerColor(p.id);
            let x = 0;
            let y = 0;
            switch (p.characterId) {
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
              <span
                key={p.id}
                className={styles.boardPlayerToken}
                style={{
                  left: `${coords.x}%`,
                  top: `${coords.y}%`,
                  color: playerColor,
                  backgroundImage: 'url(/avatars.jpg)',
                  backgroundSize: '400% 400%',
                  backgroundPosition: `${x}% ${y}%`,
                  backgroundColor: '#ffffff',
                  zIndex: 30
                }}
                title={p.name}
              />
            );
          })}
        </div>
      </div>

      {/* 獨立懸浮操作控制台 */}
      <CenterDashboard />
    </div>
  );
};
export default Board;
