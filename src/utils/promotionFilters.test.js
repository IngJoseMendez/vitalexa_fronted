import {
    PROMO_TABS,
    normalizeSearchText,
    matchesPromotionSearch,
    filterByTab,
    countByTab,
    getPromotionDateState,
    getDateStateLabel,
    getParentBlockReason,
    sortByName,
    isVisibleToAll,
} from './promotionFilters';

const NOW = new Date(2026, 9, 1, 12, 0, 0); // 1-oct-2026 12:00 hora local

const pack = {
    id: 'p1', nombre: 'Pack Vitamína C', descripcion: 'Temporada de invierno', active: true,
    mainProduct: { nombre: 'Colágeno Hidrolizado' },
    giftItems: [{ quantity: 2, product: { nombre: 'Omega Tres' } }],
    allowedVendorNames: ['NinaTorres'],
};
const special = {
    id: 's1', nombre: 'Especial Mercy', active: false,
    mainProductName: 'Magnesio', parentPromotionName: 'Surtido Navideño', allowedVendorNames: ['MercyMaestre'],
};

test('normalizeSearchText quita tildes, mayúsculas y espacios de los extremos', () => {
    expect(normalizeSearchText('  Vitamína CÓLÁGENO ')).toBe('vitamina colageno');
    expect(normalizeSearchText(null)).toBe('');
    expect(normalizeSearchText(undefined)).toBe('');
});

test('la búsqueda ignora mayúsculas y tildes y revisa nombre, descripción, producto, regalos y vendedoras', () => {
    expect(matchesPromotionSearch(pack, 'VITAMINA')).toBe(true);
    expect(matchesPromotionSearch(pack, 'invierno')).toBe(true);
    expect(matchesPromotionSearch(pack, 'colageno')).toBe(true);
    expect(matchesPromotionSearch(pack, 'omega')).toBe(true);
    expect(matchesPromotionSearch(pack, 'nina')).toBe(true);
    expect(matchesPromotionSearch(pack, 'magnesio')).toBe(false);
    expect(matchesPromotionSearch(pack, '')).toBe(true);
    expect(matchesPromotionSearch(pack, '   ')).toBe(true);
});

test('en especiales busca por producto principal, promoción padre y vendedoras', () => {
    expect(matchesPromotionSearch(special, 'navideno')).toBe(true);
    expect(matchesPromotionSearch(special, 'MAGNESIO')).toBe(true);
    expect(matchesPromotionSearch(special, 'mercymaestre')).toBe(true);
    // Campos extra (p.ej. regalos del padre)
    expect(matchesPromotionSearch(special, 'zinc')).toBe(false);
    expect(matchesPromotionSearch(special, 'zinc', ['Zinc Quelado', null])).toBe(true);
});

test('varias palabras deben aparecer todas, en cualquier campo y orden', () => {
    expect(matchesPromotionSearch(pack, 'nina vitamina')).toBe(true);
    expect(matchesPromotionSearch(pack, 'omega colageno')).toBe(true);
    expect(matchesPromotionSearch(pack, 'nina magnesio')).toBe(false);
});

test('pestañas por el campo active y contadores', () => {
    const list = [pack, special, { id: 'p2', nombre: 'Otra', active: true }];
    expect(filterByTab(list, PROMO_TABS.ACTIVE).map(p => p.id)).toEqual(['p1', 'p2']);
    expect(filterByTab(list, PROMO_TABS.INACTIVE).map(p => p.id)).toEqual(['s1']);
    expect(filterByTab(list, PROMO_TABS.ALL)).toHaveLength(3);
    expect(countByTab(list)).toEqual({ active: 2, inactive: 1, all: 3 });
    expect(countByTab([])).toEqual({ active: 0, inactive: 0, all: 0 });
});

test('etiqueta de vigencia: Vencida, Programada o ninguna', () => {
    expect(getPromotionDateState({ validUntil: '2026-09-30T23:59:59' }, NOW)).toBe('expired');
    expect(getPromotionDateState({ validFrom: '2026-10-02T00:00:00' }, NOW)).toBe('scheduled');
    expect(getPromotionDateState({ validFrom: '2026-09-01T00:00:00', validUntil: '2026-12-31T23:59:59' }, NOW)).toBeNull();
    expect(getPromotionDateState({}, NOW)).toBeNull();
    expect(getPromotionDateState(null, NOW)).toBeNull();
    // Solo fecha: medianoche LOCAL (no UTC). El 30-sep a las 21:00 la del 1-oct aún no empieza;
    // leída como UTC en Colombia empezaría el 30-sep a las 19:00.
    expect(getPromotionDateState({ validFrom: '2026-10-01' }, new Date(2026, 8, 30, 21, 0, 0))).toBe('scheduled');
    expect(getPromotionDateState({ validUntil: 'no es fecha' }, NOW)).toBeNull();
    expect(getDateStateLabel('expired')).toBe('Vencida');
    expect(getDateStateLabel('scheduled')).toBe('Programada');
    expect(getDateStateLabel(null)).toBeNull();
});

test('una especial no se puede vender si el padre está inactivo, vencido o aún no empieza', () => {
    expect(getParentBlockReason(null, NOW)).toBeNull();
    expect(getParentBlockReason({ active: true }, NOW)).toBeNull();
    expect(getParentBlockReason({ active: false }, NOW)).toBe('Padre inactiva: no se puede vender');
    expect(getParentBlockReason({ active: true, validUntil: '2026-01-01T00:00:00' }, NOW))
        .toBe('Padre vencida: no se puede vender');
    expect(getParentBlockReason({ active: true, validFrom: '2027-01-01T00:00:00' }, NOW))
        .toBe('Padre programada: aún no se puede vender');
});

test('sortByName ordena sin distinguir mayúsculas ni tildes y no muta la lista', () => {
    const list = [{ nombre: 'zeta' }, { nombre: 'Árbol' }, { nombre: 'beta' }];
    expect(sortByName(list).map(p => p.nombre)).toEqual(['Árbol', 'beta', 'zeta']);
    expect(list[0].nombre).toBe('zeta');
});

test('sin el campo visibleToAll (backend anterior) la promoción la ven todas', () => {
    expect(isVisibleToAll({})).toBe(true);
    expect(isVisibleToAll({ visibleToAll: null })).toBe(true);
    expect(isVisibleToAll({ visibleToAll: true })).toBe(true);
    expect(isVisibleToAll({ visibleToAll: false })).toBe(false);
});
