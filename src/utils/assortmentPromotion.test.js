import {
    buildAssortmentSelections,
    countFreeUnits,
    describeAssortment,
    getAssortmentConfigProblem,
    getAssortmentFreeLimit,
    isAssortmentPromotion,
    promotionInstancePrice,
    selectableFreeProducts,
} from './assortmentPromotion';

// Surtido "13 + hasta 2 gratis" por $100.000
const surtido = {
    id: 'surtido-1', nombre: 'Surtido 13+2', type: 'BUY_GET_FREE', buyQuantity: 13, freeQuantity: 2,
    packPrice: 100000, mainProduct: { id: 'm', nombre: 'Colágeno' },
};
const pack = { id: 'pack-1', nombre: 'Pack', type: 'PACK', buyQuantity: 40, packPrice: 50000, mainProduct: { id: 'x' } };

describe('configuración del surtido', () => {
    test('reconoce el surtido (también el alias viejo) y no el PACK', () => {
        expect(isAssortmentPromotion(surtido)).toBe(true);
        expect(isAssortmentPromotion({ type: 'ASSORTMENT_PROMOTION' })).toBe(true);
        expect(isAssortmentPromotion(pack)).toBe(false);
        expect(isAssortmentPromotion(null)).toBe(false);
    });

    test('freeQuantity es el límite de gratis; sin configurar (surtidos viejos) es null', () => {
        expect(getAssortmentFreeLimit(surtido)).toBe(2);
        expect(getAssortmentFreeLimit({ ...surtido, freeQuantity: null })).toBeNull();
        expect(getAssortmentFreeLimit({ ...surtido, freeQuantity: undefined })).toBeNull();
        expect(getAssortmentFreeLimit({ ...surtido, freeQuantity: 0 })).toBeNull();
    });

    test('mismo criterio que el backend para poder venderlo', () => {
        expect(getAssortmentConfigProblem(surtido)).toBeNull();
        expect(getAssortmentConfigProblem({ ...surtido, mainProduct: null })).toMatch(/producto principal/);
        expect(getAssortmentConfigProblem({ ...surtido, freeQuantity: null })).toMatch(/Cantidad Total a Bonificar/);
        expect(getAssortmentConfigProblem({ ...surtido, packPrice: null })).toMatch(/precio del paquete/);
        // Bonificada: va a $0, el precio no importa
        expect(getAssortmentConfigProblem({ ...surtido, packPrice: null }, { bonified: true })).toBeNull();
    });

    test('la tarjeta dice "Compra N + hasta X gratis a elección" (antes: "undefined Unidades a Elección")', () => {
        expect(describeAssortment(surtido)).toBe('Compra 13 Colágeno + hasta 2 gratis a elección');
        const sinConfigurar = describeAssortment({ ...surtido, freeQuantity: undefined });
        expect(sinConfigurar).not.toMatch(/undefined/);
        expect(sinConfigurar).toMatch(/falta configurar/);
    });
});

describe('envío de la venta', () => {
    test('una selección por surtido del carrito, en orden y con su estado pagada/bonificada', () => {
        const carrito = [
            { ...surtido, cartId: 'c1', freeItems: [{ productId: 'a', nombre: 'A', cantidad: 1 }] },
            { ...pack, cartId: 'c2' },
            { ...surtido, cartId: 'c3', isBonified: true, freeItems: [{ productId: 'b', nombre: 'B', cantidad: 2 }] },
            { ...surtido, cartId: 'c4', freeItems: [] },
        ];

        expect(buildAssortmentSelections(carrito)).toEqual([
            { promotionId: 'surtido-1', bonified: false, items: [{ productId: 'a', cantidad: 1 }] },
            { promotionId: 'surtido-1', bonified: true, items: [{ productId: 'b', cantidad: 2 }] },
            { promotionId: 'surtido-1', bonified: false, items: [] },
        ]);
    });

    test('no manda líneas inválidas ni el nombre/precio del producto', () => {
        const carrito = [{
            ...surtido,
            freeItems: [{ productId: 'a', nombre: 'A', cantidad: '2', precio: 5000 }, { productId: null, cantidad: 1 }, { productId: 'c', cantidad: 0 }],
        }];
        expect(buildAssortmentSelections(carrito)[0].items).toEqual([{ productId: 'a', cantidad: 2 }]);
        expect(countFreeUnits(carrito[0].freeItems)).toBe(3);
    });

    test('solo se ofrecen productos regulares activos como gratis', () => {
        const productos = [
            { id: 'a', nombre: 'A', active: true },
            { id: 'b', nombre: 'B', active: false },
            { id: 'sp', nombre: 'Especial', active: true, isSpecialProduct: true },
        ];
        expect(selectableFreeProducts(productos).map(p => p.id)).toEqual(['a']);
    });
});

describe('precio de una instancia guardada (como Order.recalculateTotal)', () => {
    const principal = { isPromotionItem: true, isFreeItem: false, promotionPackPrice: 100000, precioUnitario: 9000, cantidad: 13 };
    const gratis = { isPromotionItem: true, isFreeItem: true, promotionPackPrice: null, precioUnitario: 0, cantidad: 2 };

    test('surtido = precio del paquete aunque el gratis venga primero', () => {
        expect(promotionInstancePrice([gratis, principal])).toBe(100000);
        expect(promotionInstancePrice([principal, gratis])).toBe(100000);
    });

    test('PACK: el regalo guarda 0, pero se cobra el paquete del principal', () => {
        const regalo = { ...gratis, promotionPackPrice: 0 };
        expect(promotionInstancePrice([regalo, { ...principal, promotionPackPrice: 50000 }])).toBe(50000);
    });

    test('bonificada = $0', () => {
        expect(promotionInstancePrice([{ ...principal, isBonified: true, promotionPackPrice: 0 }, { ...gratis, isBonified: true }])).toBe(0);
    });

    test('surtido vendido antes de ser paquete (sin precio fijo): lo que se cobró', () => {
        expect(promotionInstancePrice([{ ...principal, promotionPackPrice: null }])).toBe(117000);
    });
});
