import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import InventoryHistoryPanel from './InventoryHistoryPanel';
import productService from '../api/productService';

const mockToast = { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn() };
jest.mock('./ToastContainer', () => ({ useToast: () => mockToast }));
jest.mock('../api/productService', () => ({
    __esModule: true,
    default: {
        getInventoryHistory: jest.fn(),
        searchProductsForHistory: jest.fn(),
        exportInventoryHistory: jest.fn(),
        exportInventoryMovement: jest.fn(),
    },
}));

const rows = [
    { id: 'm1', productName: 'Crema X', type: 'STOCK_ADJUSTMENT', quantity: 5, previousStock: 10, newStock: 15,
        reason: 'Ajuste', username: 'owner', timestamp: '2026-10-01T09:00:00' },
    { id: 'm2', productName: 'Crema X', type: 'SALE', quantity: 2, previousStock: 15, newStock: 13,
        reason: 'Venta Orden - Factura #1020', username: 'admin', timestamp: '2026-10-01T10:00:00',
        orderId: 'ab12cd34-0000-0000-0000-000000000001', orderLabel: 'Factura #1020' },
    { id: 'm3', productName: 'Crema X', type: 'DELETION', quantity: 13, previousStock: 13, newStock: 13,
        reason: 'Eliminación Lógica', username: 'admin', timestamp: '2026-10-01T11:00:00' },
    { id: 'm4', productName: 'Crema X', type: 'PHYSICAL_COUNT', quantity: -3, previousStock: 13, newStock: 10,
        reason: 'Conteo físico: 10 contadas', username: 'owner', timestamp: '2026-10-01T12:00:00' },
];

const page = (content, totalPages = 3) => ({ data: { content, totalPages, totalElements: content.length * totalPages } });
const lastParams = () => {
    const calls = productService.getInventoryHistory.mock.calls;
    return calls[calls.length - 1][0];
};

beforeEach(() => {
    productService.getInventoryHistory.mockResolvedValue(page(rows));
    productService.searchProductsForHistory.mockResolvedValue({
        data: { content: [{ id: 'p-old', nombre: 'Crema Vieja', stock: 0, active: false }] },
    });
});

test('signo y color del cambio salen del stock real, con etiquetas legibles y la orden', async () => {
    render(<InventoryHistoryPanel />);
    await screen.findByText('Factura #1020');

    const deltas = screen.getAllByTestId('movement-delta');
    // Ajuste que sube el stock: "+5" en verde (antes "-5" en rojo)
    expect(deltas[0]).toHaveTextContent('+5');
    expect(deltas[0]).toHaveStyle({ color: '#059669' });
    // Venta: "-2" en rojo
    expect(deltas[1]).toHaveTextContent('-2');
    expect(deltas[1]).toHaveStyle({ color: '#dc2626' });
    // Eliminación lógica: no movió stock
    expect(deltas[2]).toHaveTextContent('0');
    expect(deltas[2]).toHaveStyle({ color: '#6b7280' });
    // Conteo físico que baja el stock
    expect(deltas[3]).toHaveTextContent('-3');

    const table = screen.getByRole('table');
    expect(within(table).getByText('Ajuste de stock')).toBeInTheDocument();
    expect(within(table).getByText('Conteo físico')).toBeInTheDocument();
    expect(within(table).getByText('Eliminación de producto')).toBeInTheDocument();
});

test('el filtro "Hasta" incluye el día elegido', async () => {
    render(<InventoryHistoryPanel />);
    await screen.findByText('Factura #1020');

    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Hasta (incluido)'), { target: { value: '2026-10-01' } });

    await waitFor(() => expect(lastParams().endDate).toBe('2026-10-01T23:59:59.999999'));
    expect(lastParams().startDate).toBe('2026-10-01T00:00:00');
    expect(lastParams().sort).toBe('timestamp,desc');
    expect(lastParams().page).toBe(0);
});

test('"Desde" posterior a "Hasta": avisa y no consulta', async () => {
    render(<InventoryHistoryPanel />);
    await screen.findByText('Factura #1020');
    const calls = productService.getInventoryHistory.mock.calls.length;

    fireEvent.change(screen.getByLabelText('Hasta (incluido)'), { target: { value: '2026-10-01' } });
    await waitFor(() => expect(productService.getInventoryHistory.mock.calls.length).toBe(calls + 1));
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-05' } });

    expect(await screen.findByRole('alert')).toHaveTextContent('posterior');
    expect(productService.getInventoryHistory.mock.calls.length).toBe(calls + 1);
});

test('busca productos inactivos y al quitar el producto vuelve a la página 1', async () => {
    render(<InventoryHistoryPanel />);
    await screen.findByText('Factura #1020');

    const input = screen.getByLabelText('Producto (incluye inactivos)');
    fireEvent.change(input, { target: { value: 'crema' } });
    const suggestion = await screen.findByText('Crema Vieja', {}, { timeout: 2000 });
    expect(screen.getByText('(inactivo)')).toBeInTheDocument();
    fireEvent.click(suggestion);
    expect(productService.searchProductsForHistory).toHaveBeenCalledWith('crema');
    await waitFor(() => expect(lastParams().productId).toBe('p-old'));

    fireEvent.click(screen.getByText('Siguiente'));
    await waitFor(() => expect(lastParams().page).toBe(1));

    // Escribir otra cosa quita el producto elegido: página 1 del historial completo
    fireEvent.change(input, { target: { value: 'crem' } });
    await waitFor(() => expect(lastParams().productId).toBeNull());
    expect(lastParams().page).toBe(0);
});
