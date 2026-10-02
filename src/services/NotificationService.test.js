import notificationService from './NotificationService';
import { Client, ReconnectionTimeMode } from '@stomp/stompjs';

jest.mock('sockjs-client', () => jest.fn());
jest.mock('@stomp/stompjs', () => ({
    __esModule: true,
    ReconnectionTimeMode: { LINEAR: 0, EXPONENTIAL: 1 },
    Client: jest.fn(),
}));

const lastClient = () => Client.mock.results[Client.mock.results.length - 1].value;
const frame = (body) => ({ body: JSON.stringify(body) });

beforeEach(() => {
    localStorage.clear();
    // Cliente STOMP simulado (CRA reinicia los mocks antes de cada test): guarda la
    // configuración y las suscripciones por canal
    Client.mockImplementation((config) => {
        const client = {
            config,
            connected: false,
            subscriptions: {},
            activate: jest.fn(),
            deactivate: jest.fn(() => Promise.resolve()),
            subscribe: jest.fn((destination, callback) => { client.subscriptions[destination] = callback; }),
        };
        return client;
    });
});

test('la campana y el dashboard comparten una conexión y cada uno se desuscribe solo', () => {
    const bell = jest.fn();
    const dashboard = jest.fn();
    const offBell = notificationService.connect(bell, 'admin');
    const offDashboard = notificationService.connect(dashboard, 'admin');

    expect(Client).toHaveBeenCalledTimes(1);
    const client = lastClient();
    expect(client.activate).toHaveBeenCalledTimes(1);

    client.config.onConnect();
    client.subscriptions['/topic/admin-owner/notifications'](frame({ id: 'n1', type: 'NEW_ORDER', title: 'Nueva' }));
    client.subscriptions['/topic/inventory'](frame({ action: 'STOCK_UPDATED' }));

    for (const listener of [bell, dashboard]) {
        expect(listener).toHaveBeenCalledWith({ id: 'n1', type: 'NEW_ORDER', title: 'Nueva' });
        expect(listener).toHaveBeenCalledWith({ type: 'INVENTORY_UPDATE', payload: { action: 'STOCK_UPDATED' } });
    }

    // Antes, al desmontar el dashboard se cerraba también la conexión de la campana
    offDashboard();
    expect(client.deactivate).not.toHaveBeenCalled();
    offBell();
    expect(client.deactivate).toHaveBeenCalledTimes(1);
});

test('solo admin y owner se suscriben al canal admin-owner (el servidor lo rechaza a los demás)', () => {
    const off = notificationService.connect(jest.fn(), 'vendedor');
    const client = lastClient();
    client.config.onConnect();

    expect(Object.keys(client.subscriptions)).toEqual(['/topic/inventory', '/topic/notifications']);
    off();
});

test('reconecta sola, con espera creciente, y manda el token vigente en cada intento', () => {
    const off = notificationService.connect(jest.fn(), 'owner');
    const { config } = lastClient();

    expect(config.reconnectDelay).toBeGreaterThan(0);
    expect(config.reconnectTimeMode).toBe(ReconnectionTimeMode.EXPONENTIAL);
    expect(config.maxReconnectDelay).toBeGreaterThanOrEqual(config.reconnectDelay);

    localStorage.setItem('token', 'token-nuevo');
    const stompClient = {};
    config.beforeConnect(stompClient);
    expect(stompClient.connectHeaders).toEqual({ Authorization: 'Bearer token-nuevo' });
    off();
});

test('un oyente que falla no impide que los demás reciban', () => {
    const roto = jest.fn(() => { throw new Error('boom'); });
    const sano = jest.fn();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const offRoto = notificationService.connect(roto, 'vendedor');
    const offSano = notificationService.connect(sano, 'vendedor');
    const client = lastClient();
    client.config.onConnect();

    client.subscriptions['/topic/notifications'](frame({ id: 'n2', type: 'ORDER_COMPLETED', title: 'Orden Completada' }));
    expect(sano).toHaveBeenCalledTimes(1);
    offRoto();
    offSano();
    console.error.mockRestore();
});
