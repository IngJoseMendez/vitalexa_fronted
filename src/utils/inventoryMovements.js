// Utilidades del historial de inventario y del reporte de stock real.
// Funciones puras (sin React) para poder probarlas solas.

// Tipos de movimiento con etiqueta legible. Mismas etiquetas que el PDF del backend
// (InventoryMovementServiceImpl.TYPE_LABELS).
export const MOVEMENT_TYPES = [
    { value: 'SALE', label: 'Venta' },
    { value: 'RETURN', label: 'Devolución' },
    { value: 'ORDER_EDIT_RESTORE', label: 'Devolución por edición' },
    { value: 'ORDER_ITEM_REMOVAL', label: 'Item quitado de orden' },
    { value: 'ANNULMENT_REVERSAL', label: 'Reversión de anulación' },
    { value: 'RESTOCK', label: 'Llegada de mercancía' },
    { value: 'PHYSICAL_COUNT', label: 'Conteo físico' },
    { value: 'STOCK_ADJUSTMENT', label: 'Ajuste de stock' },
    { value: 'CREATION', label: 'Creación de producto' },
    { value: 'UPDATE', label: 'Edición de datos' },
    { value: 'DELETION', label: 'Eliminación de producto' },
];

const LABELS = Object.fromEntries(MOVEMENT_TYPES.map(t => [t.value, t.label]));

export function movementTypeLabel(type) {
    return LABELS[type] || type || '-';
}

// Tipos que, si faltan los stocks anterior/nuevo, se asume que SUMAN stock
const POSITIVE_TYPES = ['CREATION', 'RESTOCK', 'RETURN', 'ORDER_ITEM_REMOVAL', 'ORDER_EDIT_RESTORE'];

const isNumber = (v) => typeof v === 'number' && !Number.isNaN(v);

/**
 * Cambio real de stock de un movimiento: stockNuevo - stockAnterior (con signo).
 * Antes el signo salía del tipo: un ajuste que SUBÍA el stock se veía "-5" en rojo y una
 * eliminación lógica (que no mueve stock) parecía una salida. Solo si faltan los stocks
 * se usa la cantidad con el sentido del tipo.
 */
export function movementDelta(item) {
    if (!item) return 0;
    if (isNumber(item.previousStock) && isNumber(item.newStock)) {
        return item.newStock - item.previousStock;
    }
    const qty = Number(item.quantity) || 0;
    if (item.type === 'UPDATE') return 0;
    if (item.type === 'STOCK_ADJUSTMENT' || item.type === 'PHYSICAL_COUNT') return qty; // ya trae signo
    return POSITIVE_TYPES.includes(item.type) ? Math.abs(qty) : -Math.abs(qty);
}

/** "+5", "-3" o "0" */
export function formatDelta(delta) {
    if (delta > 0) return `+${delta}`;
    return String(delta);
}

/** Tono visual del cambio: entrada (verde), salida (rojo) o sin cambio (gris) */
export function deltaTone(delta) {
    if (delta > 0) return 'in';
    if (delta < 0) return 'out';
    return 'none';
}

/**
 * Fechas del filtro para la API, en hora local SIN zona (como guarda el backend).
 * "Hasta" va al final del día elegido: antes se mandaba la medianoche (toISOString) y el día
 * elegido quedaba fuera, así que filtrar un solo día salía vacío.
 */
export function historyDateParams(startDate, endDate) {
    return {
        startDate: startDate ? `${startDate}T00:00:00` : null,
        endDate: endDate ? `${endDate}T23:59:59.999999` : null,
    };
}

/**
 * Bodega que se muestra en Stock Real: nunca negativa. Si el cálculo da negativo (salió más
 * de lo que se registró como entrada) se muestra 0 y "faltan N unidades por registrar".
 * El backend ya manda stockFisicoReal (tope 0) y faltante; el cálculo local es el respaldo
 * para un backend anterior.
 */
export function bodegaInfo(item) {
    const raw = isNumber(item?.stockFisicoRealRaw)
        ? item.stockFisicoRealRaw
        : (Number(item?.stockEnBD) || 0) + (Number(item?.stockComprometido) || 0);
    const bodega = isNumber(item?.stockFisicoReal) ? Math.max(0, item.stockFisicoReal) : Math.max(0, raw);
    const faltante = isNumber(item?.faltante) ? Math.max(0, item.faltante) : Math.max(0, -raw);
    return { bodega, faltante };
}

/** Unidades en pedidos activos (no despachados) */
export function committedUnits(item) {
    return Math.max(0, Number(item?.stockComprometido) || 0);
}

/** ¿Tiene pedidos activos? (el backend nuevo manda tieneStockComprometido) */
export function hasCommitted(item) {
    return item?.tieneStockComprometido === true || committedUnits(item) > 0;
}
