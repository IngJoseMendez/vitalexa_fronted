import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import BalancesPage from './BalancesPage';
import balanceService from '../api/balanceService';
import clientApi from '../api/client';

// Actualización silenciosa de Saldos: antes, después de editar/anular un pago (o guardar un cupo,
// o pulsar "Actualizar") toda la página se cambiaba por el esqueleto y se volvía a montar: el
// historial de pagos se CERRABA solo, se perdía lo escrito y la lista saltaba. Ahora los números
// cambian en su lugar.
jest.mock('../api/balanceService', () => ({
  __esModule: true,
  default: { getAllBalances: jest.fn(), getClientBalance: jest.fn(), exportToExcel: jest.fn() },
}));
jest.mock('../api/client', () => ({ __esModule: true, default: { get: jest.fn() } }));
const mockToast = { error: jest.fn(), success: jest.fn(), warning: jest.fn(), info: jest.fn() };
jest.mock('../components/ToastContainer', () => ({ useToast: () => mockToast }));
jest.mock('../components/ConfirmDialog', () => ({ useConfirm: () => jest.fn(() => Promise.resolve(true)) }));
// Historial de pagos simulado con estado propio; "Anular pago simulado" avisa como el real
jest.mock('../components/modals/PaymentHistoryModal', () => {
  const { useState } = require('react');
  return {
    __esModule: true,
    PaymentHistoryModal: function MockPaymentHistoryModal({ onPaymentUpdate }) {
      const [reason, setReason] = useState('');
      return (
        <div role="dialog" aria-label="Historial de pagos">
          <input aria-label="Motivo de anulación" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button type="button" onClick={() => onPaymentUpdate()}>Anular pago simulado</button>
        </div>
      );
    },
  };
});
jest.mock('../components/modals/OrderManagementModal', () => ({
  __esModule: true,
  OrderDetailModal: () => <div role="dialog">Detalle simulado</div>,
  PaymentFormModal: () => <div role="dialog">Pago simulado</div>,
}));

const balance = (pendingBalance, name = 'Tienda Uno', clientId = 'c1') => ({
  clientId, clientName: name, clientPhone: '3001234567', pendingBalance, totalPaid: 60000 - pendingBalance, daysOverdue: 0,
});
const detail = (pendingAmount) => ({
  totalOrders: 60000, totalPaid: 60000 - pendingAmount, pendingBalance: pendingAmount, daysOverdue: 0,
  creditLimit: 100000, balanceFavor: 0, initialBalanceSet: true, initialBalance: 0,
  pendingOrders: [{
    id: 'o-1', orderId: 'o-1', invoiceNumber: 1500, fecha: '2026-09-01', total: 60000, discountedTotal: 60000,
    paidAmount: 60000 - pendingAmount, pendingAmount,
  }],
});

let balancesResponse;
let heldBalances;
beforeEach(() => {
  jest.clearAllMocks();
  localStorage.setItem('role', 'ROLE_OWNER');
  heldBalances = [];
  balancesResponse = () => Promise.resolve({ data: [balance(50000)] });
  balanceService.getAllBalances.mockImplementation((vendedorId) => balancesResponse(vendedorId));
  balanceService.getClientBalance.mockResolvedValue({ data: detail(50000) });
  clientApi.get.mockImplementation((url) => {
    if (url === '/admin/clients/vendedores') return Promise.resolve({ data: [{ id: 'v1', username: 'NinaTorres' }] });
    return Promise.resolve({ data: [] });
  });
});

afterEach(() => {
  localStorage.removeItem('role');
});

const holdBalances = () => {
  balancesResponse = (vendedorId) => new Promise((resolve) => heldBalances.push({ resolve, vendedorId }));
};

const openClient = async () => {
  render(<BalancesPage />);
  fireEvent.click(await screen.findByText('Tienda Uno'));
  await screen.findByText('Órdenes Pendientes de Pago');
};

test('anular un pago desde el historial: el historial sigue abierto y los saldos se actualizan en su lugar', async () => {
  await openClient();
  const creditInput = screen.getByLabelText('Límite de crédito');
  fireEvent.change(creditInput, { target: { value: '250000' } }); // sin guardar todavía

  fireEvent.click(screen.getByRole('button', { name: 'Ver historial de pagos' }));
  const reason = await screen.findByLabelText('Motivo de anulación');
  fireEvent.change(reason, { target: { value: 'pago duplicado' } });

  balanceService.getClientBalance.mockResolvedValue({ data: detail(20000) });
  holdBalances();
  fireEvent.click(screen.getByRole('button', { name: 'Anular pago simulado' }));

  // Mientras llega: ni esqueleto de página ni de detalle; el historial sigue abierto
  await waitFor(() => expect(heldBalances).toHaveLength(1));
  expect(screen.queryByText('Cargando saldos de clientes...')).not.toBeInTheDocument();
  expect(screen.queryByText('Cargando detalles...')).not.toBeInTheDocument();
  expect(screen.getByRole('dialog', { name: 'Historial de pagos' })).toBeInTheDocument();

  await act(async () => { heldBalances[0].resolve({ data: [balance(20000)] }); });

  // Mismas peticiones que antes: saldos 2 veces; detalle 3 (al abrir, la del pago y la que antes
  // hacía el remontaje tras recargar la lista)
  await waitFor(() => expect(balanceService.getClientBalance).toHaveBeenCalledTimes(3));
  expect(balanceService.getAllBalances).toHaveBeenCalledTimes(2);
  expect(balanceService.getAllBalances).toHaveBeenLastCalledWith(null);

  expect(screen.getByLabelText('Motivo de anulación')).toBe(reason);
  expect(reason).toHaveValue('pago duplicado');
  // Lo que se estaba escribiendo en el cupo no se borra
  expect(screen.getByLabelText('Límite de crédito')).toHaveValue(250000);
  // Los números nuevos
  expect((await screen.findAllByText('$20.000,00')).length).toBeGreaterThan(0);
});

