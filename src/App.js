import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Login from './pages/Login';
// La campana (NotificationCenter) se carga bajo demanda junto con su cliente WebSocket
// (sockjs + stomp): la pantalla de login no los necesita y el bundle inicial baja ~22 KB gzip.
// Sus hojas de estilo se siguen importando AQUÍ, en el mismo orden que antes (ConfirmDialog.css
// llegaba primero a través de NotificationCenter), para que la cascada CSS no cambie.
import './styles/ConfirmDialog.css';
import './styles/NotificationCenter.css';
import { ToastProvider } from './components/ToastContainer';
import { ConfirmProvider, useConfirm } from './components/ConfirmDialog';
import { clearStorageKeepingSidebarPrefs } from './hooks/useSidebarCollapsed';
import { BellFallback, LazyErrorBoundary, lazyWithRetry } from './components/LazyFallbacks';
import WelcomeRedesignGate from './components/welcome/WelcomeRedesignGate';
import './App.css';

// lazyWithRetry = React.lazy con un reintento si la red falla (ver LazyFallbacks.js).
const NotificationCenter = lazyWithRetry(() => import('./components/NotificationCenter'));

// Code-splitting: cada dashboard se carga bajo demanda (reduce el bundle inicial).
// Login queda eager (es la primera pantalla). No cambia routing ni lógica.
const AdminDashboard = lazyWithRetry(() => import('./pages/AdminDashboard'));
const VendedorDashboard = lazyWithRetry(() => import('./pages/VendedorDashboard'));
const OwnerDashboard = lazyWithRetry(() => import('./pages/OwnerDashboard'));
const EmpacadorDashboard = lazyWithRetry(() => import('./pages/EmpacadorDashboard'));
const ClientDashboard = lazyWithRetry(() => import('./pages/ClientDashboard'));
const BalancesPage = lazyWithRetry(() => import('./pages/BalancesPage'));

// V dorada de la marca (mismo archivo que el aviso del navegador y el login: una sola descarga).
// El ?v=2 evita que el navegador o el hosting sirvan el logo viejo (el de React) desde la caché.
const BRAND_LOGO_SRC = `${process.env.PUBLIC_URL || ''}/logo192.png?v=2`;

function App() {
  const getRole = () => localStorage.getItem('role');
  const getToken = () => localStorage.getItem('token');

  const ProtectedRoute = ({ children, allowedRoles }) => {
    const role = getRole();
    const token = getToken();

    if (!token) {
      return <Navigate to="/login" replace />;
    }

    if (!allowedRoles.includes(role)) {
      return <Navigate to="/login" replace />;
    }

    return children;
  };

  return (
    <ToastProvider>
      <ConfirmProvider>
        <BrowserRouter>
          <AppContent
            getRole={getRole}
            getToken={getToken}
            ProtectedRoute={ProtectedRoute}
          />
        </BrowserRouter>
      </ConfirmProvider>
    </ToastProvider>
  );
}

