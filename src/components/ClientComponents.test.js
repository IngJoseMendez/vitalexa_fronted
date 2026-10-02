import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OrdersView } from './ClientComponents';
import { clientService } from '../api/client';

// axios (ESM) no se resuelve en el Jest de CRA: se simula el servicio completo
jest.mock('../api/client', () => ({
    __esModule: true,
    default: {},
    clientService: { getOrders: jest.fn(), cancelOrder: jest.fn(), reorder: jest.fn() },
}));
jest.mock('../context/CartContext', () => ({ useCart: () => ({ addToCart: jest.fn() }) }));
jest.mock('./ConfirmDialog', () => ({ useConfirm: () => () => Promise.resolve(true) }));
const mockToast = { success: jest.fn(), error: jest.fn() };
jest.mock('./ToastContainer', () => ({ useToast: () => mockToast }));

const order = (id, estado) => ({
    id: `${id}-0000-0000`, estado, items: [{}], total: 1000, fechaCreacion: '2026-10-01T10:00:00',
});

beforeEach(() => {
    mockToast.success = jest.fn();
    mockToast.error = jest.fn();
    clientService.getOrders.mockResolvedValue({
        data: [
            order('pend', 'PENDIENTE'),
            order('conf', 'CONFIRMADO'),
            order('anul', 'ANULADA'),
            order('comp', 'COMPLETADO'),
            order('canc', 'CANCELADO'),
        ],
    });
    clientService.cancelOrder.mockResolvedValue({ data: {} });
});

test('"Cancelar" solo aparece en pedidos PENDIENTE (anulados o confirmados devolverían stock dos veces)', async () => {
    render(<OrdersView />);

    await screen.findByText('PENDIENTE');
    const cancelButtons = screen.getAllByRole('button', { name: 'Cancelar' });
    expect(cancelButtons).toHaveLength(1);
    // Reordenar sigue en todos
    expect(screen.getAllByRole('button', { name: 'Reordenar' })).toHaveLength(5);

    fireEvent.click(cancelButtons[0]);
    await waitFor(() => expect(clientService.cancelOrder).toHaveBeenCalledWith('pend-0000-0000'));
});

test('si el backend rechaza la cancelación se muestra su motivo', async () => {
    clientService.cancelOrder.mockRejectedValue({
        response: { data: { message: 'Solo se pueden cancelar pedidos pendientes' } },
    });
    render(<OrdersView />);

    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('Solo se pueden cancelar pedidos pendientes'));
});
