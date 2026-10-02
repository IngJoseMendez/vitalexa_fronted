import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import VendedorDashboard from './VendedorDashboard';
import apiClient from '../api/client';
import vendedorInitService from '../api/vendedorInitService';
import { prefKey } from '../hooks/usePersistentState';

// Preferencias de CÓMO VER de la vendedora que se recuerdan al recargar (usePersistentState):
// columnas del catálogo de Nueva Venta y, en Mis Ventas y Completadas, el orden por fecha y las
// ventas por página. La búsqueda y la fecha elegida NO se recuerdan.

jest.mock('../api/client', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn() } }));
jest.mock('../api/vendedorInitService', () => ({ __esModule: true, default: { cargarDatosInicio: jest.fn() } }));
const mockToast = { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn() };
jest.mock('../components/ToastContainer', () => ({ useToast: () => mockToast }));
jest.mock('../services/NotificationService', () => ({
  __esModule: true,
  default: { connect: () => () => {} },
}));

const DEBOUNCE_WAIT = { timeout: 3000 };
const ORDERS_URL = '/vendedor/orders/my/paginated';

// Dos ventas con fechas distintas para ver el orden; tres páginas para que salga "por página"
const venta = (id, notas, fecha) => ({
  id, orderNumber: id === 'o-1' ? 101 : 202, estado: 'PENDIENTE', fecha, completedAt: fecha,
  total: 50000, cliente: 'Cliente Uno', notas, paymentStatus: 'PENDING',
  items: [{ productName: 'Crema', cantidad: 2, precioUnitario: 25000 }],
});
const ORDERS = [venta('o-1', 'venta nueva', '2026-10-01T10:00:00'), venta('o-2', 'venta vieja', '2026-09-01T10:00:00')];
const pageOf = (content, number = 0, totalPages = 3) => ({
  data: { content, number, totalPages, totalElements: content.length * totalPages },
});

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  localStorage.clear();
  localStorage.setItem('username', 'maria');
  vendedorInitService.cargarDatosInicio.mockResolvedValue({
    productos: [{ id: 'p1', nombre: 'Crema Facial', descripcion: '', precio: 1000, stock: 5 }],
    promociones: [],
    promocionesEspeciales: [],
  });
  apiClient.get.mockImplementation((url, config) => {
    if (url === ORDERS_URL) return Promise.resolve(pageOf(ORDERS, config.params.page));
    if (url === '/vendedor/clients') return Promise.resolve({ data: [{ id: 'c1', nombre: 'Tienda Uno' }] });
    return Promise.resolve({ data: [] });
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

const savePref = (key, value) => localStorage.setItem(prefKey(key), JSON.stringify(value));
const storedPref = (key) => JSON.parse(localStorage.getItem(prefKey(key)));

const ordersCalls = (statusGroup) => apiClient.get.mock.calls
  .filter(([url, config]) => url === ORDERS_URL && config.params.statusGroup === statusGroup);

// Monta el panel y espera a que Nueva Venta (pestaña inicial) termine su carga
const renderDashboard = async () => {
  const view = render(<VendedorDashboard />);
  await screen.findByText('Crema Facial');
  return view;
};

const openTab = async (name) => {
  fireEvent.click(screen.getByRole('button', { name }));
};

const columnButton = (cols) =>
  within(screen.getByRole('group', { name: 'Columnas del catálogo' })).getByRole('button', { name: String(cols) });

const noteOrder = () => Array.from(document.querySelectorAll('.venta-card'))
  .map((card) => (card.textContent.includes('venta nueva') ? 'nueva' : 'vieja'));

test('Nueva Venta: las columnas del catálogo se recuerdan al volver a montar', async () => {
  const first = await renderDashboard();
  expect(columnButton(2)).toHaveAttribute('aria-pressed', 'true'); // defecto de siempre

  fireEvent.click(columnButton(3));
  expect(columnButton(3)).toHaveAttribute('aria-pressed', 'true');
  expect(storedPref('vendedora.newSale.columns')).toBe(3);
  first.unmount();

  await renderDashboard();
  expect(columnButton(3)).toHaveAttribute('aria-pressed', 'true');
  expect(columnButton(2)).toHaveAttribute('aria-pressed', 'false');
  expect(document.querySelector('.productos-grid').style.getPropertyValue('--vd-grid-cols')).toBe('3');
  // Ya no se usa la clave vieja (sin usuario y que se borraba al cerrar sesión)
  expect(localStorage.getItem('vendedorGridColumns')).toBeNull();
});

test('Nueva Venta: un valor guardado que no es una opción del selector vuelve a 2 columnas', async () => {
  savePref('vendedora.newSale.columns', 5);
  await renderDashboard();
  expect(columnButton(2)).toHaveAttribute('aria-pressed', 'true');
  expect(document.querySelector('.productos-grid').style.getPropertyValue('--vd-grid-cols')).toBe('2');
});

test('Mis Ventas: orden y ventas por página se recuerdan; la búsqueda no', async () => {
  const first = await renderDashboard();
  await openTab('Mis Ventas');
  await screen.findByText('venta nueva', {}, DEBOUNCE_WAIT);
  expect(noteOrder()).toEqual(['nueva', 'vieja']); // más recientes primero (defecto)
  expect(ordersCalls('pending')[0][1].params.size).toBe(20);

  fireEvent.change(screen.getByRole('combobox', { name: 'Ordenar por fecha' }), { target: { value: 'asc' } });
  expect(noteOrder()).toEqual(['vieja', 'nueva']);
  // Cambiar el tamaño hace lo mismo que antes: vuelve a la página 1 y pide con el nuevo tamaño
  fireEvent.click(screen.getByRole('button', { name: '2' }));
  await waitFor(() => expect(screen.getByText('Pág. 2/3')).toBeInTheDocument(), DEBOUNCE_WAIT);
  fireEvent.change(screen.getByRole('combobox', { name: 'Ventas por página' }), { target: { value: '50' } });
  await waitFor(() => expect(ordersCalls('pending').at(-1)[1].params).toEqual({ statusGroup: 'pending', page: 0, size: 50 }), DEBOUNCE_WAIT);
  fireEvent.change(screen.getByRole('textbox', { name: 'Buscar mis ventas' }), { target: { value: 'tienda' } });
  expect(storedPref('vendedora.myOrders.sortDir')).toBe('asc');
  expect(storedPref('vendedora.myOrders.pageSize')).toBe(50);
  first.unmount();

  apiClient.get.mockClear();
  await renderDashboard();
  await openTab('Mis Ventas');
  await screen.findByText('venta nueva', {}, DEBOUNCE_WAIT);

  // La PRIMERA petición ya usa el tamaño guardado (no una con 20 y otra con 50) y sin búsqueda
  expect(ordersCalls('pending')).toHaveLength(1);
  expect(ordersCalls('pending')[0][1]).toEqual({ params: { statusGroup: 'pending', page: 0, size: 50 } });
  expect(screen.getByRole('combobox', { name: 'Ventas por página' })).toHaveValue('50');
  expect(screen.getByRole('combobox', { name: 'Ordenar por fecha' })).toHaveValue('asc');
  expect(noteOrder()).toEqual(['vieja', 'nueva']);
  expect(screen.getByRole('textbox', { name: 'Buscar mis ventas' })).toHaveValue('');
});

test('Mis Ventas: otra pestaña cambia "ventas por página": esta sigue en su página (no pide una que ya no existe); al recargar usa lo último', async () => {
  // 60 ventas: con 20 por página hay 3 páginas; con 50, dos (la página 3 quedaría vacía y sin
  // paginación, que es donde vive el selector de tamaño)
  apiClient.get.mockImplementation((url, config) => {
    if (url === ORDERS_URL) {
      const { page, size } = config.params;
      const totalPages = Math.ceil(60 / size);
      return Promise.resolve({ data: { content: page < totalPages ? ORDERS : [], number: page, totalPages, totalElements: 60 } });
    }
    if (url === '/vendedor/clients') return Promise.resolve({ data: [{ id: 'c1', nombre: 'Tienda Uno' }] });
    return Promise.resolve({ data: [] });
  });
  const view = await renderDashboard();
  await openTab('Mis Ventas');
  await screen.findByText('venta nueva', {}, DEBOUNCE_WAIT);
  fireEvent.click(screen.getByRole('button', { name: '3' }));
  await waitFor(() => expect(ordersCalls('pending').at(-1)[1].params).toEqual({ statusGroup: 'pending', page: 2, size: 20 }), DEBOUNCE_WAIT);
  expect(await screen.findByText('Pág. 3/3')).toBeInTheDocument();
  const callsBefore = ordersCalls('pending').length;

  const storageKey = prefKey('vendedora.myOrders.pageSize');
  localStorage.setItem(storageKey, '50');
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key: storageKey, newValue: '50', storageArea: localStorage }));
  });
  await act(() => new Promise((resolve) => setTimeout(resolve, 500))); // más que el debounce de 400 ms

  expect(ordersCalls('pending')).toHaveLength(callsBefore);
  expect(screen.getByText('Pág. 3/3')).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Ventas por página' })).toHaveValue('20');
  expect(screen.getByText('venta nueva')).toBeInTheDocument();
  view.unmount();

  apiClient.get.mockClear();
  await renderDashboard();
  await openTab('Mis Ventas');
  await screen.findByText('venta nueva', {}, DEBOUNCE_WAIT);
  expect(ordersCalls('pending')[0][1]).toEqual({ params: { statusGroup: 'pending', page: 0, size: 50 } });
});

