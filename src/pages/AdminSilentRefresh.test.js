import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import AdminDashboard from './AdminDashboard';
import client from '../api/client';

// Actualización silenciosa del panel de admin: las recargas automáticas (notificación de pedido
// nuevo o completado, INVENTORY_UPDATE) y el botón "Actualizar" traen las órdenes y las cambian
// EN SU LUGAR. Antes la lista se cambiaba por esqueletos y se volvía a montar: se cerraban los
// "Ver productos" abiertos, se perdía lo escrito en los descuentos y saltaba el scroll.
jest.mock('../api/client', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() } }));
const mockToast = { error: jest.fn(), success: jest.fn(), warning: jest.fn(), info: jest.fn() };
jest.mock('../components/ToastContainer', () => ({ useToast: () => mockToast }));
// El oyente de WebSocket del dashboard: se guarda para simular un INVENTORY_UPDATE
let mockNotify = null;
jest.mock('../services/NotificationService', () => ({
  __esModule: true,
  default: { connect: (listener) => { mockNotify = listener; return () => {}; } },
}));
jest.mock('../hooks/useSidebarCollapsed', () => () => [false, () => {}]);
jest.mock('../components/SidebarToggle', () => () => null);
// Sección de descuentos simulada con estado propio: si la tarjeta se remontara, lo escrito se
// perdería. Muestra refreshKey para comprobar que se le avisa de cada recarga.
jest.mock('../components/AdminDiscountSection', () => {
  const { useState } = require('react');
  return function MockDiscountSection({ orderId, refreshKey }) {
    const [percent, setPercent] = useState('');
    return (
      <div>
        <input aria-label={`Descuento ${orderId}`} value={percent} onChange={(e) => setPercent(e.target.value)} />
        <span data-testid={`discount-refresh-${orderId}`}>{refreshKey}</span>
      </div>
    );
  };
});
// Etiquetas simulada con estado propio: con key={refreshTrigger} se remontaba (y se perdía)
jest.mock('../components/TagsPanel', () => {
  const { useState } = require('react');
  return function MockTagsPanel({ refreshTrigger }) {
    const [name, setName] = useState('');
    return (
      <div>
        <input aria-label="Nombre de etiqueta" value={name} onChange={(e) => setName(e.target.value)} />
        <span data-testid="tags-refresh">{String(refreshTrigger)}</span>
      </div>
    );
  };
});

const makeOrder = (id, total, extra = {}) => ({
  id, estado: 'PENDIENTE', fecha: '2026-10-01T10:00:00', total, discountedTotal: total,
  cliente: `Cliente ${id}`, vendedor: 'NinaTorres', paymentStatus: 'PENDING', notas: '',
  items: [{ productName: 'Crema', cantidad: 1, precioUnitario: 1000, subtotal: 1000 }],
  ...extra,
});
const page = (content, number = 0, totalPages = 1) => ({
  data: { content, number, totalPages, totalElements: content.length * totalPages },
});

// Respuestas de /admin/orders/paginated: inmediatas (respond) o retenidas hasta resolverlas
let respond;
let held;
beforeEach(() => {
  jest.clearAllMocks();
  mockNotify = null;
  held = [];
  respond = () => Promise.resolve(page([makeOrder('o-1', 50000)]));
  client.get.mockImplementation((url, config) => {
    if (url === '/admin/orders/paginated') return respond(config.params);
    return Promise.resolve({ data: [] });
  });
});

const holdNext = () => {
  respond = (params) => new Promise((resolve) => held.push({ resolve, params }));
};
// Al montar, el buscador de facturas confirma su valor inicial a los 300 ms y pone la página en
// 0 (debounce de OrdersPanel). Un test que cambia de página espera a que pase; si no, ese
// setCurrentPage(0) puede llegar después del clic (máquina cargada) y devolver a la página 1.
const settleSearchDebounce = () => act(() => new Promise((resolve) => setTimeout(resolve, 350)));
const ordersCalls = () => client.get.mock.calls.filter(([url]) => url === '/admin/orders/paginated');

