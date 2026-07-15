import React, { useState } from 'react';
import { useGameStore, getLastSettings } from '../../store/gameStore';
import { CHARACTERS } from '../../data/characters';
import styles from './Lobby.module.css';

const renderAvatar = (characterId: string, size: number = 32) => {
  return (
    <div 
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '50%',
        backgroundImage: `url(/avatars/${characterId}.png)`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        border: '2px solid var(--border-color)',
        flexShrink: 0,
        boxSizing: 'border-box'
      }} 
    />
  );
};

export const Lobby: React.FC<{ onBackToOffline: () => void }> = ({ onBackToOffline }) => {
  const {
    roomId,
    myPlayerId,
    multiplayerRole,
    onlinePlayers,
    createOnlineRoom,
    joinOnlineRoom,
    setReady,
    startMultiplayerGame,
    quitRoom
  } = useGameStore();

  const lastSettings = getLastSettings();

  // Lobby Inputs
  const [nickname, setNickname] = useState<string>(() => {
    return localStorage.getItem('multiplayer_nickname') || `特工_${Math.random().toString(36).substring(2, 6)}`;
  });
  const [selectedCharId, setSelectedCharId] = useState<string>(CHARACTERS[0].id);
  const [inputRoomId, setInputRoomId] = useState<string>('');
  const [mode, setMode] = useState<'selection' | 'create' | 'join'>('selection');

  // Game setup options
  const [startingCash, setStartingCash] = useState<number>(lastSettings.startingCash);
  const [maxRounds, setMaxRounds] = useState<number>(lastSettings.maxRounds);
  const [enableRaids, setEnableRaids] = useState<boolean>(lastSettings.enableRaids);
  const [enableQuirks, setEnableQuirks] = useState<boolean>(lastSettings.enableQuirks);

  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Ready state local track
  const myInfo = onlinePlayers.find(p => p.id === myPlayerId);
  const isReady = myInfo ? myInfo.isReady : false;

  const saveNickname = (name: string) => {
    setNickname(name);
    localStorage.setItem('multiplayer_nickname', name);
  };

  const handleCreateRoom = async () => {
    if (!nickname.trim()) {
      setErrorMsg('請輸入您的特工代號！');
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      await createOnlineRoom(nickname, selectedCharId, {
        startingCash,
        maxRounds,
        aiCount: 3, // Initial count, will adjust when starting
        enableRaids,
        enableQuirks
      });
    } catch (e) {
      setErrorMsg('創建房間失敗，請重試。');
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!nickname.trim()) {
      setErrorMsg('請輸入您的特工代號！');
      return;
    }
    if (!inputRoomId.trim()) {
      setErrorMsg('請輸入 4 碼房間代號！');
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await joinOnlineRoom(inputRoomId.trim(), nickname, selectedCharId);
      if (!res.success) {
        setErrorMsg(res.error || '加入房間失敗！');
      }
    } catch (e) {
      setErrorMsg('加入房間失敗，請確認房間代號。');
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleReady = () => {
    setReady(!isReady);
  };

  const handleStartGame = () => {
    // Check if everyone is ready
    const allReady = onlinePlayers.every(p => p.isReady || p.isAi);
    if (!allReady) {
      setErrorMsg('必須所有玩家皆準備就緒後，方可開始對局！');
      return;
    }
    setErrorMsg(null);
    startMultiplayerGame();
  };

  const handleLeaveRoom = () => {
    quitRoom();
    setMode('selection');
    setErrorMsg(null);
  };

  if (roomId) {
    // Room waiting lobby
    const allReady = onlinePlayers.every(p => p.isReady || p.isAi);

    return (
      <div className={styles.container}>
        <div className={styles.titleSection}>
          <h1 className={styles.title}>戰略指揮大廳</h1>
          <div className={styles.roomBadge}>
            房間號：<strong>{roomId}</strong>
          </div>
        </div>

        <div className={styles.setupBox}>
          <h3 className={styles.sectionTitle}>待命特工列表 ({onlinePlayers.length}/4)</h3>
          
          <div className={styles.playerListGrid}>
            {onlinePlayers.map((player) => {
              const char = CHARACTERS.find(c => c.id === player.characterId)!;
              const isHost = player.id === 'p1';
              const me = player.id === myPlayerId;
              
              return (
                <div key={player.id} className={`${styles.playerRow} ${me ? styles.myRow : ''}`}>
                  <div className={styles.playerProfile}>
                    {renderAvatar(player.characterId, 36)}
                    <div className={styles.playerText}>
                      <span className={styles.pName}>{player.name} {me && '(我)'}</span>
                      <span className={styles.pChar}>{char.name} ‧ {char.quirk}</span>
                    </div>
                  </div>

                  <div className={styles.playerStatus}>
                    {isHost && <span className={styles.hostBadge}>房主</span>}
                    {player.isReady ? (
                      <span className={styles.readyTag}>準備完成</span>
                    ) : (
                      <span className={styles.notReadyTag}>待命中</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {errorMsg && <p className={styles.errorText}>⚠️ {errorMsg}</p>}

          <div className={styles.lobbyButtons}>
            <button className={styles.btnDanger} onClick={handleLeaveRoom}>
              🚪 離開房間
            </button>

            {multiplayerRole === 'host' ? (
              <button 
                className={styles.btnPrimary} 
                onClick={handleStartGame}
                disabled={!allReady}
                title={!allReady ? "等待其他玩家準備..." : "開啟多人連線遊戲"}
              >
                🎮 啟動特工對局
              </button>
            ) : (
              <button 
                className={isReady ? styles.btnDanger : styles.btnSuccess} 
                onClick={handleToggleReady}
              >
                {isReady ? '✖️ 取消準備' : '✔️ 準備完成'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Pre-room forms
  return (
    <div className={styles.container}>
      <div className={styles.titleSection}>
        <h1 className={styles.title}>桃園 Hero City</h1>
        <p className={styles.subtitle}>即時線上多人連線大廳 ‧ 異能對決大富翁</p>
      </div>

      <div className={styles.setupBox}>
        {mode === 'selection' && (
          <div className={styles.menuGrid}>
            <div className={styles.formField} style={{ gridColumn: 'span 2' }}>
              <label className={styles.label}>我的特工代號 (暱稱)</label>
              <input 
                type="text" 
                className={styles.input} 
                value={nickname}
                onChange={e => saveNickname(e.target.value)}
                placeholder="請輸入你的代號..."
              />
            </div>

            <div className={styles.characterSection} style={{ gridColumn: 'span 2' }}>
              <label className={styles.label}>選擇派遣英雄特工</label>
              <div className={styles.charSelectGrid}>
                {CHARACTERS.map(char => {
                  const isSelected = selectedCharId === char.id;
                  return (
                    <div 
                      key={char.id}
                      className={`${styles.charSelectItem} ${isSelected ? styles.charSelected : ''}`}
                      onClick={() => setSelectedCharId(char.id)}
                    >
                      {renderAvatar(char.id, 24)}
                      <span className={styles.charName}>{char.name}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {errorMsg && <p className={styles.errorText} style={{ gridColumn: 'span 2' }}>⚠️ {errorMsg}</p>}

            <button className={styles.btnMenuPrimary} onClick={() => { setErrorMsg(null); setMode('create'); }}>
              🏢 建立連線房間
            </button>
            
            <button className={styles.btnMenuSecondary} onClick={() => { setErrorMsg(null); setMode('join'); }}>
              🔑 加入現有房間
            </button>

            <button className={styles.btnMenuOutline} style={{ gridColumn: 'span 2' }} onClick={onBackToOffline}>
              👤 返回單機模式
            </button>
          </div>
        )}

        {mode === 'create' && (
          <div className={styles.formGrid}>
            <h3 className={styles.sectionTitle} style={{ gridColumn: 'span 2' }}>配置新局參數 (房間主辦人)</h3>
            
            <div className={styles.formField}>
              <label className={styles.label}>起始支援預算</label>
              <select 
                className={styles.select}
                value={startingCash} 
                onChange={e => setStartingCash(Number(e.target.value))}
              >
                <option value={20000}>$20,000 (標準)</option>
                <option value={80000}>$80,000 (快速)</option>
                <option value={200000}>$200,000 (發展)</option>
              </select>
            </div>

            <div className={styles.formField}>
              <label className={styles.label}>最大局數限制</label>
              <select 
                className={styles.select}
                value={maxRounds} 
                onChange={e => setMaxRounds(Number(e.target.value))}
              >
                <option value={30}>30 回合 (快速)</option>
                <option value={60}>60 回合 (標準)</option>
                <option value={90}>90 回合 (戰略)</option>
              </select>
            </div>

            <div className={styles.checkboxField} style={{ gridColumn: 'span 2' }}>
              <label className={styles.checkboxLabel}>
                <input 
                  type="checkbox" 
                  checked={enableQuirks}
                  onChange={e => setEnableQuirks(e.target.checked)}
                />
                開啟角色專屬天賦技能 (Quirks)
              </label>
            </div>

            <div className={styles.checkboxField} style={{ gridColumn: 'span 2' }}>
              <label className={styles.checkboxLabel}>
                <input 
                  type="checkbox" 
                  checked={enableRaids}
                  onChange={e => setEnableRaids(e.target.checked)}
                />
                啟用隨機事件英雄/敵聯合亂入系統
              </label>
            </div>

            {errorMsg && <p className={styles.errorText} style={{ gridColumn: 'span 2' }}>⚠️ {errorMsg}</p>}

            <div className={styles.lobbyButtons} style={{ gridColumn: 'span 2' }}>
              <button className={styles.btnSecondary} onClick={() => setMode('selection')} disabled={loading}>
                返回
              </button>
              <button className={styles.btnPrimary} onClick={handleCreateRoom} disabled={loading}>
                {loading ? '創建中...' : '確認並生成房間'}
              </button>
            </div>
          </div>
        )}

        {mode === 'join' && (
          <div className={styles.formGrid}>
            <h3 className={styles.sectionTitle} style={{ gridColumn: 'span 2' }}>請輸入對接的房間代號</h3>
            
            <div className={styles.formField} style={{ gridColumn: 'span 2' }}>
              <label className={styles.label}>房間號 (4 碼英文)</label>
              <input 
                type="text" 
                className={styles.input} 
                maxLength={4}
                value={inputRoomId}
                onChange={e => setInputRoomId(e.target.value.toUpperCase())}
                placeholder="例如 ABCD..."
                style={{ textTransform: 'uppercase', letterSpacing: '4px', textAlign: 'center', fontSize: '20px', fontWeight: 'bold' }}
              />
            </div>

            {errorMsg && <p className={styles.errorText} style={{ gridColumn: 'span 2' }}>⚠️ {errorMsg}</p>}

            <div className={styles.lobbyButtons} style={{ gridColumn: 'span 2' }}>
              <button className={styles.btnSecondary} onClick={() => setMode('selection')} disabled={loading}>
                返回
              </button>
              <button className={styles.btnPrimary} onClick={handleJoinRoom} disabled={loading}>
                {loading ? '對接中...' : '連線並加入對局'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
export default Lobby;
