import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OrderDetailModal } from './OrderManagementModal';
import orderService from '../../api/orderService';
import paymentService from '../../api/paymentService';
import discountService from '../../api/discountService';
import client from '../../api/client';

// refreshKey: el panel de atrás (dueño, saldos) recargó sus datos. Antes ese panel se remontaba
// y el modal se cerraba (o volvía a abrir desde cero); ahora el modal sigue abierto y vuelve a
// pedir lo mismo que al abrir, en su lugar: sin "Cargando pagos..." y sin cerrar lo que se usa.
const mockToast = { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn() };
jest.mock('../ToastContainer', () => ({ useToast: () => mockToast }));
jest.mock('../ConfirmDialog', () => ({ useConfirm: () => jest.fn(() => Promise.resolve(true)) }));
jest.mock('../../api/orderService', () => ({
    __esModule: true,
    default: { getAnnulmentHistory: jest.fn(), revertAnnulment: jest.fn(), annulOrder: jest.fn() },
}));
jest.mock('../../api/paymentService', () => ({
    __esModule: true,
    default: { getOrderPayments: jest.fn(), restorePayment: jest.fn(), cancelPayment: jest.fn() },
}));
jest.mock('../../api/discountService', () => ({
    __esModule: true,
    default: { getOrderDiscounts: jest.fn() },
}));
jest.mock('../../api/client', () => ({ __esModule: true, default: { get: jest.fn(), patch: jest.fn() } }));

const order = {
    id: 'o-1', invoiceNumber: 1500, estado: 'COMPLETADO', vendedor: 'jose', cliente: 'Cliente Uno',
    fecha: '2026-09-18T10:00:00', completedAt: '2026-09-18T12:00:00', total: 100000, items: [], notas: null,
};
const payment = (id, amount) => ({ id, amount, isCancelled: false, paymentDate: '2026-09-19', registeredByUsername: 'owner' });

beforeEach(() => {
    jest.clearAllMocks();
    client.get.mockResolvedValue({ data: order });
    paymentService.getOrderPayments.mockResolvedValue({ data: [payment('p-1', 20000)] });
    discountService.getOrderDiscounts.mockResolvedValue({ data: [] });
    orderService.getAnnulmentHistory.mockResolvedValue({ data: [] });
});

const renderModal = (refreshKey) => render(
    <OrderDetailModal order={order} userRole="ROLE_OWNER" onClose={jest.fn()} onRefresh={jest.fn()} refreshKey={refreshKey} />
);

test('al subir refreshKey vuelve a pedir lo mismo, sin indicadores de carga y con los datos nuevos', async () => {
    const { rerender } = renderModal(1);
    await screen.findByText('$20.000,00', { selector: '.omm-payment-amount' });
    expect(paymentService.getOrderPayments).toHaveBeenCalledTimes(1);

    let resolvePayments;
    paymentService.getOrderPayments.mockImplementation(() => new Promise((r) => { resolvePayments = r; }));
    rerender(<OrderDetailModal order={order} userRole="ROLE_OWNER" onClose={jest.fn()} onRefresh={jest.fn()} refreshKey={2} />);

    await waitFor(() => expect(paymentService.getOrderPayments).toHaveBeenCalledTimes(2));
    expect(client.get).toHaveBeenCalledTimes(2);
    expect(discountService.getOrderDiscounts).toHaveBeenCalledTimes(2);
    expect(orderService.getAnnulmentHistory).toHaveBeenCalledTimes(2);
    // Mientras llega: la lista de pagos sigue ahí (sin "Cargando pagos...")
    expect(screen.queryByText('Cargando pagos...')).not.toBeInTheDocument();
    expect(screen.queryByText(/Cargando detalles actualizados/)).not.toBeInTheDocument();
    expect(screen.getByText('$20.000,00', { selector: '.omm-payment-amount' })).toBeInTheDocument();

    await act(async () => { resolvePayments({ data: [payment('p-1', 20000), payment('p-2', 30000)] }); });
    expect(screen.getByText('$30.000,00', { selector: '.omm-payment-amount' })).toBeInTheDocument();
});

test('con el formulario de pago abierto la recarga espera a que se cierre (no mueve los montos)', async () => {
    const { rerender } = renderModal(1);
    await screen.findByText('$20.000,00', { selector: '.omm-payment-amount' });

    fireEvent.click(screen.getByRole('button', { name: /Registrar Pago/ }));
    const amount = await screen.findByLabelText(/Monto del Pago/);
    fireEvent.change(amount, { target: { value: '5000' } });

    rerender(<OrderDetailModal order={order} userRole="ROLE_OWNER" onClose={jest.fn()} onRefresh={jest.fn()} refreshKey={2} />);
    // Formulario abierto: no se recarga todavía y lo escrito sigue
    expect(paymentService.getOrderPayments).toHaveBeenCalledTimes(1);
    expect(amount).toHaveValue(5000);

    // Al cerrarlo se hace la recarga pendiente
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(paymentService.getOrderPayments).toHaveBeenCalledTimes(2));
    expect(client.get).toHaveBeenCalledTimes(2);
});

test('sin refreshKey (panel de admin) no hay recargas extra', async () => {
    const { rerender } = render(<OrderDetailModal order={order} userRole="ROLE_ADMIN" onClose={jest.fn()} onRefresh={jest.fn()} />);
    await screen.findByText('$20.000,00', { selector: '.omm-payment-amount' });
    rerender(<OrderDetailModal order={{ ...order }} userRole="ROLE_ADMIN" onClose={jest.fn()} onRefresh={jest.fn()} />);
    expect(paymentService.getOrderPayments).toHaveBeenCalledTimes(1);
    expect(client.get).toHaveBeenCalledTimes(1);
});
