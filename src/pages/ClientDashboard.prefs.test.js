import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import ClientDashboard from './ClientDashboard';
import apiClient, { clientService } from '../api/client';
import { prefKey } from '../hooks/usePersistentState';

// Portal del cliente: las columnas del catálogo (1 / 2 / 3) se recuerdan al recargar
// (usePersistentState, por usuario). "Solo en stock", la búsqueda y la etiqueta NO se recuerdan.

// axios (ESM) no se resuelve en el Jest de CRA: se simula el módulo completo
jest.mock('../api/client', () => ({
    __esModule: true,
    default: { get: jest.fn() },
    clientService: {
        getProductsPage: jest.fn(), getOrders: jest.fn(), getLists: jest.fn(),
        getProfile: jest.fn(), updateProfile: jest.fn(), createOrder: jest.fn(),
    },
}));
jest.mock('../components/ConfirmDialog', () => ({ useConfirm: () => () => Promise.resolve(true) }));
const mockToast = { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn() };
jest.mock('../components/ToastContainer', () => ({ useToast: () => mockToast }));

const product = { id: 'p1', nombre: 'Crema Facial', descripcion: '', precio: 1000, stock: 20 };

beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('username', 'tienda1');
    apiClient.get.mockResolvedValue({ data: [] });
    clientService.getProductsPage.mockResolvedValue({ data: { content: [product], totalPages: 1 } });
});

const savePref = (key, value) => localStorage.setItem(prefKey(key), JSON.stringify(value));
const storedPref = (key) => JSON.parse(localStorage.getItem(prefKey(key)));

const columnButton = (cols) =>
    within(screen.getByRole('group', { name: 'Columnas del catálogo' })).getByRole('button', { name: String(cols) });
const gridColumns = () => document.querySelector('.products-grid').style.gridTemplateColumns;

// El catálogo pide al montarse dos veces (inmediata + 400 ms): se espera a la segunda
const renderCatalog = async () => {
    const view = render(<ClientDashboard />);
    await screen.findByText('Crema Facial');
    await waitFor(() => expect(clientService.getProductsPage).toHaveBeenCalledTimes(2), { timeout: 3000 });
    await act(async () => {});
    return view;
};

test('las columnas del catálogo se recuerdan al volver a montar; "Solo en stock" no', async () => {
    const first = await renderCatalog();
    expect(columnButton(2)).toHaveAttribute('aria-pressed', 'true'); // defecto de siempre
    expect(gridColumns()).toBe('repeat(2, minmax(0, 1fr))');

    fireEvent.click(columnButton(1));
    expect(gridColumns()).toBe('repeat(1, minmax(0, 1fr))');
    expect(storedPref('cliente.catalog.columns')).toBe(1);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Solo en stock' }));
    await waitFor(() => expect(clientService.getProductsPage).toHaveBeenLastCalledWith(0, 24, '', true, null), { timeout: 3000 });
    first.unmount();

    clientService.getProductsPage.mockClear();
    render(<ClientDashboard />);
    // Desde el primer render (aún cargando) ya está la columna guardada
    expect(columnButton(1)).toHaveAttribute('aria-pressed', 'true');
    await screen.findByText('Crema Facial');
    expect(gridColumns()).toBe('repeat(1, minmax(0, 1fr))');
    expect(columnButton(2)).toHaveAttribute('aria-pressed', 'false');
    // "Solo en stock" vuelve a apagado y el catálogo se pide sin ese filtro
    expect(screen.getByRole('checkbox', { name: 'Solo en stock' })).not.toBeChecked();
    expect(clientService.getProductsPage).toHaveBeenNthCalledWith(1, 0, 24, '', null, null);
});

test('lo guardado que no es una opción (o de otro tipo) vuelve a 2 columnas', async () => {
    savePref('cliente.catalog.columns', 4);
    const first = await renderCatalog();
    expect(columnButton(2)).toHaveAttribute('aria-pressed', 'true');
    expect(gridColumns()).toBe('repeat(2, minmax(0, 1fr))');
    first.unmount();

    savePref('cliente.catalog.columns', '3'); // texto, no número
    clientService.getProductsPage.mockClear();
    await renderCatalog();
    expect(columnButton(2)).toHaveAttribute('aria-pressed', 'true');
});

test('las columnas son de cada usuario del equipo y ya no se usa la clave vieja', async () => {
    savePref('cliente.catalog.columns', 3); // de tienda1
    localStorage.setItem('clientGridColumns', '1'); // clave vieja, sin usuario
    localStorage.setItem('username', 'tienda2');
    await renderCatalog();
    expect(columnButton(2)).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(columnButton(3));
    expect(storedPref('cliente.catalog.columns')).toBe(3); // ahora también de tienda2
    expect(localStorage.getItem('clientGridColumns')).toBe('1'); // la vieja no se toca ni se usa
});