function AppContent({ getRole, getToken, ProtectedRoute }) {
  const location = useLocation();
  const confirm = useConfirm();
  const isLoginPage = location.pathname === '/login';
  const token = getToken();
  const role = getRole();

  const getUserRole = () => {
    if (!role) return null;
    if (role === 'ROLE_ADMIN') return 'admin';
    if (role === 'ROLE_OWNER') return 'owner';
    if (role === 'ROLE_VENDEDOR') return 'vendedor';
    if (role === 'ROLE_EMPACADOR') return 'empacador';
    if (role === 'ROLE_VENDEDOR') return 'vendedor';
    if (role === 'ROLE_EMPACADOR') return 'empacador';
    if (role === 'ROLE_CLIENTE') return 'cliente';
    return 'vendedor';
  };

  const getRoleName = () => {
    if (role === 'ROLE_ADMIN') return 'Admin';
    if (role === 'ROLE_OWNER') return 'Owner';
    if (role === 'ROLE_VENDEDOR') return 'Vendedor';
    if (role === 'ROLE_EMPACADOR') return 'Empacador';
    if (role === 'ROLE_CLIENTE') return 'Cliente';
    return '';
  };

  // Icono Material del rol (reemplaza los emojis que antes iban dentro del nombre)
  const getRoleIcon = () => {
    if (role === 'ROLE_ADMIN') return 'admin_panel_settings';
    if (role === 'ROLE_OWNER') return 'verified_user';
    if (role === 'ROLE_VENDEDOR') return 'storefront';
    if (role === 'ROLE_EMPACADOR') return 'inventory_2';
    if (role === 'ROLE_CLIENTE') return 'shopping_bag';
    return '';
  };

  const handleLogout = async () => {
    const confirmed = await confirm({
      title: '¿Cerrar sesión?',
      message: '¿Estás seguro de que deseas cerrar sesión?'
    });

    if (confirmed) {
      // Borra la sesión pero conserva la preferencia del menú lateral (es de la persona)
      clearStorageKeepingSidebarPrefs();
      window.location.href = '/login';
    }
  };

  return (
    <div className="app">
      {/* Header global - Solo si NO es login y usuario autenticado */}
      {!isLoginPage && token && (
        <header className="app-header">
          <div className="header-content">
            <div className="header-left">
              <img
                className="app-logo"
                src={BRAND_LOGO_SRC}
                width="36"
                height="36"
                alt="Vitalexa"
              />
              <h1 className="app-title">Vitalexa</h1>
              <span className="app-subtitle">Sistema de Gestión</span>
            </div>

            <div className="header-right">
              <div className="user-info">
                <span className="user-role">
                  {getRoleIcon() && (
                    <span className="material-icons-round" aria-hidden="true">{getRoleIcon()}</span>
                  )}
                  {getRoleName()}
                </span>
                <span className="user-name">{localStorage.getItem('username')}</span>
              </div>

              {/* Sistema de Notificaciones (mientras carga su código se ve la campana sin acción;
                  si no se pudo descargar, una campana tachada que recarga al tocarla) */}
              <LazyErrorBoundary variant="bell">
                <React.Suspense fallback={<BellFallback />}>
                  <NotificationCenter userRole={getUserRole()} />
                </React.Suspense>
              </LazyErrorBoundary>

              <button className="btn-logout ui-btn ui-btn--secondary ui-btn--sm" onClick={handleLogout}>
                <span className="material-icons-round" aria-hidden="true">logout</span>
                <span className="btn-logout-text">Cerrar Sesión</span>
              </button>
            </div>
          </div>
        </header>
      )}

      {/* Bienvenida del rediseño para la administración: una sola vez por usuario y navegador */}
      {!isLoginPage && token && role === 'ROLE_ADMIN' && (
        <WelcomeRedesignGate
          key={localStorage.getItem('username') || ''}
          username={localStorage.getItem('username') || ''}
        />
      )}

      {/* Contenido principal */}
      <main className="app-main">
        {/* Si el código de una página no se pudo descargar: aviso con "Reintentar" en vez de
            pantalla en blanco (se reintenta solo al cambiar de ruta) */}
        <LazyErrorBoundary variant="page" resetKey={location.pathname}>
        <React.Suspense
          fallback={
            <div className="app-loading" role="status">
              <span className="ui-spinner" aria-hidden="true" />
              Cargando…
            </div>
          }
        >
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            path="/admin/*"
            element={
              <ProtectedRoute allowedRoles={['ROLE_ADMIN', 'ROLE_OWNER']}>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/vendedor/*"
            element={
              <ProtectedRoute allowedRoles={['ROLE_VENDEDOR']}>
                <VendedorDashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/owner/*"
            element={
              <ProtectedRoute allowedRoles={['ROLE_OWNER', 'ROLE_ADMIN']}>
                <OwnerDashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/empacador/*"
            element={
              <ProtectedRoute allowedRoles={['ROLE_EMPACADOR']}>
                <EmpacadorDashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/cliente/*"
            element={
              <ProtectedRoute allowedRoles={['ROLE_CLIENTE']}>
                <ClientDashboard />
              </ProtectedRoute>
            }
          />

          {/* Balances Page - Accessible by Owner, Admin, Vendedor */}
          <Route
            path="/balances"
            element={
              <ProtectedRoute allowedRoles={['ROLE_OWNER', 'ROLE_ADMIN', 'ROLE_VENDEDOR']}>
                <BalancesPage />
              </ProtectedRoute>
            }
          />

          <Route path="/" element={<Navigate to="/login" replace />} />
        </Routes>
        </React.Suspense>
        </LazyErrorBoundary>
      </main>
    </div>
  );
}

export default App;
