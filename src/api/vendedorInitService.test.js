import vendedorInitService from './vendedorInitService';
import apiClient from './client';

jest.mock('./client', () => ({ __esModule: true, default: { get: jest.fn() } }));

const datosDe = (username) => ({
    productos: [{ id: `prod-${username}` }],
    promociones: [{ id: `promo-${username}` }],
    promocionesEspeciales: [{ id: `especial-${username}` }],
});

beforeEach(() => {
    localStorage.clear();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    // El servidor responde el catálogo de quien está en sesión
    apiClient.get.mockImplementation(() =>
        Promise.resolve({ data: datosDe(localStorage.getItem('username')) }));
});

afterEach(() => {
    console.log.mockRestore();
    console.warn.mockRestore();
});

test('la caché es por usuaria: otra vendedora en el mismo equipo no ve el catálogo anterior', async () => {
    localStorage.setItem('username', 'maria');
    const deMaria = await vendedorInitService.cargarDatosInicio();
    expect(deMaria.promocionesEspeciales).toEqual([{ id: 'especial-maria' }]);
    expect(localStorage.getItem('vendedor_init_data:maria')).not.toBeNull();

    localStorage.setItem('username', 'laura');
    const deLaura = await vendedorInitService.cargarDatosInicio();

    expect(deLaura.fromCache).toBe(false);
    expect(deLaura.promocionesEspeciales).toEqual([{ id: 'especial-laura' }]);
    expect(apiClient.get).toHaveBeenCalledTimes(2);
});

test('pide /vendedor/init con la usuaria en la URL: la caché HTTP del navegador no mezcla sesiones', async () => {
    localStorage.setItem('username', 'maria');
    await vendedorInitService.cargarDatosInicio();
    localStorage.setItem('username', 'laura');
    await vendedorInitService.cargarDatosInicio();

    expect(apiClient.get).toHaveBeenNthCalledWith(1, '/vendedor/init', { params: { u: 'maria' } });
    expect(apiClient.get).toHaveBeenNthCalledWith(2, '/vendedor/init', { params: { u: 'laura' } });
});

test('la misma usuaria reutiliza su caché fresca sin ir al servidor', async () => {
    localStorage.setItem('username', 'maria');
    await vendedorInitService.cargarDatosInicio();

    const segunda = await vendedorInitService.cargarDatosInicio();

    expect(segunda.fromCache).toBe(true);
    expect(apiClient.get).toHaveBeenCalledTimes(1);
});

test('sin internet usa solo la caché de la usuaria actual, nunca la de otra', async () => {
    localStorage.setItem('username', 'maria');
    await vendedorInitService.cargarDatosInicio();
    apiClient.get.mockImplementation(() => Promise.reject(new Error('Network Error')));

    localStorage.setItem('username', 'laura');
    await expect(vendedorInitService.cargarDatosInicio()).rejects.toThrow('Network Error');
});

test('borra la clave fija de la versión anterior (compartida entre usuarias) y no la usa', async () => {
    localStorage.setItem('vendedor_init_data', JSON.stringify({ data: datosDe('vieja'), timestamp: Date.now() }));
    localStorage.setItem('username', 'maria');

    const datos = await vendedorInitService.cargarDatosInicio();

    expect(datos.promociones).toEqual([{ id: 'promo-maria' }]);
    expect(localStorage.getItem('vendedor_init_data')).toBeNull();
});

test('invalidarCache borra solo la caché de la usuaria actual', async () => {
    localStorage.setItem('username', 'maria');
    await vendedorInitService.cargarDatosInicio();
    localStorage.setItem('username', 'laura');
    await vendedorInitService.cargarDatosInicio();

    vendedorInitService.invalidarCache();

    expect(vendedorInitService.tieneCache()).toBe(false);
    expect(localStorage.getItem('vendedor_init_data:maria')).not.toBeNull();
});
