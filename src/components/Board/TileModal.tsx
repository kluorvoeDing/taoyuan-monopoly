import React, { useEffect } from 'react';
import { useGameStore } from '../../store/gameStore';
import { getTileConfig, TILE_PRICE_BY_TIER, calculateRent } from '../../game/engine/selectors';
import { DISTRICTS } from '../../data/districts';
import { CHARACTERS } from '../../data/characters';
import { RAIDS } from '../../data/raids';
import styles from './TileModal.module.css';

interface TileModalProps {
  tileId: number;
  onClose: () => void;
}

export const TileModal: React.FC<TileModalProps> = ({ tileId, onClose }) => {
  const state = useGameStore(store => store.state);

  // 監聽 Escape 鍵關閉視窗
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!state) return null;

  const config = getTileConfig(tileId);
  const tileState = state.tiles.find(t => t.id === tileId)!;
  const isLand = config.type === 'land';

  // 取得所有權人名稱
  const owner = tileState.ownerId ? state.players.find(p => p.id === tileState.ownerId) : null;
  const ownerName = owner ? (CHARACTERS.find(c => c.id === owner.characterId)?.name || '未知') : null;

  // 取得頭像條顏色
  const getOwnerColor = (ownerId?: string) => {
    if (!ownerId) return undefined;
    if (ownerId === 'p1') return 'var(--player-1)';
    if (ownerId === 'p2') return 'var(--player-2)';
    if (ownerId === 'p3') return 'var(--player-3)';
    return 'var(--player-4)';
  };

  // 計算土地各等級的基礎租金
  const getRentForLevel = (lvl: number) => {
    if (!isLand || !config.tier) return 0;
    const basePrice = TILE_PRICE_BY_TIER[config.tier];
    const rentRate = lvl === 1 ? 0.35 : (lvl === 2 ? 0.70 : (lvl === 3 ? 1.40 : 2.50));
    return Math.round(basePrice * rentRate);
  };

  // 計算當前真實租金 (考慮干擾、防禦、套裝加成等因素)
  const currentRent = isLand && owner 
    ? calculateRent(state, tileId, 'p1', owner.id).rent // 以 p1 付給 owner 為模擬對象
    : 0;

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
        <button className={styles.closeButton} onClick={onClose}>
          ×
        </button>

        <div className={styles.header}>
          <div className={styles.titleRow}>
            <h2 className={styles.title}>{config.name}</h2>
            {isLand && config.tier && (
              <span className={`styles.tierBadge`} style={{ color: 'var(--primary)', fontWeight: 'bold' }}>
                {config.tier} 級土地
              </span>
            )}
          </div>
          <div className={styles.subtitle}>
            {isLand && config.zone ? `${DISTRICTS[config.zone].name} 行政區 ‧ ` : ''}
            格子編號 {tileId}
          </div>
        </div>

        {/* 特殊警戒/環境提示區 */}
        {(tileState.statuses.hasRoadblock || state.raidSpawns.some(s => s.tileId === tileId)) && (() => {
          const spawn = state.raidSpawns.find(s => s.tileId === tileId);
          const raidConfig = spawn ? RAIDS.find(r => r.id === spawn.raidId) : null;
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
              {tileState.statuses.hasRoadblock && (
                <div style={{ padding: '10px 12px', borderRadius: '6px', fontSize: '12px', backgroundColor: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c', display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <span>🚧</span>
                  <div>
                    <strong>路障警報：</strong>行經此處時將會被強制攔截停下。
                  </div>
                </div>
              )}
              {raidConfig && (
                <div style={{ padding: '10px 12px', borderRadius: '6px', fontSize: '12px', backgroundColor: '#fffbeb', border: '1px solid #fcd34d', color: '#b45309', display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <span>💥</span>
                  <div>
                    <strong>環境亂入中：【{raidConfig.name}】現身！</strong>
                    <div style={{ fontSize: '11px', opacity: 0.9, marginTop: '2px' }}>效果：{raidConfig.description}</div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* 土地類型的詳細租金與所有權 */}
        {isLand ? (
          <>
            {/* 所有者看板 */}
            <div className={styles.section}>
              <div className={styles.sectionTitle}>據點所有權</div>
              {owner ? (
                <div className={styles.ownerPanel}>
                  <div className={styles.ownerAvatar} style={{ backgroundColor: getOwnerColor(owner.id) }} />
                  <div className={styles.ownerInfo}>
                    <span style={{ fontWeight: 700 }}>{ownerName} 名下據點</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      當前據點等級: Level {tileState.level}
                    </span>
                  </div>
                </div>
              ) : (
                <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                  無主據點。降落在此格可以花費 <strong>${(config.tier ? TILE_PRICE_BY_TIER[config.tier] : 0).toLocaleString("zh-Hant-TW")}</strong> 支援經費進駐。
                </div>
              )}
            </div>

            {/* 土地數據與擴建費 */}
            <div className={styles.section}>
              <div className={styles.sectionTitle}>據點資產</div>
              <div className={styles.statsGrid}>
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>進駐地價</span>
                  <span className={styles.statValue}>
                    ${(config.tier ? TILE_PRICE_BY_TIER[config.tier] : 0).toLocaleString("zh-Hant-TW")}
                  </span>
                </div>
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>單次擴建費</span>
                  <span className={styles.statValue}>
                    ${(config.tier ? Math.round(TILE_PRICE_BY_TIER[config.tier] * 0.50) : 0).toLocaleString("zh-Hant-TW")}
                  </span>
                </div>
              </div>
            </div>

            {/* 租金級階表 */}
            <div className={styles.section}>
              <div className={styles.sectionTitle}>支援租金階梯</div>
              <div className={styles.rentList}>
                {[1, 2, 3, 4].map(lvl => {
                  const isCurrent = tileState.level === lvl;
                  const names = ['臨時據點 (L1)', '二級事務所 (L2)', '高能戰略所 (L3)', 'No.1 英雄事務所 (L4)'];
                  return (
                    <div 
                      key={lvl} 
                      className={`${styles.rentRow} ${isCurrent ? styles.rentRowActive : ''}`}
                    >
                      <span>
                        {isCurrent ? '👉 ' : ''}
                        {names[lvl - 1]}
                      </span>
                      <span className={styles.statValue}>
                        ${getRentForLevel(lvl).toLocaleString("zh-Hant-TW")}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 真實租金與狀態說明 */}
            {owner && (
              <div className={styles.section} style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}>
                  <span>當前實質支援費：</span>
                  <span style={{ color: 'var(--primary)' }}>
                    ${currentRent.toLocaleString("zh-Hant-TW")}
                  </span>
                </div>
                {/* 狀態干擾說明 */}
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  {tileState.statuses.guardRounds > 0 && (
                    <span style={{ color: 'var(--color-green)' }}>🛡️ 已部署防守屏障 (剩餘 {tileState.statuses.guardRounds} 回合，對手查稅與攻擊無效)</span>
                  )}
                  {tileState.statuses.disruptedRounds > 0 && (
                    <span style={{ color: 'var(--color-red)' }}>⚠️ 受到負面輿論干擾 (剩餘 {tileState.statuses.disruptedRounds} 回合，對手降臨免付支援費)</span>
                  )}
                  {tileState.statuses.rentBoostOnce && (
                    <span style={{ color: 'var(--color-yellow)' }}>📢 已投放英雄廣告看板 (下一次對手路過收租 ×1.5)</span>
                  )}
                  {tileState.statuses.rentDisabledOnce && (
                    <span style={{ color: 'var(--text-muted)' }}>💤 據點暫時停擺 (下一次路過免租金)</span>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          /* 非土地類型的說明 */
          <div style={{ color: 'var(--text-secondary)', lineHeight: 1.6, fontSize: '13px' }}>
            <p style={{ marginBottom: '10px' }}>
              這是一個功能格：<strong>【{config.name}】</strong>。
            </p>
            <p>
              {config.type === 'start' && '抵達或經過此格，均可獲得 $2,000 巡邏經費。精準停留此格可額外獲得 $1,000 經費。'}
              {config.type === 'card' && '降落在此格，可至支援科抽取 1 張支援裝備卡（八百萬百有 20% 機率多抽 1 張）。'}
              {config.type === 'fate' && '降落在此格，會觸發突發城市事件，獲得隨機增益或扣除罰款（危機公關卡片可以抵消負面事件）。'}
              {config.type === 'traffic' && '降落在此格需支付 $300 交通費。飯田天哉在此格被動前進 2 格。使用交通卡可免付。'}
              {config.type === 'lottery' && '路過此格會被扣除 $500 投入支援基金。20% 的機率中獎，獨得基金池 70% 的累積經費。'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
export default TileModal;
