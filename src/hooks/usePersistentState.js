import { useEffect, useRef, useState } from 'react';
import { PERSON_PREF_PREFIX } from '../components/welcome/welcomeStorage';

// Preferencias de CÓMO VER una pantalla (orden y sentido, elementos por página, columnas o
// densidad de la grilla, vista grilla/lista/compacta...) que se recuerdan al recargar.
// NO es para filtros de datos (búsqueda, vendedora, cliente, fechas, pestaña de estado, mes de
// nómina, "solo en stock"...): al volver nadie debe ver una lista filtrada sin darse cuenta.
//
// Clave en localStorage: vx:pref:view:v<versión>:<usuario>:<clave>
//  - vx:pref: hace que cerrar sesión la conserve (clearStorageKeepingSidebarPrefs), igual que el
//    menú plegado y la bienvenida.
//  - Por usuario porque los equipos se comparten. Sin usuario el segmento queda vacío
//    (vx:pref:view:v1::<clave>) y no se mezcla con las de nadie.
//  - La versión permite cambiar el formato de una preferencia sin leer valores viejos.
// El valor va en JSON (24 vuelve como número, 'fecha' como texto, true como booleano).
export const VIEW_PREF_PREFIX = `${PERSON_PREF_PREFIX}view:`;
export const VIEW_PREF_VERSION = 1;

// localStorage puede no existir o lanzar (modo privado, almacenamiento bloqueado o lleno): sin él
// la pantalla funciona igual, solo no recuerda la preferencia.
const currentUsername = () => {
  try {
    return localStorage.getItem('username') || '';
  } catch (error) {
    return '';
  }
};

const versionTag = (version) => `v${String(version ?? VIEW_PREF_VERSION).replace(/^v/i, '')}`;

/** Clave completa en localStorage de una preferencia del usuario actual. */
export const prefKey = (key, version = VIEW_PREF_VERSION) =>
  `${VIEW_PREF_PREFIX}${versionTag(version)}:${currentUsername()}:${key}`;

// El valor guardado debe tener la misma forma que el valor por defecto: un número no puede volver
// como texto ni un objeto como arreglo (p. ej. una versión vieja o alguien editando a mano).
const sameShape = (value, defaultValue) => {
  if (defaultValue === null || defaultValue === undefined) return true;
  if (Array.isArray(defaultValue)) return Array.isArray(value);
  if (typeof defaultValue === 'object') {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }
  if (typeof defaultValue === 'number') return typeof value === 'number' && Number.isFinite(value);
  return typeof value === typeof defaultValue;
};

/**
 * ¿Se puede usar este valor? Misma forma que el defecto, dentro de `allowed` (si se da) y
 * aceptado por `validate` (si se da; si lanza, cuenta como inválido).
 */
export const isValidPref = (value, defaultValue, { allowed, validate } = {}) => {
  if (value === undefined || !sameShape(value, defaultValue)) return false;
  if (Array.isArray(allowed) && !allowed.includes(value)) return false;
  if (typeof validate === 'function') {
    try {
      return Boolean(validate(value));
    } catch (error) {
      return false;
    }
  }
  return true;
};

const toRaw = (value) => {
  try {
    return JSON.stringify(value);
  } catch (error) {
    return undefined; // p. ej. referencias circulares: no se guarda
  }
};

// Texto guardado -> valor válido o el valor por defecto (nada guardado, JSON roto o inválido)
const parseStored = (raw, defaultValue, options) => {
  if (raw === null || raw === undefined) return defaultValue;
  try {
    const parsed = JSON.parse(raw);
    return isValidPref(parsed, defaultValue, options) ? parsed : defaultValue;
  } catch (error) {
    return defaultValue;
  }
};

const readStored = (storageKey, defaultValue, options) => {
  let raw;
  try {
    raw = localStorage.getItem(storageKey);
  } catch (error) {
    return defaultValue;
  }
  return parseStored(raw, defaultValue, options);
};

const writeRaw = (storageKey, raw) => {
  try {
    localStorage.setItem(storageKey, raw);
  } catch (error) {
    // Sin almacenamiento (o lleno) la preferencia aplica igual, solo no se recuerda
  }
};

// Los eventos 'storage' también llegan por sessionStorage: solo interesan los de localStorage
const isLocalStorageEvent = (event) => {
  if (!event.storageArea) return true;
  try {
    return event.storageArea === window.localStorage;
  } catch (error) {
    return false;
  }
};

