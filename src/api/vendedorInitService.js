// src/api/vendedorInitService.js
// Servicio para el endpoint unificado /api/vendedor/init
// Reduce de 3 peticiones HTTP a 1 sola al iniciar la app de vendedora
// Incluye caché local (localStorage) para funcionar con internet débil o sin conexión

import apiClient from './client';

const CACHE_KEY = 'vendedor_init_data';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos en milisegundos

const vendedorInitService = {
    /**
     * Carga datos de inicio (productos, promociones, promosEspeciales) en una sola petición.
     * - Primero intenta usar caché local si está fresco (< 5 min)
     * - Si no hay caché o expiró, va al servidor y guarda en localStorage
     * - Si falla la red, usa caché aunque esté vencida (modo offline)
     *
     * @returns {{ productos, promociones, promocionesEspeciales, fromCache: boolean }}
     */
    cargarDatosInicio: async () => {
        const cached = localStorage.getItem(CACHE_KEY);

        // 1. Intentar usar caché local fresca
        if (cached) {
            try {
                const { data, timestamp } = JSON.parse(cached);
                const esFresco = (Date.now() - timestamp) < CACHE_TTL;
                if (esFresco) {
                    console.log('✅ [VendedorInit] Datos cargados desde caché local (< 5 min)');
                    // fromCache: true pero serverFailed: false → silencioso, hay internet
                    return { ...data, fromCache: true, serverFailed: false };
                }
            } catch (e) {
                // Caché corrupta, ignorar
                localStorage.removeItem(CACHE_KEY);
            }
        }

        // 2. Ir al servidor
        try {
            const response = await apiClient.get('/vendedor/init');
            const datos = {
                productos: response.data.productos || [],
                promociones: response.data.promociones || [],
                promocionesEspeciales: response.data.promocionesEspeciales || [],
            };

            // Guardar en localStorage para uso offline
            localStorage.setItem(CACHE_KEY, JSON.stringify({
                data: datos,
                timestamp: Date.now()
            }));

            console.log('✅ [VendedorInit] Datos frescos del servidor guardados en caché');
            // fromCache: false, serverFailed: false → conexión perfecta, sin banner
            return { ...datos, fromCache: false, serverFailed: false };
        } catch (error) {
            // 3. Sin red — usar caché aunque esté vencida
            if (cached) {
                try {
                    const { data } = JSON.parse(cached);
                    console.warn('⚠️ [VendedorInit] Sin internet — usando datos guardados anteriormente');
                    // serverFailed: true → activa el banner amarillo en la UI
                    return { ...data, fromCache: true, serverFailed: true };
                } catch (e) {
                    // Caché corrupta
                }
            }
            // Sin caché ni internet
            throw error;
        }
    },

    /**
     * Invalida el caché local.
     * Debe llamarse cuando el vendedor crea un pedido (el stock cambia).
     */
    invalidarCache: () => {
        localStorage.removeItem(CACHE_KEY);
        console.log('🗑️ [VendedorInit] Caché invalidada (pedido creado)');
    },

    /**
     * Verifica si hay caché guardada (aunque esté vencida).
     * Útil para saber si hay datos offline disponibles.
     */
    tieneCache: () => {
        return localStorage.getItem(CACHE_KEY) !== null;
    },
};

export default vendedorInitService;
