import { act, render, screen, fireEvent, within } from '@testing-library/react';
import AdminDashboard from './AdminDashboard';
import client from '../api/client';

// Si el código de una pestaña o de un modal diferido no se puede descargar (red móvil caída,
// o un despliegue nuevo dejó sin efecto los archivos viejos), solo esa parte muestra
// "No se pudo cargar" + "Reintentar": el menú, las demás pestañas y la lista de órdenes siguen
// funcionando (antes React desmontaba toda la app y quedaba la pantalla en blanco).
jest.mock('../api/client', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
const mockToast = { error: jest.fn(), success: jest.fn(), warning: jest.fn(), info: jest.fn() };
jest.mock('../components/ToastContainer', () => ({ useToast: () => mockToast }));
jest.mock('../services/NotificationService', () => ({ __esModule: true, default: { connect: () => () => {} } }));
jest.mock('../hooks/useSidebarCollapsed', () => () => [false, () => {}]);
jest.mock('../components/SidebarToggle', () => () => null);
jest.mock('../components/AdminDiscountSection', () => () => null);
jest.mock('../components/StockReportPanel', () => ({ role }) => <div>Stock real simulado ({role})</div>);
// import() rechazado (como un ChunkLoadError): el módulo falla cada vez que se pide, así que
// también falla el reintento automático de lazyWithRetry
jest.mock('../components/PayrollPanel', () => {
  throw new Error('Loading chunk 412 failed.');
});
jest.mock('../components/modals/OrderManagementModal', () => {
  throw new Error('Loading chunk 77 failed.');
});
jest.mock('../components/modals/EditOrderModal', () => () => <div role="dialog">Editar simulado</div>);

const order = {
  id: 'o-1', estado: 'PENDIENTE', fecha: '2026-10-01T10:00:00', total: 50000, discountedTotal: 50000,
  cliente: 'Cliente Uno', vendedor: 'NinaTorres', items: [], paymentStatus: 'PENDING', notas: '',
};

// lazyWithRetry espera 1 s antes del reintento
const AFTER_RETRY = { timeout: 4000 };

let consoleErrorSpy;
beforeEach(() => {
  // React informa por consola el error que atrapa el boundary: aquí es el esperado
  consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  client.get.mockImplementation((url) => {
    if (url === '/admin/orders/paginated') {
      return Promise.resolve({ data: { content: [order], totalPages: 1, totalElements: 1, number: 0 } });
    }
    return Promise.resolve({ data: [] });
  });
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

test('si una pestaña diferida no se puede descargar, el resto del panel sigue vivo', async () => {
  render(<AdminDashboard />);
  fireEvent.click(screen.getByRole('button', { name: 'Nómina' }));

  const alert = await screen.findByRole('alert', {}, AFTER_RETRY);
  expect(alert).toHaveTextContent('No se pudo cargar');
  expect(screen.getByRole('button', { name: /Reintentar/ })).toBeInTheDocument();

  // El menú lateral sigue ahí y otra pestaña abre normalmente (el aviso se va)
  fireEvent.click(screen.getByRole('button', { name: 'Stock Real' }));
  expect(await screen.findByText('Stock real simulado (admin)')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('si un modal diferido no se puede descargar, se puede cerrar y la lista sigue visible', async () => {
  render(<AdminDashboard />);
  const detalle = await screen.findByRole('button', { name: /Detalle/ });
  fireEvent.click(detalle);

  // Mientras carga: su espera con "Cancelar" (no queda nadie atrapado detrás del overlay)
  expect(screen.getByRole('status')).toHaveTextContent('Cargando…');
  expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();

  const dialog = await screen.findByRole('alertdialog', {}, AFTER_RETRY);
  expect(dialog).toHaveTextContent('No se pudo cargar');
  expect(within(dialog).getByRole('button', { name: /Reintentar/ })).toBeInTheDocument();
  expect(detalle).toBeVisible();

  fireEvent.click(within(dialog).getByRole('button', { name: 'Cerrar' }));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(detalle).toBeVisible();

  // Volver a abrirlo muestra el aviso otra vez (con Escape también se cierra)
  fireEvent.click(detalle);
  expect(await screen.findByRole('alertdialog')).toHaveTextContent('No se pudo cargar');
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(detalle).toBeVisible();
});

test('"Cancelar" cierra la espera de un modal sin esperar a que termine la descarga', async () => {
  client.get.mockImplementation((url) => {
    if (url === '/admin/orders/paginated') {
      return Promise.resolve({
        data: { content: [{ ...order, estado: 'CONFIRMADO' }], totalPages: 1, totalElements: 1, number: 0 },
      });
    }
    return Promise.resolve({ data: [] });
  });
  render(<AdminDashboard />);
  const editar = await screen.findByRole('button', { name: 'Editar' });
  fireEvent.click(editar);
  expect(screen.getByRole('status')).toHaveTextContent('Cargando…');
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  // Cuando la descarga termina, el modal ya no se abre solo
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(editar).toBeVisible();
});
