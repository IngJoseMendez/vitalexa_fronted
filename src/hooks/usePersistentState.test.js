import { StrictMode, useEffect } from 'react';
import { act, render, renderHook } from '@testing-library/react';
import usePersistentState, {
  clearViewPrefs,
  migrateLegacyViewPref,
  prefKey,
  readViewPref,
  VIEW_PREF_PREFIX,
} from './usePersistentState';
import { clearStorageKeepingSidebarPrefs } from './useSidebarCollapsed';

const SORTS = ['fecha', 'factura', 'pedido', 'cliente'];
const PAGE_SIZES = [12, 24, 48];

const originalStorage = Object.getOwnPropertyDescriptor(window, 'localStorage');

// Otra pestaña del mismo navegador escribe y el navegador avisa a esta con un evento 'storage'
const otherTabWrites = (key, raw) => {
  if (raw === null) localStorage.removeItem(key);
  else localStorage.setItem(key, raw);
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key, newValue: raw, storageArea: localStorage }));
  });
};

const useSort = (options = {}) => usePersistentState('orders.sort', 'fecha', { allowed: SORTS, ...options });

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('username', 'admin1');
});

afterEach(() => {
  jest.restoreAllMocks();
  if (originalStorage) Object.defineProperty(window, 'localStorage', originalStorage);
  else delete window.localStorage;
});

test('la clave lleva prefijo vx:pref:view:, versión, usuario y nombre', () => {
  expect(VIEW_PREF_PREFIX).toBe('vx:pref:view:');
  expect(prefKey('orders.sort')).toBe('vx:pref:view:v1:admin1:orders.sort');
  expect(prefKey('orders.sort', 2)).toBe('vx:pref:view:v2:admin1:orders.sort');

  localStorage.removeItem('username');
  expect(prefKey('orders.sort')).toBe('vx:pref:view:v1::orders.sort');
});

test('sin nada guardado usa el valor por defecto y montar no escribe nada', () => {
  const setItem = jest.spyOn(Storage.prototype, 'setItem');
  const { result } = renderHook(() => useSort());

  expect(result.current[0]).toBe('fecha');
  expect(setItem).not.toHaveBeenCalled();
  expect(localStorage.getItem(prefKey('orders.sort'))).toBeNull();
});

test('el primer render ya usa el valor guardado: no hay petición con el valor por defecto', () => {
  localStorage.setItem(prefKey('orders.sort'), JSON.stringify('factura'));
  const renders = [];
  const fetchOrders = jest.fn();

  function OrdersHarness() {
    const [sort] = useSort();
    renders.push(sort);
    useEffect(() => { fetchOrders(sort); }, [sort]);
    return null;
  }

  // StrictMode igual que index.js: dobles renders/efectos tampoco piden con el defecto
  render(<StrictMode><OrdersHarness /></StrictMode>);

  expect(renders.length).toBeGreaterThan(0);
  expect(renders.every((sort) => sort === 'factura')).toBe(true);
  expect(fetchOrders).toHaveBeenCalledWith('factura');
  expect(fetchOrders).not.toHaveBeenCalledWith('fecha');
});

test.each([
  ['fuera de las opciones permitidas', 'orders.sort', '"borrado"', 'fecha', { allowed: SORTS }],
  ['JSON roto', 'orders.sort', '{oops', 'fecha', { allowed: SORTS }],
  ['texto donde va un número', 'orders.pageSize', '"24"', 12, { allowed: PAGE_SIZES }],
  ['número fuera de la lista', 'orders.pageSize', '1000', 12, { allowed: PAGE_SIZES }],
  ['número de otro tipo sin lista', 'grid.columns', '"cuatro"', 3, {}],
  ['rechazado por validate', 'grid.columns', '9', 3, { validate: (n) => n >= 1 && n <= 6 }],
  ['validate que lanza', 'grid.columns', '4', 3, { validate: () => { throw new Error('x'); } }],
  ['arreglo donde va un objeto', 'grid.hidden', '["a"]', {}, {}],
])('guardado inválido (%s) -> valor por defecto', (_caso, key, raw, defaultValue, options) => {
  localStorage.setItem(prefKey(key), raw);
  const { result } = renderHook(() => usePersistentState(key, defaultValue, options));
  expect(result.current[0]).toEqual(defaultValue);
  expect(readViewPref(key, defaultValue, options)).toEqual(defaultValue);
});

