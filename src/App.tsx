import { useGameStore } from './store/gameStore';
import GameSetup from './components/GameSetup/GameSetup';
import Lobby from './components/Multiplayer/Lobby';
import Board from './components/Board/Board';
import TileModal from './components/Board/TileModal';
import GameResult from './components/Dashboard/GameResult';
import './styles/global.css';

function App() {
  const state = useGameStore(store => store.state);
  const isMultiplayer = useGameStore(store => store.isMultiplayer);
  const roomStatus = useGameStore(store => store.roomStatus);
  const dispatch = useGameStore(store => store.dispatch);

  const handleCloseModal = () => {
    dispatch({ type: 'SELECT_TILE', tileId: undefined as any });
  };

  const handleBackToOffline = () => {
    useGameStore.setState({ isMultiplayer: false });
  };

  // 判斷是否為多人連線大廳模式
  if (isMultiplayer) {
    if (roomStatus !== 'playing' || state === null) {
      return <Lobby onBackToOffline={handleBackToOffline} />;
    }
  } else {
    // 單機模式
    if (state === null) {
      return <GameSetup />;
    }
  }

  return (
    <>
      {/* 大富翁棋盤與 Dashboard */}
      <Board />

      {/* 結算排名與戰績看板 (Overlay) */}
      {state.mode === 'finished' && <GameResult />}

      {/* 點擊據點詳細彈窗 (Escape / Click Outside to close) */}
      {state.selectedTileId !== undefined && (
        <TileModal 
          tileId={state.selectedTileId} 
          onClose={handleCloseModal} 
        />
      )}
    </>
  );
}

export default App;