/**
 * Lee (sin hook) una preferencia del usuario actual con las mismas reglas que el hook.
 * @returns el valor guardado si es válido; si no, `defaultValue`
 */
export const readViewPref = (key, defaultValue, { allowed, validate, version } = {}) =>
  readStored(prefKey(key, version), defaultValue, { allowed, validate });

/**
 * Pasa UNA vez una preferencia guardada con una clave vieja (sin usuario ni versión y que cerrar
 * sesión borraba, p. ej. 'adminGridCols') a su clave nueva del usuario actual, y borra la vieja.
 * Así la elección anterior sobrevive también a los cierres de sesión siguientes. No pisa una
 * preferencia ya guardada en la clave nueva; un valor viejo que no sirve (tras `parse`, fuera de
 * `allowed` o rechazado por `validate`) se descarta igual. Sin almacenamiento no hace nada.
 *
 * Llamarla una sola vez y ANTES del hook que lee la clave nueva, para que el primer render ya use
 * lo migrado: `useState(migrar)` justo encima de `usePersistentState(key, ...)`.
 *
 * @param {string} legacyKey clave vieja en localStorage
 * @param {string} key nombre de la preferencia nueva, p. ej. 'admin.products.columns'
 * @param {{ parse?: (raw: string) => *, allowed?: Array, validate?: (value: *) => boolean, version?: number }} [options]
 *   `parse` convierte el texto viejo al tipo del estado (por defecto, el texto tal cual)
 * @returns {boolean} true si se copió el valor viejo en la clave nueva
 */
export const migrateLegacyViewPref = (legacyKey, key, { parse = (raw) => raw, allowed, validate, version } = {}) => {
  try {
    const legacy = localStorage.getItem(legacyKey);
    if (legacy === null) return false;
    const storageKey = prefKey(key, version);
    let value;
    try {
      value = parse(legacy);
    } catch (error) {
      value = undefined; // no se entiende: se descarta
    }
    const raw = toRaw(value);
    const usable = value !== null
      && !(typeof value === 'number' && !Number.isFinite(value)) // p. ej. parseInt('abc') = NaN
      && isValidPref(value, null, { allowed, validate });
    const copy = raw !== undefined && usable && localStorage.getItem(storageKey) === null;
    if (copy) localStorage.setItem(storageKey, raw);
    localStorage.removeItem(legacyKey); // si setItem lanzó no se llega aquí: se reintenta luego
    return copy;
  } catch (error) {
    return false; // Sin almacenamiento no hay nada que pasar: la preferencia arranca en su defecto
  }
};

/**
 * useState que se recuerda en localStorage por usuario.
 *
 *   const [sort, setSort] = usePersistentState('admin.orders.sort', 'fecha', {
 *     allowed: ['fecha', 'factura', 'pedido', 'cliente'],
 *   });
 *
 * - El primer render ya trae el valor guardado (se lee de forma síncrona en el inicializador):
 *   no hay una petición con el valor por defecto seguida de otra con el guardado.
 * - Guardado inválido (fuera de `allowed`, rechazado por `validate`, de otro tipo que el defecto
 *   o JSON roto) -> `defaultValue`.
 * - `setValue` acepta un valor o una función (prev) => next, igual que useState, y su identidad
 *   es estable. Solo escribe cuando el valor cambia (montar no escribe nada) y solo valores válidos.
 * - Sincronización entre pestañas OPCIONAL (`sync: true`; apagada por defecto): otra pestaña del
 *   mismo navegador que cambie la misma preferencia (mismo usuario y clave) la actualiza aquí
 *   también, validando lo recibido; si la borra, vuelve al defecto. Lo recibido entra con setValue
 *   directo, SIN pasar por el handler del control: activarla solo en preferencias de pura
 *   presentación cuyo handler no hace nada más (columnas, vista, A-Z de una lista que se ordena en
 *   el navegador). Nunca en las que entran en una consulta paginada o cuyo handler también vuelve
 *   a la página 1 (orden y por página de Órdenes, Mis Ventas, Completadas...): otra pestaña la
 *   dejaría en una página que ya no existe. Sin `sync`, esta pestaña conserva lo que muestra y lo
 *   último elegido se usa al recargar.
 * - Si `key` o el usuario cambian, se lee la preferencia de la nueva clave (no se copia la vieja).
 *
 * @param {string} key nombre de la preferencia, p. ej. 'admin.orders.sort'
 * @param {*} defaultValue valor cuando no hay nada guardado o lo guardado no sirve
 * @param {{ allowed?: Array, validate?: (value: *) => boolean, version?: number, sync?: boolean }} [options]
 * @returns {[*, Function]} [value, setValue]
 */