test('"Actualizar": spinner en el botón, la lista y el detalle abierto se quedan', async () => {
  await openClient();
  const detailTitle = screen.getByRole('heading', { name: 'Tienda Uno' });

  holdBalances();
  const refresh = screen.getByRole('button', { name: /Actualizar/ });
  fireEvent.click(refresh);
  await waitFor(() => expect(heldBalances).toHaveLength(1));
  expect(refresh).toHaveAttribute('aria-busy', 'true');
  expect(screen.queryByText('Cargando saldos de clientes...')).not.toBeInTheDocument();

  await act(async () => { heldBalances[0].resolve({ data: [balance(50000)] }); });
  await waitFor(() => expect(refresh).not.toHaveAttribute('aria-busy'));
  expect(screen.getByRole('heading', { name: 'Tienda Uno' })).toBe(detailTitle);
  // El detalle vuelve a pedir el saldo del cliente (antes lo hacía al remontarse)
  await waitFor(() => expect(balanceService.getClientBalance).toHaveBeenCalledTimes(2));
});

test('otra vendedora: esqueleto solo en la lista y una recarga vieja no pisa el resultado nuevo', async () => {
  render(<BalancesPage />);
  await screen.findByText('Tienda Uno');
  const search = screen.getByLabelText('Buscar cliente');

  // Recarga silenciosa en camino (todas las vendedoras)...
  holdBalances();
  fireEvent.click(screen.getByRole('button', { name: /Actualizar/ }));
  await waitFor(() => expect(heldBalances).toHaveLength(1));

  // ...y el usuario elige una vendedora: esa sí muestra esqueleto, pero solo en la lista
  const vendor = screen.getByRole('combobox', { name: 'Filtrar por vendedor' });
  fireEvent.change(vendor, { target: { value: 'Nina' } });
  const [nina] = within(screen.getByRole('listbox', { name: 'Filtrar por vendedor' })).getAllByRole('option');
  expect(nina).toHaveTextContent('NinaTorres');
  fireEvent.click(nina);
  await waitFor(() => expect(heldBalances).toHaveLength(2));
  expect(heldBalances[1].vendedorId).toBe('v1');
  expect(screen.getByText('Cargando saldos de clientes...')).toBeInTheDocument();
  expect(screen.getByLabelText('Buscar cliente')).toBe(search);

  // Llega primero la de la vendedora y después la recarga vieja
  await act(async () => { heldBalances[1].resolve({ data: [balance(10000, 'Cliente de Nina', 'c9')] }); });
  await act(async () => { heldBalances[0].resolve({ data: [balance(50000, 'Tienda Uno')] }); });

  expect(await screen.findByText('Cliente de Nina')).toBeInTheDocument();
  expect(screen.queryByText('Tienda Uno')).not.toBeInTheDocument();
  expect(screen.queryByText('Cargando saldos de clientes...')).not.toBeInTheDocument();
});

test('otra vendedora: los totales y el contador no muestran los saldos de la anterior mientras llegan los nuevos', async () => {
  render(<BalancesPage />);
  await screen.findByText('Tienda Uno');
  const stats = document.querySelector('.bp-stats');
  // Todas las vendedoras: pendiente $50.000,00, pagado $10.000,00
  expect(within(stats).getByText('$50.000,00')).toBeInTheDocument();
  expect(within(stats).getByText('$10.000,00')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Clientes (1)' })).toBeInTheDocument();

  // Una recarga silenciosa (misma consulta) deja los números en su lugar mientras llega
  holdBalances();
  fireEvent.click(screen.getByRole('button', { name: /Actualizar/ }));
  await waitFor(() => expect(heldBalances).toHaveLength(1));
  expect(within(stats).getByText('$50.000,00')).toBeInTheDocument();
  expect(stats).not.toHaveAttribute('aria-busy');
  await act(async () => { heldBalances[0].resolve({ data: [balance(50000)] }); });

  // Elegir otra vendedora: los totales van en esqueleto hasta que lleguen los suyos
  const vendor = screen.getByRole('combobox', { name: 'Filtrar por vendedor' });
  fireEvent.change(vendor, { target: { value: 'Nina' } });
  fireEvent.click(within(screen.getByRole('listbox', { name: 'Filtrar por vendedor' })).getAllByRole('option')[0]);
  await waitFor(() => expect(heldBalances).toHaveLength(2));

  expect(screen.getByText('Cargando saldos de clientes...')).toBeInTheDocument();
  expect(document.querySelector('.bp-stats')).toBe(stats); // no se remonta
  expect(stats).toHaveAttribute('aria-busy', 'true');
  expect(within(stats).queryByText('$50.000,00')).not.toBeInTheDocument();
  expect(within(stats).queryByText('$10.000,00')).not.toBeInTheDocument();
  expect(within(stats).queryByText('1')).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Clientes' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Clientes (1)' })).not.toBeInTheDocument();

  // Llegan los de la vendedora: pendiente $25.000,00 y pagado $35.000,00
  await act(async () => { heldBalances[1].resolve({ data: [balance(25000, 'Cliente de Nina', 'c9')] }); });
  expect(await screen.findByText('Cliente de Nina')).toBeInTheDocument();
  expect(within(stats).getByText('$25.000,00')).toBeInTheDocument();
  expect(within(stats).getByText('$35.000,00')).toBeInTheDocument();
  expect(stats).not.toHaveAttribute('aria-busy');
  expect(screen.getByRole('heading', { name: 'Clientes (1)' })).toBeInTheDocument();
});
