import { useState } from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import SpecialPromotionsPanel from './SpecialPromotionsPanel';
import SpecialProductsPanel from './SpecialProductsPanel';
import VendorSpecialProductsPanel from './VendorSpecialProductsPanel';
import AdminDiscountSection from './AdminDiscountSection';
import client from '../api/client';
import specialPromotionService from '../api/specialPromotionService';
import specialProductService from '../api/specialProductService';
import promotionService from '../api/promotionService';
import { tagService } from '../api/tagService';

// Actualización silenciosa de Promociones especiales, Productos especiales (admin y vendedora) y
// de los descuentos de la tarjeta de orden del admin. Cuando llega una recarga (INVENTORY_UPDATE
// de cualquier usuario o "Actualizar") el panel trae los datos y los cambia EN SU LUGAR: el
// buscador no se desmonta (no se pierde el foco ni lo escrito), la grilla no se cambia por
// "Cargando...", el modal abierto sigue abierto y las tarjetas son los mismos nodos.

jest.mock('../api/client', () => ({
    __esModule: true,
    default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
jest.mock('../api/specialPromotionService', () => ({
    __esModule: true,
    default: { getAll: jest.fn(), search: jest.fn(), toggleStatus: jest.fn(), remove: jest.fn() },
}));
jest.mock('../api/promotionService', () => ({ __esModule: true, default: { getAll: jest.fn() } }));
jest.mock('../api/specialProductService', () => ({
    __esModule: true,
    default: { getAll: jest.fn(), search: jest.fn(), getVendorProducts: jest.fn(), toggleStatus: jest.fn(), remove: jest.fn() },
}));
jest.mock('../api/tagService', () => ({ __esModule: true, tagService: { getAll: jest.fn() } }));
const mockToast = { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn() };
jest.mock('./ToastContainer', () => ({ useToast: () => mockToast }));
jest.mock('./ConfirmDialog', () => ({ useConfirm: () => jest.fn(() => Promise.resolve(true)) }));
// Modales simulados con un campo propio: si el panel se remontara, lo escrito se perdería
jest.mock('./modals/SpecialPromotionFormModal', () => () => (
    <div role="dialog" aria-label="Formulario de promoción especial"><input aria-label="Nombre de la especial" /></div>
));
jest.mock('./modals/SpecialProductFormModal', () => () => (
    <div role="dialog" aria-label="Formulario de producto especial"><input aria-label="Nombre del especial" /></div>
));

const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
};

// Mismo contrato que los dashboards: un número que cambia con cada refresco
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

beforeEach(() => {
    jest.clearAllMocks();
});

describe('SpecialPromotionsPanel', () => {
    const special = (id, nombre, extra = {}) => ({
        id, nombre, type: 'PACK', buyQuantity: 2, packPrice: 90000, mainProductName: 'Colágeno', active: true,
        parentPromotionId: 'p1', parentPromotionName: 'Pack Base', allowedVendorIds: [], allowedVendorNames: [], ...extra,
    });
    const parents = [{ id: 'p1', nombre: 'Pack Base', type: 'PACK', buyQuantity: 2, active: true, mainProduct: { id: 'm1', nombre: 'Colágeno' }, giftItems: [] }];

    beforeEach(() => {
        specialPromotionService.getAll.mockResolvedValue({ data: { content: [special('s1', 'Especial Nina')] } });
        promotionService.getAll.mockResolvedValue({ data: parents });
    });

    test('una recarga no desmonta el buscador (ni le quita el foco), no muestra "Cargando..." y el modal sigue abierto', async () => {
        render(<WithTrigger Panel={SpecialPromotionsPanel} />);
        const card = (await screen.findByText('Especial Nina')).closest('article');

        const search = screen.getByPlaceholderText(/Buscar por nombre/);
        search.focus();
        fireEvent.change(search, { target: { value: 'espe' } });
        fireEvent.click(screen.getByRole('button', { name: /Nueva Promoción/ }));
        fireEvent.change(screen.getByLabelText('Nombre de la especial'), { target: { value: 'Especial Navidad' } });
        search.focus(); // sigue escribiendo en el buscador con el modal simulado abierto

        const refresh = deferred();
        specialPromotionService.getAll.mockReturnValueOnce(refresh.promise);
        inventoryUpdate();
        expect(specialPromotionService.getAll).toHaveBeenCalledTimes(2);
        expect(specialPromotionService.getAll).toHaveBeenLastCalledWith(0, 500);

        // Mientras llega: el buscador sigue montado y con foco; la grilla no se cambia por "Cargando..."
        expect(document.body.contains(search)).toBe(true);
        expect(document.activeElement).toBe(search);
        expect(screen.queryByText('Cargando...')).not.toBeInTheDocument();
        expect(screen.getByText('Especial Nina').closest('article')).toBe(card);

        await act(async () => {
            refresh.resolve({ data: { content: [special('s1', 'Especial Nina'), special('s2', 'Especial Nueva')] } });
        });

        expect(await screen.findByText('Especial Nueva')).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/Buscar por nombre/)).toBe(search);
        expect(search).toHaveValue('espe');
        expect(document.activeElement).toBe(search);
        expect(screen.getByText('Especial Nina').closest('article')).toBe(card);
        expect(screen.getByLabelText('Nombre de la especial')).toHaveValue('Especial Navidad');
    });

    test('si la recarga falla se conservan las promociones con el mismo aviso de siempre', async () => {
        render(<WithTrigger Panel={SpecialPromotionsPanel} />);
        await screen.findByText('Especial Nina');

        specialPromotionService.getAll.mockRejectedValueOnce(new Error('sin red'));
        inventoryUpdate();

        await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('Error al cargar promociones especiales'));
        expect(screen.getByText('Especial Nina')).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/Buscar por nombre/)).toBeInTheDocument();
        expect(screen.queryByText('Cargando...')).not.toBeInTheDocument();
    });
});

