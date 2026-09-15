// Claves de idempotencia para envíos que crean datos (p.ej. ventas).
// El backend deduplica por (usuario, Idempotency-Key): si el mismo intento llega dos
// veces (doble toque, reintento tras timeout), devuelve la venta ya creada en vez de
// crear otra.

export function newIdempotencyKey() {
  const c = typeof window !== 'undefined' ? window.crypto : undefined;
  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }
  // randomUUID solo existe en contextos seguros y navegadores recientes
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // versión 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variante RFC 4122
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Clave del intento de envío actual, guardada en un ref de React.
 * Se genera en el primer envío y se CONSERVA aunque el carrito cambie; solo hay que
 * limpiar el ref (ref.current = null) tras un envío exitoso o un rechazo definitivo (4xx).
 * Si el envío anterior quedó sin confirmar (timeout, red, 5xx) el siguiente reutiliza la
 * clave: el backend devuelve la venta ya creada o, si el contenido cambió, avisa que ya
 * quedó registrada, en vez de crear otra.
 */
export function idempotencyKeyFor(ref) {
  if (!ref.current) {
    ref.current = newIdempotencyKey();
  }
  return ref.current;
}
