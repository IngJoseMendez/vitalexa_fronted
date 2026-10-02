import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import ClientDashboard from './ClientDashboard';
import apiClient, { clientService } from '../api/client';

// Portal del cliente: el botón "Actualizar" vuelve a pedir los datos y los reemplaza en su lugar.
// Antes key={refreshTrigger} montaba cada vista de cero (se borraban las notas del pedido y la
// edición del perfil) y el catálogo cambiaba la grilla por esqueletos (la cantidad elegida en cada
// tarjeta volvía a 1).

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

const deferred = () => {
    let resolve;
    const promise = new Promise((r) => { resolve = r; });
    return { promise, resolve };
};

const product = (stock) => ({ id: 'p1', nombre: 'Crema Facial', descripcion: '', precio: 1000, stock });
const order = (id, estado = 'PENDIENTE') => ({
    id: `${id}-0000-0000`, orderNumber: id === 'a' ? 11 : 22, estado, items: [{}], total: 1000,
    fechaCreacion: '2026-10-01T10:00:00',
});
const profile = (direccion) => ({ nombre: 'Tienda Uno', email: 't@uno.co', telefono: '300', direccion });

const refreshButton = () => screen.getByRole('button', { name: 'Actualizar datos' });

beforeEach(() => {
    localStorage.clear();
    apiClient.get.mockResolvedValue({ data: [] });
    clientService.getProductsPage.mockResolvedValue({ data: { content: [product(20)], totalPages: 1 } });
    clientService.getOrders.mockResolvedValue({ data: [order('a')] });
    clientService.getLists.mockResolvedValue({ data: [] });
    clientService.getProfile.mockResolvedValue({ data: profile('Calle Vieja') });
});

// El catálogo pide al montarse dos veces (inmediata + 400 ms): se espera a la segunda
const renderCatalog = async () => {
    render(<ClientDashboard />);
    await screen.findByText('Crema Facial');
    await waitFor(() => expect(clientService.getProductsPage).toHaveBeenCalledTimes(2), { timeout: 3000 });
    await act(async () => {});
};

test('catálogo: "Actualizar" no cambia la grilla por esqueletos y la cantidad elegida se conserva', async () => {
    await renderCatalog();
    fireEvent.click(screen.getByRole('button', { name: 'Aumentar cantidad' }));
    fireEvent.click(screen.getByRole('button', { name: 'Aumentar cantidad' }));
    expect(document.querySelector('.qty-val')).toHaveTextContent('3');

    const refresh = deferred();
    clientService.getProductsPage.mockReturnValueOnce(refresh.promise);
    fireEvent.click(refreshButton());

    expect(clientService.getProductsPage).toHaveBeenCalledTimes(3);
    expect(clientService.getProductsPage).toHaveBeenLastCalledWith(0, 24, '', null, null); // misma petición
    expect(screen.queryByText('Cargando catálogo...')).not.toBeInTheDocument();
    expect(screen.getByText('Crema Facial')).toBeInTheDocument();

    await act(async () => { refresh.resolve({ data: { content: [product(30)], totalPages: 1 } }); });

    expect(await screen.findByText('30 de 30 disponibles')).toBeInTheDocument();
    expect(document.querySelector('.qty-val')).toHaveTextContent('3');
});

test('perfil: "Actualizar" no pisa lo que el cliente está editando; Cancelar vuelve al perfil nuevo', async () => {
    await renderCatalog();
    fireEvent.click(screen.getByRole('button', { name: 'Perfil' }));
    await screen.findByText('Mi Perfil');

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '555' } });

    clientService.getProfile.mockResolvedValueOnce({ data: profile('Calle Nueva') });
    fireEvent.click(refreshButton());
    await waitFor(() => expect(clientService.getProfile).toHaveBeenCalledTimes(2));
    await act(async () => {});

    // Sigue editando, con lo escrito
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeInTheDocument();
    expect(screen.getByLabelText('Teléfono')).toHaveValue('555');

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByLabelText('Dirección')).toHaveValue('Calle Nueva');
    expect(screen.getByLabelText('Teléfono')).toHaveValue('300');
});

test('mis pedidos: "Actualizar" reemplaza la lista sin esqueleto', async () => {
    await renderCatalog();
    fireEvent.click(screen.getByRole('button', { name: 'Mis Pedidos' }));
    expect(await screen.findByText('Pedido P-11')).toBeInTheDocument();

    const refresh = deferred();
    clientService.getOrders.mockReturnValueOnce(refresh.promise);
    fireEvent.click(refreshButton());

    expect(clientService.getOrders).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Cargando pedidos...')).not.toBeInTheDocument();
    expect(screen.getByText('Pedido P-11')).toBeInTheDocument();

    await act(async () => { refresh.resolve({ data: [order('a'), order('b', 'CONFIRMADO')] }); });
    expect(await screen.findByText('Pedido P-22')).toBeInTheDocument();
    expect(screen.getByText('Pedido P-11')).toBeInTheDocument();
});

test('carrito: "Actualizar" no borra las notas del pedido escritas', async () => {
    await renderCatalog();
    fireEvent.click(screen.getByRole('button', { name: 'Agregar al carrito' }));
    fireEvent.click(screen.getByRole('button', { name: /^Carrito/ }));

    const notes = await screen.findByLabelText('Notas de la orden');
    fireEvent.change(notes, { target: { value: 'Entregar en la tarde' } });

    fireEvent.click(refreshButton());
    await act(async () => {});

    expect(screen.getByLabelText('Notas de la orden')).toBe(notes);
    expect(notes).toHaveValue('Entregar en la tarde');
});
