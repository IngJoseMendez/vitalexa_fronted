/**
 * Formats a number as a currency string with thousands separators.
 * Uses 'es-CO' locale to ensure dots are used for thousands and commas for decimals.
 * @param {number|string} value - The value to format.
 * @returns {string} - The formatted currency string (e.g., "1.000.000").
 */
export const formatCurrency = (value) => {
    if (value === null || value === undefined || value === '') return '';
    
    const numberValue = typeof value === 'string' ? parseFloat(value) : value;
    
    if (isNaN(numberValue)) return value;

    return new Intl.NumberFormat('es-CO', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(numberValue);
};

/**
 * Formats a number into a compact currency style using K/M/B suffixes.
 * @param {number|string} value - The value to format.
 * @returns {string} - The compact formatted string (e.g., "1.2M").
 */
export const formatCompactCurrency = (value) => {
    if (value === null || value === undefined || value === '') return '';

    const numberValue = typeof value === 'string' ? parseFloat(value) : value;

    if (isNaN(numberValue)) return value;

    const absValue = Math.abs(numberValue);
    let divisor = 1;
    let suffix = '';

    if (absValue >= 1e9) {
        divisor = 1e9;
        suffix = 'B';
    } else if (absValue >= 1e6) {
        divisor = 1e6;
        suffix = 'M';
    } else if (absValue >= 1e3) {
        divisor = 1e3;
        suffix = 'K';
    }

    if (!suffix) {
        return new Intl.NumberFormat('es-CO', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(numberValue);
    }

    const compactValue = numberValue / divisor;

    return `${new Intl.NumberFormat('es-CO', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    }).format(compactValue)}${suffix}`;
};

/**
 * Formats a date string or Date object to a readable date format
 * @param {string|Date} date - The date to format (ISO string or Date object)
 * @returns {string} - The formatted date string (e.g., "17/02/2026")
 */
export const formatDate = (date) => {
    if (!date) return '';

    try {
        // Si es un string en formato YYYY-MM-DD, parsearlo directamente para evitar
        // el bug UTC de JavaScript (new Date("2026-02-14") se interpreta como UTC
        // medianoche, lo que en UTC-5 muestra el día anterior).
        if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
            const [year, month, day] = date.split('-');
            return `${day}/${month}/${year}`;
        }
        const dateObj = typeof date === 'string' ? new Date(date) : date;
        return new Intl.DateTimeFormat('es-CO', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        }).format(dateObj);
    } catch (error) {
        console.error('Error formatting date:', error);
        return date.toString();
    }
};

/**
 * Formats a date string or Date object to include date and time
 * @param {string|Date} date - The date to format (ISO string or Date object)
 * @returns {string} - The formatted datetime string (e.g., "17/02/2026 14:30")
 */
export const formatDateTime = (date) => {
    if (!date) return '';

    try {
        const dateObj = typeof date === 'string' ? new Date(date) : date;
        return new Intl.DateTimeFormat('es-CO', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        }).format(dateObj);
    } catch (error) {
        console.error('Error formatting datetime:', error);
        return date.toString();
    }
};

/**
 * Formats a date to ISO date string (YYYY-MM-DD)
 * @param {Date} date - The date to format
 * @returns {string} - The ISO date string
 */
export const formatDateISO = (date) => {
    if (!date) return '';

    try {
        const dateObj = typeof date === 'string' ? new Date(date) : date;
        return dateObj.toISOString().split('T')[0];
    } catch (error) {
        console.error('Error formatting date to ISO:', error);
        return '';
    }
};

// ── Número de pedido / factura de una orden ─────────────────────────────────
// Espejo de OrderReferenceUtil del backend: un solo formato en toda la app.

const hasValue = (v) => v !== null && v !== undefined && v !== '';

/**
 * Número de pedido legible: "P-123". Siempre con prefijo para no confundirlo con una
 * factura del mismo número (pedido 1500 y factura #1500 pueden coexistir).
 * @param {number|string} orderNumber
 * @returns {string|null} - "P-123" o null si no hay número
 */
export const formatOrderNumber = (orderNumber) => (hasValue(orderNumber) ? `P-${orderNumber}` : null);

