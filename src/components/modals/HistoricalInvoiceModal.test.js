import { render, fireEvent, waitFor } from '@testing-library/react';
import HistoricalInvoiceModal from './HistoricalInvoiceModal';
import client from '../../api/client';

const mockToast = { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn() };
jest.mock('../ToastContainer', () => ({ useToast: () => mockToast }));
jest.mock('../ConfirmDialog', () => ({ useConfirm: () => jest.fn(() => Promise.resolve(true)) }));
jest.mock('../../api/client', () => ({ __esModule: true, default: { get: jest.fn(), put: jest.fn(), post: jest.fn() } }));

// Venta normal: pedida el 18/09 y facturada (completada) el 23/09
const completed = {
    id: 'o-1', invoiceNumber: 385394, estado: 'COMPLETADO', vendedor: 'MercyMaestre',
    cliente: 'Tienda Naturista Sabilan', fecha: '2026-09-18T10:24:00', completedAt: '2026-09-23T00:00:00',
    total: 300000, invoiceType: 'NORMAL',
};

beforeEach(() => {
    jest.clearAllMocks();
    client.get.mockResolvedValue({ data: [{ id: 'c-1', nombre: 'Tienda Naturista Sabilan', nit: '900' }] });
    client.put.mockResolvedValue({ data: {} });
});

test('editar precarga la fecha de la factura (completedAt) y la envía en hora local, sin pasarla a UTC', async () => {
    const { container } = render(
        <HistoricalInvoiceModal initialOrder={completed} onClose={jest.fn()} onSuccess={jest.fn()} />);
    const dateInput = container.querySelector('input[name="fecha"]');

    await waitFor(() => expect(dateInput.value).toBe('2026-09-23T00:00'));
    fireEvent.change(dateInput, { target: { value: '2026-10-01T00:00' } });
    fireEvent.change(container.querySelector('input[name="amountPaid"]'), { target: { value: '0' } });
    fireEvent.submit(container.querySelector('#historical-form'));

    await waitFor(() => expect(client.put).toHaveBeenCalledWith('/owner/invoices/o-1', expect.objectContaining({
        fecha: '2026-10-01T00:00',
        invoiceDate: '2026-10-01T00:00',
        clientId: 'c-1',
    })));
});

test('una factura histórica (sin completedAt) precarga su fecha', async () => {
    const historical = { ...completed, completedAt: null, fecha: '2026-09-10T08:00:00' };
    const { container } = render(
        <HistoricalInvoiceModal initialOrder={historical} onClose={jest.fn()} onSuccess={jest.fn()} />);

    await waitFor(() => expect(container.querySelector('input[name="fecha"]').value).toBe('2026-09-10T08:00'));
});
