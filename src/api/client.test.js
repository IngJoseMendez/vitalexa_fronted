import apiClient, { DOWNLOAD_TIMEOUT_MS } from './client';

// axios 1.x es ESM y Jest (CRA) no lo transforma: se simula la instancia para capturar el interceptor
jest.mock('axios', () => ({
    __esModule: true,
    default: {
        create: () => {
            const instance = {
                interceptors: {
                    request: { use: (fulfilled) => { instance.prepareRequest = fulfilled; } },
                    response: { use: () => {} },
                },
            };
            return instance;
        },
    },
}));

const prepare = (config) => apiClient.prepareRequest({ headers: {}, ...config });

test('las descargas (blob) esperan hasta 2 min; el resto conserva los 10 s', () => {
    expect(prepare({ timeout: 10000, responseType: 'blob' }).timeout).toBe(DOWNLOAD_TIMEOUT_MS);
    expect(prepare({ timeout: 10000 }).timeout).toBe(10000);
});

test('un timeout explícito mayor o sin límite (0) no se toca', () => {
    expect(prepare({ timeout: 300000, responseType: 'blob' }).timeout).toBe(300000);
    expect(prepare({ timeout: 0, responseType: 'blob' }).timeout).toBe(0);
});
