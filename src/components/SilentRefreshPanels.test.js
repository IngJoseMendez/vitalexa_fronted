import { useState } from 'react';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import TagsPanel from './TagsPanel';
import PromotionsPanel from './PromotionsPanel';
import ProductsPanel from './ProductsPanel';
import StockReportPanel from './StockReportPanel';
import client from '../api/client';
import { tagService } from '../api/tagService';
import productService from '../api/productService';
import promotionService from '../api/promotionService';

// Actualización silenciosa de los paneles de inventario/promociones: cuando cambia refreshTrigger
// (INVENTORY_UPDATE o "Actualizar") el panel vuelve a pedir sus datos y los reemplaza EN SU LUGAR:
// sin "Cargando"/esqueletos, sin cerrar el modal abierto y sin perder lo escrito.

jest.mock('../api/client', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn() } }));
jest.mock('../api/tagService', () => ({
    __esModule: true,
    tagService: { getAll: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
}));
jest.mock('../api/productService', () => ({
    __esModule: true,
    default: { getStockReport: jest.fn(), registerPhysicalCount: jest.fn() },
}));
jest.mock('../api/promotionService', () => ({
    __esModule: true,
    default: { getAll: jest.fn(), toggleStatus: jest.fn(), delete: jest.fn() },
}));
const mockToast = { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn() };
jest.mock('./ToastContainer', () => ({ useToast: () => mockToast }));
jest.mock('./ConfirmDialog', () => ({ useConfirm: () => jest.fn(() => Promise.resolve(true)) }));
// Modales simulados con un campo: basta con saber si siguen montados y con lo escrito
jest.mock('./modals/PromotionFormModal', () => () => (
    <div role="dialog" aria-label="Formulario de promoción"><input aria-label="Nombre de la promoción" /></div>
));
jest.mock('./modals/StockArrivalModal', () => ({ product }) => (
    <div role="dialog" aria-label={`Llegada de ${product.nombre}`}><input aria-label="Unidades que llegaron" /></div>
));
jest.mock('./modals/ProductFormModal', () => () => <div role="dialog" aria-label="Producto" />);

const deferred = () => {
    let resolve;
    const promise = new Promise((r) => { resolve = r; });
    return { promise, resolve };
};

// Envoltorio con el mismo contrato que los dashboards: un número que cambia con cada refresco
function WithTrigger({ Panel, ...props }) {
    const [trigger, setTrigger] = useState(0);
    return (
        <>
            <button type="button" onClick={() => setTrigger((t) => t + 1)}>Simular INVENTORY_UPDATE</button>
            <Panel refreshTrigger={trigger} {...props} />
        </>
    );
}
const inventoryUpdate = () => fireEvent.click(screen.getByRole('button', { name: 'Simular INVENTORY_UPDATE' }));

describe('TagsPanel', () => {
    beforeEach(() => {
        tagService.getAll.mockResolvedValue({ data: [{ id: 't1', name: 'Ofertas', type: 'USER' }] });
    });

    test('el modal de nueva etiqueta sigue abierto con lo escrito y la tabla se actualiza', async () => {
        render(<WithTrigger Panel={TagsPanel} />);
        await screen.findByText('Ofertas');

        fireEvent.click(screen.getByRole('button', { name: '+ Nueva Etiqueta' }));
        const input = screen.getByLabelText('Nombre de la etiqueta');
        fireEvent.change(input, { target: { value: 'Importado' } });

        const refresh = deferred();
        tagService.getAll.mockReturnValueOnce(refresh.promise);
        inventoryUpdate();
        expect(tagService.getAll).toHaveBeenCalledTimes(2);
        expect(screen.queryByText('Cargando etiquetas...')).not.toBeInTheDocument();
        expect(screen.getByText('Ofertas')).toBeInTheDocument();

        await act(async () => {
            refresh.resolve({ data: [{ id: 't1', name: 'Ofertas', type: 'USER' }, { id: 't2', name: 'Nacional', type: 'USER' }] });
        });
        expect(await screen.findByText('Nacional')).toBeInTheDocument();
        expect(screen.getByRole('dialog', { name: 'Nueva Etiqueta' })).toBeInTheDocument();
        expect(screen.getByLabelText('Nombre de la etiqueta')).toBe(input);
        expect(input).toHaveValue('Importado');
    });

    test('si el refresco falla se conservan las etiquetas (con el mismo aviso)', async () => {
        render(<WithTrigger Panel={TagsPanel} />);
        await screen.findByText('Ofertas');

        tagService.getAll.mockRejectedValueOnce(new Error('sin red'));
        inventoryUpdate();
        await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('Error al cargar etiquetas'));
        expect(screen.getByText('Ofertas')).toBeInTheDocument();
    });
});

