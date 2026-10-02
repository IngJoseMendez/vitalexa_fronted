import { useState } from 'react';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import PayrollPanel from './PayrollPanel';
import PaymentTransferPanel from './PaymentTransferPanel';
import {
    getAllPayrolls,
    getAllPayrollConfigs,
    calculateAllPayrolls,
} from '../api/payrollService';
import paymentTransferService from '../api/paymentTransferService';

// Nómina y Transferencias del dueño: reciben refreshTrigger (INVENTORY_UPDATE o "Actualizar" del
// menú) y vuelven a pedir lo que se ve, EN SU LUGAR. Antes el dashboard entero se remontaba: se
// volvía a pedir la nómina del mes actual pero se perdía el mes elegido, las notas, el detalle
// abierto y el formulario de revocación. Sin refreshTrigger ("Actualizar" con el panel ya
// montado) la pestaña Nómina no pedía nada.

jest.mock('../api/client', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn() } }));
jest.mock('../api/payrollService', () => ({
    __esModule: true,
    getAllPayrollConfigs: jest.fn(),
    getPayrollConfig: jest.fn(),
    savePayrollConfig: jest.fn(),
    calculatePayroll: jest.fn(),
    calculateAllPayrolls: jest.fn(),
    getAllPayrolls: jest.fn(),
    getVendorPayrollHistory: jest.fn(),
    exportAllPayrollExcel: jest.fn(),
    exportAllPayrollPdf: jest.fn(),
    exportVendorPayrollExcel: jest.fn(),
    exportVendorPayrollPdf: jest.fn(),
}));
jest.mock('../api/paymentTransferService', () => ({
    __esModule: true,
    default: { getTransfersByOrigin: jest.fn(), getTransfersByDest: jest.fn(), revokeTransfer: jest.fn(), createTransfer: jest.fn() },
}));
jest.mock('../api/paymentService', () => ({ __esModule: true, default: { getActiveOrderPayments: jest.fn() } }));
const mockToast = { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn() };
jest.mock('./ToastContainer', () => ({ useToast: () => mockToast }));
jest.mock('./ConfirmDialog', () => ({ useConfirm: () => jest.fn(() => Promise.resolve(true)) }));

const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
};

function WithTrigger({ Panel, ...props }) {
    const [trigger, setTrigger] = useState(0);
    return (
        <>
            <button type="button" onClick={() => setTrigger((t) => t + 1)}>Simular Actualizar</button>
            <Panel refreshTrigger={trigger} {...props} />
        </>
    );
}
const ownerRefresh = () => fireEvent.click(screen.getByRole('button', { name: 'Simular Actualizar' }));

const vendedores = [{ id: 'v1', username: 'NinaTorres', active: true }];

beforeEach(() => {
    jest.clearAllMocks();
});

