import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Login from './pages/Login';
import AdminDashboard from './pages/AdminDashboard';
import VendedorDashboard from './pages/VendedorDashboard';
import OwnerDashboard from './pages/OwnerDashboard';
import EmpacadorDashboard from './pages/EmpacadorDashboard';
import ClientDashboard from './pages/ClientDashboard';
import NotificationCenter from './components/NotificationCenter';
import { ToastProvider } from './components/ToastContainer';
import { ConfirmProvider, useConfirm } from './components/ConfirmDialog';
import './App.css';

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
    if (role === 'ROLE_ADMIN') return '👨‍💼 Admin';
    if (role === 'ROLE_OWNER') return '👑 Owner';
    if (role === 'ROLE_VENDEDOR') return '🛒 Vendedor';
    if (role === 'ROLE_EMPACADOR') return '📦 Empacador';
    if (role === 'ROLE_CLIENTE') return '🛍️ Cliente';
    return '';
  };

  const handleLogout = async () => {
    const confirmed = await confirm({
      title: '¿Cerrar sesión?',
      message: '¿Estás seguro de que deseas cerrar sesión?'
    });

    if (confirmed) {
      localStorage.clear();
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
              <h1 className="app-title">🏪 Vitalexa</h1>
              <span className="app-subtitle">Sistema de Gestión</span>
            </div>

            <div className="header-right">
              <div className="user-info">
                <span className="user-role">{getRoleName()}</span>
                <span className="user-name">{localStorage.getItem('username')}</span>
              </div>

              {/* Sistema de Notificaciones */}
              <NotificationCenter userRole={getUserRole()} />

              <button className="btn-logout" onClick={handleLogout}>
                🚪 Cerrar Sesión
              </button>
            </div>
          </div>
        </header>
      )}

      {/* Contenido principal */}
      <main className="app-main">
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
              <ProtectedRoute allowedRoles={['ROLE_OWNER']}>
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

          <Route path="/" element={<Navigate to="/login" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
