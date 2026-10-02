import { render, screen, fireEvent, within } from '@testing-library/react';
import BalancesPage from './BalancesPage';
import balanceService from '../api/balanceService';
import clientApi from '../api/client';
import { prefKey } from '../hooks/usePersistentState';

// Preferencias de vista de Saldos (CONVENTIONS §10): el orden A-Z/Z-A de la lista de clientes y
// el orden de las facturas del detalle (Fecha/Factura y Asc/Desc) se recuerdan por usuario aunque
// se recargue la página (aquí: desmontar y volver a montar), y valen para cualquier cliente. La
// búsqueda y el filtro Todos/Deben/Al día NO se recuerdan. Las peticiones son las de siempre (el
// orden es local).
jest.mock('../api/balanceService', () => ({
  __esModule: true,
  default: { getAllBalances: jest.fn(), getClientBalance: jest.fn(), exportToExcel: jest.fn() },
}));
jest.mock('../api/client', () => ({ __esModule: true, default: { get: jest.fn() } }));
const mockToast = { error: jest.fn(), success: jest.fn(), warning: jest.fn(), info: jest.fn() };
jest.mock('../components/ToastContainer', () => ({ useToast: () => mockToast }));
jest.mock('../components/ConfirmDialog', () => ({ useConfirm: () => jest.fn(() => Promise.resolve(true)) }));
jest.mock('../components/modals/PaymentHistoryModal', () => ({ __esModule: true, PaymentHistoryModal: () => null }));
jest.mock('../components/modals/OrderManagementModal', () => ({
  __esModule: true,
  OrderDetailModal: () => null,
  PaymentFormModal: () => null,
}));

const stored = (key) => {
  const raw = localStorage.getItem(prefKey(key));
  return raw === null ? null : JSON.parse(raw);
};
const save = (key, value) => localStorage.setItem(prefKey(key), JSON.stringify(value));

const balance = (clientId, clientName) => ({
  clientId, clientName, clientPhone: '3001234567', pendingBalance: 10000, totalPaid: 0, daysOverdue: 0,
});
const order = (id, invoiceNumber, fecha) => ({
  id, orderId: id, invoiceNumber, fecha, total: 10000, discountedTotal: 10000, paidAmount: 0, pendingAmount: 10000,
});
// La factura 1500 es la más vieja y la 1600 la más nueva: Fecha/Desc y Factura/Asc dan órdenes distintos
const detail = {
  totalOrders: 20000, totalPaid: 0, pendingBalance: 20000, daysOverdue: 0, creditLimit: 0, balanceFavor: 0,
  initialBalanceSet: true, initialBalance: 0,
  pendingOrders: [order('o-a', 1500, '2026-08-01'), order('o-b', 1600, '2026-09-15')],
};

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  localStorage.setItem('username', 'owner1');
  localStorage.setItem('role', 'ROLE_OWNER');
  balanceService.getAllBalances.mockResolvedValue({ data: [balance('c1', 'Abarrotes Sol'), balance('c2', 'Zapatería Luna')] });
  balanceService.getClientBalance.mockResolvedValue({ data: detail });
  clientApi.get.mockImplementation((url) => {
    if (url === '/admin/clients/vendedores') return Promise.resolve({ data: [{ id: 'v1', username: 'NinaTorres' }] });
    return Promise.resolve({ data: [] });
  });
});
afterAll(() => localStorage.clear());

const NAMES = ['Abarrotes Sol', 'Zapatería Luna'];
const shownClients = () => screen.getAllByText(new RegExp(`^(${NAMES.join('|')})$`)).map((el) => el.textContent);
const shownInvoices = () => screen.getAllByText(/^Factura #\d+/).map((el) => el.textContent.match(/#(\d+)/)[1]);
const listSortBtn = () => screen.getByRole('button', { name: /^(A-Z|Z-A)$/ });
const statusBtn = (name) => within(screen.getByRole('group', { name: 'Filtrar por estado' })).getByRole('button', { name });

const openClient = async (name) => {
  fireEvent.click(screen.getByText(name));
  await screen.findByText('Órdenes Pendientes de Pago');
  await screen.findAllByText(/^Factura #\d+/);
};

test('el A-Z de la lista y el orden de las facturas se recuerdan al volver a montar', async () => {
  const { unmount } = render(<BalancesPage />);
  await screen.findByText('Abarrotes Sol');
  expect(listSortBtn()).toHaveTextContent('A-Z');
  expect(shownClients()).toEqual(['Abarrotes Sol', 'Zapatería Luna']);

  await openClient('Abarrotes Sol');
  // Por defecto: Fecha, Desc (la más nueva primero)
  expect(screen.getByRole('button', { name: /^Fecha$/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Desc$/ })).toBeInTheDocument();
  expect(shownInvoices()).toEqual(['1600', '1500']);
  ['balances.clients.sortDir', 'balances.invoices.sort', 'balances.invoices.sortDir']
    .forEach((k) => expect(stored(k)).toBeNull()); // montar no escribe

  fireEvent.click(listSortBtn());
  fireEvent.click(screen.getByRole('button', { name: /^Fecha$/ })); // -> Factura
  fireEvent.click(screen.getByRole('button', { name: /^Desc$/ })); // -> Asc
  expect(stored('balances.clients.sortDir')).toBe('desc');
  expect(stored('balances.invoices.sort')).toBe('invoice');
  expect(stored('balances.invoices.sortDir')).toBe('asc');
  unmount();

  // "Recargar la página"
  balanceService.getAllBalances.mockClear();
  render(<BalancesPage />);
  await screen.findByText('Abarrotes Sol');
  expect(listSortBtn()).toHaveTextContent('Z-A');
  expect(shownClients()).toEqual(['Zapatería Luna', 'Abarrotes Sol']);
  expect(balanceService.getAllBalances).toHaveBeenCalledTimes(1);

  // Vale para cualquier cliente que se abra
  await openClient('Zapatería Luna');
  expect(screen.getByRole('button', { name: /^Factura$/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Asc$/ })).toBeInTheDocument();
  expect(shownInvoices()).toEqual(['1500', '1600']);
});

test('el filtro Todos/Deben/Al día y la búsqueda NO se recuerdan', async () => {
  save('balances.clients.sortDir', 'desc');
  const { unmount } = render(<BalancesPage />);
  await screen.findByText('Abarrotes Sol');
  fireEvent.click(statusBtn(/Al día/));
  fireEvent.change(screen.getByPlaceholderText(/Buscar/), { target: { value: 'zap' } });
  unmount();

  render(<BalancesPage />);
  await screen.findByText('Abarrotes Sol');
  expect(statusBtn('Todos')).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByPlaceholderText(/Buscar/)).toHaveValue('');
  expect(shownClients()).toEqual(['Zapatería Luna', 'Abarrotes Sol']);
});

test('lo guardado que no es una opción vuelve al defecto', async () => {
  save('balances.clients.sortDir', 'za');
  save('balances.invoices.sort', 'total');
  save('balances.invoices.sortDir', true);
  render(<BalancesPage />);
  await screen.findByText('Abarrotes Sol');
  expect(listSortBtn()).toHaveTextContent('A-Z');
  await openClient('Abarrotes Sol');
  expect(screen.getByRole('button', { name: /^Fecha$/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Desc$/ })).toBeInTheDocument();
  expect(shownInvoices()).toEqual(['1600', '1500']);
});