describe('PromotionsPanel', () => {
    const promo = (id, nombre, extra = {}) => ({
        id, nombre, type: 'PACK', buyQuantity: 2, mainProduct: { id: 'm1', nombre: 'Colágeno' }, giftItems: [],
        active: true, visibleToAll: true, allowedVendorIds: [], allowedVendorNames: [], ...extra,
    });

    beforeEach(() => {
        promotionService.getAll.mockResolvedValue({ data: [promo('p1', 'Pack Uno'), promo('p2', 'Pack Viejo', { active: false })] });
    });

    test('búsqueda, pestaña y formulario abiertos se conservan; la lista se actualiza', async () => {
        render(<WithTrigger Panel={PromotionsPanel} />);
        await screen.findByText('Pack Uno');

        fireEvent.click(screen.getByRole('tab', { name: /Todas/ }));
        const search = screen.getByPlaceholderText(/Buscar por nombre/);
        fireEvent.change(search, { target: { value: 'pack' } });
        fireEvent.click(screen.getByRole('button', { name: /Nueva Promoción/ }));
        fireEvent.change(screen.getByLabelText('Nombre de la promoción'), { target: { value: 'Pack Navidad' } });

        const refresh = deferred();
        promotionService.getAll.mockReturnValueOnce(refresh.promise);
        inventoryUpdate();
        expect(screen.queryByText('Cargando promociones...')).not.toBeInTheDocument();

        await act(async () => {
            refresh.resolve({ data: [promo('p1', 'Pack Uno'), promo('p2', 'Pack Viejo', { active: false }), promo('p3', 'Pack Nuevo')] });
        });

        expect(await screen.findByText('Pack Nuevo')).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/Buscar por nombre/)).toBe(search);
        expect(search).toHaveValue('pack');
        expect(screen.getByRole('tab', { name: /Todas/ })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByText('Pack Viejo')).toBeInTheDocument(); // sigue en "Todas"
        expect(screen.getByLabelText('Nombre de la promoción')).toHaveValue('Pack Navidad');
    });
});

describe('ProductsPanel', () => {
    const product = (stock) => ({
        id: 'p1', nombre: 'Crema Facial', descripcion: 'Hidratante', precio: 1000, stock, active: true, reorderPoint: 1,
    });

    beforeEach(() => {
        tagService.getAll.mockResolvedValue({ data: [] });
        client.get.mockResolvedValue({ data: [product(5)] });
    });

    const productsCalls = () => client.get.mock.calls.filter(([url]) => url === '/admin/products');

    test('la grilla se actualiza en su lugar y el modal de llegada sigue abierto con lo escrito', async () => {
        render(<WithTrigger Panel={ProductsPanel} />);
        const name = await screen.findByText('Crema Facial');
        await waitFor(() => expect(productsCalls()).toHaveLength(2)); // los dos efectos del montaje
        await act(async () => {});
        const card = name.closest('article');

        fireEvent.click(within(card).getByRole('button', { name: /Llegada/ }));
        fireEvent.change(screen.getByLabelText('Unidades que llegaron'), { target: { value: '12' } });

        const refresh = deferred();
        client.get.mockReturnValueOnce(refresh.promise);
        inventoryUpdate();
        await waitFor(() => expect(productsCalls()).toHaveLength(3));
        expect(productsCalls()[2]).toEqual(['/admin/products', { params: { size: 2000 } }]); // misma petición

        // Mientras llega: ni esqueletos ni grilla desmontada
        expect(screen.queryByText('Cargando productos...')).not.toBeInTheDocument();
        expect(screen.getByText('Crema Facial').closest('article')).toBe(card);

        await act(async () => { refresh.resolve({ data: [product(17)] }); });

        await waitFor(() => expect(within(card).getByText('17')).toBeInTheDocument());
        expect(screen.getByText('Crema Facial').closest('article')).toBe(card); // misma tarjeta (sin re-animar)
        expect(screen.getByRole('dialog', { name: 'Llegada de Crema Facial' })).toBeInTheDocument();
        expect(screen.getByLabelText('Unidades que llegaron')).toHaveValue('12');
    });

    test('si el refresco falla se conservan los productos (con el mismo aviso)', async () => {
        render(<WithTrigger Panel={ProductsPanel} />);
        await screen.findByText('Crema Facial');
        await waitFor(() => expect(productsCalls()).toHaveLength(2));
        await act(async () => {});

        client.get.mockRejectedValueOnce(new Error('sin red'));
        inventoryUpdate();
        await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('Error al cargar productos'));
        expect(screen.getByText('Crema Facial')).toBeInTheDocument();
    });
});

