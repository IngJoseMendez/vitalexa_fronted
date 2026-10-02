// ============================================
// Catálogo de promociones de la VENDEDORA: normales + especiales asignadas.
// Funciones puras: se prueban sin montar el dashboard.
// ============================================

/**
 * Convierte una promoción especial (respuesta de /vendedor/init o /vendedor/special-promotions)
 * en una entrada del catálogo de venta, con la misma forma que una promoción normal.
 *
 * - id, nombre, descripción y precio son de la ESPECIAL: la venta envía su id en promotionIds
 *   (el backend la reconoce como especial) y cobra su precio.
 * - Tipo, cantidad, producto principal y regalos son los del PADRE (parentPromotion): es lo que
 *   la venta aplica de verdad (OrderServiceImpl.processPromotions). Si el backend todavía no
 *   envía parentPromotion se usan los datos propios de la especial.
 * - No se copian las vendedoras asignadas al padre ni su visibilidad: la especial tiene la suya
 *   (visibleToAll: true = "Todas las vendedoras"; sin el campo = solo sus asignadas).
 */
export const toCatalogSpecialPromotion = (special) => {
    if (!special) return null;
    const {
        visibleToAll: _parentVisibleToAll,
        allowedVendorIds: _parentVendorIds,
        allowedVendorNames: _parentVendorNames,
        ...parent
    } = special.parentPromotion || {};

    const fallbackMainProduct = special.mainProductId
        ? { id: special.mainProductId, nombre: special.mainProductName }
        : null;

    return {
        ...parent,
        id: special.id,
        nombre: special.nombre || parent.nombre,
        descripcion: special.descripcion ?? parent.descripcion ?? null,
        packPrice: special.packPrice ?? parent.packPrice ?? null,
        type: parent.type || special.type,
        buyQuantity: parent.buyQuantity ?? special.buyQuantity,
        mainProduct: parent.mainProduct || fallbackMainProduct,
        giftItems: Array.isArray(parent.giftItems) ? parent.giftItems : [],
        active: special.active,
        parentPromotionId: special.parentPromotionId ?? null,
        parentPromotionName: special.parentPromotionName ?? null,
        allowedVendorIds: Array.isArray(special.allowedVendorIds) ? special.allowedVendorIds : [],
        allowedVendorNames: Array.isArray(special.allowedVendorNames) ? special.allowedVendorNames : [],
        visibleToAll: special.visibleToAll === true,
        isSpecial: true,
    };
};

/** Normales primero y luego las especiales (marcadas isSpecial). Acepta null/undefined. */
export const mergeVendorPromotions = (promociones, especiales) => [
    ...(Array.isArray(promociones) ? promociones : []),
    ...(Array.isArray(especiales) ? especiales : [])
        .map(toCatalogSpecialPromotion)
        .filter(Boolean),
];
