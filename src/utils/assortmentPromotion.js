// ============================================
// Promoción SURTIDO (BUY_GET_FREE) = PAQUETE a precio fijo.
//
// La instancia cuesta el precio del paquete (packPrice; en una especial, el suyo) e incluye
// el producto principal x buyQuantity más HASTA freeQuantity productos que escoge la
// vendedora, GRATIS ($0). Los escogidos viajan en assortmentSelections (no como items
// cobrados): el backend los guarda como regalos de esa instancia.
// Funciones puras: se prueban sin montar los dashboards.
// ============================================
import { PromotionType } from './types';

/** ¿Es una promoción surtido? (acepta el alias viejo ASSORTMENT_PROMOTION) */
export const isAssortmentPromotion = (promotion) =>
    !!promotion && (promotion.type === PromotionType.BUY_GET_FREE || promotion.type === 'ASSORTMENT_PROMOTION');

/** HASTA cuántos productos gratis se escogen por paquete; null si no está configurado. */
export const getAssortmentFreeLimit = (promotion) => {
    const n = Number(promotion?.freeQuantity);
    return Number.isInteger(n) && n > 0 ? n : null;
};

/** Precio del paquete (número > 0) o null. */
export const getAssortmentPackPrice = (promotion) => {
    const n = parseFloat(promotion?.packPrice);
    return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Qué le falta a un surtido para poder venderse (mismo criterio que el backend), o null si
 * está completo. Bonificada: el precio no importa (va a $0).
 */
export const getAssortmentConfigProblem = (promotion, { bonified = false } = {}) => {
    if (!promotion?.mainProduct) return 'no tiene producto principal';
    if (getAssortmentFreeLimit(promotion) == null) return 'no tiene configurada la "Cantidad Total a Bonificar"';
    if (!bonified && getAssortmentPackPrice(promotion) == null) return 'no tiene precio del paquete';
    return null;
};

/** Texto de la tarjeta del catálogo: "Compra 13 Colágeno + hasta 2 gratis a elección". */
export const describeAssortment = (promotion) => {
    const mainName = promotion?.mainProduct?.nombre ? ` ${promotion.mainProduct.nombre}` : '';
    const base = `Compra ${promotion?.buyQuantity ?? '?'}${mainName}`;
    const limit = getAssortmentFreeLimit(promotion);
    return limit != null
        ? `${base} + hasta ${limit} gratis a elección`
        : `${base} (falta configurar cuántos gratis)`;
};

/** Unidades escogidas (ignora cantidades inválidas). */
export const countFreeUnits = (items) =>
    (Array.isArray(items) ? items : []).reduce((sum, i) => sum + (parseInt(i?.cantidad, 10) > 0 ? parseInt(i.cantidad, 10) : 0), 0);

/**
 * assortmentSelections para el backend: una por cada surtido del carrito, en el MISMO orden
 * del carrito (el backend asigna la k-ésima selección de una promoción a su k-ésima
 * instancia en promotionIds / bonifiedPromotionIds). Las otras promociones no llevan.
 */
export const buildAssortmentSelections = (promotionsCart) =>
    (Array.isArray(promotionsCart) ? promotionsCart : [])
        .filter(isAssortmentPromotion)
        .map(promo => ({
            promotionId: promo.id,
            bonified: !!promo.isBonified,
            items: (Array.isArray(promo.freeItems) ? promo.freeItems : [])
                .filter(i => i && i.productId && parseInt(i.cantidad, 10) > 0)
                .map(i => ({ productId: i.productId, cantidad: parseInt(i.cantidad, 10) })),
        }));

/**
 * Productos que se pueden escoger como gratis: activos y regulares (los especiales comparten
 * el stock de su producto base y el backend solo acepta productos regulares).
 */
export const selectableFreeProducts = (products) =>
    (Array.isArray(products) ? products : []).filter(p => p && p.active && !p.isSpecialProduct);

const toNumber = (value) => {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : null;
};

/**
 * Precio cobrado por UNA instancia de promoción ya guardada en una orden (sus items), igual
 * que Order.recalculateTotal del backend. Sirve para cualquier promoción, no solo surtido:
 * - bonificada: $0;
 * - precio fijo: el promotionPackPrice del item PRINCIPAL (no regalo). Los regalos de PACK
 *   guardan 0 y los gratis del surtido null, y el backend no garantiza el orden de los items,
 *   así que tomar "el primero" podía mostrar $0 o el precio normal del principal;
 * - sin precio fijo (surtidos vendidos antes de ser paquete): suma de los items cobrados.
 */
export const promotionInstancePrice = (items) => {
    const list = Array.isArray(items) ? items.filter(Boolean) : [];
    if (list.some(i => i.isBonified)) return 0;
    const main = list.find(i => !i.isFreeItem && toNumber(i.promotionPackPrice) != null);
    if (main) return toNumber(main.promotionPackPrice);
    const anyFixed = list.find(i => toNumber(i.promotionPackPrice) > 0);
    if (anyFixed) return toNumber(anyFixed.promotionPackPrice);
    return list.reduce((sum, i) => (i.isFreeItem
        ? sum
        : sum + (toNumber(i.precioUnitario) || 0) * (toNumber(i.cantidad) || 0)), 0);
};
