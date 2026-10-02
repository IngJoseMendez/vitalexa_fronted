import {
    movementDelta,
    formatDelta,
    deltaTone,
    movementTypeLabel,
    historyDateParams,
    bodegaInfo,
    hasCommitted,
} from './inventoryMovements';

test('el cambio sale de stock nuevo - anterior, no del tipo', () => {
    // Ajuste que SUBE el stock (antes se veía "-5" en rojo)
    expect(movementDelta({ type: 'STOCK_ADJUSTMENT', quantity: 5, previousStock: 10, newStock: 15 })).toBe(5);
    // Conteo físico que baja el stock
    expect(movementDelta({ type: 'PHYSICAL_COUNT', quantity: -13, previousStock: 20, newStock: 7 })).toBe(-13);
    // Eliminación lógica: no mueve stock (antes "-40")
    expect(movementDelta({ type: 'DELETION', quantity: 40, previousStock: 40, newStock: 40 })).toBe(0);
    // Edición de datos: "0", no "-0"
    expect(movementDelta({ type: 'UPDATE', quantity: 0, previousStock: 7, newStock: 7 })).toBe(0);
    // Venta y devolución
    expect(movementDelta({ type: 'SALE', quantity: 2, previousStock: 10, newStock: 8 })).toBe(-2);
    expect(movementDelta({ type: 'RETURN', quantity: 3, previousStock: -1, newStock: 2 })).toBe(3);
});

test('sin stocks guardados usa la cantidad con el sentido del tipo', () => {
    expect(movementDelta({ type: 'SALE', quantity: 4 })).toBe(-4);
    expect(movementDelta({ type: 'RESTOCK', quantity: 4 })).toBe(4);
    expect(movementDelta({ type: 'PHYSICAL_COUNT', quantity: -2 })).toBe(-2);
    expect(movementDelta({ type: 'UPDATE', quantity: 9 })).toBe(0);
});

test('formato y tono del cambio', () => {
    expect(formatDelta(5)).toBe('+5');
    expect(formatDelta(-3)).toBe('-3');
    expect(formatDelta(0)).toBe('0');
    expect(deltaTone(5)).toBe('in');
    expect(deltaTone(-1)).toBe('out');
    expect(deltaTone(0)).toBe('none');
});

test('etiquetas legibles de los tipos', () => {
    expect(movementTypeLabel('PHYSICAL_COUNT')).toBe('Conteo físico');
    expect(movementTypeLabel('ORDER_EDIT_RESTORE')).toBe('Devolución por edición');
    expect(movementTypeLabel('RESTOCK')).toBe('Llegada de mercancía');
    expect(movementTypeLabel('ALGO_NUEVO')).toBe('ALGO_NUEVO');
});

test('"Hasta" llega al final del día elegido y sin zona horaria', () => {
    expect(historyDateParams('2026-10-01', '2026-10-01')).toEqual({
        startDate: '2026-10-01T00:00:00',
        endDate: '2026-10-01T23:59:59.999999',
    });
    expect(historyDateParams('', '')).toEqual({ startDate: null, endDate: null });
});

test('bodega nunca negativa: 0 y "faltan N" (con o sin los campos nuevos del backend)', () => {
    // Backend nuevo: stockFisicoReal ya viene con tope 0 y faltante
    expect(bodegaInfo({ stockEnBD: -8, stockComprometido: 3, stockFisicoRealRaw: -5, stockFisicoReal: 0, faltante: 5 }))
        .toEqual({ bodega: 0, faltante: 5 });
    // Backend anterior (sin stockFisicoReal ni faltante): se calcula local
    expect(bodegaInfo({ stockEnBD: -8, stockComprometido: 3 })).toEqual({ bodega: 0, faltante: 5 });
    expect(bodegaInfo({ stockEnBD: -2, stockComprometido: 6 })).toEqual({ bodega: 4, faltante: 0 });
    expect(bodegaInfo({ stockEnBD: null, stockComprometido: 0 })).toEqual({ bodega: 0, faltante: 0 });
});

test('"En pedidos" con el campo del backend o con las unidades comprometidas', () => {
    expect(hasCommitted({ tieneStockComprometido: true, stockComprometido: 2 })).toBe(true);
    expect(hasCommitted({ stockComprometido: 3 })).toBe(true);
    expect(hasCommitted({ stockComprometido: 0 })).toBe(false);
});
