import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import NotificationService from '../services/NotificationService';
import { useConfirm } from './ConfirmDialog';
import '../styles/NotificationCenter.css';

function NotificationCenter({ userRole }) {
  const [notifications, setNotifications] = useState([]);
  const [showPanel, setShowPanel] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const navigate = useNavigate();
  const confirm = useConfirm();

  useEffect(() => {
    if (!userRole) return;

    console.log('🚀 Iniciando NotificationCenter para rol:', userRole);

    // Conectar a WebSocket
    NotificationService.connect((notification) => {
      handleNewNotification(notification);
    }, userRole);

    // Cargar notificaciones del localStorage
    const saved = localStorage.getItem('notifications');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setNotifications(parsed);
        updateUnreadCount(parsed);
      } catch (error) {
        console.error('Error al cargar notificaciones guardadas:', error);
        localStorage.removeItem('notifications');
      }
    }

    // Pedir permisos de notificación
    requestNotificationPermission();

    return () => {
      NotificationService.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userRole]);

  const handleNewNotification = (notification) => {
    console.log('🔔 Nueva notificación recibida:', notification);

    setNotifications(prev => {
      const updated = [notification, ...prev].slice(0, 50); // Máximo 50 notificaciones
      localStorage.setItem('notifications', JSON.stringify(updated));
      updateUnreadCount(updated);
      return updated;
    });

    // Mostrar notificación del navegador
    showBrowserNotification(notification);

    // Reproducir sonido
    playNotificationSound();

    // ✅ DISPARAR EVENTOS PERSONALIZADOS PARA AUTO-ACTUALIZACIÓN
    if (notification.type === 'NEW_ORDER') {
      window.dispatchEvent(new CustomEvent('new-order-notification'));
      console.log('📤 Evento de nueva orden disparado');
    }

    if (notification.type === 'ORDER_COMPLETED') {
      window.dispatchEvent(new CustomEvent('order-completed-notification'));
      console.log('📤 Evento de orden completada disparado');
    }
  };

  const updateUnreadCount = (notifs) => {
    const count = notifs.filter(n => !n.read).length;
    setUnreadCount(count);
  };

  const showBrowserNotification = (notification) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      const browserNotif = new Notification(notification.title, {
        body: notification.message,
        icon: '/logo192.png',
        badge: '/logo192.png',
        tag: notification.id,
        requireInteraction: false,
        silent: false
      });

      // Auto-cerrar después de 5 segundos
      setTimeout(() => browserNotif.close(), 5000);

      // Click en la notificación del navegador
      browserNotif.onclick = () => {
        window.focus();
        handleNotificationClick(notification);
        browserNotif.close();
      };
    }
  };

  const playNotificationSound = () => {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.2);
    } catch (error) {
      console.log('No se pudo reproducir el sonido:', error);
    }
  };

  const requestNotificationPermission = () => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(permission => {
        console.log('Permiso de notificación:', permission);
        if (permission === 'granted') {
          console.log('✅ Notificaciones del navegador habilitadas');
        }
      });
    }
  };

  const markAsRead = (notificationId) => {
    setNotifications(prev => {
      const updated = prev.map(n =>
        n.id === notificationId ? { ...n, read: true } : n
      );
      localStorage.setItem('notifications', JSON.stringify(updated));
      updateUnreadCount(updated);
      return updated;
    });
  };

  const markAllAsRead = () => {
    setNotifications(prev => {
      const updated = prev.map(n => ({ ...n, read: true }));
      localStorage.setItem('notifications', JSON.stringify(updated));
      updateUnreadCount(updated);
      return updated;
    });
  };

  const clearAll = async () => {
    const confirmed = await confirm({
      title: '¿Eliminar todas las notificaciones?',
      message: 'Esta acción no se puede deshacer.'
    });

    if (!confirmed) return;

    setNotifications([]);
    setUnreadCount(0);
    localStorage.removeItem('notifications');
  };

  const handleNotificationClick = (notification) => {
    markAsRead(notification.id);
    setShowPanel(false);

    // ✅ NAVEGACIÓN SIN RECARGAR PÁGINA
    const role = localStorage.getItem('role');

    if (role === 'ROLE_OWNER') {
      navigate('/owner', { replace: false });
    } else if (role === 'ROLE_ADMIN') {
      navigate('/admin', { replace: false });
    } else if (role === 'ROLE_VENDEDOR') {
      navigate('/vendedor', { replace: false });
    }

    // Disparar evento para que el dashboard actualice
    setTimeout(() => {
      if (notification.type === 'NEW_ORDER') {
        window.dispatchEvent(new CustomEvent('new-order-notification'));
      }
    }, 100);
  };

  const getNotificationIcon = (type) => {
    const icons = {
      NEW_ORDER: 'inventory_2',
      ORDER_COMPLETED: 'check_circle',
      LOW_STOCK: 'warning',
      OUT_OF_STOCK: 'error',
      RESTOCK_NEEDED: 'trending_up',
      SYSTEM_ALERT: 'notifications'
    };
    return <span className="material-icons-round">{icons[type] || 'notifications'}</span>;
  };

  const getNotificationClass = (type) => {
    const classes = {
      NEW_ORDER: 'info',
      ORDER_COMPLETED: 'success',
      LOW_STOCK: 'warning',
      OUT_OF_STOCK: 'danger',
      RESTOCK_NEEDED: 'info',
      SYSTEM_ALERT: 'info'
    };
    return classes[type] || 'info';
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Ahora';
    if (diffMins < 60) return `Hace ${diffMins} min`;
    if (diffHours < 24) return `Hace ${diffHours}h`;
    if (diffDays < 7) return `Hace ${diffDays}d`;

    return date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="notification-center">
      <button
        className="notification-bell"
        onClick={() => setShowPanel(!showPanel)}
        title="Notificaciones"
        aria-label="Notificaciones"
      >
        <span className="material-icons-round" style={{ fontSize: '24px' }}>notifications</span>
        {unreadCount > 0 && (
          <span className="badge" aria-label={`${unreadCount} notificaciones no leídas`}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {showPanel && (
        <>
          <div className="notification-overlay" onClick={() => setShowPanel(false)} />
          <div className="notification-panel">
            <div className="panel-header">
              <h3>🔔 Notificaciones</h3>
              <div className="panel-actions">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="btn-mark-read"
                    title="Marcar todas como leídas"
                  >
                    <span className="material-icons-round" style={{ fontSize: '18px' }}>done_all</span> All
                  </button>
                )}
                {notifications.length > 0 && (
                  <button
                    onClick={clearAll}
                    className="btn-clear"
                    title="Limpiar todas"
                  >
                    <span className="material-icons-round" style={{ fontSize: '18px' }}>delete_sweep</span>
                  </button>
                )}
                <button
                  onClick={() => setShowPanel(false)}
                  className="btn-close"
                  title="Cerrar"
                >
                  <span className="material-icons-round" style={{ fontSize: '18px' }}>close</span>
                </button>
              </div>
            </div>

            <div className="notifications-list">
              {notifications.length === 0 ? (
                <div className="no-notifications">
                  <div className="empty-icon"><span className="material-icons-round" style={{ fontSize: '48px' }}>notifications_off</span></div>
                  <p>No hay notificaciones</p>
                  <span>Te notificaremos cuando haya algo nuevo</span>
                </div>
              ) : (
                <>
                  {notifications.map(notification => (
                    <div
                      key={notification.id}
                      className={`notification-item ${getNotificationClass(notification.type)} ${notification.read ? 'read' : 'unread'}`}
                      onClick={() => handleNotificationClick(notification)}
                    >
                      <div className="notification-icon">
                        {getNotificationIcon(notification.type)}
                      </div>
                      <div className="notification-content">
                        <h4>{notification.title}</h4>
                        <p>{notification.message}</p>
                        <span className="notification-time">
                          {formatTime(notification.timestamp)}
                        </span>
                      </div>
                      {!notification.read && <div className="unread-dot" />}
                    </div>
                  ))}
                </>
              )}
            </div>

            {notifications.length > 0 && (
              <div className="panel-footer">
                <span className="notifications-count">
                  {notifications.length} notificación{notifications.length !== 1 ? 'es' : ''}
                </span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default NotificationCenter;
