import { useGameStore } from './store/gameStore';
import GameSetup from './components/GameSetup/GameSetup';
import Board from './components/Board/Board';
import TileModal from './components/Board/TileModal';
import GameResult from './components/Dashboard/GameResult';
import './styles/global.css';

function App() {
  const state = useGameStore(store => store.state);
  const dispatch = useGameStore(store => store.dispatch);

  const handleCloseModal = () => {
    dispatch({ type: 'SELECT_TILE', tileId: undefined as any });
  };

  return (
    <>
      {/* 遊戲初始化引導設定頁面 */}
      {state === null ? (
        <GameSetup />
      ) : (
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
      )}
    </>
  );
}

export default App;