describe('PayrollPanel', () => {
    const nomina = (totalPayout, extra = {}) => ({
        id: 'n1', vendedorId: 'v1', vendedorUsername: 'NinaTorres', month: 10, year: 2026,
        totalPayout, baseSalary: 1500000, totalCommissions: totalPayout - 1500000,
        salesGoalMet: true, collectionGoalMet: false, notes: '', ...extra,
    });
    const card = () => screen.getByRole('heading', { name: 'NinaTorres' }).closest('article');

    beforeEach(() => {
        getAllPayrolls.mockResolvedValue({ data: [nomina(1600000)] });
        getAllPayrollConfigs.mockResolvedValue({ data: [] });
    });

    test('Nóminas: la recarga pide el mismo mes y cambia los montos en su lugar sin cerrar el detalle ni borrar las notas', async () => {
        render(<WithTrigger Panel={PayrollPanel} vendedores={vendedores} />);
        await screen.findByRole('heading', { name: 'NinaTorres' });
        const [month, year] = getAllPayrolls.mock.calls[0];
        const firstCard = card();

        fireEvent.change(screen.getByLabelText('Notas para el cálculo'), { target: { value: 'Bono octubre' } });
        fireEvent.click(within(firstCard).getByRole('button', { name: 'Ver' }));
        expect(screen.getByRole('dialog', { name: 'Nómina — NinaTorres' })).toBeInTheDocument();

        const refresh = deferred();
        getAllPayrolls.mockReturnValueOnce(refresh.promise);
        ownerRefresh();
        expect(getAllPayrolls).toHaveBeenCalledTimes(2);
        expect(getAllPayrolls).toHaveBeenLastCalledWith(month, year);
        expect(screen.queryByText('Cargando nóminas...')).not.toBeInTheDocument();
        expect(card()).toBe(firstCard);

        await act(async () => { refresh.resolve({ data: [nomina(1750000)] }); });

        expect(card()).toBe(firstCard);
        expect(within(firstCard).getByText('$1.750.000,00')).toBeInTheDocument();
        expect(screen.getByRole('dialog', { name: 'Nómina — NinaTorres' })).toBeInTheDocument();
        expect(screen.getByLabelText('Notas para el cálculo')).toHaveValue('Bono octubre');
    });

    test('Nóminas: si el dueño cambia de mes mientras llega una recarga, la respuesta vieja no pisa la del mes nuevo', async () => {
        render(<WithTrigger Panel={PayrollPanel} vendedores={vendedores} />);
        await screen.findByRole('heading', { name: 'NinaTorres' });

        const stale = deferred();
        getAllPayrolls.mockReturnValueOnce(stale.promise);
        ownerRefresh();

        // Elegir otro mes sí muestra "Cargando nóminas..." (lo pidió el dueño)
        const otherMonth = deferred();
        getAllPayrolls.mockReturnValueOnce(otherMonth.promise);
        fireEvent.change(screen.getByLabelText('Mes'), { target: { value: '1' } });
        expect(screen.getByText('Cargando nóminas...')).toBeInTheDocument();
        expect(getAllPayrolls).toHaveBeenLastCalledWith(1, expect.any(Number));

        await act(async () => { otherMonth.resolve({ data: [nomina(900000, { id: 'n9', vendedorUsername: 'MercyMaestre', month: 1 })] }); });
        await act(async () => { stale.resolve({ data: [nomina(1600000)] }); });

        expect(await screen.findByRole('heading', { name: 'MercyMaestre' })).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'NinaTorres' })).not.toBeInTheDocument();
        expect(screen.queryByText('Cargando nóminas...')).not.toBeInTheDocument();
    });

    test('Nóminas: una recarga que salió antes de "Calcular Todas" no pisa las nóminas recién calculadas', async () => {
        render(<WithTrigger Panel={PayrollPanel} vendedores={vendedores} />);
        await screen.findByRole('heading', { name: 'NinaTorres' });

        const stale = deferred();
        getAllPayrolls.mockReturnValueOnce(stale.promise);
        ownerRefresh();

        calculateAllPayrolls.mockResolvedValue({ data: [nomina(2100000)] });
        fireEvent.click(screen.getByRole('button', { name: /Calcular Todas/ }));
        await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith('Nóminas calculadas: 1 vendedores'));
        expect(within(card()).getByText('$2.100.000,00')).toBeInTheDocument();

        await act(async () => { stale.resolve({ data: [nomina(1600000)] }); });
        expect(within(card()).getByText('$2.100.000,00')).toBeInTheDocument();
    });

    test('Nóminas: si la recarga falla se quedan las nóminas (mismo aviso)', async () => {
        render(<WithTrigger Panel={PayrollPanel} vendedores={vendedores} />);
        await screen.findByRole('heading', { name: 'NinaTorres' });

        getAllPayrolls.mockRejectedValueOnce(new Error('sin red'));
        ownerRefresh();

        await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('Error al cargar nóminas'));
        expect(screen.getByRole('heading', { name: 'NinaTorres' })).toBeInTheDocument();
    });

    test('Configuración: la sub-pestaña se conserva y sus datos se recargan en su lugar', async () => {
        render(<WithTrigger Panel={PayrollPanel} vendedores={vendedores} />);
        await screen.findByRole('heading', { name: 'NinaTorres' });

        fireEvent.click(screen.getByRole('tab', { name: /Configuración/ }));
        expect(await screen.findByText(/Sin configuración/)).toBeInTheDocument();
        expect(getAllPayrollConfigs).toHaveBeenCalledTimes(1);

        const refresh = deferred();
        getAllPayrollConfigs.mockReturnValueOnce(refresh.promise);
        ownerRefresh();
        expect(getAllPayrollConfigs).toHaveBeenCalledTimes(2);
        expect(screen.queryByText('Cargando configuraciones...')).not.toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /Configuración/ })).toHaveAttribute('aria-selected', 'true');

        await act(async () => {
            refresh.resolve({ data: [{ vendedorId: 'v1', baseSalary: 1800000, salesCommissionPct: 0.015, collectionCommissionPct: 0.03, collectionThresholdPct: 0.8 }] });
        });
        expect(await screen.findByText('$1.800.000,00')).toBeInTheDocument();
        expect(screen.queryByText(/Sin configuración/)).not.toBeInTheDocument();
    });
});

