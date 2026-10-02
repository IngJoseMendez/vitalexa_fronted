import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import OwnerDashboard from './OwnerDashboard';
import client from '../api/client';
import { tagService } from '../api/tagService';

// Actualización silenciosa del panel del dueño: antes cada INVENTORY_UPDATE (o "Actualizar")
// cambiaba TODO el panel por "Cargando dashboard..." y lo volvía a montar: se cerraban el detalle
// de la orden y sus formularios, se perdían la búsqueda, los "Ver productos" abiertos, las fechas
// de Reportes y lo escrito en Nómina. Ahora los datos cambian en su lugar.
jest.mock('../api/client', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
const mockToast = { error: jest.fn(), success: jest.fn(), warning: jest.fn(), info: jest.fn() };
jest.mock('../components/ToastContainer', () => ({ useToast: () => mockToast }));
jest.mock('../components/ConfirmDialog', () => ({ useConfirm: () => jest.fn(() => Promise.resolve(true)) }));
let mockNotify = null;
jest.mock('../services/NotificationService', () => ({
  __esModule: true,
  default: { connect: (listener) => { mockNotify = listener; return () => {}; } },
}));
jest.mock('../api/tagService', () => ({ tagService: { getAll: jest.fn() } }));
jest.mock('../hooks/useSidebarCollapsed', () => () => [false, () => {}]);
jest.mock('../components/SidebarToggle', () => () => null);
jest.mock('../components/modals/HistoricalInvoiceModal', () => () => null);
// Detalle de orden simulado con estado propio: cuenta cuántas veces se monta y muestra refreshKey
let mockModalMounts = 0;
jest.mock('../components/modals/OrderManagementModal', () => {
  const { useState, useEffect } = require('react');
  return {
    __esModule: true,
    OrderDetailModal: function MockOrderDetailModal({ order, refreshKey }) {
      const [note, setNote] = useState('');
      useEffect(() => { mockModalMounts += 1; }, []);
      return (
        <div role="dialog" aria-label={`Detalle ${order.id}`}>
          <input aria-label="Motivo en el detalle" value={note} onChange={(e) => setNote(e.target.value)} />
          <span data-testid="modal-refresh-key">{refreshKey}</span>
        </div>
      );
    },
  };
});
// Nómina simulada con estado propio: muestra el refreshTrigger que recibe
jest.mock('../components/PayrollPanel', () => {
  const { useState } = require('react');
  return function MockPayrollPanel({ refreshTrigger }) {
    const [notes, setNotes] = useState('');
    return (
      <div>
        <textarea aria-label="Notas de nómina" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <span data-testid="payroll-refresh">{String(refreshTrigger)}</span>
      </div>
    );
  };
});

const makeOrder = (total) => ({
  id: 'o-1', estado: 'PENDIENTE', fecha: '2026-10-01T10:00:00', total, discountedTotal: total,
  cliente: 'Cliente Uno', vendedor: 'NinaTorres', paymentStatus: 'PENDING', notas: '',
  items: [{ productName: 'Crema', cantidad: 1, precioUnitario: 1000, subtotal: 1000 }],
});
const report = {
  salesReport: {
    totalRevenue: 100000, averageOrderValue: 50000, totalOrders: 2, completedOrders: 1, pendingOrders: 1,
    canceledOrders: 0, dailySales: [], monthlySales: [],
  },
  productReport: { totalProducts: 1, activeProducts: 1, totalInventoryValue: 0, lowStockProducts: 0, topSellingProducts: [], lowStockDetails: [] },
  clientReport: { totalClients: 1, activeClients: 1, topClients: [] },
  vendorReport: { totalVendors: 0, topVendors: [] },
};

// /admin/orders: inmediata o retenida hasta resolverla
let ordersResponse;
let heldOrders;
beforeEach(() => {
  jest.clearAllMocks();
  mockNotify = null;
  mockModalMounts = 0;
  heldOrders = [];
  ordersResponse = () => Promise.resolve({ data: [makeOrder(50000)] });
  tagService.getAll.mockResolvedValue({ data: [] });
  client.get.mockImplementation((url) => {
    if (url === '/admin/orders') return ordersResponse();
    if (url === '/admin/products') return Promise.resolve({ data: [] });
    if (url === '/owner/reports/sales') return Promise.resolve({ data: { totalOrders: 1, completedOrders: 0, pendingOrders: 1, totalRevenue: 0 } });
    if (url === '/owner/reports/complete') return Promise.resolve({ data: report });
    return Promise.resolve({ data: [] });
  });
});

const holdOrders = () => {
  ordersResponse = () => new Promise((resolve) => heldOrders.push(resolve));
};
const openTab = (name) => fireEvent.click(screen.getByRole('button', { name }));

test('INVENTORY_UPDATE no cierra el detalle de la orden ni los "Ver productos", y conserva la búsqueda', async () => {
  render(<OwnerDashboard />);
  await screen.findByText('Ingresos Totales');
  openTab(/^Órdenes/);

  const summary = await screen.findByText('Ver productos (1)');
  const details = summary.closest('details');
  details.open = true;
  const search = screen.getByLabelText('Buscar órdenes');
  fireEvent.change(search, { target: { value: 'Cliente' } });

  fireEvent.click(screen.getByRole('button', { name: /Gestionar Orden/ }));
  const modalInput = await screen.findByLabelText('Motivo en el detalle');
  fireEvent.change(modalInput, { target: { value: 'revisar abono' } });
  const keyBefore = screen.getByTestId('modal-refresh-key').textContent;

  holdOrders();
  act(() => { mockNotify({ type: 'INVENTORY_UPDATE' }); });
  await waitFor(() => expect(heldOrders).toHaveLength(1));
  // Mientras llega: el panel no se cambia por "Cargando dashboard..."
  expect(screen.queryByText('Cargando dashboard...')).not.toBeInTheDocument();
  expect(screen.getByText('Ver productos (1)')).toBe(summary);

  await act(async () => { heldOrders[0]({ data: [makeOrder(90000)] }); });
  expect(await screen.findByText('$90.000,00')).toBeInTheDocument();

  expect(details).toBeInTheDocument();
  expect(details.open).toBe(true);
  expect(search).toHaveValue('Cliente');
  expect(screen.getByLabelText('Motivo en el detalle')).toBe(modalInput);
  expect(modalInput).toHaveValue('revisar abono');
  expect(mockModalMounts).toBe(1);
  // El detalle se entera de la recarga (vuelve a pedir lo suyo en su lugar)
  await waitFor(() => expect(screen.getByTestId('modal-refresh-key').textContent).not.toBe(keyBefore));
});

test('"Actualizar" del menú: spinner en el botón y el panel no se vacía', async () => {
  render(<OwnerDashboard />);
  await screen.findByText('Ingresos Totales');
  const callsBefore = client.get.mock.calls.length;

  holdOrders();
  const button = screen.getByTitle('Actualizar datos');
  fireEvent.click(button);
  await waitFor(() => expect(heldOrders).toHaveLength(1));
  expect(button).toHaveAttribute('aria-busy', 'true');
  expect(screen.getByText('Ingresos Totales')).toBeInTheDocument();
  expect(screen.queryByText('Cargando dashboard...')).not.toBeInTheDocument();

  await act(async () => { heldOrders[0]({ data: [makeOrder(50000)] }); });
  await waitFor(() => expect(button).not.toHaveAttribute('aria-busy'));
  // Mismas peticiones que antes: pedidos, productos, ventas y vendedoras
  const urls = client.get.mock.calls.slice(callsBefore).map(([url]) => url);
  expect(urls).toEqual(expect.arrayContaining(['/admin/orders', '/admin/products', '/owner/reports/sales', '/admin/sale-goals/vendedores']));
});

test('Reportes: una recarga del dashboard vuelve a pedir el reporte con las fechas elegidas, sin esqueletos', async () => {
  render(<OwnerDashboard />);
  await screen.findByText('Ingresos Totales');
  openTab('Reportes');
  await screen.findByText('Sistema de Reportes');

  const desde = screen.getByLabelText('Desde:');
  fireEvent.change(desde, { target: { value: '2026-01-15' } });
  await waitFor(() => expect(client.get).toHaveBeenLastCalledWith('/owner/reports/complete', {
    params: expect.objectContaining({ startDate: '2026-01-15' }),
  }));
  await waitFor(() => expect(screen.queryByText('Generando reportes...')).not.toBeInTheDocument());
  const reportCalls = () => client.get.mock.calls.filter(([url]) => url === '/owner/reports/complete');
  const before = reportCalls().length;

  act(() => { mockNotify({ type: 'INVENTORY_UPDATE' }); });
  await waitFor(() => expect(reportCalls().length).toBe(before + 1));
  expect(reportCalls()[before][1].params.startDate).toBe('2026-01-15');
  expect(screen.queryByText('Generando reportes...')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Desde:')).toBe(desde);
  expect(desde).toHaveValue('2026-01-15');
});

test('Nómina recibe refreshTrigger sin remontarse: lo escrito se queda', async () => {
  render(<OwnerDashboard />);
  await screen.findByText('Ingresos Totales');
  openTab('Nómina');
  const notes = await screen.findByLabelText('Notas de nómina');
  fireEvent.change(notes, { target: { value: 'bono de octubre' } });
  const before = screen.getByTestId('payroll-refresh').textContent;

  act(() => { mockNotify({ type: 'INVENTORY_UPDATE' }); });
  await waitFor(() => expect(screen.getByTestId('payroll-refresh').textContent).not.toBe(before));
  expect(screen.getByLabelText('Notas de nómina')).toBe(notes);
  expect(notes).toHaveValue('bono de octubre');
});
