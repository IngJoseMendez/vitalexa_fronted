import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import AdminDashboard from './AdminDashboard';
import client from '../api/client';

// Las pestañas y los modales del panel de admin se cargan con React.lazy(): este test comprueba
// que al abrirlos se muestran (tras el "Cargando…") y que el resto del panel sigue igual.
jest.mock('../api/client', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
const mockToast = { error: jest.fn(), success: jest.fn(), warning: jest.fn(), info: jest.fn() };
jest.mock('../components/ToastContainer', () => ({ useToast: () => mockToast }));
jest.mock('../services/NotificationService', () => ({ __esModule: true, default: { connect: () => () => {} } }));
jest.mock('../hooks/useSidebarCollapsed', () => () => [false, () => {}]);
jest.mock('../components/SidebarToggle', () => () => null);
jest.mock('../components/AdminDiscountSection', () => () => null);
// Paneles diferidos simulados: basta con saber que el lazy() los monta con sus props
jest.mock('../components/PayrollPanel', () => () => <div>Panel de nómina simulado</div>);
jest.mock('../components/StockReportPanel', () => ({ role }) => <div>Stock real simulado ({role})</div>);
jest.mock('../components/modals/OrderManagementModal', () => ({
  __esModule: true,
  OrderDetailModal: ({ order, userRole }) => <div role="dialog">Detalle simulado {order.id} {userRole}</div>,
}));

const order = {
  id: 'o-1', estado: 'PENDIENTE', fecha: '2026-10-01T10:00:00', total: 50000, discountedTotal: 50000,
  cliente: 'Cliente Uno', vendedor: 'NinaTorres', items: [], paymentStatus: 'PENDING', notas: '',
};

beforeEach(() => {
  client.get.mockImplementation((url) => {
    if (url === '/admin/orders/paginated') {
      return Promise.resolve({ data: { content: [order], totalPages: 1, totalElements: 1, number: 0 } });
    }
    if (url === '/admin/clients/vendedores') return Promise.resolve({ data: [] });
    return Promise.resolve({ data: [] });
  });
});

test('una pestaña diferida aparece al abrirla, con sus props', async () => {
  render(<AdminDashboard />);
  fireEvent.click(screen.getByRole('button', { name: 'Stock Real' }));
  expect(await screen.findByText('Stock real simulado (admin)')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Nómina' }));
  expect(await screen.findByText('Panel de nómina simulado')).toBeInTheDocument();
  expect(screen.queryByText(/Stock real simulado/)).not.toBeInTheDocument();
});

test('el modal de detalle (diferido) se abre sin ocultar la lista de órdenes', async () => {
  render(<AdminDashboard />);
  const detalle = await screen.findByRole('button', { name: /Detalle/ });
  fireEvent.click(detalle);
  // Mientras llega el código del modal: su propia espera y la lista de órdenes sigue visible
  // (si el Suspense fuera el de la pestaña, React ocultaría la lista con display:none)
  expect(screen.getByRole('status')).toHaveTextContent('Cargando…');
  expect(detalle).toBeVisible();
  expect(await screen.findByRole('dialog')).toHaveTextContent('Detalle simulado o-1 ROLE_ADMIN');
  await waitFor(() => expect(screen.queryByText('Cargando…')).not.toBeInTheDocument());
  expect(detalle).toBeVisible();
});

test('filtro de vendedor de órdenes: se escribe, se elige y las órdenes se piden de esa vendedora', async () => {
  client.get.mockImplementation((url) => {
    if (url === '/admin/orders/paginated') {
      return Promise.resolve({ data: { content: [order], totalPages: 1, totalElements: 1, number: 0 } });
    }
    if (url === '/admin/clients/vendedores') {
      return Promise.resolve({ data: [{ id: 'v1', username: 'NinaTorres' }, { id: 'v2', username: 'YicelaSandoval' }] });
    }
    return Promise.resolve({ data: [] });
  });
  render(<AdminDashboard />);
  await screen.findByRole('button', { name: /Detalle/ });

  const filtro = screen.getByRole('combobox', { name: 'Filtrar por vendedor' });
  expect(filtro).toHaveValue('Todos los vendedores');

  // (la lista del selector con buscador: los <select> de orden y paginación también tienen opciones)
  const listaVendedores = () => screen.getByRole('listbox', { name: 'Filtrar por vendedor' });
  fireEvent.change(filtro, { target: { value: 'yic' } });
  const opciones = within(listaVendedores()).getAllByRole('option');
  expect(opciones.map((o) => o.textContent)).toEqual(['YicelaSandoval']);
  fireEvent.click(opciones[0]);

  expect(filtro).toHaveValue('YicelaSandoval');
  await waitFor(() => expect(client.get).toHaveBeenCalledWith('/admin/orders/paginated', {
    params: expect.objectContaining({ vendedor: 'YicelaSandoval', page: 0 }),
  }));
  // Filtro del historial: también trae los clientes eliminados (archivados), sus ventas siguen ahí
  expect(client.get).toHaveBeenCalledWith('/admin/clients/seller/v2', { params: { includeArchived: true } });
  await screen.findByRole('button', { name: /Detalle/ });

  // "Todos los vendedores" sigue en la lista (vuelve a todas las órdenes)
  fireEvent.change(filtro, { target: { value: 'todos' } });
  fireEvent.click(within(listaVendedores()).getByRole('option', { name: 'Todos los vendedores' }));
  expect(filtro).toHaveValue('Todos los vendedores');
  expect(screen.queryByRole('button', { name: 'Quitar filtro de vendedor' })).not.toBeInTheDocument();
  await waitFor(() => expect(client.get).toHaveBeenLastCalledWith('/admin/orders/paginated', {
    params: expect.not.objectContaining({ vendedor: expect.anything() }),
  }));
  await screen.findByRole('button', { name: /Detalle/ });
});
