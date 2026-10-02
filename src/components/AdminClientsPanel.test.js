import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import AdminClientsPanel from './AdminClientsPanel';
import client from '../api/client';

const mockToast = { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn() };
const mockConfirm = jest.fn();
jest.mock('./ToastContainer', () => ({ useToast: () => mockToast }));
jest.mock('./ConfirmDialog', () => ({ useConfirm: () => mockConfirm }));
// clientService.js usa este mismo módulo: DELETE y PATCH también quedan simulados
jest.mock('../api/client', () => ({
    __esModule: true,
    default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));

const activos = [
    {
        id: 'c1', nombre: 'Droguería Uno', nit: '900111', email: 'uno@correo.co', telefono: '3001234567',
        direccion: 'Calle 1', vendedorAsignadoId: 'v1', vendedorAsignadoNombre: 'NinaTorres',
        totalCompras: 150000, active: true,
    },
    {
        id: 'c2', nombre: 'Tienda Dos', nit: '900222', direccion: 'Calle 2', vendedorAsignadoId: 'v2',
        vendedorAsignadoNombre: 'YicelaSandoval', totalCompras: 0, active: true,
    },
];
const archivados = [
    {
        id: 'c9', nombre: 'Farmacia Vieja', nit: '900999', direccion: 'Calle 9', vendedorAsignadoId: 'v1',
        vendedorAsignadoNombre: 'NinaTorres', totalCompras: 80000, active: false,
    },
];
const vendedores = [{ id: 'v1', username: 'NinaTorres' }, { id: 'v2', username: 'YicelaSandoval' }];

const cardOf = (name) => screen.getByText(name).closest('article');
// GET de la lista normal (sin status): cuántas veces se recargó
const activeListLoads = () => client.get.mock.calls.filter(([url, config]) => url === '/admin/clients' && !config).length;

beforeEach(() => {
    localStorage.setItem('role', 'ROLE_ADMIN');
    mockConfirm.mockResolvedValue(true);
    client.get.mockImplementation((url, config) => {
        if (url === '/admin/clients/vendedores') return Promise.resolve({ data: vendedores });
        if (url === '/admin/clients') {
            return Promise.resolve({ data: config?.params?.status === 'archived' ? archivados : activos });
        }
        return Promise.reject(new Error(`URL inesperada: ${url}`));
    });
});

afterEach(() => {
    localStorage.clear();
});

test.each(['ROLE_ADMIN', 'ROLE_OWNER'])('%s ve "Eliminar" junto a "Editar" y las pestañas Activos / Eliminados', async (role) => {
    localStorage.setItem('role', role);
    render(<AdminClientsPanel />);
    await screen.findByText('Droguería Uno');

    const card = cardOf('Droguería Uno');
    const eliminar = within(card).getByRole('button', { name: 'Eliminar cliente Droguería Uno' });
    expect(eliminar).toHaveAttribute('title', 'Eliminar cliente');
    expect(eliminar).toHaveTextContent('Eliminar');
    expect(within(card).getByRole('button', { name: 'Editar' })).toBeInTheDocument();
    expect(within(cardOf('Tienda Dos')).getByRole('button', { name: 'Eliminar cliente Tienda Dos' })).toBeInTheDocument();

    expect(screen.getByRole('tab', { name: 'Activos' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Eliminados' })).toHaveAttribute('aria-selected', 'false');
});

test.each(['ROLE_VENDEDOR', null])('rol %s: sin "Eliminar" ni "Eliminados" (Editar sigue)', async (role) => {
    localStorage.clear();
    if (role) localStorage.setItem('role', role);
    render(<AdminClientsPanel />);
    await screen.findByText('Droguería Uno');

    expect(screen.queryByRole('button', { name: /Eliminar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(within(cardOf('Droguería Uno')).getByRole('button', { name: 'Editar' })).toBeInTheDocument();
});

test('confirmar → DELETE; el botón carga y la tarjeta sale de la lista sin recargar', async () => {
    let resolveDelete;
    client.delete.mockReturnValue(new Promise((resolve) => { resolveDelete = resolve; }));
    render(<AdminClientsPanel />);
    await screen.findByText('Droguería Uno');
    expect(activeListLoads()).toBe(1);

    const card = cardOf('Droguería Uno');
    fireEvent.click(within(card).getByRole('button', { name: 'Eliminar cliente Droguería Uno' }));

    // Mientras el servidor responde: botón ocupado y deshabilitado; Editar de esa tarjeta también
    const busy = await within(card).findByRole('button', { name: 'Eliminando cliente Droguería Uno' });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute('aria-busy', 'true');
    expect(busy).toHaveTextContent('Eliminando...');
    expect(within(card).getByRole('button', { name: 'Editar' })).toBeDisabled();
    expect(client.delete).toHaveBeenCalledWith('/admin/clients/c1');

    await act(async () => resolveDelete({ data: { result: 'DELETED', message: 'Cliente eliminado' } }));
    expect(mockToast.success).toHaveBeenCalledWith('Cliente eliminado');
    // Salida corta (opacidad/escala) antes de quitarla: el resto de la lista no se desmonta
    expect(card).toHaveClass('is-leaving');
    const otherCard = cardOf('Tienda Dos');
    await waitFor(() => expect(screen.queryByText('Droguería Uno')).not.toBeInTheDocument());
    expect(cardOf('Tienda Dos')).toBe(otherCard);

    // Las demás tarjetas siguen; no se volvió a pedir la lista
    expect(screen.getByText('Tienda Dos')).toBeInTheDocument();
    expect(screen.getByText('1 cliente')).toBeInTheDocument();
    expect(activeListLoads()).toBe(1);

    // El diálogo explica el borrado / archivado con el nombre del cliente
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    const options = mockConfirm.mock.calls[0][0];
    expect(options).toEqual(expect.objectContaining({ title: 'Eliminar cliente', confirmText: 'Eliminar', cancelText: 'Cancelar' }));
    const message = render(<p>{options.message}</p>);
    expect(message.container).toHaveTextContent('Droguería Uno');
    expect(message.container).toHaveTextContent('Si el cliente no tiene pedidos ni pagos se borrará definitivamente.');
    expect(message.container).toHaveTextContent(
        'Si tiene historial, se archivará: dejará de aparecer en listas y buscadores, pero sus facturas y pagos se conservan y podrás restaurarlo desde “Eliminados”.'
    );
    message.unmount();
});

test('tenía historial (ARCHIVED): toast que explica que se conserva y se puede restaurar', async () => {
    client.delete.mockResolvedValue({ data: { result: 'ARCHIVED', message: 'Cliente archivado' } });
    render(<AdminClientsPanel />);
    await screen.findByText('Droguería Uno');

    fireEvent.click(within(cardOf('Droguería Uno')).getByRole('button', { name: 'Eliminar cliente Droguería Uno' }));

    await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith(
        'Cliente archivado: tenía historial, se conserva y puedes restaurarlo desde Eliminados', 6000
    ));
    await waitFor(() => expect(screen.queryByText('Droguería Uno')).not.toBeInTheDocument());
    expect(screen.getByText('Tienda Dos')).toBeInTheDocument();
});

test('cancelar el diálogo no llama al servidor', async () => {
    mockConfirm.mockResolvedValue(false);
    render(<AdminClientsPanel />);
    await screen.findByText('Droguería Uno');

    fireEvent.click(within(cardOf('Droguería Uno')).getByRole('button', { name: 'Eliminar cliente Droguería Uno' }));

    await waitFor(() => expect(mockConfirm).toHaveBeenCalledTimes(1));
    expect(client.delete).not.toHaveBeenCalled();
    expect(screen.getByText('Droguería Uno')).toBeInTheDocument();
});

test('409 (saldo pendiente): toast de error con el mensaje del servidor y la tarjeta se queda', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    client.delete.mockRejectedValue({ response: { status: 409, data: { message: 'Tiene $150.000 pendiente' } } });
    render(<AdminClientsPanel />);
    await screen.findByText('Droguería Uno');

    const card = cardOf('Droguería Uno');
    fireEvent.click(within(card).getByRole('button', { name: 'Eliminar cliente Droguería Uno' }));

    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('Tiene $150.000 pendiente', 6000));
    expect(mockToast.success).not.toHaveBeenCalled();
    expect(screen.getByText('Droguería Uno')).toBeInTheDocument();
    expect(card).not.toHaveClass('is-leaving');
    // Se puede volver a intentar (el botón vuelve a su estado normal)
    expect(within(card).getByRole('button', { name: 'Eliminar cliente Droguería Uno' })).toBeEnabled();
    expect(within(card).getByRole('button', { name: 'Editar' })).toBeEnabled();
    expect(activeListLoads()).toBe(1);
    consoleError.mockRestore();
});

test('Eliminados: pide status=archived, tarjeta "Archivado" sin Editar ni Eliminar; Restaurar → PATCH y vuelve a Activos', async () => {
    client.patch.mockResolvedValue({ data: { ...archivados[0], active: true } });
    render(<AdminClientsPanel />);
    await screen.findByText('Droguería Uno');

    fireEvent.click(screen.getByRole('tab', { name: 'Eliminados' }));
    expect(screen.getByRole('tab', { name: 'Eliminados' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('Farmacia Vieja')).toBeInTheDocument();
    expect(client.get).toHaveBeenCalledWith('/admin/clients', { params: { status: 'archived' } });
    expect(screen.queryByText('Droguería Uno')).not.toBeInTheDocument();

    const card = cardOf('Farmacia Vieja');
    expect(card).toHaveClass('is-archived');
    expect(within(card).getByText('Archivado')).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: /Eliminar/ })).not.toBeInTheDocument();

    fireEvent.click(within(card).getByRole('button', { name: 'Restaurar cliente Farmacia Vieja' }));
    await waitFor(() => expect(client.patch).toHaveBeenCalledWith('/admin/clients/c9/restore'));
    await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith('Cliente restaurado'));
    await waitFor(() => expect(screen.queryByText('Farmacia Vieja')).not.toBeInTheDocument());
    expect(screen.getByText('No hay clientes eliminados')).toBeInTheDocument();

    // De vuelta en Activos aparece sin recargar la lista
    fireEvent.click(screen.getByRole('tab', { name: 'Activos' }));
    expect(screen.getByText('Farmacia Vieja')).toBeInTheDocument();
    expect(screen.getByText('Droguería Uno')).toBeInTheDocument();
    expect(within(cardOf('Farmacia Vieja')).getByRole('button', { name: 'Eliminar cliente Farmacia Vieja' })).toBeInTheDocument();
    expect(activeListLoads()).toBe(1);
});

test('un refresco pedido antes de eliminar no revive la tarjeta eliminada', async () => {
    const { rerender } = render(<AdminClientsPanel refreshTrigger={0} />);
    await screen.findByText('Droguería Uno');

    // Refresco (p. ej. aviso de inventario) que todavía no responde: trae la lista vieja con c1
    let resolveStaleList;
    client.get.mockImplementation((url, config) => {
        if (url === '/admin/clients/vendedores') return Promise.resolve({ data: vendedores });
        if (url === '/admin/clients' && !config) return new Promise((resolve) => { resolveStaleList = resolve; });
        return Promise.reject(new Error(`URL inesperada: ${url}`));
    });
    rerender(<AdminClientsPanel refreshTrigger={1} />);
    await waitFor(() => expect(activeListLoads()).toBe(2));

    client.delete.mockResolvedValue({ data: { result: 'DELETED' } });
    fireEvent.click(within(cardOf('Droguería Uno')).getByRole('button', { name: 'Eliminar cliente Droguería Uno' }));
    await waitFor(() => expect(screen.queryByText('Droguería Uno')).not.toBeInTheDocument());

    await act(async () => resolveStaleList({ data: activos }));
    expect(screen.queryByText('Droguería Uno')).not.toBeInTheDocument();
    expect(screen.getByText('Tienda Dos')).toBeInTheDocument();
});

test('un refresco del dashboard actualiza la lista sin cerrar el modal de Editar abierto', async () => {
    const { rerender } = render(<AdminClientsPanel refreshTrigger={0} />);
    await screen.findByText('Droguería Uno');

    fireEvent.click(within(cardOf('Droguería Uno')).getByRole('button', { name: 'Editar' }));
    const nombre = screen.getByLabelText(/Nombre de Establecimiento/);
    fireEvent.change(nombre, { target: { value: 'Droguería Uno SAS' } });

    rerender(<AdminClientsPanel refreshTrigger={1} />);
    await waitFor(() => expect(activeListLoads()).toBe(2));

    expect(screen.getByRole('dialog', { name: 'Editar Cliente' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Nombre de Establecimiento/)).toHaveValue('Droguería Uno SAS');
    expect(screen.queryByText('Cargando clientes...')).not.toBeInTheDocument();
});
