// src/api/vendedorInitCache.js
// Claves de la caché local del endpoint /vendedor/init.
//
// El catálogo depende de la vendedora (promociones y productos especiales asignados), así que
// la caché se guarda POR USUARIA: en un celular compartido una vendedora no debe ver (ni usar
// sin internet) el catálogo de otra. Módulo aparte para que client.js pueda limpiarla en el 401
// sin importar vendedorInitService (que a su vez importa client.js).

// Clave fija de la versión anterior (no dependía del usuario). Se sigue limpiando.
export const INIT_CACHE_PREFIX = 'vendedor_init_data';

const safeGetUsername = () => {
    try {
        return localStorage.getItem('username') || '';
    } catch (e) {
        return '';
    }
};

/** Clave de la caché de la usuaria actual (o la indicada). */
export const initCacheKey = (username = safeGetUsername()) =>
    `${INIT_CACHE_PREFIX}:${username || 'anon'}`;

/**
 * Parámetro por usuaria para las URL del catálogo de la vendedora (/vendedor/init,
 * /vendedor/promotions). La caché HTTP del navegador guarda por URL, no por token: un backend que
 * todavía responda "Cache-Control: max-age" le entregaría a la vendedora que entra después la
 * respuesta guardada de la anterior. Con la usuaria en la URL cada una tiene su propia entrada.
 * El backend ignora el parámetro.
 */
export const perUserCatalogParams = (username = safeGetUsername()) => ({ u: username || 'anon' });

/**
 * Borra la caché de init de TODAS las usuarias, incluida la clave vieja sin usuario.
 * Se usa al expirar la sesión (401): quien entre después no debe ver el catálogo anterior.
 */
export const clearAllInitCaches = () => {
    try {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key === INIT_CACHE_PREFIX || (key && key.startsWith(`${INIT_CACHE_PREFIX}:`))) {
                keys.push(key);
            }
        }
        keys.forEach(key => localStorage.removeItem(key));
    } catch (e) {
        // Sin localStorage (modo privado/bloqueado) no hay caché que limpiar
    }
};
