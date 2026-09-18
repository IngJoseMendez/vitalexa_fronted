import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { OrderDetailModal } from './OrderManagementModal';
import orderService from '../../api/orderService';
import paymentService from '../../api/paymentService';
import discountService from '../../api/discountService';
import client from '../../api/client';

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

const annulled = {
    id: 'o-1', invoiceNumber: 1020, estado: 'ANULADA', vendedor: 'jose', cliente: 'Cliente Uno',
    fecha: '2026-09-18T10:00:00', total: 25000, items: [], notas: null,
    cancellationReason: 'El cliente devolvió la mercancía',
};
const annulEvent = {
    id: 'e-1', action: 'ANNULMENT', reason: 'El cliente devolvió la mercancía', previousStatus: 'COMPLETADO',
    newStatus: 'ANULADA', stockAdjusted: true, username: 'admin', createdAt: '2026-09-18T10:05:00',
};
const revertEvent = {
    id: 'e-2', action: 'REVERSAL', reason: 'Se anuló por error', previousStatus: 'ANULADA',
    newStatus: 'COMPLETADO', stockAdjusted: true, username: 'owner', createdAt: '2026-09-18T11:00:00',
};

beforeEach(() => {
    jest.clearAllMocks();
    client.get.mockResolvedValue({ data: annulled });
    paymentService.getOrderPayments.mockResolvedValue({
        data: [{ id: 'p-1', amount: 5000, isCancelled: true, paymentDate: '2026-09-18', cancelledByUsername: 'owner' }],
    });
    discountService.getOrderDiscounts.mockResolvedValue({ data: [] });
    orderService.getAnnulmentHistory.mockResolvedValue({ data: [annulEvent] });
});

test('venta anulada: motivo, historial, sin editar ni restaurar pagos, y botón de revertir', async () => {
    render(<OrderDetailModal order={annulled} userRole="ROLE_OWNER" onClose={jest.fn()} onRefresh={jest.fn()} />);

    expect(await screen.findByText('Venta anulada')).toBeInTheDocument();
    expect(screen.getByText('Motivo: El cliente devolvió la mercancía')).toBeInTheDocument();
    expect(await screen.findByText(/Por admin el 18\/09\/2026/)).toBeInTheDocument();
    expect(screen.getByText('Historial de anulación')).toBeInTheDocument();
    expect(screen.getByText(/Completado → Anulada · stock devuelto al inventario/)).toBeInTheDocument();

    expect(screen.getByRole('button', { name: /Revertir Anulación/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Editar Factura/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Anular Venta/ })).not.toBeInTheDocument();
    await screen.findByText('ANULADO'); // pago anulado cargado
    expect(screen.queryByTitle('Restaurar Pago')).not.toBeInTheDocument();
});

test('revertir exige motivo, envía el motivo recortado y actualiza la vista', async () => {
    const onRefresh = jest.fn();
    orderService.revertAnnulment.mockResolvedValue({ data: { ...annulled, estado: 'COMPLETADO' } });
    render(<OrderDetailModal order={annulled} userRole="ROLE_ADMIN" onClose={jest.fn()} onRefresh={onRefresh} />);

    fireEvent.click(await screen.findByRole('button', { name: /Revertir Anulación/ }));
    const dialog = screen.getByText('Motivo de la reversión').closest('.revert-annulment-modal');
    expect(within(dialog).getByText('Completado')).toBeInTheDocument(); // estado destino según el historial
    const confirm = within(dialog).getByRole('button', { name: 'Revertir Anulación' });
    expect(confirm).toBeDisabled();

    orderService.getAnnulmentHistory.mockResolvedValue({ data: [revertEvent, annulEvent] });
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: '  Se anuló por error  ' } });
    expect(confirm).not.toBeDisabled();
    fireEvent.click(confirm);

    await waitFor(() => expect(orderService.revertAnnulment).toHaveBeenCalledWith('o-1', 'Se anuló por error'));
    await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith(
        'Anulación revertida. La venta quedó en estado Completado'));
    expect(onRefresh).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText('Venta anulada')).not.toBeInTheDocument());
    expect(screen.queryByText('Motivo de la reversión')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Editar Factura/ })).toBeInTheDocument();
    expect(await screen.findByText('Anulación revertida')).toBeInTheDocument();
    expect(screen.getByText(/Anulada → Completado · stock descontado de nuevo/)).toBeInTheDocument();
});

test('si el backend rechaza la reversión se muestra su mensaje', async () => {
    orderService.revertAnnulment.mockRejectedValue({ response: { data: { message: 'La orden no está anulada' } } });
    render(<OrderDetailModal order={annulled} userRole="ROLE_OWNER" onClose={jest.fn()} onRefresh={jest.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: /Revertir Anulación/ }));
    const dialog = screen.getByText('Motivo de la reversión').closest('.revert-annulment-modal');
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'motivo' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Revertir Anulación' }));

    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith(
        'Error al revertir la anulación: La orden no está anulada'));
    expect(screen.getByText('Motivo de la reversión')).toBeInTheDocument(); // el modal sigue abierto
});