describe('SpecialProductsPanel', () => {
    const product = (id, nombre, stock = 5) => ({
        id, nombre, precio: 1000, stock, reorderPoint: 1, active: true, parentProductId: null, allowedVendorNames: [],
    });
    const pageOf = (content, totalPages = 1) => ({ data: { content, totalPages } });

    beforeEach(() => {
        tagService.getAll.mockResolvedValue({ data: [] });
        specialProductService.getAll.mockResolvedValue(pageOf([product('e1', 'Crema Especial')]));
        specialProductService.search.mockResolvedValue(pageOf([product('e1', 'Crema Especial')]));
    });

    test('la grilla se actualiza en su lugar: sin "Cargando", mismas tarjetas, buscador y modal intactos', async () => {
        render(<WithTrigger Panel={SpecialProductsPanel} />);
        const card = (await screen.findByText('Crema Especial')).closest('article');
        const search = screen.getByLabelText('Buscar producto especial');

        fireEvent.click(screen.getByRole('button', { name: /Nuevo Especial/ }));
        fireEvent.change(screen.getByLabelText('Nombre del especial'), { target: { value: 'Suero' } });

        const refresh = deferred();
        specialProductService.getAll.mockReturnValueOnce(refresh.promise);
        inventoryUpdate();
        expect(specialProductService.getAll).toHaveBeenLastCalledWith(0, 20);
        expect(screen.queryByText('Cargando productos especiales...')).not.toBeInTheDocument();
        expect(screen.getByText('Crema Especial').closest('article')).toBe(card);

        await act(async () => {
            refresh.resolve(pageOf([product('e1', 'Crema Especial', 2), product('e2', 'Gel Especial')]));
        });

        expect(await screen.findByText('Gel Especial')).toBeInTheDocument();
        expect(screen.getByText('Crema Especial').closest('article')).toBe(card);
        expect(card).toHaveTextContent('2'); // stock nuevo en la misma tarjeta
        expect(screen.getByLabelText('Buscar producto especial')).toBe(search);
        expect(screen.getByLabelText('Nombre del especial')).toHaveValue('Suero');
    });

    test('buscar sí muestra "Cargando" y una recarga vieja no pisa el resultado de la búsqueda', async () => {
        render(<WithTrigger Panel={SpecialProductsPanel} />);
        await screen.findByText('Crema Especial');

        // Recarga silenciosa en camino (sin búsqueda)...
        const staleRefresh = deferred();
        specialProductService.getAll.mockReturnValueOnce(staleRefresh.promise);
        inventoryUpdate();

        // ...y el admin busca: eso sí cambia la grilla por "Cargando"
        const searchResult = deferred();
        specialProductService.search.mockReturnValueOnce(searchResult.promise);
        fireEvent.change(screen.getByLabelText('Buscar producto especial'), { target: { value: 'gel' } });
        expect(screen.getByText('Cargando productos especiales...')).toBeInTheDocument();

        await act(async () => { searchResult.resolve(pageOf([product('e2', 'Gel Especial')])); });
        await act(async () => { staleRefresh.resolve(pageOf([product('e1', 'Crema Especial')])); });

        expect(await screen.findByText('Gel Especial')).toBeInTheDocument();
        expect(screen.queryByText('Crema Especial')).not.toBeInTheDocument();
        expect(screen.queryByText('Cargando productos especiales...')).not.toBeInTheDocument();
    });

    test('si la recarga falla se conservan los productos (mismo aviso)', async () => {
        render(<WithTrigger Panel={SpecialProductsPanel} />);
        await screen.findByText('Crema Especial');

        specialProductService.getAll.mockRejectedValueOnce(new Error('sin red'));
        inventoryUpdate();

        await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('Error al cargar productos especiales'));
        expect(screen.getByText('Crema Especial')).toBeInTheDocument();
    });
});