test('una notificación de pedido nuevo actualiza las tarjetas sin cerrar "Ver productos" ni borrar lo escrito', async () => {
  render(<AdminDashboard />);
  const summary = await screen.findByText('Ver productos (1)');
  const details = summary.closest('details');
  details.open = true;
  const discountInput = screen.getByLabelText('Descuento o-1');
  fireEvent.change(discountInput, { target: { value: '15' } });
  const firstParams = ordersCalls()[0][1].params;
  const refreshBefore = Number(screen.getByTestId('discount-refresh-o-1').textContent);

  holdNext();
  act(() => { window.dispatchEvent(new Event('new-order-notification')); });

  // Mientras llega: ni esqueletos ni lista desmontada
  await waitFor(() => expect(held).toHaveLength(1));
  expect(screen.queryByText('Cargando órdenes...')).not.toBeInTheDocument();
  expect(screen.getByText('Ver productos (1)')).toBe(summary);
  // Misma consulta que antes (mismos parámetros)
  expect(held[0].params).toEqual(firstParams);

  // Llega la orden con otro total: se ve el dato nuevo en la MISMA tarjeta
  await act(async () => { held[0].resolve(page([makeOrder('o-1', 80000)])); });
  expect(await screen.findByText('$80.000,00')).toBeInTheDocument();
  expect(details).toBeInTheDocument();
  expect(details.open).toBe(true);
  expect(screen.getByLabelText('Descuento o-1')).toBe(discountInput);
  expect(discountInput).toHaveValue('15');
  // La sección de descuentos se entera de la recarga (vuelve a pedir lo suyo sin remontarse)
  expect(Number(screen.getByTestId('discount-refresh-o-1').textContent)).toBeGreaterThan(refreshBefore);
});

test('INVENTORY_UPDATE (WebSocket) recarga las órdenes en silencio', async () => {
  render(<AdminDashboard />);
  const details = (await screen.findByText('Ver productos (1)')).closest('details');
  details.open = true;
  const callsBefore = ordersCalls().length;

  holdNext();
  act(() => { mockNotify({ type: 'INVENTORY_UPDATE' }); });
  await waitFor(() => expect(held).toHaveLength(1));
  expect(ordersCalls().length).toBe(callsBefore + 1);
  expect(screen.queryByText('Cargando órdenes...')).not.toBeInTheDocument();

  await act(async () => { held[0].resolve(page([makeOrder('o-1', 50000), makeOrder('o-2', 30000)])); });
  expect(await screen.findByText('Cliente o-2', { exact: false })).toBeInTheDocument();
  expect(details).toBeInTheDocument();
  expect(details.open).toBe(true);
});

test('cambiar de página mientras llega una recarga silenciosa: la respuesta vieja no devuelve a la página anterior', async () => {
  respond = (params) => Promise.resolve(page([makeOrder(`p${params.page}`, 10000)], params.page, 3));
  render(<AdminDashboard />);
  await screen.findByText('Ver productos (1)');
  expect(screen.getByText('Página 1 de 3')).toBeInTheDocument();
  await settleSearchDebounce();

  holdNext();
  act(() => { window.dispatchEvent(new Event('order-completed-notification')); }); // silenciosa, página 1
  await waitFor(() => expect(held).toHaveLength(1));

  // El admin pasa a la página 2: esa sí muestra esqueletos (lo pidió él)
  fireEvent.click(screen.getByRole('button', { name: '2' }));
  await waitFor(() => expect(held).toHaveLength(2));
  expect(held[1].params.page).toBe(1);
  expect(screen.getByText('Cargando órdenes...')).toBeInTheDocument();

  // Llega primero la página 2 y después la recarga vieja de la página 1
  await act(async () => { held[1].resolve(page([makeOrder('p1', 10000)], 1, 3)); });
  await act(async () => { held[0].resolve(page([makeOrder('p0-viejo', 10000)], 0, 3)); });

  expect(await screen.findByText('Cliente p1', { exact: false })).toBeInTheDocument();
  expect(screen.queryByText('Cliente p0-viejo', { exact: false })).not.toBeInTheDocument();
  expect(screen.getByText('Página 2 de 3')).toBeInTheDocument();
  expect(screen.queryByText('Cargando órdenes...')).not.toBeInTheDocument();
});

test('si falla una recarga silenciosa, las órdenes que se ven se quedan', async () => {
  render(<AdminDashboard />);
  await screen.findByText('Ver productos (1)');

  respond = () => Promise.reject(new Error('Network Error'));
  await act(async () => { window.dispatchEvent(new Event('new-order-notification')); });

  await waitFor(() => expect(mockToast.error).toHaveBeenCalled());
  expect(screen.getByText('Ver productos (1)')).toBeInTheDocument();
  expect(screen.queryByText('Cargando órdenes...')).not.toBeInTheDocument();
});

test('Etiquetas recibe refreshTrigger como prop: recarga sin remontarse ni perder lo escrito', async () => {
  render(<AdminDashboard />);
  await screen.findByText('Ver productos (1)');
  fireEvent.click(within(screen.getByRole('navigation')).getByRole('button', { name: 'Etiquetas' }));

  const input = await screen.findByLabelText('Nombre de etiqueta');
  fireEvent.change(input, { target: { value: 'Capilar' } });
  const before = screen.getByTestId('tags-refresh').textContent;

  act(() => { mockNotify({ type: 'INVENTORY_UPDATE' }); });

  await waitFor(() => expect(screen.getByTestId('tags-refresh').textContent).not.toBe(before));
  expect(screen.getByLabelText('Nombre de etiqueta')).toBe(input);
  expect(input).toHaveValue('Capilar');
});
