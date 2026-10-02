import { render, screen, fireEvent, within } from '@testing-library/react';
import StockReportPanel from './StockReportPanel';
import productService from '../api/productService';

const mockToast = { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn() };
jest.mock('./ToastContainer', () => ({ useToast: () => mockToast }));
jest.mock('../api/productService', () => ({
    __esModule: true,
    default: { getStockReport: jest.fn(), getStockAlerts: jest.fn(), registerPhysicalCount: jest.fn() },
}));

const report = [
    // Se completaron pedidos sin registrar la llegada: crudo -5 → bodega 0 y faltan 5
    { productId: 'p-falta', nombre: 'Crema Falta', stockEnBD: -8, stockComprometido: 3, stockFisicoRealRaw: -5,
        stockFisicoReal: 0, faltante: 5, alertaCritica: true, tieneStockComprometido: true },
    // Vendido sin stock, pendiente de llegada: normal, bodega 0 sin faltante
    { productId: 'p-pedido', nombre: 'Gel Pedido', stockEnBD: -4, stockComprometido: 4, stockFisicoRealRaw: 0,
        stockFisicoReal: 0, faltante: 0, alertaCritica: true, tieneStockComprometido: true },
    { productId: 'p-ok', nombre: 'Jabón OK', stockEnBD: 12, stockComprometido: 0, stockFisicoRealRaw: 12,
        stockFisicoReal: 12, faltante: 0, alertaCritica: false, tieneStockComprometido: false },
];

beforeEach(() => {
    productService.getStockReport.mockResolvedValue({ data: report });
});

const row = (nombre) => screen.getByText(nombre).closest('tr');

test('bodega nunca negativa: 0 con "faltan N por registrar"; insignia "En pedidos"', async () => {
    render(<StockReportPanel role="owner" />);
    await screen.findByText('Crema Falta');

    expect(productService.getStockReport).toHaveBeenCalledWith('owner');
    const falta = row('Crema Falta');
    expect(within(falta).getByTestId('bodega')).toHaveTextContent('0');
    expect(within(falta).getByText('faltan 5 por registrar')).toBeInTheDocument();
    expect(within(falta).getByText('En pedidos')).toBeInTheDocument();

    const pedido = row('Gel Pedido');
    expect(within(pedido).queryByText(/faltan/)).not.toBeInTheDocument();
    expect(within(pedido).getByText('En pedidos')).toBeInTheDocument();

    expect(within(row('Jabón OK')).getByText('✓ OK')).toBeInTheDocument();
    expect(screen.queryByText('-5')).not.toBeInTheDocument();
});

test('los filtros son locales: las tarjetas y "Todos (N)" no cambian al filtrar', async () => {
    render(<StockReportPanel />);
    await screen.findByText('Crema Falta');

    fireEvent.click(screen.getByRole('button', { name: /Faltan por registrar \(1\)/ }));

    expect(screen.getByText('Crema Falta')).toBeInTheDocument();
    expect(screen.queryByText('Jabón OK')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Todos \(3\)/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /En pedidos \(2\)/ })).toBeInTheDocument();
    expect(productService.getStockAlerts).not.toHaveBeenCalled();
});

test('"Conteo físico" abre el modal con lo que hay en pedidos', async () => {
    render(<StockReportPanel />);
    await screen.findByText('Crema Falta');

    fireEvent.click(within(row('Crema Falta')).getByRole('button', { name: /Conteo físico/ }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Crema Falta')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Unidades contadas en bodega *'), { target: { value: '10' } });
    expect(within(dialog).getByText(/El sistema quedará en/)).toHaveTextContent('7');
});
