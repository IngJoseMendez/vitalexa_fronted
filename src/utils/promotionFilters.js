// ============================================
// Búsqueda y filtros de los paneles de promociones (admin/owner).
// Funciones puras: se prueban sin montar los paneles.
// ============================================

export const PROMO_TABS = {
    ACTIVE: 'active',
    INACTIVE: 'inactive',
    ALL: 'all',
};

export const PROMO_DATE_STATE = {
    EXPIRED: 'expired',
    SCHEDULED: 'scheduled',
};

// Sin mayúsculas ni tildes: "Vitamína C" y "vitamina c" deben coincidir
export const normalizeSearchText = (value) =>
    String(value ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .trim();

// Textos por los que se busca una promoción (normal o especial)
export const getPromotionSearchFields = (promotion) => {
    if (!promotion) return [];
    const gifts = Array.isArray(promotion.giftItems) ? promotion.giftItems : [];
    const vendors = Array.isArray(promotion.allowedVendorNames) ? promotion.allowedVendorNames : [];
    return [
        promotion.nombre,
        promotion.descripcion,
        promotion.mainProduct?.nombre,
        promotion.mainProductName,
        ...gifts.map(g => g?.product?.nombre || g?.productName),
        promotion.parentPromotionName,
        ...vendors,
    ].filter(Boolean);
};

// Cada palabra escrita debe aparecer en algún campo, en cualquier orden
// ("vitamina nina" encuentra la promo de vitamina asignada a NinaTorres).
// extraFields: textos que no vienen en la promoción (p.ej. regalos del padre de una especial).
export const matchesPromotionSearch = (promotion, term, extraFields = []) => {
    const tokens = normalizeSearchText(term).split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return true;
    const haystack = [...getPromotionSearchFields(promotion), ...(extraFields || []).filter(Boolean)]
        .map(normalizeSearchText)
        .join('\n');
    return tokens.every(token => haystack.includes(token));
};

// Pestañas por el campo active (lo que el admin activa o desactiva a mano)
export const filterByTab = (promotions, tab) => {
    if (tab === PROMO_TABS.ACTIVE) return promotions.filter(p => !!p.active);
    if (tab === PROMO_TABS.INACTIVE) return promotions.filter(p => !p.active);
    return promotions;
};

export const countByTab = (promotions) => {
    const active = promotions.filter(p => !!p.active).length;
    return { active, inactive: promotions.length - active, all: promotions.length };
};

// "2026-02-14" (solo fecha) se toma como medianoche LOCAL: new Date() lo leería como UTC
// y en Colombia (UTC-5) correría la fecha al día anterior.
const parseLocalDateTime = (value) => {
    if (!value) return null;
    if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [year, month, day] = value.split('-').map(Number);
        return new Date(year, month - 1, day);
    }
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
};

// Etiqueta de vigencia: 'expired' (ya pasó validUntil), 'scheduled' (aún no llega validFrom) o null
export const getPromotionDateState = (promotion, now = new Date()) => {
    if (!promotion) return null;
    const from = parseLocalDateTime(promotion.validFrom);
    const until = parseLocalDateTime(promotion.validUntil);
    if (until && now > until) return PROMO_DATE_STATE.EXPIRED;
    if (from && now < from) return PROMO_DATE_STATE.SCHEDULED;
    return null;
};

export const getDateStateLabel = (state) => {
    if (state === PROMO_DATE_STATE.EXPIRED) return 'Vencida';
    if (state === PROMO_DATE_STATE.SCHEDULED) return 'Programada';
    return null;
};

// Una especial VINCULADA se vende con las reglas de su promoción padre: al vender, el backend
// exige que el padre esté activo y vigente (OrderServiceImpl.processPromotions) y si no, rechaza
// la venta. Por eso el panel avisa cuando el padre no cumple, aunque la especial esté activa.
export const getParentBlockReason = (parent, now = new Date()) => {
    if (!parent) return null;
    if (!parent.active) return 'Padre inactiva: no se puede vender';
    const state = getPromotionDateState(parent, now);
    if (state === PROMO_DATE_STATE.EXPIRED) return 'Padre vencida: no se puede vender';
    if (state === PROMO_DATE_STATE.SCHEDULED) return 'Padre programada: aún no se puede vender';
    return null;
};

export const sortByName = (promotions) =>
    [...promotions].sort((a, b) =>
        String(a?.nombre ?? '').localeCompare(String(b?.nombre ?? ''), 'es', { sensitivity: 'base' }));

// Visibilidad de una promoción normal. Si el backend todavía no envía el campo
// (versión anterior), la promoción es visible para todas, igual que siempre.
export const isVisibleToAll = (promotion) => promotion?.visibleToAll !== false;

// Visibilidad de una promoción ESPECIAL: al revés que las normales, sin el campo (backend
// anterior o especial creada antes de V46) es solo para sus vendedoras asignadas.
export const isSpecialVisibleToAll = (special) => special?.visibleToAll === true;
