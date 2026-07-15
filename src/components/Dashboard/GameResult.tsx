import React from 'react';
import { useGameStore } from '../../store/gameStore';
import { CHARACTERS } from '../../data/characters';
import { calculateNetWorth } from '../../game/engine/selectors';
import styles from './GameResult.module.css';

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

export const GameResult: React.FC = () => {
  const state = useGameStore(store => store.state);
  const resetGame = useGameStore(store => store.resetGame);

  if (!state || state.mode !== 'finished') return null;

  // 對生存玩家進行聲望資產排序，破產者排最後
  const sortedPlayers = [...state.players].sort((a, b) => {
    if (a.isBankrupt && !b.isBankrupt) return 1;
    if (!a.isBankrupt && b.isBankrupt) return -1;
    return calculateNetWorth(state, b.id) - calculateNetWorth(state, a.id);
  });

  const getCharName = (charId: string) => {
    return CHARACTERS.find(c => c.id === charId)?.name || '未知英雄';
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.box}>
        <h1 className={styles.title}>桃園 Hero City 對決終結</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '14px' }}>
          經歷了 {state.round - 1} 回合激烈對峙，城市支援戰略資產統計如下：
        </p>

        <div className={styles.rankingList}>
          {sortedPlayers.map((p, idx) => {
            const rank = idx + 1;
            
            return (
              <div 
                key={p.id} 
                className={`${styles.rankingCard} ${styles[`rank${rank}`]}`}
                style={{ display: 'flex', alignItems: 'center', gap: '12px' }}
              >
                <div className={`${styles.rankBadge} ${styles[`rankBadge${rank}`]}`}>
                  {rank}
                </div>
                
                {renderAvatar(p.characterId, 32)}

                <div className={styles.playerInfo} style={{ marginLeft: 0 }}>
                  <div className={styles.charName}>
                    {getCharName(p.characterId)}
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginLeft: '8px' }}>
                      ({p.control === 'human' ? '玩家' : 'AI'})
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {p.isBankrupt ? '🚫 由於破產中途淘汰' : `現鈔: $${p.cash.toLocaleString("zh-Hant-TW")}`}
                  </div>
                </div>

                <div className={styles.netWorth}>
                  {p.isBankrupt ? '已停業' : `$${calculateNetWorth(state, p.id).toLocaleString("zh-Hant-TW")}`}
                </div>
              </div>
            );
          })}
        </div>

        <button className={styles.restartButton} onClick={resetGame}>
          重啟新對局
        </button>
      </div>
    </div>
  );
};
export default GameResult;