test('números, textos, booleanos y objetos vuelven con su tipo', () => {
  const useView = () => ({
    pageSize: usePersistentState('orders.pageSize', 12, { allowed: PAGE_SIZES }),
    sort: useSort(),
    compact: usePersistentState('orders.compact', false),
    columns: usePersistentState('orders.columns', { cliente: true, total: true }),
  });

  const { result: before, unmount } = renderHook(() => useView());
  act(() => {
    before.current.pageSize[1](48);
    before.current.sort[1]('pedido');
    before.current.compact[1](true);
    before.current.columns[1]({ cliente: false, total: true });
  });
  expect(localStorage.getItem(prefKey('orders.pageSize'))).toBe('48');
  expect(localStorage.getItem(prefKey('orders.sort'))).toBe('"pedido"');
  expect(localStorage.getItem(prefKey('orders.compact'))).toBe('true');
  unmount();

  // "Recargar la página"
  const { result } = renderHook(() => useView());
  expect(result.current.pageSize[0]).toBe(48);
  expect(result.current.sort[0]).toBe('pedido');
  expect(result.current.compact[0]).toBe(true);
  expect(result.current.columns[0]).toEqual({ cliente: false, total: true });
  expect(readViewPref('orders.pageSize', 12, { allowed: PAGE_SIZES })).toBe(48);
});

test('acepta función actualizadora como useState y el setter es estable', () => {
  const { result, rerender } = renderHook(() => usePersistentState('orders.direction', 'desc', { allowed: ['asc', 'desc'] }));
  const firstSetter = result.current[1];

  act(() => result.current[1]((prev) => (prev === 'asc' ? 'desc' : 'asc')));
  expect(result.current[0]).toBe('asc');
  act(() => {
    // Dos actualizaciones seguidas en el mismo lote se encadenan como en useState
    result.current[1]((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    result.current[1]((prev) => (prev === 'asc' ? 'desc' : 'asc'));
  });
  expect(result.current[0]).toBe('asc');
  expect(localStorage.getItem(prefKey('orders.direction'))).toBe('"asc"');

  rerender();
  expect(result.current[1]).toBe(firstSetter);
});

test('escribe solo cuando el valor cambia y nunca guarda un valor inválido', () => {
  const setItem = jest.spyOn(Storage.prototype, 'setItem');
  const { result, rerender } = renderHook(() => useSort());

  act(() => result.current[1]('fecha')); // el mismo valor
  expect(setItem).not.toHaveBeenCalled();

  act(() => result.current[1]('cliente'));
  expect(setItem).toHaveBeenCalledTimes(1);
  expect(setItem).toHaveBeenCalledWith(prefKey('orders.sort'), '"cliente"');

  rerender();
  act(() => result.current[1]('cliente'));
  expect(setItem).toHaveBeenCalledTimes(1);

  act(() => result.current[1]('inventado'));
  expect(result.current[0]).toBe('inventado'); // como useState: el estado cambia...
  expect(setItem).toHaveBeenCalledTimes(1); // ...pero no se recuerda
  expect(localStorage.getItem(prefKey('orders.sort'))).toBe('"cliente"');
});

test('almacenamiento bloqueado (modo privado): funciona igual, solo no recuerda', () => {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get() { throw new DOMException('Acceso denegado', 'SecurityError'); },
  });

  const { result } = renderHook(() => useSort());
  expect(result.current[0]).toBe('fecha');
  act(() => result.current[1]('pedido'));
  expect(result.current[0]).toBe('pedido');
  expect(readViewPref('orders.sort', 'fecha', { allowed: SORTS })).toBe('fecha');
  expect(clearViewPrefs()).toBe(0);
});

