import React, { useCallback, useState, useEffect, useRef } from 'react';
import { useGameStore } from '../../store/gameStore';
import { Tile } from './Tile';
import { CenterDashboard } from '../Dashboard/CenterDashboard';
import { GRAPH_CONNECTIONS, getValidNextDirections } from '../../game/engine/reducer';
import styles from './Board.module.css';

// 56 個地圖據點的絕對百分比座標 (星軌星座星圖分佈)
// 56 個地圖據點的絕對百分比座標 (星軌星座星圖分佈 - 已優化防重疊)
const NODE_COORDINATES: Record<number, { x: number; y: number }> = {
  // Bottom Edge (y = 92)
  47: { x: 7, y: 92 },
  51: { x: 14, y: 92 },
  0: { x: 21, y: 92 },
  1: { x: 28, y: 92 },
  2: { x: 35, y: 92 },
  3: { x: 42, y: 92 },
  4: { x: 49, y: 92 },
  5: { x: 56, y: 92 },
  9: { x: 63, y: 92 },
  10: { x: 70, y: 92 },
  11: { x: 77, y: 92 },
  12: { x: 84, y: 92 },
  13: { x: 91, y: 92 },

  // Right Edge (x = 91)
  14: { x: 91, y: 80 },
  15: { x: 91, y: 68 },
  16: { x: 91, y: 56 },
  17: { x: 91, y: 44 },
  18: { x: 91, y: 32 },
  22: { x: 91, y: 20 },
  24: { x: 91, y: 8 },

  // Top Edge (y = 8)
  25: { x: 84, y: 8 },
  26: { x: 77, y: 8 },
  27: { x: 70, y: 8 },
  28: { x: 63, y: 8 },
  29: { x: 56, y: 8 },
  30: { x: 49, y: 8 },
  31: { x: 42, y: 8 },
  32: { x: 35, y: 8 },
  33: { x: 28, y: 8 },
  37: { x: 21, y: 8 },
  38: { x: 14, y: 8 },
  39: { x: 7, y: 8 },

  // Left Edge (x = 7)
  40: { x: 7, y: 8 },
  41: { x: 7, y: 20 },
  42: { x: 7, y: 32 },
  43: { x: 7, y: 44 },
  44: { x: 7, y: 56 },
  45: { x: 7, y: 68 },
  46: { x: 7, y: 80 },

  // Inward Left Arm
  48: { x: 15, y: 62 },
  49: { x: 23, y: 68 },
  50: { x: 31, y: 62 },
  52: { x: 39, y: 54 },

  // Inward Right Arm
  23: { x: 83, y: 38 },
  21: { x: 75, y: 44 },
  20: { x: 67, y: 38 },
  19: { x: 59, y: 46 },

  // Inward Bottom Arm
  6: { x: 50, y: 84 },
  7: { x: 44, y: 76 },
  8: { x: 50, y: 68 },
  55: { x: 44, y: 62 },

  // Inward Top Arm
  34: { x: 48, y: 16 },
  35: { x: 54, y: 24 },
  36: { x: 48, y: 32 },
  53: { x: 54, y: 38 },

  // Central Hub Node
  54: { x: 49, y: 50 }
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
      // 設計稿固定尺寸為 1350x700，以此進行雙軸等比例適應縮放
      const scaleX = width / 1350;
      const scaleY = height / 700;
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
        style={{ top: '84px', bottom: '12px' }}
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
            }

            return (
              <span
                key={p.id}
                className={styles.boardPlayerToken}
                style={{
                  left: `${coords.x}%`,
                  top: `${coords.y}%`,
                  borderColor: playerColor,
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
