import { render, screen, fireEvent } from '@testing-library/react';
import BalancesPage from './BalancesPage';
import balanceService from '../api/balanceService';
import clientApi from '../api/client';

// Saldos: el ojito "Ver detalles de la orden" (detalle de la factura con descuentos) lo ven el
// Owner y el Admin; "Pagar" (registrar pagos) sigue siendo solo del Owner; la vendedora no ve
// ninguno de los dos.
jest.mock('../api/balanceService', () => ({
  __esModule: true,
  default: { getAllBalances: jest.fn(), getClientBalance: jest.fn(), exportToExcel: jest.fn() },
}));
jest.mock('../api/client', () => ({ __esModule: true, default: { get: jest.fn() } }));
const mockToast = { error: jest.fn(), success: jest.fn(), warning: jest.fn(), info: jest.fn() };
jest.mock('../components/ToastContainer', () => ({ useToast: () => mockToast }));
jest.mock('../components/ConfirmDialog', () => ({ useConfirm: () => jest.fn(() => Promise.resolve(true)) }));
jest.mock('../components/modals/PaymentHistoryModal', () => ({
  __esModule: true,
  PaymentHistoryModal: () => <div role="dialog" aria-label="Historial de pagos" />,
}));
jest.mock('../components/modals/OrderManagementModal', () => ({
  __esModule: true,
  OrderDetailModal: ({ userRole }) => <div role="dialog" aria-label="Detalle de la orden">Detalle para {userRole}</div>,
  PaymentFormModal: () => <div role="dialog" aria-label="Registrar pago" />,
}));

const order = {
  id: 'o-1', orderId: 'o-1', invoiceNumber: 1500, fecha: '2026-09-01', total: 60000, discountedTotal: 60000,
  paidAmount: 10000, pendingAmount: 50000,
};

beforeEach(() => {
  jest.clearAllMocks();
  balanceService.getAllBalances.mockResolvedValue({
    data: [{ clientId: 'c1', clientName: 'Tienda Uno', clientPhone: '3001234567', pendingBalance: 50000, totalPaid: 10000, daysOverdue: 0 }],
  });
  balanceService.getClientBalance.mockResolvedValue({
    data: {
      totalOrders: 60000, totalPaid: 10000, pendingBalance: 50000, daysOverdue: 0, creditLimit: 100000,
      balanceFavor: 0, initialBalanceSet: true, initialBalance: 0, pendingOrders: [order],
    },
  });
  clientApi.get.mockImplementation((url) => {
    if (url === '/admin/clients/vendedores') return Promise.resolve({ data: [] });
    if (url === '/admin/orders' || url === '/owner/orders') return Promise.resolve({ data: [order] });
    return Promise.resolve({ data: [] });
  });
});

afterEach(() => {
  localStorage.removeItem('role');
});

const openClient = async () => {
  render(<BalancesPage />);
  fireEvent.click(await screen.findByText('Tienda Uno'));
  await screen.findByText('Órdenes Pendientes de Pago');
};

it('el admin ve el ojito y abre el detalle de la factura (pide /admin/orders)', async () => {
  localStorage.setItem('role', 'ROLE_ADMIN');
  await openClient();
  expect(screen.queryByTitle('Registrar Pago')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Ver detalles de la orden' }));
  expect(await screen.findByRole('dialog', { name: 'Detalle de la orden' })).toHaveTextContent('Detalle para ROLE_ADMIN');
  expect(clientApi.get).toHaveBeenCalledWith('/admin/orders');
});

it('el owner sigue viendo el ojito y el botón Pagar', async () => {
  localStorage.setItem('role', 'ROLE_OWNER');
  await openClient();
  expect(screen.getByRole('button', { name: 'Ver detalles de la orden' })).toBeInTheDocument();
  expect(screen.getByTitle('Registrar Pago')).toBeInTheDocument();
});

it('la vendedora no ve el ojito ni Pagar', async () => {
  localStorage.setItem('role', 'ROLE_VENDEDOR');
  await openClient();
  expect(screen.queryByRole('button', { name: 'Ver detalles de la orden' })).not.toBeInTheDocument();
  expect(screen.queryByTitle('Registrar Pago')).not.toBeInTheDocument();
});