export default function usePersistentState(key, defaultValue, options = {}) {
  const { allowed, validate, version = VIEW_PREF_VERSION, sync = false } = options;
  const storageKey = prefKey(key, version);

  // Lo último recibido (allowed/validate suelen llegar como literales nuevos en cada render): así
  // el oyente de 'storage' valida con lo vigente sin volver a suscribirse en cada render.
  const latest = useRef(null);
  latest.current = { defaultValue, allowed, validate };

  const [value, setValue] = useState(() => readStored(storageKey, defaultValue, { allowed, validate }));
  const [valueKey, setValueKey] = useState(storageKey);

  // Lo que ya está en el almacenamiento (o el defecto) para la clave: el efecto de escritura solo
  // escribe cuando el valor se aparta de esto. Montar con lo guardado o con el defecto no escribe.
  const synced = useRef(null);
  if (synced.current === null) synced.current = { key: storageKey, raw: toRaw(value) };

  // Cambió la clave (otro `key`, otra versión u otro usuario): se toma lo guardado en la nueva
  // durante el render (patrón de React para reiniciar estado al cambiar una prop), sin pintar ni
  // escribir el valor anterior bajo la clave nueva.
  let current = value;
  if (valueKey !== storageKey) {
    current = readStored(storageKey, defaultValue, { allowed, validate });
    setValueKey(storageKey);
    setValue(current);
  }

  useEffect(() => {
    const raw = toRaw(value);
    if (synced.current.key !== storageKey) {
      synced.current = { key: storageKey, raw }; // valor recién leído de la clave nueva
      return;
    }
    if (synced.current.raw === raw) return;
    synced.current = { key: storageKey, raw };
    const { defaultValue: def, allowed: allow, validate: check } = latest.current;
    if (raw === undefined || !isValidPref(value, def, { allowed: allow, validate: check })) return;
    writeRaw(storageKey, raw);
  }, [storageKey, value]);

  useEffect(() => {
    if (!sync) return undefined; // sin sincronización: lo que haga otra pestaña aplica al recargar
    const onStorage = (event) => {
      // key null = otra pestaña vació el almacenamiento (p. ej. cerró sesión y volvió a escribir
      // las preferencias): se vuelve a leer lo que haya ahora.
      if (event.key !== null && event.key !== storageKey) return;
      if (!isLocalStorageEvent(event)) return;
      const { defaultValue: def, allowed: allow, validate: check } = latest.current;
      const next = event.key === null
        ? readStored(storageKey, def, { allowed: allow, validate: check })
        : parseStored(event.newValue, def, { allowed: allow, validate: check });
      synced.current = { key: storageKey, raw: toRaw(next) }; // vino de afuera: no se reescribe
      setValue(next);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [storageKey, sync]);

  return [current, setValue];
}

export { usePersistentState };

/**
 * Borra las preferencias de vista guardadas (todas las versiones). Por defecto solo las del
 * usuario actual; con { allUsers: true }, las de todos. No toca la sesión, el menú plegado ni la
 * bienvenida. Las pantallas abiertas conservan lo que muestran hasta recargar (o hasta que su
 * propio botón "Restablecer" llame a setValue con el defecto).
 * @returns {number} cuántas claves se borraron
 */
export const clearViewPrefs = ({ allUsers = false } = {}) => {
  const userSegment = `${currentUsername()}:`;
  const doomed = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const storageKey = localStorage.key(i);
      if (!storageKey || !storageKey.startsWith(VIEW_PREF_PREFIX)) continue;
      const rest = storageKey.slice(VIEW_PREF_PREFIX.length);
      const version = /^v\d+:/.exec(rest);
      if (allUsers || (version && rest.slice(version[0].length).startsWith(userSegment))) {
        doomed.push(storageKey);
      }
    }
  } catch (error) {
    return 0; // Sin almacenamiento no hay nada que borrar
  }
  let removed = 0;
  doomed.forEach((storageKey) => {
    try {
      localStorage.removeItem(storageKey);
      removed += 1;
    } catch (error) {
      // Si no se puede borrar, queda como estaba
    }
  });
  return removed;
};
