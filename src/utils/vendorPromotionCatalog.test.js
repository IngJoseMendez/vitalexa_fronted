import { mergeVendorPromotions, toCatalogSpecialPromotion } from './vendorPromotionCatalog';

const parent = {
    id: 'p-1',
    nombre: 'Base Vitamina',
    descripcion: 'Promo base',
    type: 'PACK',
    buyQuantity: 40,
    packPrice: 100000,
    mainProduct: { id: 'prod-1', nombre: 'Vitamina C', imageUrl: 'img.png' },
    giftItems: [{ id: 'g-1', quantity: 2, product: { id: 'prod-2', nombre: 'Gel' } }],
    visibleToAll: false,
    allowedVendorIds: ['v-otra'],
    allowedVendorNames: ['otra'],
};

const special = {
    id: 'sp-1',
    nombre: 'Especial Maria',
    descripcion: null,
    type: 'BUY_GET_FREE', // tipo propio de la especial: la venta usa el del padre
    buyQuantity: 30,
    packPrice: 90000,
    mainProductId: 'prod-x',
    mainProductName: 'Otro',
    active: true,
    parentPromotionId: 'p-1',
    parentPromotionName: 'Base Vitamina',
    isLinked: true,
    allowedVendorIds: [],
    allowedVendorNames: [],
    parentPromotion: parent,
};

test('una especial se vende con su id y precio, pero con producto, cantidad, tipo y regalos del padre', () => {
    const item = toCatalogSpecialPromotion(special);

    expect(item.id).toBe('sp-1');
    expect(item.isSpecial).toBe(true);
    expect(item.nombre).toBe('Especial Maria');
    expect(item.packPrice).toBe(90000);
    expect(item.type).toBe('PACK');
    expect(item.buyQuantity).toBe(40);
    expect(item.mainProduct).toEqual(parent.mainProduct);
    expect(item.giftItems).toEqual(parent.giftItems);
    expect(item.descripcion).toBe('Promo base');
    expect(item.parentPromotionId).toBe('p-1');
});

test('no copia las vendedoras asignadas al padre ni su visibilidad', () => {
    const item = toCatalogSpecialPromotion(special);

    expect(item.allowedVendorNames).toEqual([]);
    expect(item.allowedVendorIds).toEqual([]);
    // Sin el campo en la especial: solo sus asignadas (nunca la visibilidad del padre)
    expect(item.visibleToAll).toBe(false);
});

test('una especial "Todas las vendedoras" conserva su visibleToAll aunque el padre esté restringido', () => {
    const item = toCatalogSpecialPromotion({ ...special, visibleToAll: true });

    expect(item.visibleToAll).toBe(true);
    expect(item.isSpecial).toBe(true);
});

test('backend anterior (sin parentPromotion): usa los datos propios de la especial', () => {
    const { parentPromotion, ...legacy } = special;

    const item = toCatalogSpecialPromotion(legacy);

    expect(item.type).toBe('BUY_GET_FREE');
    expect(item.buyQuantity).toBe(30);
    expect(item.mainProduct).toEqual({ id: 'prod-x', nombre: 'Otro' });
    expect(item.giftItems).toEqual([]);
    expect(item.isSpecial).toBe(true);
});

test('mergeVendorPromotions: normales primero, luego especiales marcadas; tolera null', () => {
    const normal = { id: 'n-1', nombre: 'Normal', type: 'PACK' };

    const merged = mergeVendorPromotions([normal], [special]);

    expect(merged.map(p => p.id)).toEqual(['n-1', 'sp-1']);
    expect(merged[0].isSpecial).toBeUndefined();
    expect(merged[1].isSpecial).toBe(true);
    expect(mergeVendorPromotions(null, undefined)).toEqual([]);
    expect(mergeVendorPromotions(undefined, [special])).toHaveLength(1);
    expect(mergeVendorPromotions([normal], [null])).toEqual([normal]);
});
