import avatarToneDefault, { avatarTone, avatarInitials, AVATAR_TONES } from './avatarTone';

const SAMPLE = [
    'Ana', 'María López', 'Droguería La 14', 'José Pérez', 'Farmacia Central', 'Carlos Ruiz',
    'Laura Gómez', 'Pedro', 'Sofía Martínez', 'Distribuidora Norte', 'Andrea', 'Camila Torres',
    'Luis Fernando', 'Valentina', 'Juan Esteban', 'Natalia', 'Miguel Ángel', 'Daniela',
    'Santiago', 'Paula',
];

describe('avatarTone', () => {
    test('solo devuelve los tonos permitidos', () => {
        expect(AVATAR_TONES).toEqual(['primary', 'success', 'teal', 'sky', 'warning']);
        SAMPLE.forEach((name) => expect(AVATAR_TONES).toContain(avatarTone(name)));
    });

    test('es determinista: el mismo nombre siempre da el mismo tono', () => {
        SAMPLE.forEach((name) => expect(avatarTone(name)).toBe(avatarTone(name)));
        // Valores fijos: si el hash cambiara, los clientes cambiarían de color entre versiones
        expect(avatarTone('Ana')).toBe('warning');
        expect(avatarTone('María López')).toBe('success');
        expect(avatarTone('Carlos Ruiz')).toBe('primary');
        expect(avatarTone('Pedro')).toBe('sky');
        expect(avatarTone('Natalia')).toBe('teal');
    });

    test('mayúsculas, tildes y espacios no cambian el tono', () => {
        const base = avatarTone('José Pérez');
        expect(avatarTone('jose perez')).toBe(base);
        expect(avatarTone('  JOSÉ   PÉREZ ')).toBe(base);
        expect(avatarTone('Jose Perez')).toBe(base);
    });

    test('sin nombre devuelve primary', () => {
        expect(avatarTone('')).toBe('primary');
        expect(avatarTone('   ')).toBe('primary');
        expect(avatarTone(null)).toBe('primary');
        expect(avatarTone(undefined)).toBe('primary');
    });

    test('acepta números (p. ej. un NIT) sin fallar', () => {
        expect(AVATAR_TONES).toContain(avatarTone(900123456));
    });

    test('reparte los nombres entre todos los tonos', () => {
        const used = new Set(SAMPLE.map(avatarTone));
        expect(used.size).toBe(AVATAR_TONES.length);
    });

    test('export por defecto = avatarTone', () => {
        expect(avatarToneDefault).toBe(avatarTone);
    });
});

describe('avatarInitials', () => {
    test('primera letra de las dos primeras palabras, en mayúscula', () => {
        expect(avatarInitials('Droguería La 14')).toBe('DL');
        expect(avatarInitials('maría lópez')).toBe('ML');
        expect(avatarInitials('Ángela')).toBe('Á');
        expect(avatarInitials('  ana   maría  pérez ')).toBe('AM');
    });

    test('sin nombre devuelve el fallback', () => {
        expect(avatarInitials('')).toBe('?');
        expect(avatarInitials(null)).toBe('?');
        expect(avatarInitials(undefined, '—')).toBe('—');
    });
});
