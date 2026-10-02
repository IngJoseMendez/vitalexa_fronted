import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import VendedorDashboard from './VendedorDashboard';
import apiClient from '../api/client';
import vendedorInitService from '../api/vendedorInitService';

// Actualización silenciosa del panel de la vendedora: un INVENTORY_UPDATE (llega cada vez que
// cualquier usuario mueve una orden o un producto) vuelve a pedir los datos y los reemplaza EN SU
// LUGAR. Antes 4 paneles se montaban de cero (key={refreshTrigger}) y Nueva Venta cambiaba toda
// la pantalla por "Cargando...": se cerraba lo abierto y se perdía lo escrito.

jest.mock('../api/client', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn() } }));
jest.mock('../api/vendedorInitService', () => ({ __esModule: true, default: { cargarDatosInicio: jest.fn() } }));
const mockToast = { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn() };
jest.mock('../components/ToastContainer', () => ({ useToast: () => mockToast }));
let mockNotify = null;
jest.mock('../services/NotificationService', () => ({
  __esModule: true,
  default: { connect: (listener) => { mockNotify = listener; return () => {}; } },
}));

const DEBOUNCE_WAIT = { timeout: 3000 };

const inventoryUpdate = () => act(() => { mockNotify({ type: 'INVENTORY_UPDATE' }); });

const deferred = () => {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
};

const venta = (id, notas, extra = {}) => ({
  id, orderNumber: id === 'o-1' ? 101 : 202, estado: 'PENDIENTE', fecha: '2026-10-01T10:00:00',
  total: 50000, cliente: 'Cliente Uno', notas, paymentStatus: 'PENDING',
  items: [{ productName: 'Crema', cantidad: 2, precioUnitario: 25000 }], ...extra,
});

const pageOf = (content, number = 0, totalPages = 1) => ({
  data: { content, number, totalPages, totalElements: content.length * totalPages },
});

// Respuestas por defecto de lo que pide cada panel al montarse
let ordersHandler;
let clientsHandler;
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  mockNotify = null;
  Object.values(mockToast).forEach((fn) => fn.mockClear());
  localStorage.clear();
  vendedorInitService.cargarDatosInicio.mockResolvedValue({
    productos: [{ id: 'p1', nombre: 'Crema Facial', descripcion: '', precio: 1000, stock: 5 }],
    promociones: [],
    promocionesEspeciales: [],
  });
  ordersHandler = () => Promise.resolve(pageOf([venta('o-1', 'nota vieja')]));
  clientsHandler = () => Promise.resolve({ data: [{ id: 'c1', nombre: 'Tienda Uno' }] });
  apiClient.get.mockImplementation((url, config) => {
    if (url === '/vendedor/orders/my/paginated') return ordersHandler(config);
    if (url === '/vendedor/clients') return clientsHandler();
    return Promise.resolve({ data: [] });
  });
});

const ordersCalls = () => apiClient.get.mock.calls.filter(([url]) => url === '/vendedor/orders/my/paginated');
const clientsCalls = () => apiClient.get.mock.calls.filter(([url]) => url === '/vendedor/clients');

const openTab = async (name) => {
  render(<VendedorDashboard />);
  // Nueva Venta (pestaña inicial) termina su carga antes de cambiar de pestaña
  await screen.findByText('Crema Facial');
  fireEvent.click(screen.getByRole('button', { name }));
};

test('Mis Ventas: el INVENTORY_UPDATE reemplaza la lista en su lugar ("Ver productos" sigue abierto, sin esqueleto)', async () => {
  await openTab('Mis Ventas');
  expect(await screen.findByText('nota vieja', {}, DEBOUNCE_WAIT)).toBeInTheDocument();
  const details = document.querySelector('details.venta-details');
  details.open = true; // la vendedora abrió "Ver productos"

  const refresh = deferred();
  ordersHandler = () => refresh.promise;
  inventoryUpdate();
  await waitFor(() => expect(ordersCalls()).toHaveLength(2), DEBOUNCE_WAIT);

  // Mientras llega la respuesta: la lista sigue visible y abierta (antes: esqueleto en todo el panel)
  expect(screen.queryByRole('status', { name: 'Cargando mis ventas' })).not.toBeInTheDocument();
  expect(screen.getByText('nota vieja')).toBeInTheDocument();
  expect(details.open).toBe(true);

  await act(async () => { refresh.resolve(pageOf([venta('o-1', 'nota nueva')])); });

  expect(await screen.findByText('nota nueva')).toBeInTheDocument();
  expect(document.querySelector('details.venta-details')).toBe(details); // mismo nodo: no se remontó
  expect(details.open).toBe(true);
  // Misma petición que antes (mismos parámetros)
  expect(ordersCalls()[1][1]).toEqual({ params: { statusGroup: 'pending', page: 0, size: 20 } });
});

test('Mis Ventas: la búsqueda escrita se conserva y el refresco pide con ella', async () => {
  await openTab('Mis Ventas');
  await screen.findByText('nota vieja', {}, DEBOUNCE_WAIT);
  const search = screen.getByRole('textbox', { name: 'Buscar mis ventas' });
  fireEvent.change(search, { target: { value: 'cliente' } });
  await waitFor(() => expect(ordersCalls()).toHaveLength(2), DEBOUNCE_WAIT);
  await screen.findByText('nota vieja');

  inventoryUpdate();
  await waitFor(() => expect(ordersCalls()).toHaveLength(3), DEBOUNCE_WAIT);

  expect(screen.getByRole('textbox', { name: 'Buscar mis ventas' })).toBe(search);
  expect(search).toHaveValue('cliente');
  expect(ordersCalls()[2][1].params).toEqual({ statusGroup: 'pending', page: 0, size: 20, search: 'cliente' });
});