/**
 * Etiqueta de una orden:
 *  - sin factura: "Pedido P-123"
 *  - con factura: solo "Factura #1500" (pedido del dueño: con los dos números las empleadas
 *    se confundían; el número de pedido sigue sirviendo para buscar)
 * Sin factura ni número de pedido (backend anterior): "Orden #ab12cd34" (inicio del id). Sirve para órdenes (id) y DTOs de cartera (orderId).
 * @param {object} order - { invoiceNumber, orderNumber, id | orderId }
 * @returns {string}
 */
export const formatOrderLabel = (order) => {
    if (!order) return '';
    const pedido = formatOrderNumber(order.orderNumber);
    if (hasValue(order.invoiceNumber)) {
        return `Factura #${order.invoiceNumber}`;
    }
    if (pedido) return `Pedido ${pedido}`;
    const id = String(order.id || order.orderId || '');
    return id ? `Orden #${id.slice(0, 8)}` : '';
};

// Texto con prefijo de pedido -> solo número de pedido: "P-123", "p123", "p 123", "#P-123",
// "pedido 123", "Pedido P-123". Un número solo ("123") busca factura Y pedido.
const ORDER_NUMBER_QUERY = /^(?:pedido\s*(?:#?\s*p\s*-?\s*)?|#?\s*p\s*-?\s*)(\d+)$/;

/**
 * ¿El texto buscado coincide con la REFERENCIA de la orden? Número de factura ("1500",
 * "#1500"), número de pedido ("123", "P-123", "p123", "Pedido P-123") o parte del id.
 * Para los filtros locales; cada pantalla lo combina con sus otros campos (cliente, etc.).
 * @param {object} order
 * @param {string} query
 * @returns {boolean}
 */
export const orderReferenceMatches = (order, query) => {
    if (!order) return false;
    const q = String(query ?? '').trim().toLowerCase();
    if (!q) return true;

    const invoice = hasValue(order.invoiceNumber) ? String(order.invoiceNumber) : '';
    const orderNumber = hasValue(order.orderNumber) ? String(order.orderNumber) : '';

    // Con prefijo de pedido: solo el número de pedido (empieza por lo escrito)
    const pedido = q.match(ORDER_NUMBER_QUERY);
    if (pedido) return orderNumber !== '' && orderNumber.startsWith(pedido[1]);

    const text = q.replace(/^#\s*/, '');
    const id = String(order.id || order.orderId || '').toLowerCase();
    return (invoice !== '' && invoice.includes(text))
        || (orderNumber !== '' && orderNumber.includes(text))
        || (id !== '' && id.includes(q));
};

/**
 * Nombre del PDF de una orden (igual que el backend): "factura_1500_P-123.pdf",
 * "pedido_P-123.pdf" sin factura, o "factura_orden_ab12cd34.pdf" con un backend anterior.
 * @param {object} order
 * @returns {string}
 */
export const orderPdfFileName = (order) => {
    const pedido = formatOrderNumber(order?.orderNumber);
    if (hasValue(order?.invoiceNumber)) {
        return `factura_${order.invoiceNumber}${pedido ? `_${pedido}` : ''}.pdf`;
    }
    if (pedido) return `pedido_${pedido}.pdf`;
    return `factura_orden_${String(order?.id || order?.orderId || '').slice(0, 8)}.pdf`;
};

/**
 * Números de pedido de las órdenes recién creadas (aviso de "venta registrada"):
 * "Pedido P-123", o "Pedidos P-123, P-124" si la venta se dividió (Standard / S/R / Promoción).
 * Devuelve '' si el backend no manda orderNumber (versión anterior): el aviso sale como antes.
 * @param {Array<object>} orders - res.data.orders de crear venta
 * @returns {string}
 */
export const formatCreatedOrdersSummary = (orders) => {
    const numbers = (Array.isArray(orders) ? orders : [])
        .map(o => formatOrderNumber(o?.orderNumber))
        .filter(Boolean);
    if (numbers.length === 0) return '';
    return `${numbers.length === 1 ? 'Pedido' : 'Pedidos'} ${numbers.join(', ')}`;
};
