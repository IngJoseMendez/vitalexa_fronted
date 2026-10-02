import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { AdminNuevaVentaPanel } from './AdminDashboard';
import client from '../api/client';
import promotionService from '../api/promotionService';
import specialPromotionService from '../api/specialPromotionService';

// axios no se resuelve en el Jest de CRA: el cliente y los servicios se reemplazan
jest.mock('../api/client', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock('../api/promotionService', () => ({
    __esModule: true,
    default: { getValidAdmin: jest.fn(), completeAssortment: jest.fn() },
}));
jest.mock('../api/specialPromotionService', () => ({
    __esModule: true,
    default: { getVendorPromotions: jest.fn() },
}));
const mockToast = { error: jest.fn(), success: jest.fn(), warning: jest.fn(), info: jest.fn() };
jest.mock('../components/ToastContainer', () => ({ useToast: () => mockToast }));
// Paneles del dashboard que este test no usa (y que importan sockets, gráficos, etc.)
jest.mock('../services/NotificationService', () => ({ __esModule: true, default: { connect: () => () => {} } }));
jest.mock('../hooks/useSidebarCollapsed', () => () => [false, () => {}]);
jest.mock('../components/SidebarToggle', () => () => null);
jest.mock('../components/TagsPanel', () => () => null);
jest.mock('../components/PromotionsPanel', () => () => null);
jest.mock('../components/AdminClientsPanel', () => () => null);
jest.mock('../components/ProductsPanel', () => () => null);
jest.mock('../components/SpecialProductsPanel', () => () => null);
jest.mock('../components/SpecialPromotionsPanel', () => () => null);
jest.mock('../components/InventoryHistoryPanel', () => () => null);
jest.mock('../components/SalesHistoryPanel', () => () => null);
jest.mock('../components/StockReportPanel', () => () => null);
jest.mock('../components/AdminDiscountSection', () => () => null);
jest.mock('../components/PayrollPanel', () => () => null);
jest.mock('../components/modals/OrderManagementModal', () => ({ __esModule: true, OrderDetailModal: () => null }));
jest.mock('../components/modals/EditOrderModal', () => () => null);
jest.mock('../components/modals/CompleteOrderModal', () => () => null);

// Surtido "13 + hasta 2 gratis" por $100.000
const surtido = {
    id: 'surtido-1', nombre: 'Surtido 13+2', type: 'BUY_GET_FREE', buyQuantity: 13, freeQuantity: 2,
    packPrice: 100000, active: true, mainProduct: { id: 'm', nombre: 'Colágeno' }, giftItems: [],
    visibleToAll: true, allowedVendorIds: [], allowedVendorNames: [],
};
// Como la manda /vendedor/special-promotions a ADMIN/OWNER: sin mainProduct ni freeQuantity en
// el primer nivel (solo mainProductId/mainProductName y la promoción base en parentPromotion)
const especialSurtido = {
    id: 'sp-1', nombre: 'Surtido Nina', descripcion: null, type: 'BUY_GET_FREE', buyQuantity: 13,
    packPrice: 90000, mainProductId: 'm', mainProductName: 'Colágeno', active: true,
    parentPromotionId: 'surtido-1', parentPromotionName: 'Surtido 13+2', isLinked: true,
    allowedVendorIds: ['v1'], allowedVendorNames: ['NinaTorres'],
    parentPromotion: { ...surtido, allowedVendorIds: [], allowedVendorNames: [] },
};
const productos = [
    { id: 'm', nombre: 'Colágeno', active: true, stock: 30, precio: 9000 },
    { id: 'a', nombre: 'Aceite', active: true, stock: 20, precio: 5000 },
    { id: 'b', nombre: 'Bálsamo', active: true, stock: 20, precio: 7000 },
];

beforeEach(() => {
    client.get.mockImplementation((url) => {
        if (url === '/admin/clients/vendedores') return Promise.resolve({ data: [{ id: 'v1', username: 'NinaTorres' }] });
        if (url === '/admin/products') return Promise.resolve({ data: productos });
        if (url === '/admin/clients/seller/v1') return Promise.resolve({ data: [{ id: 'c1', nombre: 'Cliente Uno' }] });
        return Promise.reject(new Error(`GET inesperado ${url}`));
    });
    client.post.mockResolvedValue({ data: {} });
    promotionService.getValidAdmin.mockResolvedValue({ data: [] });
    specialPromotionService.getVendorPromotions.mockResolvedValue({ data: { content: [especialSurtido] } });
});

const openPromotions = async () => {
    render(<AdminNuevaVentaPanel />);
    fireEvent.click(await screen.findByRole('tab', { name: /Promociones/ }));
    return (await screen.findByText('Surtido Nina')).closest('.promotion-card');
};

const pickFree = (name) => {
    fireEvent.change(screen.getByLabelText('Buscar Producto'), { target: { value: name.slice(0, 3) } });
    const fila = screen.getByText(name, { selector: '.product-search-item div' }).closest('.product-search-item');
    fireEvent.click(within(fila).getByRole('button', { name: 'Agregar' }));
};

test('una especial vinculada a un surtido se describe con los datos de su promoción base y se puede agregar', async () => {
    const card = await openPromotions();

    // Antes: "Compra 13 (falta configurar cuántos gratis)" y el modal bloqueaba el paquete
    expect(within(card).getByText('Compra 13 Colágeno + hasta 2 gratis a elección')).toBeInTheDocument();
    expect(within(card).getByText('NinaTorres')).toBeInTheDocument();

    fireEvent.click(within(card).getByRole('button', { name: /Agregar/ }));

    const modal = (await screen.findByText('Escoger productos gratis')).closest('.modal-content');
    expect(within(modal).queryByRole('alert')).not.toBeInTheDocument();
    expect(within(modal).getByText(/hasta 2$/)).toBeInTheDocument();
    // Precio de la ESPECIAL, no el de la promoción base
    expect(within(modal).getByText('$90.000,00')).toBeInTheDocument();
    // Un solo paquete: sin "Paquete 1 de 1"
    expect(within(modal).queryByText(/Paquete \d de/)).not.toBeInTheDocument();
    expect(within(modal).getByRole('button', { name: 'Agregar paquete' })).toBeEnabled();
});

test('cantidad 2 en un surtido: se arman 2 paquetes, cada uno con sus gratis, y se envían por separado', async () => {
    const card = await openPromotions();

    fireEvent.change(within(card).getByTitle('Cantidad de promociones a agregar'), { target: { value: '2' } });
    fireEvent.click(within(card).getByRole('button', { name: /Agregar/ }));

    // Paquete 1 de 2
    expect(await screen.findByText('Paquete 1 de 2')).toBeInTheDocument();
    pickFree('Aceite');
    fireEvent.click(screen.getByRole('button', { name: 'Agregar paquete' }));

    // Paquete 2 de 2: el modal sigue abierto y empieza vacío
    expect(await screen.findByText('Paquete 2 de 2')).toBeInTheDocument();
    expect(screen.queryByText('Productos gratis escogidos')).not.toBeInTheDocument();
    pickFree('Bálsamo');
    fireEvent.click(screen.getByRole('button', { name: 'Agregar paquete' }));

    await waitFor(() => expect(screen.queryByText('Escoger productos gratis')).not.toBeInTheDocument());
    expect(mockToast.success).toHaveBeenLastCalledWith('2 paquetes surtidos agregados al carrito');

    // Carrito: dos paquetes de $90.000 (los gratis a $0)
    const cartGroup = screen.getByText('Promociones', { selector: '.cart-group-header' }).closest('.cart-group');
    expect(within(cartGroup).getAllByText('Surtido Nina')).toHaveLength(2);
    expect(within(cartGroup).getByText(/Aceite × 1/)).toBeInTheDocument();
    expect(within(cartGroup).getByText(/Bálsamo × 1/)).toBeInTheDocument();
    expect(screen.getByText('Total').nextSibling).toHaveTextContent('180.000,00');

    // Vender
    const [vendorSelect] = screen.getAllByRole('combobox');
    fireEvent.change(vendorSelect, { target: { value: 'v1' } });
    await screen.findByText('Cliente Uno');
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'c1' } });
    fireEvent.click(screen.getByRole('button', { name: /Finalizar Venta/ }));

    await waitFor(() => expect(client.post).toHaveBeenCalled());
    const [url, body] = client.post.mock.calls[0];
    expect(url).toBe('/admin/orders');
    expect(body.promotionIds).toEqual(['sp-1', 'sp-1']);
    expect(body.bonifiedPromotionIds).toEqual([]);
    expect(body.items).toEqual([]);
    expect(body.assortmentSelections).toEqual([
        { promotionId: 'sp-1', bonified: false, items: [{ productId: 'a', cantidad: 1 }] },
        { promotionId: 'sp-1', bonified: false, items: [{ productId: 'b', cantidad: 1 }] },
    ]);
});

test('cancelar a mitad: quedan los paquetes ya confirmados y avisa cuántos se agregaron', async () => {
    const card = await openPromotions();

    fireEvent.change(within(card).getByTitle('Cantidad de promociones a agregar'), { target: { value: '3' } });
    fireEvent.click(within(card).getByRole('button', { name: /Agregar/ }));

    expect(await screen.findByText('Paquete 1 de 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Agregar paquete' }));
    expect(await screen.findByText('Paquete 2 de 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByText('Escoger productos gratis')).not.toBeInTheDocument();
    expect(mockToast.info).toHaveBeenCalledWith('Se agregaron 1 de 3 paquetes surtidos');
    const cartGroup = screen.getByText('Promociones', { selector: '.cart-group-header' }).closest('.cart-group');
    expect(within(cartGroup).getAllByText('Surtido Nina')).toHaveLength(1);
});