describe('VendorSpecialProductsPanel', () => {
    const product = (id, nombre, stock) => ({ id, nombre, precio: '1500', stock, descripcion: '' });

    beforeEach(() => {
        specialProductService.getVendorProducts.mockResolvedValue({ data: { content: [product('v1', 'Crema Nina', 8)], totalPages: 1 } });
    });

    test('un INVENTORY_UPDATE no reemplaza el panel por "Cargando...": el stock cambia en la misma tarjeta', async () => {
        render(<WithTrigger Panel={VendorSpecialProductsPanel} />);
        const card = (await screen.findByText('Crema Nina')).closest('article');

        const refresh = deferred();
        specialProductService.getVendorProducts.mockReturnValueOnce(refresh.promise);
        inventoryUpdate();
        expect(specialProductService.getVendorProducts).toHaveBeenCalledTimes(2);
        expect(specialProductService.getVendorProducts).toHaveBeenLastCalledWith(0, 20);
        expect(screen.queryByText('Cargando...')).not.toBeInTheDocument();
        expect(screen.getByText('Crema Nina').closest('article')).toBe(card);

        await act(async () => {
            refresh.resolve({ data: { content: [product('v1', 'Crema Nina', 3)], totalPages: 1 } });
        });

        expect(screen.getByText('Crema Nina').closest('article')).toBe(card);
        expect(card).toHaveTextContent('Stock: 3');
    });

    test('si la recarga falla se quedan los productos que ya se ven', async () => {
        render(<WithTrigger Panel={VendorSpecialProductsPanel} />);
        await screen.findByText('Crema Nina');

        specialProductService.getVendorProducts.mockRejectedValueOnce(new Error('sin red'));
        inventoryUpdate();

        await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('Error al cargar productos especiales'));
        expect(screen.getByText('Crema Nina')).toBeInTheDocument();
        expect(screen.queryByText('Cargando...')).not.toBeInTheDocument();
    });
});

describe('AdminDiscountSection', () => {
    const discount = (status) => ({ id: 'd1', type: 'PRESET', percentage: 10, reason: 'Cliente fiel', status });
    const discountCalls = () => client.get.mock.calls.filter(([url]) => url === '/admin/discounts/order/o-1');

    test('cada recarga de la lista (refreshKey) vuelve a pedir los descuentos sin borrar lo escrito', async () => {
        client.get.mockResolvedValue({ data: [discount('ACTIVE')] });
        const { rerender } = render(<AdminDiscountSection orderId="o-1" orderStatus="PENDIENTE" refreshKey={1} />);
        expect(await screen.findByRole('button', { name: 'Revocar descuento' })).toBeInTheDocument();
        expect(discountCalls()).toHaveLength(1);

        const percent = screen.getByLabelText('Porcentaje de descuento');
        const reason = screen.getByLabelText('Motivo del descuento');
        fireEvent.change(percent, { target: { value: '7' } });
        fireEvent.change(reason, { target: { value: 'Pronto pago' } });

        // Otro admin (o el dueño) revocó el descuento; llega la recarga de la lista de órdenes
        client.get.mockResolvedValue({ data: [discount('REVOKED')] });
        rerender(<AdminDiscountSection orderId="o-1" orderStatus="PENDIENTE" refreshKey={2} />);

        await waitFor(() => expect(discountCalls()).toHaveLength(2));
        expect(await screen.findByText('(revocado)')).toBeInTheDocument();
        // Ya no se ofrece revocar un descuento revocado
        expect(screen.queryByRole('button', { name: 'Revocar descuento' })).not.toBeInTheDocument();
        // Lo escrito en el descuento personalizado sigue ahí, en los mismos campos
        expect(screen.getByLabelText('Porcentaje de descuento')).toBe(percent);
        expect(percent).toHaveValue(7);
        expect(reason).toHaveValue('Pronto pago');
    });

    test('una respuesta vieja no pisa a la más nueva', async () => {
        client.get.mockResolvedValueOnce({ data: [] });
        const { rerender } = render(<AdminDiscountSection orderId="o-1" orderStatus="PENDIENTE" refreshKey={1} />);
        await waitFor(() => expect(discountCalls()).toHaveLength(1));

        const older = deferred();
        const newer = deferred();
        client.get.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
        rerender(<AdminDiscountSection orderId="o-1" orderStatus="PENDIENTE" refreshKey={2} />);
        rerender(<AdminDiscountSection orderId="o-1" orderStatus="PENDIENTE" refreshKey={3} />);
        expect(discountCalls()).toHaveLength(3);

        await act(async () => { newer.resolve({ data: [discount('REVOKED')] }); });
        await act(async () => { older.resolve({ data: [discount('ACTIVE')] }); });

        expect(screen.getByText('(revocado)')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Revocar descuento' })).not.toBeInTheDocument();
    });
});