test('Mis Ventas: una respuesta vieja no devuelve a la página anterior', async () => {
  ordersHandler = (config) => Promise.resolve(
    pageOf([venta(config.params.page === 1 ? 'o-2' : 'o-1', `nota página ${config.params.page + 1}`)], config.params.page, 3)
  );
  await openTab('Mis Ventas');
  await screen.findByText('nota página 1', {}, DEBOUNCE_WAIT);

  // Llega un INVENTORY_UPDATE y su respuesta (página 1) tarda...
  const slow = deferred();
  const normal = ordersHandler;
  ordersHandler = (config) => (config.params.page === 0 ? slow.promise : normal(config));
  inventoryUpdate();
  await waitFor(() => expect(ordersCalls()).toHaveLength(2), DEBOUNCE_WAIT);

  // ...mientras tanto la vendedora pasa a la página 2
  fireEvent.click(screen.getByRole('button', { name: '2' }));
  await waitFor(() => expect(ordersCalls()).toHaveLength(3), DEBOUNCE_WAIT);
  expect(await screen.findByText('nota página 2')).toBeInTheDocument();

  // La respuesta vieja (página 1) llega tarde y se descarta
  await act(async () => { slow.resolve(pageOf([venta('o-1', 'nota página 1')], 0, 3)); });

  expect(screen.getByText('Pág. 2/3')).toBeInTheDocument();
  expect(screen.getByText('nota página 2')).toBeInTheDocument();
  expect(screen.queryByText('nota página 1')).not.toBeInTheDocument();
});

test('Clientes: el formulario de cliente nuevo sigue abierto con lo escrito y la lista se actualiza', async () => {
  await openTab('Clientes');
  expect(await screen.findByText('Tienda Uno')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: '+ Nuevo Cliente' }));
  const nit = screen.getByLabelText(/^NIT/);
  fireEvent.change(nit, { target: { value: '900123' } });

  clientsHandler = () => Promise.resolve({ data: [{ id: 'c1', nombre: 'Tienda Uno' }, { id: 'c2', nombre: 'Tienda Dos' }] });
  const before = clientsCalls().length;
  inventoryUpdate();

  expect(await screen.findByText('Tienda Dos')).toBeInTheDocument();
  expect(clientsCalls()).toHaveLength(before + 1);
  expect(screen.getByRole('dialog', { name: 'Nuevo Cliente' })).toBeInTheDocument();
  expect(screen.getByLabelText(/^NIT/)).toBe(nit);
  expect(nit).toHaveValue('900123');
});

test('Nueva Venta: el refresco no cambia la pantalla por "Cargando..." ni borra lo escrito', async () => {
  render(<VendedorDashboard />);
  await screen.findByText('Crema Facial');
  const search = screen.getByRole('textbox', { name: 'Buscar productos' });
  fireEvent.change(search, { target: { value: 'crema' } });
  search.focus();
  expect(screen.getByText('5 unidades')).toBeInTheDocument();

  const refresh = deferred();
  vendedorInitService.cargarDatosInicio.mockReturnValueOnce(refresh.promise);
  inventoryUpdate();

  expect(vendedorInitService.cargarDatosInicio).toHaveBeenCalledTimes(2);
  expect(screen.queryByText('Cargando...')).not.toBeInTheDocument();

  await act(async () => {
    refresh.resolve({
      productos: [{ id: 'p1', nombre: 'Crema Facial', descripcion: '', precio: 1000, stock: 9 }],
      promociones: [],
      promocionesEspeciales: [],
    });
  });

  expect(await screen.findByText('9 unidades')).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Buscar productos' })).toBe(search);
  expect(search).toHaveValue('crema');
  expect(search).toHaveFocus();
});

test('Nueva Venta: si el refresco falla se conservan los productos y las promociones que ya se ven', async () => {
  vendedorInitService.cargarDatosInicio.mockResolvedValueOnce({
    productos: [{ id: 'p1', nombre: 'Crema Facial', descripcion: '', precio: 1000, stock: 5 }],
    promociones: [{ id: 'pr1', nombre: 'Pack Uno', type: 'PACK', buyQuantity: 2, giftItems: [], active: true }],
    promocionesEspeciales: [],
  });
  render(<VendedorDashboard />);
  await screen.findByText('Crema Facial');
  // Contador de promociones del selector Productos | Promociones
  expect(screen.getByRole('tab', { name: /Promociones/ })).toHaveTextContent('1');

  vendedorInitService.cargarDatosInicio.mockRejectedValueOnce(new Error('sin red'));
  apiClient.get.mockImplementation((url) => (url === '/vendedor/products'
    ? Promise.reject(new Error('sin red'))
    : Promise.resolve({ data: [] })));
  inventoryUpdate();

  // Misma recuperación que antes (intenta al menos los productos)...
  await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/vendedor/products'));
  await act(async () => {});
  // ...pero lo que ya se veía no se borra (antes las promociones quedaban vacías)
  expect(screen.getByText('Crema Facial')).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /Promociones/ })).toHaveTextContent('1');
  expect(screen.queryByText('Cargando...')).not.toBeInTheDocument();
});