describe('StockReportPanel', () => {
    const report = (stockOk) => [
        { productId: 'p-falta', nombre: 'Crema Falta', stockEnBD: -8, stockComprometido: 3, stockFisicoRealRaw: -5,
            stockFisicoReal: 0, faltante: 5, alertaCritica: true, tieneStockComprometido: true },
        { productId: 'p-ok', nombre: 'Jabón OK', stockEnBD: stockOk, stockComprometido: 0, stockFisicoRealRaw: stockOk,
            stockFisicoReal: stockOk, faltante: 0, alertaCritica: false, tieneStockComprometido: false },
    ];

    beforeEach(() => {
        productService.getStockReport.mockResolvedValue({ data: report(12) });
    });

    test('refreshTrigger: la tabla se actualiza sin esqueleto y el conteo físico abierto conserva lo escrito', async () => {
        render(<WithTrigger Panel={StockReportPanel} role="owner" />);
        await screen.findByText('Crema Falta');

        fireEvent.click(within(screen.getByText('Crema Falta').closest('tr')).getByRole('button', { name: /Conteo físico/ }));
        const counted = within(screen.getByRole('dialog')).getByLabelText('Unidades contadas en bodega *');
        fireEvent.change(counted, { target: { value: '10' } });

        const refresh = deferred();
        productService.getStockReport.mockReturnValueOnce(refresh.promise);
        inventoryUpdate();
        expect(productService.getStockReport).toHaveBeenLastCalledWith('owner');
        expect(screen.queryByText('Cargando inventario...')).not.toBeInTheDocument();
        // Spinner solo en el botón "Actualizar"
        expect(screen.getByRole('button', { name: /Actualizar/ })).toHaveAttribute('aria-busy', 'true');

        await act(async () => { refresh.resolve({ data: report(15) }); });

        await waitFor(() => expect(within(screen.getByText('Jabón OK').closest('tr')).getByTestId('bodega')).toHaveTextContent('15'));
        expect(screen.getByRole('button', { name: /Actualizar/ })).not.toHaveAttribute('aria-busy');
        expect(within(screen.getByRole('dialog')).getByLabelText('Unidades contadas en bodega *')).toBe(counted);
        expect(counted).toHaveValue(10);
    });

    test('el botón "Actualizar" tampoco vacía la tabla', async () => {
        render(<StockReportPanel />);
        await screen.findByText('Crema Falta');

        const refresh = deferred();
        productService.getStockReport.mockReturnValueOnce(refresh.promise);
        fireEvent.click(screen.getByRole('button', { name: /Actualizar/ }));

        expect(screen.queryByText('Cargando inventario...')).not.toBeInTheDocument();
        expect(screen.getByText('Jabón OK')).toBeInTheDocument();
        await act(async () => { refresh.resolve({ data: report(12) }); });
    });
});
