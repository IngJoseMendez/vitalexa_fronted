import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AdminDashboard from './AdminDashboard';
import client from '../api/client';

// Historial de pedidos y facturas del admin: el filtro "por cliente" (después de elegir la
// vendedora) también ofrece a los clientes eliminados (archivados), porque sus ventas siguen en
// el historial. Lo pide con includeArchived=true y los marca "(eliminado)".
jest.mock('../api/client', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() } }));
const mockToast = { error: jest.fn(), success: jest.fn(), warning: jest.fn(), info: jest.fn() };
jest.mock('../components/ToastContainer', () => ({ useToast: () => mockToast }));
jest.mock('../services/NotificationService', () => ({
  __esModule: true,
  default: { connect: () => () => {} },
}));
jest.mock('../hooks/useSidebarCollapsed', () => () => [false, () => {}]);
jest.mock('../components/SidebarToggle', () => () => null);
jest.mock('../components/AdminDiscountSection', () => () => null);

const vendedores = [{ id: 'v-1', username: 'NinaTorres' }];
const clientesDeNina = [
  { id: 'c-1', nombre: 'Droguería Activa', active: true },
  { id: 'c-2', nombre: 'Droguería Vieja', active: false },
];

beforeEach(() => {
  jest.clearAllMocks();
  client.get.mockImplementation((url) => {
    if (url === '/admin/orders/paginated') {
      return Promise.resolve({ data: { content: [], number: 0, totalPages: 0, totalElements: 0 } });
    }
    if (url === '/admin/clients/vendedores') return Promise.resolve({ data: vendedores });
    if (url === '/admin/clients/seller/v-1') return Promise.resolve({ data: clientesDeNina });
    return Promise.resolve({ data: [] });
  });
});

test('el filtro por cliente del historial pide y muestra también a los clientes eliminados', async () => {
  render(<AdminDashboard />);

  const vendorInput = await screen.findByRole('combobox', { name: 'Filtrar por vendedor' });
  fireEvent.focus(vendorInput);
  fireEvent.click(await screen.findByRole('option', { name: 'NinaTorres' }));

  await waitFor(() => expect(client.get).toHaveBeenCalledWith('/admin/clients/seller/v-1',
    { params: { includeArchived: true } }));

  fireEvent.focus(await screen.findByLabelText('Filtrar por cliente'));
  expect(await screen.findByText('Droguería Vieja (eliminado)')).toBeTruthy();
  expect(screen.getByText('Droguería Activa')).toBeTruthy();

  // Elegirlo filtra el historial por su nombre (sin la marca)
  fireEvent.click(screen.getByText('Droguería Vieja (eliminado)'));
  await waitFor(() => expect(client.get).toHaveBeenCalledWith('/admin/orders/paginated',
    expect.objectContaining({ params: expect.objectContaining({ cliente: 'Droguería Vieja', vendedor: 'NinaTorres' }) })));
});