test('almacenamiento lleno (setItem lanza): la preferencia aplica igual', () => {
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('Lleno', 'QuotaExceededError');
  });

  const { result } = renderHook(() => useSort());
  act(() => result.current[1]('cliente'));
  expect(result.current[0]).toBe('cliente');
});

// Monta la pantalla como `username`, opcionalmente elige un orden, y devuelve lo que vio al entrar
const visitAs = (username, choose) => {
  localStorage.setItem('username', username);
  const { result, unmount } = renderHook(() => useSort());
  const seen = result.current[0];
  if (choose) act(() => result.current[1](choose));
  unmount();
  return seen;
};

test('la preferencia es por usuario (equipos compartidos)', () => {
  expect(visitAs('admin1', 'pedido')).toBe('fecha');
  expect(visitAs('ana')).toBe('fecha'); // no ve el orden de admin1
  visitAs('ana', 'cliente');

  expect(visitAs('admin1')).toBe('pedido');
  expect(visitAs('ana')).toBe('cliente');
  expect(localStorage.getItem('vx:pref:view:v1:admin1:orders.sort')).toBe('"pedido"');
  expect(localStorage.getItem('vx:pref:view:v1:ana:orders.sort')).toBe('"cliente"');
});

test('la versión va en la clave: subirla ignora lo guardado con la anterior', () => {
  localStorage.setItem(prefKey('orders.sort'), '"factura"');
  const { result } = renderHook(() => useSort({ version: 2 }));
  expect(result.current[0]).toBe('fecha');

  act(() => result.current[1]('cliente'));
  expect(localStorage.getItem('vx:pref:view:v2:admin1:orders.sort')).toBe('"cliente"');
  expect(localStorage.getItem('vx:pref:view:v1:admin1:orders.sort')).toBe('"factura"');
});

test('si cambia la clave lee la nueva y no copia en ella el valor anterior', () => {
  localStorage.setItem(prefKey('admin.orders.sort'), '"factura"');
  const setItem = jest.spyOn(Storage.prototype, 'setItem');
  const renders = [];
  const { result, rerender } = renderHook(({ k }) => {
    const state = usePersistentState(k, 'fecha', { allowed: SORTS });
    renders.push([k, state[0]]);
    return state;
  }, { initialProps: { k: 'admin.orders.sort' } });
  expect(result.current[0]).toBe('factura');

  rerender({ k: 'owner.orders.sort' });
  expect(result.current[0]).toBe('fecha');
  expect(renders).not.toContainEqual(['owner.orders.sort', 'factura']);
  expect(setItem).not.toHaveBeenCalled();

  rerender({ k: 'admin.orders.sort' });
  expect(result.current[0]).toBe('factura');
});

test('sin `sync` (por defecto) lo que haga otra pestaña no cambia esta; aplica al recargar', () => {
  const { result, unmount } = renderHook(() => useSort());
  act(() => result.current[1]('factura'));
  const setItem = jest.spyOn(Storage.prototype, 'setItem');

  otherTabWrites(prefKey('orders.sort'), '"cliente"');
  expect(result.current[0]).toBe('factura'); // sigue lo que se ve (el handler del control no corrió)
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key: null, storageArea: localStorage }));
  });
  expect(result.current[0]).toBe('factura');
  expect(setItem.mock.calls.map(([, raw]) => raw)).toEqual(['"cliente"']); // esta no reescribió

  // Elegir aquí sigue guardando lo elegido aquí
  act(() => result.current[1]('pedido'));
  expect(localStorage.getItem(prefKey('orders.sort'))).toBe('"pedido"');
  unmount();

  // Al recargar se usa lo último guardado, venga de la pestaña que venga
  otherTabWrites(prefKey('orders.sort'), '"cliente"');
  const { result: reloaded } = renderHook(() => useSort());
  expect(reloaded.current[0]).toBe('cliente');
});

