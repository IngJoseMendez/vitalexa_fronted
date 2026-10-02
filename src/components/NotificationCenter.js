import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import NotificationService from '../services/NotificationService';
import { useConfirm } from './ConfirmDialog';
import '../styles/NotificationCenter.css';

// Solo son avisos de la campana los que manda el backend con id y título. Los eventos de
// inventario (INVENTORY_UPDATE) solo refrescan los dashboards: antes entraban aquí sin fecha ni
// texto, se veían como "Invalid Date", contaban como no leídos y hacían sonar la campana.
export const isDisplayableNotification = (n) =>
  Boolean(n && n.id && n.title && n.type !== 'INVENTORY_UPDATE');

// El backend manda la hora de Colombia sin zona ("2026-10-01T10:30:05.123"). Las fracciones se
// recortan a milisegundos porque no todos los navegadores aceptan más dígitos.
export const parseNotificationDate = (value) => {
  if (value == null || value === '') return null;
  const date = new Date(typeof value === 'string' ? value.replace(/(\.\d{3})\d+/, '$1') : value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const MAX_NOTIFICATIONS = 50;

// Logo de Vitalexa para el aviso del navegador (antes /logo192.png era el átomo de React). El
// ?v=2 evita que un navegador o el hosting sigan sirviendo el archivo viejo desde la caché.
export const BROWSER_NOTIFICATION_ICON = `${process.env.PUBLIC_URL || ''}/logo192.png?v=2`;

// Por usuario: en un equipo compartido cada quien ve solo sus avisos
const storageKey = () => `notifications:${localStorage.getItem('username') || ''}`;

const loadStoredNotifications = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey()) || '[]');
    return Array.isArray(parsed) ? parsed.filter(isDisplayableNotification) : [];
  } catch (error) {
    return [];
  }
};

const storeNotifications = (list) => {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(list));
  } catch (error) {
    console.error('No se pudieron guardar las notificaciones:', error);
  }
};

// Uno solo por sesión: crear un AudioContext por aviso agota el límite del navegador
let audioContext = null;

function NotificationCenter({ userRole }) {
  const [notifications, setNotifications] = useState(loadStoredNotifications);
  const [showPanel, setShowPanel] = useState(false);
  const navigate = useNavigate();
  const confirm = useConfirm();
  const unreadCount = notifications.filter(n => !n.read).length;

  useEffect(() => {
    if (!userRole) return;

    console.log('🚀 Iniciando NotificationCenter para rol:', userRole);

    // La clave sin usuario de versiones anteriores solo acumulaba eventos de inventario
    localStorage.removeItem('notifications');

    // Pedir permisos de notificación
    requestNotificationPermission();

    // Conectar a WebSocket (devuelve la función para desuscribirse)
    return NotificationService.connect((notification) => {
      handleNewNotification(notification);
    }, userRole);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userRole]);

  const handleNewNotification = (notification) => {
    if (!isDisplayableNotification(notification)) return;

    console.log('🔔 Nueva notificación recibida:', notification);

    setNotifications(prev => {
      // Repetida (p. ej. al reconectar): no se agrega dos veces
      if (prev.some(n => n.id === notification.id)) return prev;
      const updated = [notification, ...prev].slice(0, MAX_NOTIFICATIONS);
      storeNotifications(updated);
      return updated;
    });

    // ✅ DISPARAR EVENTOS PERSONALIZADOS PARA AUTO-ACTUALIZACIÓN (antes que sonido y aviso del
    // navegador: si esos fallan, el dashboard igual se actualiza)
    if (notification.type === 'NEW_ORDER') {
      window.dispatchEvent(new CustomEvent('new-order-notification'));
      console.log('📤 Evento de nueva orden disparado');
    }

    if (notification.type === 'ORDER_COMPLETED') {
      window.dispatchEvent(new CustomEvent('order-completed-notification'));
      console.log('📤 Evento de orden completada disparado');
    }

    // Mostrar notificación del navegador
    showBrowserNotification(notification);

    // Reproducir sonido
    playNotificationSound();
  };

  const showBrowserNotification = (notification) => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      const browserNotif = new Notification(notification.title, {
        body: notification.message,
        icon: BROWSER_NOTIFICATION_ICON,
        badge: BROWSER_NOTIFICATION_ICON,
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
    } catch (error) {
      // Chrome en Android no permite new Notification() fuera de un service worker
      console.log('Aviso del navegador no disponible:', error.message);
    }
  };

  const playNotificationSound = () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      audioContext = audioContext || new AudioCtx();
      if (audioContext.state === 'suspended') audioContext.resume();
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
      storeNotifications(updated);
      return updated;
    });
  };

  const markAllAsRead = () => {
    setNotifications(prev => {
      const updated = prev.map(n => ({ ...n, read: true }));
      storeNotifications(updated);
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
    localStorage.removeItem(storageKey());
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
      SYSTEM_ALERT: 'notifications',
      REEMBOLSO_CREATED: 'assignment_return'
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
    const date = parseNotificationDate(timestamp);
    if (!date) return '';
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
                        {formatTime(notification.timestamp) && (
                          <span className="notification-time">
                            {formatTime(notification.timestamp)}
                          </span>
                        )}
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
