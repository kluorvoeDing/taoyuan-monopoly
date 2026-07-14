import React from 'react';
import type { TileState, PlayerState, RaidSpawn } from '../../game/types';
import { getTileConfig, TILE_PRICE_BY_TIER } from '../../game/engine/selectors';
import { DISTRICTS } from '../../data/districts';
import { RAIDS } from '../../data/raids';
import styles from './Tile.module.css';

interface TileProps {
  tileState: TileState;
  playersOnTile: PlayerState[];
  raidSpawn?: RaidSpawn;
  isSelected: boolean;
  isValidTarget?: boolean;
  onClick: (id: number) => void;
}

export const Tile = React.memo<TileProps>(({
  tileState,
  raidSpawn,
  isSelected,
  isValidTarget,
  onClick
}) => {
  const config = getTileConfig(tileState.id);
  const isLand = config.type === 'land';

  // Zone (District) colors
  const zoneColor = (isLand && config.zone) ? DISTRICTS[config.zone]?.color : undefined;

  // Owner colors
  const getOwnerColor = (ownerId?: string) => {
    if (!ownerId) return undefined;
    if (ownerId === 'p1') return 'var(--player-1)';
    if (ownerId === 'p2') return 'var(--player-2)';
    if (ownerId === 'p3') return 'var(--player-3)';
    if (ownerId === 'p4') return 'var(--player-4)';
    return undefined;
  };

  const ownerColor = getOwnerColor(tileState.ownerId);

  // Special tile category names for badges
  const getSpecialBadgeText = (type: string) => {
    if (type === 'start') return '起點';
    if (type === 'card') return '支援';
    if (type === 'fate') return '事件';
    if (type === 'traffic') return '交通';
    if (type === 'lottery') return '基金';
    if (type === 'empty') return '公園';
    return '';
  };

  // Get raid config name
  const raidName = raidSpawn ? (RAIDS.find(r => r.id === raidSpawn.raidId)?.name || '敵人') : '';

  // 根據據點狀態動態決定 Hexagon 投影發光邊緣
  const getShadowFilter = () => {
    if (isSelected) {
      return 'drop-shadow(0 0 5px var(--primary)) drop-shadow(0 0 1px var(--primary))';
    }
    if (isValidTarget) {
      return 'drop-shadow(0 0 6px #10B981) drop-shadow(0 0 2px #10B981)';
    }
    if (ownerColor) {
      return `drop-shadow(0 0 3px ${ownerColor}) drop-shadow(0 0 1.2px ${ownerColor})`;
    }
    return 'drop-shadow(0 1.5px 2px rgba(0,0,0,0.12)) drop-shadow(0 0 0.8px rgba(0,0,0,0.18))';
  };

  return (
    <div 
      className={`${styles.tile} ${isSelected ? styles.selected : ''} ${isValidTarget ? styles.validTarget : ''}`}
      style={{ filter: getShadowFilter() }}
      onClick={() => onClick(tileState.id)}
    >
      {/* 頂部資訊列 (ID膠囊背景為區域代表色) */}
      <div className={styles.infoRow}>
        <span 
          className={styles.tileId} 
          style={{ backgroundColor: zoneColor || 'var(--text-muted, #64748b)' }}
        >
          {tileState.id}
        </span>
        {isLand && config.tier && (
          <span className={`${styles.tierBadge} ${styles[`tier${config.tier}`]}`}>
            {config.tier}
          </span>
        )}
      </div>

      {/* 據點名稱 */}
      <div className={styles.name} style={{ color: ownerColor ? ownerColor : undefined }}>
        {config.name}
      </div>

      {/* 據點價值/類型標記 */}
      {isLand ? (
        <span className={styles.valueRow}>
          {tileState.ownerId ? (
            <>
              <span className={styles.levelIcon} title={`L${tileState.level} 據點`}>
                {tileState.level === 1 ? '⛺' : tileState.level === 2 ? '🏢' : tileState.level === 3 ? '🏬' : '🏛️'}
              </span>
              <span>L{tileState.level}</span>
            </>
          ) : (
            `$${(config.tier ? TILE_PRICE_BY_TIER[config.tier] : 0).toLocaleString("zh-Hant-TW")}`
          )}
        </span>
      ) : (
        <span className={`${styles.specialBadge} ${styles[`badge_${config.type}`]}`}>
          {getSpecialBadgeText(config.type)}
        </span>
      )}

      {/* 據點攻防狀態圖示 */}
      <div className={styles.statusContainer}>
        {tileState.statuses.guardRounds > 0 && (
          <span className={styles.statusGuard} title={`防守剩餘 ${tileState.statuses.guardRounds} 輪`}>🛡️</span>
        )}
        {tileState.statuses.disruptedRounds > 0 && (
          <span className={styles.statusDisrupt} title={`輿論干擾剩餘 ${tileState.statuses.disruptedRounds} 輪`}>⚠️</span>
        )}
        {tileState.statuses.rentDisabledOnce && (
          <span className={styles.statusDisabled} title="停擺一次">🛑</span>
        )}
        {tileState.statuses.rentBoostOnce && (
          <span className={styles.statusBoost} title={`租金加倍 ×${tileState.statuses.rentBoostOnce}`}>📢</span>
        )}
        {tileState.statuses.hasRoadblock && (
          <span className={styles.statusRoadblock} title="路障已設置">🚧</span>
        )}
      </div>

      {/* 亂入 Overlay */}
      {raidSpawn && (
        <div className={styles.raidOverlay}>
          {raidName}
        </div>
      )}

    </div>
  );
});
