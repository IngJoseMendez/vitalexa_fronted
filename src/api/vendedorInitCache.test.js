import apiClient from './client';
import { clearAllInitCaches, initCacheKey, perUserCatalogParams } from './vendedorInitCache';

// axios 1.x es ESM y Jest (CRA) no lo transforma: se simula la instancia para capturar el
// manejador de errores de respuesta (el que atiende el 401)
jest.mock('axios', () => ({
    __esModule: true,
    default: {
        create: () => {
            const instance = {
                interceptors: {
                    request: { use: () => {} },
                    response: { use: (fulfilled, rejected) => { instance.onResponseError = rejected; } },
                },
            };
            return instance;
        },
    },
}));

beforeEach(() => {
    localStorage.clear();
});

test('la clave de caché incluye a la usuaria en sesión', () => {
    localStorage.setItem('username', 'maria');

    expect(initCacheKey()).toBe('vendedor_init_data:maria');
    expect(initCacheKey('laura')).toBe('vendedor_init_data:laura');
});

test('perUserCatalogParams: una URL distinta por usuaria (y anon sin sesión)', () => {
    localStorage.setItem('username', 'maria');

    expect(perUserCatalogParams()).toEqual({ u: 'maria' });
    expect(perUserCatalogParams('laura')).toEqual({ u: 'laura' });
    localStorage.removeItem('username');
    expect(perUserCatalogParams()).toEqual({ u: 'anon' });
});

test('clearAllInitCaches borra la de todas las usuarias y la clave vieja, y nada más', () => {
    localStorage.setItem('vendedor_init_data', '{}');
    localStorage.setItem('vendedor_init_data:maria', '{}');
    localStorage.setItem('vendedor_init_data:laura', '{}');
    localStorage.setItem('vendedorGridColumns', '3');
    localStorage.setItem('username', 'maria');

    clearAllInitCaches();

    expect(localStorage.getItem('vendedor_init_data')).toBeNull();
    expect(localStorage.getItem('vendedor_init_data:maria')).toBeNull();
    expect(localStorage.getItem('vendedor_init_data:laura')).toBeNull();
    expect(localStorage.getItem('vendedorGridColumns')).toBe('3');
    expect(localStorage.getItem('username')).toBe('maria');
});

test('un 401 cierra la sesión y borra el catálogo en caché de las vendedoras', async () => {
    localStorage.setItem('token', 't');
    localStorage.setItem('vendedor_init_data:maria', '{}');
    // jsdom no implementa la navegación de window.location: se silencia su aviso
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const error = { response: { status: 401 } };

    await expect(apiClient.onResponseError(error)).rejects.toBe(error);

    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('vendedor_init_data:maria')).toBeNull();
    consoleError.mockRestore();
});
