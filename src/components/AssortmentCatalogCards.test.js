import { render, screen, fireEvent } from '@testing-library/react';
import VendedorPromotionsCatalog from './VendedorPromotionsCatalog';
import AdminPromotionsCatalog from './AdminPromotionsCatalog';
import promotionService from '../api/promotionService';
import specialPromotionService from '../api/specialPromotionService';
import { mergeVendorPromotions } from '../utils/vendorPromotionCatalog';

jest.mock('../api/promotionService', () => ({
    __esModule: true,
    default: { getValid: jest.fn(), getValidAdmin: jest.fn() },
}));
jest.mock('../api/specialPromotionService', () => ({
    __esModule: true,
    default: { getVendorPromotions: jest.fn() },
}));
const mockToast = { error: () => {}, success: () => {}, warning: () => {}, info: () => {} };
jest.mock('./ToastContainer', () => ({ useToast: () => mockToast }));

// Surtido "13 + hasta 2 gratis" por $100.000
const surtido = {
    id: 'surtido-1', nombre: 'Surtido Colágeno', type: 'BUY_GET_FREE', buyQuantity: 13, freeQuantity: 2,
    packPrice: 100000, active: true, mainProduct: { id: 'm', nombre: 'Colágeno' }, giftItems: [],
    visibleToAll: true, allowedVendorIds: [], allowedVendorNames: [],
};
// Surtido creado antes del cambio: el backend no tenía freeQuantity
const surtidoViejo = { ...surtido, id: 'surtido-2', nombre: 'Surtido viejo', freeQuantity: undefined };

test('vendedora: la tarjeta dice "Compra N + hasta X gratis a elección" (antes "undefined Unidades a Elección")', () => {
    render(<VendedorPromotionsCatalog onAddToCart={() => {}} initialPromotions={[surtido, surtidoViejo]} initLoading={false} />);

    expect(screen.getByText('Compra 13 Colágeno + hasta 2 gratis a elección')).toBeInTheDocument();
    expect(screen.getByText(/Compra 13 Colágeno \(falta configurar cuántos gratis\)/)).toBeInTheDocument();
    expect(screen.queryByText(/undefined/)).not.toBeInTheDocument();
});

test('vendedora: una especial vinculada a un surtido usa la cantidad de gratis de su promoción base', () => {
    const especial = {
        id: 'sp-1', nombre: 'Surtido Nina', packPrice: 90000, active: true, isLinked: true,
        parentPromotionId: 'surtido-1', parentPromotion: surtido, allowedVendorIds: [], allowedVendorNames: [],
    };
    render(<VendedorPromotionsCatalog onAddToCart={() => {}} initialPromotions={mergeVendorPromotions([], [especial])} initLoading={false} />);

    expect(screen.getByText('Compra 13 Colágeno + hasta 2 gratis a elección')).toBeInTheDocument();
});

test('admin: una especial vinculada a un surtido (respuesta sin mainProduct ni freeQuantity) usa los de su base', async () => {
    const especial = {
        id: 'sp-1', nombre: 'Surtido Nina', type: 'BUY_GET_FREE', buyQuantity: 13, packPrice: 90000,
        mainProductId: 'm', mainProductName: 'Colágeno', active: true, isLinked: true,
        parentPromotionId: 'surtido-1', parentPromotion: surtido,
        allowedVendorIds: ['v1'], allowedVendorNames: ['NinaTorres'],
    };
    promotionService.getValidAdmin.mockResolvedValue({ data: [] });
    specialPromotionService.getVendorPromotions.mockResolvedValue({ data: { content: [especial] } });
    const onAddToCart = jest.fn();

    render(<AdminPromotionsCatalog onAddToCart={onAddToCart} />);

    expect(await screen.findByText('Compra 13 Colágeno + hasta 2 gratis a elección')).toBeInTheDocument();
    expect(screen.getByText('NinaTorres')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Agregar/ }));
    // Se agrega con el id y precio de la ESPECIAL y los datos del surtido base
    expect(onAddToCart).toHaveBeenCalledWith(expect.objectContaining({
        id: 'sp-1', isSpecial: true, packPrice: 90000, freeQuantity: 2, mainProduct: surtido.mainProduct,
    }), 1);
});

test('admin: el catálogo de Nueva Venta describe el surtido igual', async () => {
    promotionService.getValidAdmin.mockResolvedValue({ data: [surtido] });
    specialPromotionService.getVendorPromotions.mockResolvedValue({ data: { content: [] } });

    render(<AdminPromotionsCatalog onAddToCart={() => {}} />);

    expect(await screen.findByText('Compra 13 Colágeno + hasta 2 gratis a elección')).toBeInTheDocument();
    expect(screen.queryByText(/undefined/)).not.toBeInTheDocument();
});
