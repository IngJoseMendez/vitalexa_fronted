// src/services/NotificationService.js
import SockJS from 'sockjs-client';
import { Stomp } from '@stomp/stompjs';

class NotificationService {
  constructor() {
    this.stompClient = null;
    this.subscriptions = [];
    this.connected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
  }

  connect(onMessageReceived, userRole = 'vendedor') {
    if (this.connected) {
      console.log('⚠️ Ya estás conectado al WebSocket');
      return;
    }

    console.log(`🔌 Conectando WebSocket como ${userRole}...`);

    console.log('🔍 process.env.REACT_APP_WS_URL:', process.env.REACT_APP_WS_URL);
    console.log('🔍 process.env.NODE_ENV:', process.env.NODE_ENV);

    // 🔥 Usar variable de entorno, con fallback a localhost para desarrollo
    const WS_URL = process.env.REACT_APP_WS_URL || 'http://localhost:8080/ws';
    console.log('🔍 WebSocket URL:', WS_URL);

    const socket = new SockJS(WS_URL);
    this.stompClient = Stomp.over(socket);

    // Desactivar logs de debug en producción
    this.stompClient.debug = (msg) => {
      if (process.env.NODE_ENV === 'development') {
        console.log('STOMP:', msg);
      }
    };

    this.stompClient.connect(
      {},
      (frame) => {
        console.log('✅ WebSocket conectado exitosamente');
        this.connected = true;
        this.reconnectAttempts = 0;

        // ✅ SUSCRIPCIÓN ÚNICA PARA ADMIN Y OWNER
        if (userRole === 'admin' || userRole === 'owner') {
          this.subscriptions.push(
            this.stompClient.subscribe('/topic/admin-owner/notifications', (message) => {
              const notification = JSON.parse(message.body);
              console.log('📬 Notificación admin/owner:', notification.type);
              onMessageReceived(notification);
            })
          );
          console.log('📡 Suscrito a /topic/admin-owner/notifications');
        }

        // ✅ SUSCRIPCIÓN PARA TODOS: Actualizaciones de inventario
        this.subscriptions.push(
          this.stompClient.subscribe('/topic/inventory', (message) => {
            const event = JSON.parse(message.body);
            console.log('📦 Actualización de inventario:', event.action);
            // Enviamos el evento con un tipo especial
            onMessageReceived({ type: 'INVENTORY_UPDATE', payload: event });
          })
        );
        console.log('📡 Suscrito a /topic/inventory (Global)');

        // Todos reciben notificaciones generales (órdenes completadas)
        this.subscriptions.push(
          this.stompClient.subscribe('/topic/notifications', (message) => {
            const notification = JSON.parse(message.body);
            console.log('📬 Notificación general:', notification.type);
            onMessageReceived(notification);
          })
        );
        console.log('📡 Suscrito a /topic/notifications');
      },
      (error) => {
        console.error('❌ Error en WebSocket:', error);
        this.connected = false;
        this.handleReconnect(onMessageReceived, userRole);
      }
    );
  }

  handleReconnect(onMessageReceived, userRole) {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

      console.log(`🔄 Reintentando conexión en ${delay / 1000}s (intento ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

      setTimeout(() => {
        this.connect(onMessageReceived, userRole);
      }, delay);
    } else {
      console.error('❌ Se alcanzó el máximo de intentos de reconexión');
    }
  }

  disconnect() {
    if (this.stompClient && this.connected) {
      this.subscriptions.forEach(sub => {
        try {
          sub.unsubscribe();
        } catch (error) {
          console.error('Error al desuscribirse:', error);
        }
      });
      this.subscriptions = [];

      try {
        this.stompClient.disconnect(() => {
          console.log('🔌 Desconectado de WebSocket');
        });
      } catch (error) {
        console.error('Error al desconectar:', error);
      }

      this.connected = false;
      this.reconnectAttempts = 0;
    }
  }

  isConnected() {
    return this.connected;
  }

  // Método para enviar mensajes (opcional, por si lo necesitas)
  send(destination, message) {
    if (this.connected && this.stompClient) {
      this.stompClient.send(destination, {}, JSON.stringify(message));
    } else {
      console.error('No se puede enviar: WebSocket no conectado');
    }
  }
}

const notificationService = new NotificationService();
export default notificationService;
