import React from 'react';
import ReactDOM from 'react-dom/client';
// Orden importa (en CRA todo el CSS es global): primero el sistema de diseño (tokens,
// base, primitivas .ui-* y clases legacy), luego los helpers de la app y el layout
// compartido de los dashboards. El CSS de cada área se carga después y puede pisarlos.
import './styles/design-system.css';
import './index.css';
import './styles/Dashboard.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
