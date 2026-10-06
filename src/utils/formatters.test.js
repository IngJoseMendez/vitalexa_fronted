import {
    formatOrderNumber,
    formatOrderLabel,
    orderReferenceMatches,
    orderPdfFileName,
    formatCreatedOrdersSummary,
} from './formatters';

const ID = 'ab12cd34-0000-0000-0000-000000000001';

describe('formatOrderNumber', () => {
    test('siempre con prefijo "P-" (no se confunde con una factura del mismo número)', () => {
        expect(formatOrderNumber(123)).toBe('P-123');
        expect(formatOrderNumber('45')).toBe('P-45');
    });

    test('sin número devuelve null', () => {
        expect(formatOrderNumber(null)).toBeNull();
        expect(formatOrderNumber(undefined)).toBeNull();
        expect(formatOrderNumber('')).toBeNull();
    });
});

describe('formatOrderLabel', () => {
    test('sin factura: "Pedido P-123"', () => {
        expect(formatOrderLabel({ id: ID, orderNumber: 123, invoiceNumber: null })).toBe('Pedido P-123');
    });

    test('con factura: solo "Factura #N" (sin el número de pedido)', () => {
        expect(formatOrderLabel({ id: ID, orderNumber: 123, invoiceNumber: 1500 }))
            .toBe('Factura #1500');
    });

    test('pedido y factura con el mismo número: cada uno con su prefijo', () => {
        expect(formatOrderLabel({ id: ID, orderNumber: 1500, invoiceNumber: 1500 }))
            .toBe('Factura #1500');
    });

    test('DTOs de cartera (orderId en vez de id)', () => {
        expect(formatOrderLabel({ orderId: ID, orderNumber: 7, invoiceNumber: 1020 }))
            .toBe('Factura #1020');
    });

    test('backend anterior (sin orderNumber): como antes, factura o inicio del id', () => {
        expect(formatOrderLabel({ id: ID, invoiceNumber: 1500 })).toBe('Factura #1500');
        expect(formatOrderLabel({ id: ID, invoiceNumber: null })).toBe('Orden #ab12cd34');
        expect(formatOrderLabel({ orderId: ID })).toBe('Orden #ab12cd34');
    });

    test('sin datos no rompe', () => {
        expect(formatOrderLabel(null)).toBe('');
        expect(formatOrderLabel(undefined)).toBe('');
        expect(formatOrderLabel({})).toBe('');
    });
});

describe('orderReferenceMatches (búsquedas locales)', () => {
    const order = { id: ID, orderNumber: 123, invoiceNumber: 1500 };
    const pending = { orderId: ID, orderNumber: 45, invoiceNumber: null };

    test('texto vacío no filtra', () => {
        expect(orderReferenceMatches(order, '')).toBe(true);
        expect(orderReferenceMatches(order, '   ')).toBe(true);
        expect(orderReferenceMatches(order, undefined)).toBe(true);
    });

    test('número de pedido con prefijo: "P-123", "p123", "p 12", "#P-123", "Pedido P-123"', () => {
        ['P-123', 'p-123', 'p123', 'p 12', '#P-123', 'Pedido P-123', 'pedido 123', 'P-1'].forEach(q => {
            expect(orderReferenceMatches(order, q)).toBe(true);
        });
    });

    test('con prefijo de pedido NO busca en la factura', () => {
        // "P-1500" es un pedido que no existe aquí, aunque la factura sea #1500
        expect(orderReferenceMatches(order, 'P-1500')).toBe(false);
        expect(orderReferenceMatches(order, 'P-9')).toBe(false);
    });

    test('número solo: factura o pedido', () => {
        expect(orderReferenceMatches(order, '1500')).toBe(true);
        expect(orderReferenceMatches(order, '#1500')).toBe(true);
        expect(orderReferenceMatches(order, '123')).toBe(true);
        expect(orderReferenceMatches(order, '999')).toBe(false);
    });

    test('pedido sin factura (cartera con orderId)', () => {
        expect(orderReferenceMatches(pending, 'P-45')).toBe(true);
        expect(orderReferenceMatches(pending, '45')).toBe(true);
        expect(orderReferenceMatches(pending, '1500')).toBe(false);
    });

    test('parte del id (compatibilidad con la búsqueda de antes)', () => {
        expect(orderReferenceMatches(order, 'ab12cd')).toBe(true);
        expect(orderReferenceMatches(pending, 'AB12CD34')).toBe(true);
    });

    test('backend anterior (sin orderNumber): un prefijo de pedido no encuentra nada, la factura sí', () => {
        const old = { id: ID, invoiceNumber: 1500 };
        expect(orderReferenceMatches(old, 'P-15')).toBe(false);
        expect(orderReferenceMatches(old, '1500')).toBe(true);
    });

    test('sin orden: false', () => {
        expect(orderReferenceMatches(null, 'P-1')).toBe(false);
    });
});

describe('orderPdfFileName', () => {
    test('igual que el backend', () => {
        expect(orderPdfFileName({ id: ID, orderNumber: 123, invoiceNumber: 1500 })).toBe('factura_1500_P-123.pdf');
        expect(orderPdfFileName({ id: ID, orderNumber: 123 })).toBe('pedido_P-123.pdf');
    });

    test('backend anterior: como antes', () => {
        expect(orderPdfFileName({ id: ID, invoiceNumber: 1500 })).toBe('factura_1500.pdf');
        expect(orderPdfFileName({ id: ID })).toBe('factura_orden_ab12cd34.pdf');
    });
});

describe('formatCreatedOrdersSummary (aviso de venta registrada)', () => {
    test('una orden: "Pedido P-123"', () => {
        expect(formatCreatedOrdersSummary([{ id: ID, orderNumber: 123 }])).toBe('Pedido P-123');
    });

    test('venta dividida (Standard / S/R / Promoción): todos los pedidos', () => {
        expect(formatCreatedOrdersSummary([{ orderNumber: 123 }, { orderNumber: 124 }, { orderNumber: 125 }]))
            .toBe('Pedidos P-123, P-124, P-125');
    });

    test('backend anterior o respuesta vacía: "" (el aviso sale como antes)', () => {
        expect(formatCreatedOrdersSummary([{ id: ID }])).toBe('');
        expect(formatCreatedOrdersSummary([])).toBe('');
        expect(formatCreatedOrdersSummary(undefined)).toBe('');
        expect(formatCreatedOrdersSummary(null)).toBe('');
    });
});
