import { render, screen, act, fireEvent } from '@testing-library/react';
import NotificationCenter, { parseNotificationDate } from './NotificationCenter';
import NotificationService from '../services/NotificationService';

// react-router-dom (ESM) no se resuelve en el Jest de CRA: solo se usa useNavigate
jest.mock('react-router-dom', () => ({ useNavigate: () => jest.fn() }), { virtual: true });
jest.mock('./ConfirmDialog', () => ({ useConfirm: () => jest.fn(() => Promise.resolve(true)) }));
jest.mock('../services/NotificationService', () => ({
    __esModule: true,
    default: { connect: jest.fn(() => jest.fn()) },
}));

// Oyente que la campana registró en el servicio
const receive = (notification) => act(() => NotificationService.connect.mock.calls[0][0](notification));

const ordenNueva = {
    id: 'n1', type: 'NEW_ORDER', title: 'Nueva Orden Recibida', message: 'Nueva orden #abc12345',
    timestamp: '2026-10-01T10:30:05.123456', read: false,
};

beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('username', 'admin');
    NotificationService.connect.mockImplementation(() => jest.fn()); // devuelve el "desuscribir"
});

test('los eventos de inventario no entran a la campana; los avisos reales sí, una sola vez', () => {
    render(<NotificationCenter userRole="admin" />);

    receive({ type: 'INVENTORY_UPDATE', payload: { action: 'STOCK_UPDATED', timestamp: 1 } });
    expect(screen.queryByLabelText(/no leídas/)).not.toBeInTheDocument();

    receive(ordenNueva);
    receive(ordenNueva); // repetida
    expect(screen.getByLabelText('1 notificaciones no leídas')).toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Notificaciones'));
    expect(screen.getAllByText('Nueva Orden Recibida')).toHaveLength(1);
    expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument();
});

test('al cargar descarta la basura que guardaron versiones anteriores', () => {
    localStorage.setItem('notifications', JSON.stringify([{ type: 'INVENTORY_UPDATE', payload: {} }]));
    localStorage.setItem('notifications:admin', JSON.stringify([
        { type: 'INVENTORY_UPDATE', payload: { action: 'STOCK_UPDATED' } },
        { id: 'n2', type: 'ORDER_COMPLETED', title: 'Orden Completada', message: 'La orden #abc fue completada',
            timestamp: '2026-09-30T08:00:00', read: false },
    ]));

    render(<NotificationCenter userRole="admin" />);
    expect(screen.getByLabelText('1 notificaciones no leídas')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Notificaciones'));
    expect(screen.getByText('Orden Completada')).toBeInTheDocument();
    expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument();
    expect(localStorage.getItem('notifications')).toBeNull();
});

test('si el aviso del navegador falla (Chrome en Android), el dashboard igual se actualiza', () => {
    const original = window.Notification;
    window.Notification = jest.fn(() => { throw new TypeError('Illegal constructor'); });
    window.Notification.permission = 'granted';
    const onCompleted = jest.fn();
    window.addEventListener('order-completed-notification', onCompleted);

    render(<NotificationCenter userRole="vendedor" />);
    receive({ id: 'n3', type: 'ORDER_COMPLETED', title: 'Orden Completada', message: 'x',
        timestamp: '2026-10-01T10:00:00', read: false });

    expect(onCompleted).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('1 notificaciones no leídas')).toBeInTheDocument();
    window.removeEventListener('order-completed-notification', onCompleted);
    window.Notification = original;
});

test('el aviso del navegador usa el logo de Vitalexa (no el de React en caché)', () => {
    const original = window.Notification;
    window.Notification = jest.fn(function FakeNotification() { this.close = jest.fn(); });
    window.Notification.permission = 'granted';

    render(<NotificationCenter userRole="admin" />);
    receive(ordenNueva);

    expect(window.Notification).toHaveBeenCalledWith('Nueva Orden Recibida', expect.objectContaining({
        icon: '/logo192.png?v=2',
        badge: '/logo192.png?v=2',
    }));
    window.Notification = original;
});

test('parseNotificationDate acepta microsegundos y descarta valores inválidos', () => {
    expect(parseNotificationDate('2026-10-01T10:30:05.123456').getMilliseconds()).toBe(123);
    expect(parseNotificationDate('2026-10-01T10:30:05').getHours()).toBe(10);
    expect(parseNotificationDate(undefined)).toBeNull();
    expect(parseNotificationDate('no es fecha')).toBeNull();
});