test('Completadas: lo guardado se usa desde la primera petición y es independiente de Mis Ventas', async () => {
  savePref('vendedora.completed.pageSize', 10);
  savePref('vendedora.completed.sortDir', 'asc');
  await renderDashboard();

  await openTab('Completadas');
  await screen.findByText('venta nueva', {}, DEBOUNCE_WAIT);
  expect(ordersCalls('completed')).toHaveLength(1);
  expect(ordersCalls('completed')[0][1]).toEqual({ params: { statusGroup: 'completed', page: 0, size: 10 } });
  expect(screen.getByRole('combobox', { name: 'Ordenar por fecha' })).toHaveValue('asc');
  expect(noteOrder()).toEqual(['vieja', 'nueva']);

  // Mis Ventas tiene sus propias preferencias: sigue con el defecto
  await openTab('Mis Ventas');
  await screen.findByText('venta nueva', {}, DEBOUNCE_WAIT);
  expect(ordersCalls('pending')[0][1].params.size).toBe(20);
  expect(screen.getByRole('combobox', { name: 'Ordenar por fecha' })).toHaveValue('desc');
});

test('Completadas: la fecha elegida no se recuerda; el orden sí', async () => {
  const first = await renderDashboard();
  await openTab('Completadas');
  await screen.findByText('venta nueva', {}, DEBOUNCE_WAIT);
  fireEvent.change(screen.getByRole('combobox', { name: 'Ordenar por fecha' }), { target: { value: 'asc' } });
  const dateInput = screen.getByTitle('Mostrar solo ventas completadas en esta fecha exacta');
  fireEvent.change(dateInput, { target: { value: '2026-09-01' } });
  await waitFor(() => expect(ordersCalls('completed').at(-1)[1].params.completedDate).toBe('2026-09-01'), DEBOUNCE_WAIT);
  first.unmount();

  apiClient.get.mockClear();
  await renderDashboard();
  await openTab('Completadas');
  await screen.findByText('venta nueva', {}, DEBOUNCE_WAIT);
  expect(ordersCalls('completed')[0][1]).toEqual({ params: { statusGroup: 'completed', page: 0, size: 20 } });
  expect(screen.getByTitle('Mostrar solo ventas completadas en esta fecha exacta')).toHaveValue('');
  expect(screen.getByRole('combobox', { name: 'Ordenar por fecha' })).toHaveValue('asc');
});

test('las preferencias son de cada usuaria y lo guardado inválido vuelve al defecto', async () => {
  savePref('vendedora.myOrders.pageSize', 50); // de maria
  localStorage.setItem('username', 'laura');
  savePref('vendedora.myOrders.pageSize', 30); // no es una opción (10, 20, 50)
  savePref('vendedora.myOrders.sortDir', 'fecha'); // tampoco ('desc', 'asc')

  await renderDashboard();
  await openTab('Mis Ventas');
  await screen.findByText('venta nueva', {}, DEBOUNCE_WAIT);
  expect(ordersCalls('pending')).toHaveLength(1);
  expect(ordersCalls('pending')[0][1].params.size).toBe(20);
  expect(screen.getByRole('combobox', { name: 'Ordenar por fecha' })).toHaveValue('desc');
});
