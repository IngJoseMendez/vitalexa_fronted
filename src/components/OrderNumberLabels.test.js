import { render, screen } from '@testing-library/react';
import { OrdersView } from './ClientComponents';
import { PaymentHistoryModal } from './modals/PaymentHistoryModal';
import { clientService } from '../api/client';
import paymentService from '../api/paymentService';

// axios (ESM) no se resuelve en el Jest de CRA: se simulan los servicios completos
jest.mock('../api/client', () => ({
    __esModule: true,
    default: {},
    clientService: { getOrders: jest.fn(), cancelOrder: jest.fn(), reorder: jest.fn() },
}));
jest.mock('../api/paymentService', () => ({
    __esModule: true,
    default: { getOrderPayments: jest.fn() },
}));
jest.mock('../context/CartContext', () => ({ useCart: () => ({ addToCart: jest.fn() }) }));
jest.mock('./ConfirmDialog', () => ({ useConfirm: () => () => Promise.resolve(true) }));
const mockToast = { success: jest.fn(), error: jest.fn() };
jest.mock('./ToastContainer', () => ({ useToast: () => mockToast }));

const ID = 'ab12cd34-0000-0000-0000-000000000001';

beforeEach(() => {
    mockToast.success = jest.fn();
    mockToast.error = jest.fn();
    paymentService.getOrderPayments.mockResolvedValue({ data: [] });
});

const portalOrder = (overrides) => ({
    id: ID, estado: 'PENDIENTE', items: [{}], total: 1000, fechaCreacion: '2026-10-01T10:00:00', ...overrides,
});

test('portal del cliente: "Pedido P-N" sin factura y "Factura #N" con factura', async () => {
    clientService.getOrders.mockResolvedValue({
        data: [
            portalOrder({ id: `${ID}-a`, orderNumber: 123, invoiceNumber: null }),
            portalOrder({ id: `${ID}-b`, orderNumber: 124, invoiceNumber: 1500, estado: 'COMPLETADO' }),
        ],
    });

    render(<OrdersView />);

    expect(await screen.findByText('Pedido P-123')).toBeInTheDocument();
    expect(screen.getByText('Factura #1500')).toBeInTheDocument();
    // El UUID ya no se muestra cuando hay número de pedido
    expect(screen.queryByText(/ab12cd34/)).not.toBeInTheDocument();
});

test('portal del cliente con un backend anterior (sin orderNumber): inicio del id, como antes', async () => {
    clientService.getOrders.mockResolvedValue({ data: [portalOrder({ invoiceNumber: null })] });

    render(<OrdersView />);

    expect(await screen.findByText('Orden #ab12cd34')).toBeInTheDocument();
});

test('historial de pagos: título con factura y pedido', async () => {
    render(
        <PaymentHistoryModal isOpen onClose={() => {}} orderId={ID} invoiceNumber={1020} orderNumber={7}
            userRole="ROLE_OWNER" />
    );

    expect(await screen.findByText(/Historial de Pagos - Factura #1020$/)).toBeInTheDocument();
    expect(paymentService.getOrderPayments).toHaveBeenCalledWith(ID);
});

test('historial de pagos sin factura: "Pedido P-N" (antes mostraba el UUID completo)', async () => {
    render(<PaymentHistoryModal isOpen onClose={() => {}} orderId={ID} invoiceNumber={null} orderNumber={45} />);

    expect(await screen.findByText(/Historial de Pagos - Pedido P-45/)).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(ID))).not.toBeInTheDocument();
});
