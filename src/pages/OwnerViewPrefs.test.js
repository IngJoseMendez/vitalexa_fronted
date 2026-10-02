import { render, screen, fireEvent, within } from '@testing-library/react';
import OwnerDashboard from './OwnerDashboard';
import client from '../api/client';
import { tagService } from '../api/tagService';
import { prefKey } from '../hooks/usePersistentState';

// Preferencias de vista del dueño (CONVENTIONS §10): las columnas de la cuadrícula de Productos
// (1/2/3) se recuerdan por usuario aunque se recargue la página (aquí: desmontar y volver a
// montar). Antes se leía 'ownerGridColumns' pero nunca se escribía: siempre volvía a 2. El filtro
// Todos/Activos/Stock Bajo es un filtro de datos y NO se recuerda. Las peticiones son las de
// siempre (las columnas no cambian qué se pide).
jest.mock('../api/client', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
const mockToast = { error: jest.fn(), success: jest.fn(), warning: jest.fn(), info: jest.fn() };
jest.mock('../components/ToastContainer', () => ({ useToast: () => mockToast }));
jest.mock('../components/ConfirmDialog', () => ({ useConfirm: () => jest.fn(() => Promise.resolve(true)) }));
jest.mock('../services/NotificationService', () => ({ __esModule: true, default: { connect: () => () => {} } }));
jest.mock('../api/tagService', () => ({ tagService: { getAll: jest.fn() } }));
jest.mock('../hooks/useSidebarCollapsed', () => () => [false, () => {}]);
jest.mock('../components/SidebarToggle', () => () => null);

const stored = (key) => {
  const raw = localStorage.getItem(prefKey(key));
  return raw === null ? null : JSON.parse(raw);
};
const save = (key, value) => localStorage.setItem(prefKey(key), JSON.stringify(value));

const PRODUCTS = [
  { id: 'p1', nombre: 'Crema', descripcion: '', precio: 1000, stock: 50, active: true },
  { id: 'p2', nombre: 'Jabón', descripcion: '', precio: 2000, stock: 5, active: true },
];

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  localStorage.setItem('username', 'owner1');
  tagService.getAll.mockResolvedValue({ data: [] });
  client.get.mockImplementation((url) => {
    if (url === '/admin/products') return Promise.resolve({ data: PRODUCTS });
    if (url === '/owner/reports/sales') return Promise.resolve({ data: { totalOrders: 0, completedOrders: 0, pendingOrders: 0, totalRevenue: 0 } });
    return Promise.resolve({ data: [] });
  });
});
afterAll(() => localStorage.clear());

const columnsBtn = (n) => within(screen.getByRole('group', { name: 'Columnas de la cuadrícula' }))
  .getByRole('button', { name: new RegExp(`^${n}$`) });
const filterBtn = (name) => within(screen.getByRole('group', { name: 'Filtrar productos' }))
  .getByRole('button', { name });
// La cuadrícula no tiene rol: se mira su clase de columnas (solo presentación)
// eslint-disable-next-line -- sin rol accesible: se mira la grilla (testing-library/no-node-access)
const productsGrid = (container) => container.querySelector('.own-products-grid');

// Monta el panel y abre Productos (el dashboard arranca en Resumen)
const openProducts = async () => {
  const utils = render(<OwnerDashboard />);
  await screen.findByText('Ingresos Totales');
  fireEvent.click(screen.getByRole('button', { name: /^Productos/ }));
  await screen.findByText('Crema');
  return utils;
};

test('las columnas de Productos se recuerdan al volver a montar y la cuadrícula llega ya con ellas', async () => {
  const view = await openProducts();
  expect(columnsBtn(2)).toHaveAttribute('aria-pressed', 'true');
  expect(productsGrid(view.container)).toHaveClass('own-products-grid--cols-2');
  expect(stored('owner.products.columns')).toBeNull(); // montar no escribe

  fireEvent.click(columnsBtn(3));
  expect(columnsBtn(3)).toHaveAttribute('aria-pressed', 'true');
  expect(stored('owner.products.columns')).toBe(3); // número, como el estado
  view.unmount();

  // "Recargar la página"
  client.get.mockClear();
  const { container } = await openProducts();
  expect(columnsBtn(3)).toHaveAttribute('aria-pressed', 'true');
  expect(columnsBtn(2)).toHaveAttribute('aria-pressed', 'false');
  expect(productsGrid(container)).toHaveClass('own-products-grid--cols-3');
  // Mismas peticiones de siempre
  expect(client.get.mock.calls.map(([url]) => url).sort()).toEqual(
    ['/admin/orders', '/admin/products', '/admin/sale-goals/vendedores', '/owner/reports/sales'].sort()
  );
});

test('el filtro Todos/Activos/Stock Bajo NO se recuerda; las columnas sí', async () => {
  save('owner.products.columns', 1);
  const view = await openProducts();
  expect(productsGrid(view.container)).toHaveClass('own-products-grid--cols-1');
  fireEvent.click(filterBtn(/Stock Bajo/));
  expect(filterBtn(/Stock Bajo/)).toHaveAttribute('aria-pressed', 'true');
  view.unmount();

  const { container } = await openProducts();
  expect(filterBtn(/Todos/)).toHaveAttribute('aria-pressed', 'true');
  expect(productsGrid(container)).toHaveClass('own-products-grid--cols-1');
});

test('lo guardado que no es una opción (o la clave vieja ownerGridColumns) no se usa: vuelve a 2', async () => {
  save('owner.products.columns', 4);
  localStorage.setItem('ownerGridColumns', '3');
  const view = await openProducts();
  expect(columnsBtn(2)).toHaveAttribute('aria-pressed', 'true');
  expect(productsGrid(view.container)).toHaveClass('own-products-grid--cols-2');
  view.unmount();

  save('owner.products.columns', '3'); // texto: el estado guarda números
  const { container } = await openProducts();
  expect(productsGrid(container)).toHaveClass('own-products-grid--cols-2');
});
