import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx'; // Importerer App med stort A
import { GameDataProvider } from './context/GameDataContext.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <GameDataProvider>
      <App />
    </GameDataProvider>
  </React.StrictMode>
);