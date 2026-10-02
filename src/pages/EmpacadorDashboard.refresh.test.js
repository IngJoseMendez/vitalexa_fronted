import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import EmpacadorDashboard from './EmpacadorDashboard';
import productService from '../api/productService';

// Actualización silenciosa del empacador: antes cada INVENTORY_UPDATE montaba el inventario de
// cero (key={refreshTrigger}): se borraba la búsqueda, volvían "Todos", la vista y el orden, y el
// scroll subía. Ahora los números se reemplazan en su lugar.

jest.mock('../api/productService', () => ({ __esModule: true, default: { getStockReportForEmpacador: jest.fn() } }));
const mockToast = { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn() };
jest.mock('../components/ToastContainer', () => ({ useToast: () => mockToast }));
let mockNotify = null;
jest.mock('../services/NotificationService', () => ({
    __esModule: true,
    default: { connect: (listener) => { mockNotify = listener; return () => {}; } },
}));

const item = (productId, nombre, stockEnBD) => ({
    productId, nombre, stockEnBD, stockComprometido: 0, stockFisicoReal: stockEnBD, faltante: 0, alertaCritica: false,
});

const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
};

const inventoryUpdate = () => act(() => { mockNotify({ type: 'INVENTORY_UPDATE' }); });

beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    // La vista y el orden se recuerdan (usePersistentState): sin esto el primer test deja "lista"
    // y "menor stock" guardados para los siguientes
    localStorage.clear();
    mockNotify = null;
    productService.getStockReportForEmpacador.mockResolvedValue({
        data: [item('aaaaaaaa-1', 'Crema Facial', 7), item('bbbbbbbb-2', 'Gel Frío', 3)],
    });
});

test('INVENTORY_UPDATE: búsqueda, vista y orden siguen igual y el stock se actualiza en su lugar', async () => {
    render(<EmpacadorDashboard />);
    await screen.findByText('Crema Facial');

    const search = screen.getByRole('textbox', { name: 'Buscar producto' });
    fireEvent.change(search, { target: { value: 'crema' } });
    fireEvent.click(screen.getByRole('button', { name: 'Vista lista' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Ordenar productos' }), { target: { value: 'stock_asc' } });
    expect(screen.getByTitle('Bodega')).toHaveTextContent('7');

    const refresh = deferred();
    productService.getStockReportForEmpacador.mockReturnValueOnce(refresh.promise);
    inventoryUpdate();

    // Mientras llega: nada de esqueletos ni "Cargando..." (la lista sigue a la vista)
    expect(productService.getStockReportForEmpacador).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Cargando inventario...')).not.toBeInTheDocument();
    expect(screen.getByText('Crema Facial')).toBeInTheDocument();

    await act(async () => {
        refresh.resolve({ data: [item('aaaaaaaa-1', 'Crema Facial', 12), item('bbbbbbbb-2', 'Gel Frío', 3)] });
    });

    await waitFor(() => expect(screen.getByTitle('Bodega')).toHaveTextContent('12'));
    expect(screen.getByRole('textbox', { name: 'Buscar producto' })).toBe(search);
    expect(search).toHaveValue('crema');
    expect(screen.queryByText('Gel Frío')).not.toBeInTheDocument(); // el filtro de búsqueda sigue
    expect(screen.getByRole('button', { name: 'Vista lista' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('combobox', { name: 'Ordenar productos' })).toHaveValue('stock_asc');
});

test('si el refresco falla, el inventario que ya se ve se conserva (con el mismo aviso)', async () => {
    render(<EmpacadorDashboard />);
    await screen.findByText('Crema Facial');

    productService.getStockReportForEmpacador.mockRejectedValueOnce(new Error('sin red'));
    inventoryUpdate();

    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('Error al cargar inventario: sin red'));
    expect(screen.getByText('Crema Facial')).toBeInTheDocument();
    expect(screen.getByText('Gel Frío')).toBeInTheDocument();
});

test('una respuesta vieja no pisa a la más nueva (ráfaga de INVENTORY_UPDATE)', async () => {
    render(<EmpacadorDashboard />);
    await screen.findByText('Crema Facial');

    const first = deferred();
    const second = deferred();
    productService.getStockReportForEmpacador.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    inventoryUpdate();
    // Date.now() distinto para que el segundo evento cambie refreshTrigger
    await new Promise((r) => setTimeout(r, 5));
    inventoryUpdate();
    expect(productService.getStockReportForEmpacador).toHaveBeenCalledTimes(3);

    await act(async () => { second.resolve({ data: [item('aaaaaaaa-1', 'Crema Facial', 20)] }); });
    await act(async () => { first.resolve({ data: [item('aaaaaaaa-1', 'Crema Facial', 1)] }); });

    expect(screen.getByText('Crema Facial').closest('.emp-pcard')).toHaveTextContent('20');
    expect(screen.queryByText('Gel Frío')).not.toBeInTheDocument();
});
