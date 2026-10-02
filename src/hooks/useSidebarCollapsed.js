import { useCallback, useState } from 'react';
import { PERSON_PREF_PREFIX } from '../components/welcome/welcomeStorage';

// Preferencia del menú lateral de Admin/Owner (plegado a solo iconos). Se guarda por panel y por
// usuario: en un equipo compartido cada quien conserva la suya.
export const SIDEBAR_PREF_PREFIX = 'vx:sidebarCollapsed:';

// localStorage puede no existir o lanzar (modo privado, almacenamiento bloqueado): sin él, el menú
// simplemente arranca expandido y la preferencia no se recuerda.
const currentUsername = () => {
  try {
    return localStorage.getItem('username') || '';
  } catch (error) {
    return '';
  }
};

export const sidebarPrefKey = (panel) => `${SIDEBAR_PREF_PREFIX}${panel}:${currentUsername()}`;

export const readSidebarCollapsed = (panel) => {
  try {
    return localStorage.getItem(sidebarPrefKey(panel)) === '1';
  } catch (error) {
    return false;
  }
};

const writeSidebarCollapsed = (panel, collapsed) => {
  try {
    localStorage.setItem(sidebarPrefKey(panel), collapsed ? '1' : '0');
  } catch (error) {
    // Sin almacenamiento el plegado funciona igual, solo no se recuerda
  }
};

/**
 * Estado del menú lateral plegable. Por defecto expandido.
 * @param {'admin'|'owner'} panel
 * @returns {[boolean, () => void]} [collapsed, toggle]
 */
export default function useSidebarCollapsed(panel) {
  const [collapsed, setCollapsed] = useState(() => readSidebarCollapsed(panel));

  const toggle = useCallback(() => {
    const next = !collapsed;
    setCollapsed(next);
    writeSidebarCollapsed(panel, next);
  }, [collapsed, panel]);

  return [collapsed, toggle];
}

/**
 * Cerrar sesión borra todo el localStorage (token, rol, caché). La preferencia del menú y las
 * preferencias de la persona (prefijo vx:pref:, p. ej. "ya vio la bienvenida del rediseño") no
 * son de la sesión, así que se copian antes y se vuelven a escribir después. Si
 * localStorage.clear() falla, el error sube igual que antes (la sesión no se da por cerrada).
 */
export const clearStorageKeepingSidebarPrefs = () => {
  const kept = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith(SIDEBAR_PREF_PREFIX) || key.startsWith(PERSON_PREF_PREFIX))) {
        kept.push([key, localStorage.getItem(key)]);
      }
    }
  } catch (error) {
    // Si no se pueden leer, se pierden: el menú vuelve a salir expandido
  }

  localStorage.clear();

  kept.forEach(([key, value]) => {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      // Igual que arriba: perder la preferencia no impide cerrar sesión
    }
  });
};
