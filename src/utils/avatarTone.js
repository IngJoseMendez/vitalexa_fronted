// Avatares de iniciales (.ui-avatar) con tono determinista por nombre
// (premium-polish-SPEC §1): el mismo cliente/vendedora siempre sale del mismo color, en
// cualquier pantalla y en cualquier sesión. Solo presentación: no depende de ids ni de datos
// del servidor.

// Tonos permitidos para avatares (clases .ui-avatar--{tono} en design-system.css)
export const AVATAR_TONES = Object.freeze(['primary', 'success', 'teal', 'sky', 'warning']);

// Mayúsculas/minúsculas, tildes y espacios repetidos no cambian el tono:
// "José Pérez", "jose  perez" y " JOSE PEREZ " dan el mismo.
const normalizeName = (name) => String(name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

// Hash estable (multiplicativo base 31, 32 bits sin signo) → uno de AVATAR_TONES.
// Sin nombre: 'primary'.
export function avatarTone(name) {
    const key = normalizeName(name);
    if (!key) return AVATAR_TONES[0];
    let hash = 0;
    for (let i = 0; i < key.length; i += 1) {
        hash = (Math.imul(hash, 31) + key.charCodeAt(i)) >>> 0;
    }
    return AVATAR_TONES[hash % AVATAR_TONES.length];
}

// Iniciales para el avatar: primera letra de las dos primeras palabras ("Droguería La 14" → "DL",
// "Ana" → "A"). Sin nombre: fallback ("?").
export function avatarInitials(name, fallback = '?') {
    const words = String(name ?? '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return fallback;
    const letters = words.slice(0, 2).map((w) => Array.from(w)[0]).join('');
    return letters.toLocaleUpperCase('es');
}

export default avatarTone;
