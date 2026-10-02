// Bienvenida del rediseño (una sola vez por usuario y navegador).
// Las claves empiezan por PERSON_PREF_PREFIX: cerrar sesión las conserva (ver
// clearStorageKeepingSidebarPrefs), así el mensaje no vuelve a salir en el siguiente ingreso.
export const PERSON_PREF_PREFIX = 'vx:pref:';

// Cambiar la versión hace que la bienvenida vuelva a salir (p. ej. para un próximo rediseño)
export const WELCOME_VERSION = 'rediseno-2026-10';

const seenKey = (username) => `${PERSON_PREF_PREFIX}bienvenida:${WELCOME_VERSION}:${username || ''}`;
const SOUND_KEY = `${PERSON_PREF_PREFIX}bienvenida:sonido`;

// localStorage puede no existir o lanzar (modo privado, almacenamiento bloqueado). Sin él la
// bienvenida no se muestra: es preferible no mostrarla a mostrarla en cada carga.
export const hasSeenWelcome = (username) => {
  try {
    return localStorage.getItem(seenKey(username)) === '1';
  } catch (error) {
    return true;
  }
};

export const markWelcomeSeen = (username) => {
  try {
    localStorage.setItem(seenKey(username), '1');
  } catch (error) {
    // Sin almacenamiento no se puede recordar; no pasa nada más
  }
};

export const isWelcomeSoundMuted = () => {
  try {
    return localStorage.getItem(SOUND_KEY) === 'off';
  } catch (error) {
    return false;
  }
};

export const setWelcomeSoundMuted = (muted) => {
  try {
    localStorage.setItem(SOUND_KEY, muted ? 'off' : 'on');
  } catch (error) {
    // Igual que arriba
  }
};