test('con `sync: true` otra pestaña cambia la misma preferencia: se actualiza aquí, validada y sin reescribir', () => {
  const { result } = renderHook(() => useSort({ sync: true }));
  const setItem = jest.spyOn(Storage.prototype, 'setItem');

  otherTabWrites(prefKey('orders.sort'), '"cliente"');
  expect(result.current[0]).toBe('cliente');

  otherTabWrites(prefKey('orders.sort'), '"hackeado"');
  expect(result.current[0]).toBe('fecha');

  otherTabWrites(prefKey('orders.sort'), '"pedido"');
  otherTabWrites(prefKey('orders.sort'), null); // la borró
  expect(result.current[0]).toBe('fecha');

  // Solo las escrituras de "la otra pestaña"; esta no devolvió ninguna
  expect(setItem.mock.calls.map(([, raw]) => raw)).toEqual(['"cliente"', '"hackeado"', '"pedido"']);
});

test('con `sync: true`, eventos de otra preferencia, otro usuario o sessionStorage se ignoran', () => {
  const { result } = renderHook(() => useSort({ sync: true }));
  act(() => result.current[1]('factura'));

  otherTabWrites(prefKey('orders.pageSize'), '48');
  otherTabWrites('vx:pref:view:v1:ana:orders.sort', '"cliente"');
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', {
      key: prefKey('orders.sort'), newValue: '"cliente"', storageArea: sessionStorage,
    }));
  });

  expect(result.current[0]).toBe('factura');
});

test('con `sync: true`, otra pestaña vacía el almacenamiento (evento sin clave): se vuelve a leer lo que quedó', () => {
  const { result } = renderHook(() => useSort({ sync: true }));
  act(() => result.current[1]('pedido'));
  const clearedElsewhere = () => act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key: null, storageArea: localStorage }));
  });

  // Allá cerró sesión y volvió a entrar con el mismo usuario: las preferencias se conservaron,
  // así que aquí no cambia nada
  clearStorageKeepingSidebarPrefs();
  localStorage.setItem('username', 'admin1');
  clearedElsewhere();
  expect(result.current[0]).toBe('pedido');

  // Borró todo (incluidas las preferencias): vuelve al defecto
  localStorage.clear();
  localStorage.setItem('username', 'admin1');
  clearedElsewhere();
  expect(result.current[0]).toBe('fecha');
});

test('sobrevive a cerrar sesión (clearStorageKeepingSidebarPrefs) y vuelve al entrar', () => {
  localStorage.setItem('token', 'jwt');
  localStorage.setItem('role', 'ROLE_ADMIN');
  const { result: before, unmount } = renderHook(() => usePersistentState('orders.pageSize', 12, { allowed: PAGE_SIZES }));
  act(() => before.current[1](24));
  unmount();

  clearStorageKeepingSidebarPrefs();
  expect(localStorage.getItem('token')).toBeNull();
  expect(localStorage.getItem('username')).toBeNull();
  expect(localStorage.getItem('vx:pref:view:v1:admin1:orders.pageSize')).toBe('24');

  localStorage.setItem('username', 'admin1'); // vuelve a iniciar sesión
  const { result } = renderHook(() => usePersistentState('orders.pageSize', 12, { allowed: PAGE_SIZES }));
  expect(result.current[0]).toBe(24);
});

