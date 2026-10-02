import { render, screen, within } from '@testing-library/react';
import VendedorPromotionsCatalog from './VendedorPromotionsCatalog';
import AdminPromotionsCatalog, { VendorChips } from './AdminPromotionsCatalog';
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
const toastStub = { error: () => {}, success: () => {}, warning: () => {}, info: () => {} };
jest.mock('./ToastContainer', () => ({ useToast: () => toastStub }));

const normalTodas = {
    id: 'n-1', nombre: 'Pack Vitamina', type: 'PACK', buyQuantity: 40, packPrice: 100000,
    mainProduct: { id: 'prod-1', nombre: 'Vitamina C' }, giftItems: [], visibleToAll: true,
    allowedVendorIds: [], allowedVendorNames: [],
};
const normalRestringida = {
    ...normalTodas, id: 'n-2', nombre: 'Pack Solo Maria', visibleToAll: false,
    allowedVendorIds: ['v-1'], allowedVendorNames: ['maria'],
};
const normalNinguna = { ...normalTodas, id: 'n-3', nombre: 'Base oculta', visibleToAll: false };
const especial = {
    id: 'sp-1', nombre: 'Especial Nina', type: 'PACK', buyQuantity: 40, packPrice: 90000,
    mainProductId: 'prod-1', mainProductName: 'Vitamina C', active: true,
    parentPromotionId: 'n-1', parentPromotionName: 'Pack Vitamina', isLinked: true,
    allowedVendorIds: ['v-2'], allowedVendorNames: ['NinaTorres'],
};
const especialSinVendedoras = { ...especial, id: 'sp-2', nombre: 'Especial huerfana', allowedVendorIds: [], allowedVendorNames: [] };

const cardOf = (name) => screen.getByText(name).closest('.promotion-card');

describe('VendedorPromotionsCatalog', () => {
    test('las especiales de la vendedora aparecen con la etiqueta ESPECIAL; las normales no', () => {
        const promos = mergeVendorPromotions([normalTodas], [{ ...especial, parentPromotion: normalTodas }]);

        render(<VendedorPromotionsCatalog onAddToCart={() => {}} initialPromotions={promos} initLoading={false} />);

        expect(within(cardOf('Especial Nina')).getByText('ESPECIAL')).toBeInTheDocument();
        expect(within(cardOf('Pack Vitamina')).queryByText('ESPECIAL')).not.toBeInTheDocument();
        // Muestra el producto del padre (lo que la venta aplica)
        expect(within(cardOf('Especial Nina')).getByText(/Compra 40/)).toBeInTheDocument();
    });

    test('una especial sin tipo (backend anterior) no rompe el catálogo', () => {
        const promos = [{ ...especial, type: null, isSpecial: true }];

        render(<VendedorPromotionsCatalog onAddToCart={() => {}} initialPromotions={promos} initLoading={false} />);

        expect(screen.getByText('Especial Nina')).toBeInTheDocument();
    });
});

describe('AdminPromotionsCatalog', () => {
    beforeEach(() => {
        promotionService.getValidAdmin.mockResolvedValue({ data: [normalTodas, normalRestringida, normalNinguna] });
        specialPromotionService.getVendorPromotions.mockResolvedValue({
            data: { content: [especial, especialSinVendedoras] },
        });
    });

    test('muestra a qué vendedoras les aparece cada promoción (normales y especiales)', async () => {
        render(<AdminPromotionsCatalog onAddToCart={() => {}} />);

        await screen.findByText('Pack Vitamina');

        expect(within(cardOf('Pack Vitamina')).getByText('Todas')).toBeInTheDocument();
        expect(within(cardOf('Pack Solo Maria')).getByText('maria')).toBeInTheDocument();
        expect(within(cardOf('Pack Solo Maria')).queryByText('Todas')).not.toBeInTheDocument();
        expect(within(cardOf('Base oculta')).getByText('Ninguna (solo admin)')).toBeInTheDocument();
        expect(within(cardOf('Especial Nina')).getByText('NinaTorres')).toBeInTheDocument();
        expect(within(cardOf('Especial huerfana')).getByText('Sin vendedoras')).toBeInTheDocument();
    });
});

test('VendorChips: un backend anterior sin visibleToAll muestra Todas (comportamiento de siempre)', () => {
    render(<VendorChips promotion={{ id: 'x', nombre: 'Vieja' }} />);

    expect(screen.getByText('Todas')).toBeInTheDocument();
});

test('VendorChips de una especial: "Todas" solo con visibleToAll=true; sin el campo, sus asignadas', () => {
    const { rerender } = render(<VendorChips promotion={{ id: 'e', nombre: 'Especial', isSpecial: true, visibleToAll: true }} />);
    expect(screen.getByText('Todas')).toBeInTheDocument();

    rerender(<VendorChips promotion={{ id: 'e', nombre: 'Especial', isSpecial: true, allowedVendorNames: [] }} />);
    expect(screen.queryByText('Todas')).not.toBeInTheDocument();
    expect(screen.getByText('Sin vendedoras')).toBeInTheDocument();
});

test('AdminPromotionsCatalog: una especial "Todas las vendedoras" se marca Todas aunque su padre esté restringido', async () => {
    promotionService.getValidAdmin.mockResolvedValue({ data: [] });
    specialPromotionService.getVendorPromotions.mockResolvedValue({
        data: {
            content: [{
                ...especialSinVendedoras, id: 'sp-9', nombre: 'Especial equipo', visibleToAll: true,
                parentPromotion: normalNinguna,
            }],
        },
    });

    render(<AdminPromotionsCatalog onAddToCart={() => {}} />);

    await screen.findByText('Especial equipo');
    expect(within(cardOf('Especial equipo')).getByText('Todas')).toBeInTheDocument();
    expect(within(cardOf('Especial equipo')).queryByText('Sin vendedoras')).not.toBeInTheDocument();
});
