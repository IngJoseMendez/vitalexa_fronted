// src/services/NotificationService.js
import SockJS from 'sockjs-client';
import { Client, ReconnectionTimeMode } from '@stomp/stompjs';

/**
 * Una sola conexión WebSocket para toda la app, con varios oyentes (la campana y el dashboard).
 *
 * Antes guardaba un solo callback: el segundo componente en conectarse no recibía nada (o abría
 * otra conexión y llegaban duplicadas) y el dashboard, al desmontarse, cerraba también la de la
 * campana. Además usaba Stomp.over(socket), que no reconecta: tras un despliegue del backend o un
 * corte de red las notificaciones dejaban de llegar en silencio hasta recargar la página.
 */
class NotificationService {
  constructor() {
    this.listeners = new Set();
    this.userRole = 'vendedor';
    this.client = null;
  }

  /** Suscribe un oyente (y conecta si hace falta). Devuelve la función para desuscribirlo. */
  connect(listener, userRole = 'vendedor') {
    this.listeners.add(listener);
    this.userRole = userRole;
    if (!this.client) {
      this.client = this.createClient();
      window.addEventListener('online', this.reconnectNow);
      document.addEventListener('visibilitychange', this.reconnectNow);
    }
    return () => this.disconnect(listener);
  }

  /** Quita el oyente; la conexión se cierra cuando ya no queda ninguno. */
  disconnect(listener) {
    this.listeners.delete(listener);
    if (this.listeners.size > 0 || !this.client) return;

    window.removeEventListener('online', this.reconnectNow);
    document.removeEventListener('visibilitychange', this.reconnectNow);
    const client = this.client;
    this.client = null;
    client.deactivate();
  }

  isConnected() {
    return Boolean(this.client && this.client.connected);
  }

  createClient() {
    // 🔥 Usar variable de entorno, con fallback a localhost para desarrollo
    const WS_URL = process.env.REACT_APP_WS_URL || 'http://localhost:8080/ws';

    const client = new Client({
      webSocketFactory: () => new SockJS(WS_URL),
      // Reintenta siempre: 2 s, 4 s, 8 s… hasta 1 min entre intentos (poco tráfico con mala señal)
      reconnectDelay: 2000,
      maxReconnectDelay: 60000,
      reconnectTimeMode: ReconnectionTimeMode.EXPONENTIAL,
      connectionTimeout: 15000,
      // El servidor late cada 10 s: sin latidos la conexión se da por muerta y se reconecta
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 0,
      // El token se lee en cada intento (puede haber cambiado desde la conexión anterior)
      beforeConnect: (stompClient) => {
        const token = localStorage.getItem('token');
        stompClient.connectHeaders = token ? { Authorization: `Bearer ${token}` } : {};
      },
      // También tras cada reconexión: las suscripciones no sobreviven al socket anterior
      onConnect: () => this.subscribeTopics(client),
      onStompError: (frame) => console.error('❌ Error en WebSocket:', frame.headers?.message),
      debug: (msg) => {
        if (process.env.NODE_ENV === 'development') {
          console.log('STOMP:', msg);
        }
      },
    });
    client.activate();
    return client;
  }

  subscribeTopics(client) {
    const emit = (notification) => this.listeners.forEach((listener) => {
      try {
        listener(notification);
      } catch (error) {
        console.error('Error procesando notificación:', error);
      }
    });
    const parse = (message) => {
      try {
        return JSON.parse(message.body);
      } catch (error) {
        console.error('Notificación ilegible:', error);
        return null;
      }
    };

    // Solo admin y owner: el servidor rechaza este canal para los demás roles
    if (this.userRole === 'admin' || this.userRole === 'owner') {
      client.subscribe('/topic/admin-owner/notifications', (message) => {
        const notification = parse(message);
        if (notification) emit(notification);
      });
    }

    // Para todos: cambios de inventario (los dashboards refrescan; no son avisos de la campana)
    client.subscribe('/topic/inventory', (message) => {
      const event = parse(message);
      if (event) emit({ type: 'INVENTORY_UPDATE', payload: event });
    });

    // Para todos: notificaciones generales (órdenes completadas)
    client.subscribe('/topic/notifications', (message) => {
      const notification = parse(message);
      if (notification) emit(notification);
    });
  }

  // Al volver a la pestaña o recuperar la red no espera el próximo reintento (hasta 1 min)
  reconnectNow = () => {
    const client = this.client;
    if (!client || client.connected || document.visibilityState === 'hidden') return;
    client.deactivate().then(() => {
      if (this.client === client) client.activate();
    });
  };
}

const notificationService = new NotificationService();
export default notificationService;