test('clearViewPrefs borra solo las preferencias de vista del usuario actual (o de todos)', () => {
  localStorage.setItem('token', 'jwt');
  localStorage.setItem('vx:pref:view:v1:admin1:orders.sort', '"pedido"');
  localStorage.setItem('vx:pref:view:v2:admin1:orders.pageSize', '24');
  localStorage.setItem('vx:pref:view:v1:ana:orders.sort', '"cliente"');
  localStorage.setItem('vx:pref:view:v1::orders.sort', '"factura"');
  localStorage.setItem('vx:pref:bienvenida:sonido', 'off');
  localStorage.setItem('vx:sidebarCollapsed:admin:admin1', '1');

  expect(clearViewPrefs()).toBe(2);
  expect(localStorage.getItem('vx:pref:view:v1:admin1:orders.sort')).toBeNull();
  expect(localStorage.getItem('vx:pref:view:v2:admin1:orders.pageSize')).toBeNull();
  expect(localStorage.getItem('vx:pref:view:v1:ana:orders.sort')).toBe('"cliente"');
  expect(localStorage.getItem('vx:pref:view:v1::orders.sort')).toBe('"factura"');
  expect(localStorage.getItem('vx:pref:bienvenida:sonido')).toBe('off');
  expect(localStorage.getItem('vx:sidebarCollapsed:admin:admin1')).toBe('1');
  expect(localStorage.getItem('token')).toBe('jwt');

  expect(clearViewPrefs({ allUsers: true })).toBe(2);
  expect(Object.keys(localStorage).filter((k) => k.startsWith(VIEW_PREF_PREFIX))).toEqual([]);
  expect(localStorage.getItem('username')).toBe('admin1');
});

describe('migrateLegacyViewPref (claves viejas sin usuario)', () => {
  const COLS = [1, 2, 3, 4];
  const migrateCols = () => migrateLegacyViewPref('adminGridCols', 'grid.columns', {
    parse: (raw) => parseInt(raw, 10),
    allowed: COLS,
  });
  const useCols = () => usePersistentState('grid.columns', 3, { allowed: COLS });

  test('pasa el valor viejo a la clave del usuario con su tipo, borra la vieja y sobrevive a cerrar sesión', () => {
    localStorage.setItem('adminGridCols', '4');
    expect(migrateCols()).toBe(true);
    expect(localStorage.getItem(prefKey('grid.columns'))).toBe('4');
    expect(localStorage.getItem('adminGridCols')).toBeNull();
    expect(migrateCols()).toBe(false); // una sola vez

    clearStorageKeepingSidebarPrefs();
    localStorage.setItem('username', 'admin1');
    const { result } = renderHook(() => useCols());
    expect(result.current[0]).toBe(4);
  });

  test('no pisa una preferencia ya guardada; un valor viejo inválido se descarta igual', () => {
    localStorage.setItem(prefKey('grid.columns'), '2');
    localStorage.setItem('adminGridCols', '4');
    expect(migrateCols()).toBe(false);
    expect(localStorage.getItem(prefKey('grid.columns'))).toBe('2');
    expect(localStorage.getItem('adminGridCols')).toBeNull();

    localStorage.clear();
    localStorage.setItem('username', 'admin1');
    ['9', 'abc', ''].forEach((raw) => {
      localStorage.setItem('adminGridCols', raw);
      expect(migrateCols()).toBe(false);
      expect(localStorage.getItem(prefKey('grid.columns'))).toBeNull();
      expect(localStorage.getItem('adminGridCols')).toBeNull();
    });

    // Sin `parse` copia el texto tal cual (Órdenes guardaba 'auto' / '1'...'6' como texto)
    localStorage.setItem('adminOrdersColumns', 'auto');
    expect(migrateLegacyViewPref('adminOrdersColumns', 'orders.columns', { allowed: ['auto', '1'] })).toBe(true);
    expect(localStorage.getItem(prefKey('orders.columns'))).toBe('"auto"');
  });

  test('sin nada viejo no escribe; sin almacenamiento o si guardar falla, no rompe (y reintenta luego)', () => {
    const setItem = jest.spyOn(Storage.prototype, 'setItem');
    expect(migrateCols()).toBe(false);
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();

    localStorage.setItem('adminGridCols', '4');
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Lleno', 'QuotaExceededError');
    });
    expect(migrateCols()).toBe(false);
    expect(localStorage.getItem('adminGridCols')).toBe('4'); // no se perdió: se intenta otra vez
    jest.restoreAllMocks();

    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() { throw new DOMException('Acceso denegado', 'SecurityError'); },
    });
    expect(migrateCols()).toBe(false);
  });
});