describe('PaymentTransferPanel', () => {
    const transfer = (id, clientName, extra = {}) => ({
        id, paymentId: `pay-${id}-0000`, paymentTotalAmount: 200000, orderClientName: clientName,
        originVendedorUsername: 'MercyMaestre', destVendedorUsername: 'NinaTorres', amount: 100000,
        targetMonth: 10, targetYear: 2026, reason: 'Apoyo', createdAt: '2026-10-01T10:00:00',
        createdByUsername: 'owner', isRevoked: false, ...extra,
    });

    const chooseVendor = async () => {
        fireEvent.change(screen.getByRole('combobox', { name: 'Vendedor' }), { target: { value: 'Nina' } });
        const option = screen.getAllByRole('option').find((o) => o.textContent.includes('NinaTorres'));
        fireEvent.click(option);
        await screen.findByText('Tienda Uno');
    };

    beforeEach(() => {
        paymentTransferService.getTransfersByDest.mockResolvedValue({ data: [transfer('t1', 'Tienda Uno')] });
    });

    test('con una vendedora elegida, la recarga trae su historial en su lugar sin cerrar la revocación a medio escribir', async () => {
        render(<WithTrigger Panel={PaymentTransferPanel} vendedores={vendedores} />);
        await chooseVendor();
        expect(paymentTransferService.getTransfersByDest).toHaveBeenCalledTimes(1);
        const row = screen.getByText('Tienda Uno').closest('tr');

        fireEvent.click(within(row).getByRole('button', { name: /Revocar/ }));
        const reason = screen.getByLabelText('Motivo de revocación');
        fireEvent.change(reason, { target: { value: 'pago duplicado' } });

        const refresh = deferred();
        paymentTransferService.getTransfersByDest.mockReturnValueOnce(refresh.promise);
        ownerRefresh();
        expect(paymentTransferService.getTransfersByDest).toHaveBeenCalledTimes(2);
        expect(paymentTransferService.getTransfersByDest).toHaveBeenLastCalledWith('v1');
        expect(screen.queryByText('Cargando transferencias…')).not.toBeInTheDocument();

        await act(async () => {
            refresh.resolve({ data: [transfer('t1', 'Tienda Uno'), transfer('t2', 'Tienda Dos')] });
        });

        expect(await screen.findByText('Tienda Dos')).toBeInTheDocument();
        expect(screen.getByText('Tienda Uno').closest('tr')).toBe(row);
        expect(screen.getByLabelText('Motivo de revocación')).toBe(reason);
        expect(reason).toHaveValue('pago duplicado');
    });

    test('revocar con éxito borra el aviso de error anterior (antes lo hacía la recarga, ahora silenciosa)', async () => {
        render(<WithTrigger Panel={PaymentTransferPanel} vendedores={vendedores} />);
        await chooseVendor();

        fireEvent.click(within(screen.getByText('Tienda Uno').closest('tr')).getByRole('button', { name: /Revocar/ }));
        fireEvent.change(screen.getByLabelText('Motivo de revocación'), { target: { value: 'duplicada' } });
        paymentTransferService.revokeTransfer.mockRejectedValueOnce(new Error('sin red'));
        fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
        expect(await screen.findByText('Error al revocar: sin red')).toBeInTheDocument();

        paymentTransferService.revokeTransfer.mockResolvedValueOnce({});
        paymentTransferService.getTransfersByDest.mockResolvedValueOnce({ data: [] });
        fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

        expect(await screen.findByText('Transferencia revocada exitosamente')).toBeInTheDocument();
        expect(screen.queryByText('Error al revocar: sin red')).not.toBeInTheDocument();
        expect(paymentTransferService.revokeTransfer).toHaveBeenLastCalledWith('t1', 'duplicada');
    });

    test('sin vendedora elegida la recarga no pide nada (como antes)', async () => {
        render(<WithTrigger Panel={PaymentTransferPanel} vendedores={vendedores} />);
        expect(screen.getByText('Selecciona un vendedor para ver sus transferencias')).toBeInTheDocument();
        ownerRefresh();
        expect(paymentTransferService.getTransfersByDest).not.toHaveBeenCalled();
        expect(paymentTransferService.getTransfersByOrigin).not.toHaveBeenCalled();
    });

    test('si la recarga falla se queda la tabla y sale el aviso de siempre', async () => {
        render(<WithTrigger Panel={PaymentTransferPanel} vendedores={vendedores} />);
        await chooseVendor();

        paymentTransferService.getTransfersByDest.mockRejectedValueOnce(new Error('sin red'));
        ownerRefresh();

        expect(await screen.findByText('Error al cargar transferencias: sin red')).toBeInTheDocument();
        expect(screen.getByText('Tienda Uno')).toBeInTheDocument();
    });
});
