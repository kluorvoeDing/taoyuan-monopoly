import React, { useState } from 'react';
import { useGameStore, getLastSettings } from '../../store/gameStore';
import { CHARACTERS } from '../../data/characters';
import styles from './GameSetup.module.css';

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

export const GameSetup: React.FC = () => {
  const lastSettings = getLastSettings();
  const startGame = useGameStore(state => state.startGame);

  // Form states
  const [startingCash, setStartingCash] = useState<number>(lastSettings.startingCash);
  const [maxRounds, setMaxRounds] = useState<number>(lastSettings.maxRounds);
  const [aiCount, setAiCount] = useState<number>(lastSettings.aiCount);
  const [enableRaids, setEnableRaids] = useState<boolean>(lastSettings.enableRaids);
  const [enableQuirks, setEnableQuirks] = useState<boolean>(lastSettings.enableQuirks);
  
  // Selected character state (default to first character: Midoriya)
  const [selectedCharId, setSelectedCharId] = useState<string>(CHARACTERS[0].id);

  const handleStart = () => {
    startGame(
      {
        startingCash,
        maxRounds,
        aiCount,
        enableRaids,
        enableQuirks
      },
      selectedCharId
    );
  };

  return (
    <div className={styles.container}>
      <div className={styles.titleSection}>
        <h1 className={styles.title}>桃園 Hero City</h1>
        <p className={styles.subtitle}>大富翁網頁版回合制策略遊戲 ‧ 全民英雄對決</p>
      </div>

      <div className={styles.setupBox}>
        {/* 開局參數設定 */}
        <div className={styles.formGrid}>
          <div className={styles.formField}>
            <label className={styles.label}>起始支援預算 (現金)</label>
            <select 
              className={styles.select}
              value={startingCash} 
              onChange={e => setStartingCash(Number(e.target.value))}
            >
              <option value={20000}>$20,000 (標準)</option>
              <option value={80000}>$80,000 (快速)</option>
              <option value={200000}>$200,000 (發展)</option>
              <option value={400000}>$400,000 (壓力局)</option>
            </select>
          </div>

          <div className={styles.formField}>
            <label className={styles.label}>最大局數限制 (回合)</label>
            <select 
              className={styles.select}
              value={maxRounds} 
              onChange={e => setMaxRounds(Number(e.target.value))}
            >
              <option value={30}>30 回合 (快速)</option>
              <option value={60}>60 回合 (普通)</option>
              <option value={90}>90 回合 (戰略)</option>
              <option value={180}>180 回合 (漫長)</option>
            </select>
          </div>

          <div className={styles.formField}>
            <label className={styles.label}>AI 競爭玩家人數</label>
            <select 
              className={styles.select}
              value={aiCount} 
              onChange={e => setAiCount(Number(e.target.value))}
            >
              <option value={1}>1 名 AI</option>
              <option value={2}>2 名 AI</option>
              <option value={3}>3 名 AI (完整體驗)</option>
            </select>
          </div>

          <div className={styles.formField} style={{ justifyContent: 'center', gap: '14px' }}>
            <label className={styles.checkboxLabel}>
              <input 
                type="checkbox" 
                className={styles.checkbox}
                checked={enableRaids} 
                onChange={e => setEnableRaids(e.target.checked)} 
              />
              英雄／反派亂入機制
            </label>
            <label className={styles.checkboxLabel}>
              <input 
                type="checkbox" 
                className={styles.checkbox}
                checked={enableQuirks} 
                onChange={e => setEnableQuirks(e.target.checked)} 
              />
              啟用角色個性天賦
            </label>
          </div>
        </div>

        {/* 角色卡牌選擇區 */}
        <div className={styles.characterSelection}>
          <label className={styles.label} style={{ fontSize: '16px' }}>請選擇你的參戰英雄角色 (個性能力)：</label>
          <div className={styles.charGrid}>
            {CHARACTERS.map(char => {
              const isSelected = selectedCharId === char.id;
              return (
                <div 
                  key={char.id}
                  className={`${styles.charCard} ${isSelected ? styles.selectedCard : ''}`}
                  onClick={() => setSelectedCharId(char.id)}
                >
                  <div className={styles.charHeader} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {renderAvatar(char.id, 32)}
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span className={styles.charName}>{char.name}</span>
                      <span className={styles.charQuirk} style={{ fontSize: '10px', marginTop: '2px', alignSelf: 'flex-start' }}>{char.quirk}</span>
                    </div>
                  </div>
                  <div>
                    <span className={styles.charAbilityName}>{char.abilityName}</span>
                  </div>
                  <p className={styles.charAbilityText}>{char.abilityText}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className={styles.buttonGroup}>
          <button className={styles.startButton} onClick={handleStart}>
            進入 Hero City 棋盤
          </button>
          <button 
            className={styles.multiplayerButton} 
            onClick={() => useGameStore.setState({ isMultiplayer: true })}
            type="button"
          >
            🌐 線上多人連線模式
          </button>
        </div>
      </div>
    </div>
  );
};
export default GameSetup;
