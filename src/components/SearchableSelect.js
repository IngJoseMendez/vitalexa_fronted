import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Selector con buscador (combobox ARIA 1.2). Reemplazo directo de un <select> nativo para
 * elegir algo que ya existe (clientes, productos, vendedoras, promociones…): el campo es
 * escribible y la lista se va filtrando con lo que se escribe.
 *
 *   <SearchableSelect
 *       id="cliente" name="clientId" value={clientId}
 *       onChange={(e) => setClientId(e.target.value)}
 *       options={clientes.map(c => ({ value: c.id, label: c.nombre, description: c.nit }))}
 *       emptyOption={{ label: 'Sin cliente' }}
 *   />
 *
 * - options: [{ value, label, description?, keywords?, disabled? }] (value se compara como texto).
 * - value: texto ('' = nada elegido). Sin `value` funciona como no controlado (defaultValue).
 * - onChange(evento): igual que el <select>: evento.target = { value, name, id } con value texto.
 *   No se llama si se vuelve a elegir la misma opción (como el nativo).
 * - emptyOption: { label } (o el texto) → primera opción con value '' (p.ej. "Todos").
 * - La x ("Limpiar selección") solo aparece si hay emptyOption (limpiar = elegir esa opción) o
 *   con clearable; nunca si es required. Sin ellas no se puede mandar '' (como un <select> sin
 *   <option value="">), así que un handler como setMes(Number(e.target.value)) no recibe 0.
 * - Teclado: flechas + Enter eligen; Escape o clic fuera cancelan la búsqueda. Tab elige la opción
 *   resaltada si se escribió algo o se movió con las flechas (como escribir en el <select> nativo)
 *   y deja seguir al siguiente campo; si solo se pasa por el campo, no cambia nada.
 * - query / onQueryChange: texto de búsqueda controlado (opcional). filterOption(opcion, texto)
 *   reemplaza el filtro por defecto (sin mayúsculas ni tildes; deben aparecer todas las palabras
 *   en label + description + keywords; primero lo que empieza por lo escrito).
 * - maxResults (100): cuántas opciones se pintan como máximo; loading: muestra "Cargando…".
 * - required: un <input> nativo oculto lleva required/value/name para que la validación del
 *   formulario siga funcionando; el campo visible lleva el mismo error (setCustomValidity), así
 *   que al enviar el navegador enfoca el combobox y muestra ahí "Selecciona una opción…".
 * - className / style van al contenedor (ui-select y ui-input se ignoran: el campo ya se ve así);
 *   inputClassName y el resto de props (title, data-*, aria-describedby…) van al <input>.
 * La lista flota con position: fixed en un portal para no quedar recortada dentro de modales con
 * overflow: dentro de un diálogo aria-modal se pinta en el diálogo (fuera de él VoiceOver no la
 * ve); si no, en document.body. Estilos: .ui-combobox* en styles/design-system.css.
 */

const COMBINING_MARKS = /[\u0300-\u036f]/g;
const DEFAULT_MAX_RESULTS = 100;
const PANEL_MAX_HEIGHT = 300;
const PANEL_MIN_HEIGHT = 96;
const PANEL_MIN_WIDTH = 240;
const PANEL_GAP = 4;
const VIEWPORT_MARGIN = 8;
// Si abajo no caben al menos ~4 opciones y arriba hay más espacio, la lista abre hacia arriba
const OPEN_UP_THRESHOLD = 180;
const IGNORED_ROOT_CLASSES = ['ui-select', 'ui-input'];
const NO_TOKENS = [];
const noop = () => {};

const normalizeText = (text) =>
    String(text ?? '').normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase();

// Normalización cacheada: las listas se reconstruyen en cada render del padre (options inline)
const normalizedCache = new Map();
const normalizeCached = (text) => {
    let result = normalizedCache.get(text);
    if (result === undefined) {
        if (normalizedCache.size >= 20000) normalizedCache.clear();
        result = normalizeText(text);
        normalizedCache.set(text, result);
    }
    return result;
};

const toTokens = (text) => Array.from(new Set(normalizeText(text).split(/\s+/).filter(Boolean)));

const isWordChar = (char) => !!char && /[a-z0-9]/.test(char);

// 0 = el label empieza por lo escrito, 1 = alguna palabra empieza por lo escrito, 2 = lo contiene
const rankOf = (normLabel, token) => {
    if (normLabel.startsWith(token)) return 0;
    let at = normLabel.indexOf(token);
    while (at !== -1) {
        if (!isWordChar(normLabel[at - 1])) return 1;
        at = normLabel.indexOf(token, at + 1);
    }
    return 2;
};

// ¿El label tiene una palabra exactamente igual a lo escrito? ("10" en "Producto 10", no en "$5910")
const hasWholeWord = (normLabel, token) => {
    let at = normLabel.indexOf(token);
    while (at !== -1) {
        if (!isWordChar(normLabel[at - 1]) && !isWordChar(normLabel[at + token.length])) return true;
        at = normLabel.indexOf(token, at + 1);
    }
    return false;
};

// Puntaje para ordenar (menor = mejor): suma del rango de cada palabra escrita en el label (3 si
// solo aparece en la descripción o palabras clave), y un poco menos por cada palabra completa
const scoreOf = (normLabel, tokens) => tokens.reduce((score, token) => {
    if (!normLabel.includes(token)) return score + 3;
    return score + rankOf(normLabel, token) - (hasWholeWord(normLabel, token) ? 0.5 : 0);
}, 0);

const toText = (value) => (value == null ? '' : String(value));

const keywordsText = (keywords) => {
    if (Array.isArray(keywords)) return keywords.filter((k) => k != null).join(' ');
    return toText(keywords);
};

// Negrita en lo que coincide (sin tildes ni mayúsculas) conservando el texto original
function highlightMatches(label, tokens) {
    if (!tokens.length || !label) return label;
    let norm = '';
    const starts = [];
    const ends = [];
    let pos = 0;
    for (const char of label) {
        const normalized = normalizeText(char);
        for (let k = 0; k < normalized.length; k += 1) {
            norm += normalized[k];
            starts.push(pos);
            ends.push(pos + char.length);
        }
        pos += char.length;
    }
    const marked = new Array(label.length).fill(false);
    let found = false;
    tokens.forEach((token) => {
        let at = norm.indexOf(token);
        while (at !== -1) {
            for (let i = starts[at]; i < ends[at + token.length - 1]; i += 1) marked[i] = true;
            found = true;
            at = norm.indexOf(token, at + token.length);
        }
    });
    if (!found) return label;
    const parts = [];
    let i = 0;
    while (i < label.length) {
        const isMatch = marked[i];
        let j = i;
        while (j < label.length && marked[j] === isMatch) j += 1;
        const text = label.slice(i, j);
        parts.push(isMatch ? <mark key={i} className="ui-combobox-match">{text}</mark> : text);
        i = j;
    }
    return parts;
}

// Posición de la lista (fixed) junto al campo; abre hacia arriba si abajo no hay espacio.
// Con visualViewport se descuenta el teclado del celular.
function computePanelPosition(input) {
    if (!input || typeof window === 'undefined') return null;
    const rect = input.getBoundingClientRect();
    const viewport = window.visualViewport;
    // Viewport de layout sin barras de scroll: es el bloque contenedor de position: fixed
    // (innerHeight/innerWidth incluyen la barra horizontal/vertical)
    const docEl = document.documentElement;
    const layoutHeight = (docEl && docEl.clientHeight) || window.innerHeight;
    const layoutWidth = (docEl && docEl.clientWidth) || window.innerWidth;
    const viewTop = viewport ? viewport.offsetTop : 0;
    const viewLeft = viewport ? viewport.offsetLeft : 0;
    const viewHeight = viewport ? viewport.height : layoutHeight;
    const viewWidth = viewport ? viewport.width : layoutWidth;

    const spaceBelow = viewTop + viewHeight - rect.bottom - PANEL_GAP - VIEWPORT_MARGIN;
    const spaceAbove = rect.top - viewTop - PANEL_GAP - VIEWPORT_MARGIN;
    const openUp = spaceBelow < Math.min(PANEL_MAX_HEIGHT, OPEN_UP_THRESHOLD) && spaceAbove > spaceBelow;

    const maxWidth = Math.max(0, viewWidth - VIEWPORT_MARGIN * 2);
    const width = Math.round(Math.min(Math.max(rect.width, PANEL_MIN_WIDTH), maxWidth));
    let left = rect.left;
    const maxLeft = viewLeft + viewWidth - VIEWPORT_MARGIN - width;
    if (left > maxLeft) left = maxLeft;
    if (left < viewLeft + VIEWPORT_MARGIN) left = viewLeft + VIEWPORT_MARGIN;
    const maxHeight = Math.round(Math.max(PANEL_MIN_HEIGHT, Math.min(PANEL_MAX_HEIGHT, openUp ? spaceAbove : spaceBelow)));

    // bottom de un fixed se mide desde el borde inferior del viewport de layout (no innerHeight)
    return openUp
        ? { placement: 'top', left: Math.round(left), width, maxHeight, bottom: Math.round(layoutHeight - rect.top + PANEL_GAP) }
        : { placement: 'bottom', left: Math.round(left), width, maxHeight, top: Math.round(rect.bottom + PANEL_GAP) };
}

// ¿El elemento hace de bloque contenedor de sus hijos position: fixed? (entonces la lista no se
// ubicaría respecto a la ventana). P.ej. el transform de la animación de entrada de .ui-modal.
const isFixedContainingBlock = (node) => {
    const css = window.getComputedStyle(node);
    const isSet = (prop) => !!css[prop] && css[prop] !== 'none';
    return isSet('transform') || isSet('perspective') || isSet('filter') || isSet('backdropFilter')
        || /transform|perspective|filter/.test(css.willChange || '')
        || /paint|layout|strict|content/.test(css.contain || '')
        || (!!css.containerType && css.containerType !== 'normal');
};

// Dónde se pinta la lista: dentro del diálogo modal que contiene al campo (con aria-modal, WebKit y
// VoiceOver ignoran lo que queda fuera del diálogo y no anunciarían las opciones); si no hay diálogo
// o algo en su cadena desplazaría el position: fixed, en body.
function findPortalTarget(input) {
    const body = document.body;
    const dialog = input && typeof input.closest === 'function' ? input.closest('[aria-modal="true"]') : null;
    if (!dialog || typeof window.getComputedStyle !== 'function') return body;
    for (let node = dialog; node && node !== body && node.nodeType === 1; node = node.parentElement) {
        if (isFixedContainingBlock(node)) return body;
    }
    return dialog;
}

const samePosition = (a, b) => !!a && !!b
    && a.placement === b.placement && a.left === b.left && a.width === b.width
    && a.maxHeight === b.maxHeight && a.top === b.top && a.bottom === b.bottom;

const requestFrame = (callback) => (typeof window.requestAnimationFrame === 'function'
    ? window.requestAnimationFrame(callback)
    : window.setTimeout(callback, 16));

const cancelFrame = (handle) => (typeof window.cancelAnimationFrame === 'function'
    ? window.cancelAnimationFrame(handle)
    : window.clearTimeout(handle));

// Nombre accesible de la lista: el <label> del campo (sin el asterisco de obligatorio)
const labelTextOf = (input) => {
    const label = input?.labels?.[0];
    return label ? label.textContent.replace(/\s*\*\s*$/, '').trim() : '';
};

const ComboboxOption = memo(function ComboboxOption({ id, option, active, selected, tokensKey, onPick, onHover }) {
    const tokens = tokensKey ? tokensKey.split(' ') : NO_TOKENS;
    const className = [
        'ui-combobox-option',
        active && 'is-active',
        selected && 'is-selected',
        option.disabled && 'is-disabled',
        option.isEmpty && 'is-empty-option',
    ].filter(Boolean).join(' ');
    return (
        <li
            id={id}
            role="option"
            aria-selected={selected}
            aria-disabled={option.disabled ? true : undefined}
            className={className}
            onMouseMove={() => onHover(option)}
            onClick={() => onPick(option)}
        >
            <span className="ui-combobox-option-text">
                <span className="ui-combobox-option-label">
                    {option.label ? highlightMatches(option.label, tokens) : '\u00a0'}
                </span>
                {option.description ? <span className="ui-combobox-option-desc">{option.description}</span> : null}
            </span>
            {selected ? <span className="material-icons-round ui-combobox-check" aria-hidden="true">check</span> : null}
        </li>
    );
});

export default function SearchableSelect({
    id,
    name,
    value,
    defaultValue,
    onChange,
    options,
    placeholder = 'Seleccionar…',
    emptyOption,
    searchPlaceholder = 'Escribe para buscar…',
    noResultsText = 'Sin resultados',
    loadingText = 'Cargando…',
    requiredMessage = 'Selecciona una opción de la lista.',
    disabled = false,
    required = false,
    clearable = false,
    className,
    inputClassName,
    style,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledby,
    query,
    onQueryChange,
    filterOption,
    loading = false,
    maxResults = DEFAULT_MAX_RESULTS,
    onFocus: onFocusProp,
    onBlur: onBlurProp,
    onKeyDown: onKeyDownProp,
    onClick: onClickProp,
    // Un <select> llevaba <option> como hijos: aquí van en `options` (no se pasan al <input>)
    children,
    ...inputProps
}) {
    const generatedId = useId();
    const inputId = id || `${generatedId}-input`;
    const listId = `${generatedId}-listbox`;

    const rootRef = useRef(null);
    const inputRef = useRef(null);
    const panelRef = useRef(null);
    const listRef = useRef(null);
    const suppressOpenRef = useRef(false);
    const scrollActiveRef = useRef(false);
    const pointerTypeRef = useRef('');
    // La opción activa la movió el usuario con las flechas (Tab la elige; el mouse encima no)
    const activeByKeyRef = useRef(false);
    const latestRef = useRef(null);

    const [open, setOpen] = useState(false);
    const [innerQuery, setInnerQuery] = useState('');
    const [innerValue, setInnerValue] = useState(() => toText(defaultValue));
    // null = automática (lo elegido al abrir; la primera coincidencia al escribir)
    const [activeValue, setActiveValue] = useState(null);
    const [position, setPosition] = useState(null);
    const [listLabel, setListLabel] = useState('');
    const [portalNode, setPortalNode] = useState(null);

    const isValueControlled = value !== undefined;
    const currentValue = isValueControlled ? toText(value) : innerValue;
    const isQueryControlled = query !== undefined && query !== null;
    const currentQuery = isQueryControlled ? String(query) : innerQuery;
    const isOpen = open && !disabled;
    const hasQuery = currentQuery.trim() !== '';

    let emptyLabel = null;
    if (emptyOption != null && emptyOption !== false) {
        emptyLabel = typeof emptyOption === 'object' ? toText(emptyOption.label) : String(emptyOption);
    }

    // Opciones normalizadas una vez por lista (value siempre texto, texto de búsqueda cacheado)
    const prepared = useMemo(() => {
        const list = [];
        const seen = new Map();
        const add = (raw, isEmpty) => {
            const optionValue = toText(raw.value);
            const label = raw.label == null ? optionValue : String(raw.label);
            const description = toText(raw.description);
            const repeated = seen.get(optionValue) || 0;
            seen.set(optionValue, repeated + 1);
            list.push({
                key: `o:${optionValue}${repeated ? `#${repeated}` : ''}`,
                value: optionValue,
                label,
                description,
                disabled: !!raw.disabled,
                isEmpty,
                raw,
                normLabel: normalizeCached(label),
                haystack: normalizeCached(`${label} ${description} ${keywordsText(raw.keywords)}`),
            });
        };
        if (emptyLabel !== null) add({ value: '', label: emptyLabel }, true);
        (Array.isArray(options) ? options : []).forEach((raw) => {
            if (raw && typeof raw === 'object') add(raw, false);
        });
        return list;
    }, [options, emptyLabel]);

    const selectedOption = useMemo(
        () => prepared.find((option) => option.value === currentValue) || null,
        [prepared, currentValue]
    );

    const tokens = useMemo(() => toTokens(currentQuery), [currentQuery]);

    const filtered = useMemo(() => {
        if (typeof filterOption === 'function') {
            return prepared.filter((option) => filterOption(option.raw, currentQuery));
        }
        if (!tokens.length) return prepared;
        return prepared
            .filter((option) => tokens.every((token) => option.haystack.includes(token)))
            .map((option, order) => ({ option, order, rank: scoreOf(option.normLabel, tokens) }))
            .sort((a, b) => a.rank - b.rank || a.order - b.order)
            .map((entry) => entry.option);
    }, [prepared, tokens, filterOption, currentQuery]);

    const limit = maxResults > 0 ? maxResults : DEFAULT_MAX_RESULTS;
    const visible = useMemo(
        () => (filtered.length > limit ? filtered.slice(0, limit) : filtered),
        [filtered, limit]
    );

    let activeIndex = activeValue === null
        ? -1
        : visible.findIndex((option) => option.value === activeValue && !option.disabled);
    if (activeIndex === -1) {
        if (hasQuery) activeIndex = visible.findIndex((option) => !option.disabled);
        else if (selectedOption && !selectedOption.disabled) activeIndex = visible.indexOf(selectedOption);
    }
    const activeOptionId = isOpen && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined;

    const updateQuery = (next) => {
        if (!isQueryControlled) setInnerQuery(next);
        if (typeof onQueryChange === 'function') onQueryChange(next);
    };

    const openList = () => {
        if (disabled || open) return;
        scrollActiveRef.current = true;
        activeByKeyRef.current = false;
        setActiveValue(null);
        setListLabel(ariaLabel || labelTextOf(inputRef.current) || 'Opciones');
        setPortalNode(findPortalTarget(inputRef.current));
        // Posición ya en el primer render abierto: la opción elegida se desplaza a la vista con la
        // lista ya limitada a su alto (React corre el efecto de scroll antes de volver a pintar con
        // la posición que calcula el useLayoutEffect)
        setPosition(computePanelPosition(inputRef.current));
        setOpen(true);
    };

    const closeList = () => {
        if (open) setOpen(false);
        activeByKeyRef.current = false;
        setActiveValue(null);
        if (currentQuery !== '') updateQuery('');
    };

    const emitChange = (nextValue) => {
        if (!isValueControlled) setInnerValue(nextValue);
        if (typeof onChange !== 'function') return;
        const target = { value: nextValue, name: name ?? '', id: id ?? '', type: 'select-one' };
        onChange({ target, currentTarget: target, type: 'change', preventDefault: noop, stopPropagation: noop, persist: noop });
    };

    const selectOption = (option) => {
        if (!option || option.disabled) return;
        if (option.value !== currentValue) emitChange(option.value);
        closeList();
        // En el celular, tras tocar una opción se cierra el teclado (como el <select> nativo)
        const byTouch = pointerTypeRef.current === 'touch';
        pointerTypeRef.current = '';
        if (byTouch && inputRef.current) inputRef.current.blur();
    };

    const focusWithoutOpening = () => {
        const input = inputRef.current;
        if (!input || document.activeElement === input) return;
        suppressOpenRef.current = true;
        input.focus();
        suppressOpenRef.current = false;
    };

    const moveActive = (step) => {
        const count = visible.length;
        if (!count) return;
        let index = activeIndex;
        for (let tries = 0; tries < count; tries += 1) {
            index = index === -1 ? (step > 0 ? 0 : count - 1) : (index + step + count) % count;
            if (!visible[index].disabled) {
                scrollActiveRef.current = true;
                activeByKeyRef.current = true;
                setActiveValue(visible[index].value);
                return;
            }
        }
    };

    latestRef.current = { selectOption, closeList, open, activeValue };

    const handlePick = useCallback((option) => latestRef.current.selectOption(option), []);
    const handleHover = useCallback((option) => {
        if (option.disabled || latestRef.current.activeValue === option.value) return;
        activeByKeyRef.current = false;
        setActiveValue(option.value);
    }, []);

    const handleInputChange = (event) => {
        let text = event.target.value;
        // Cerrado, el campo muestra lo elegido: lo que se escribe al final inicia una búsqueda nueva
        if (!isOpen && selectedOption && selectedOption.label && text.length > selectedOption.label.length
            && text.startsWith(selectedOption.label)) {
            text = text.slice(selectedOption.label.length);
        }
        updateQuery(text);
        activeByKeyRef.current = false;
        setActiveValue(null);
        openList();
    };

    const handleFocus = (event) => {
        if (onFocusProp) onFocusProp(event);
        if (suppressOpenRef.current) {
            suppressOpenRef.current = false;
            return;
        }
        openList();
    };

    const handleBlur = (event) => {
        if (onBlurProp) onBlurProp(event);
        const next = event.relatedTarget;
        if (next && panelRef.current && panelRef.current.contains(next)) return;
        // Si el campo sigue siendo el activo del documento, lo que perdió el foco fue la ventana
        // (otra pestaña o app): el focus de la vuelta no debe abrir la lista sola
        if (typeof document !== 'undefined' && document.activeElement === event.target) {
            suppressOpenRef.current = true;
        }
        closeList();
    };

    const handleClick = (event) => {
        if (onClickProp) onClickProp(event);
        if (!isOpen) openList();
    };

    const handleKeyDown = (event) => {
        if (onKeyDownProp) onKeyDownProp(event);
        if (event.defaultPrevented || disabled) return;
        pointerTypeRef.current = '';
        switch (event.key) {
            case 'ArrowDown':
            case 'ArrowUp': {
                event.preventDefault();
                const step = event.key === 'ArrowDown' ? 1 : -1;
                if (!isOpen) {
                    openList();
                    const enabled = visible.filter((option) => !option.disabled);
                    let target = selectedOption && enabled.includes(selectedOption) ? selectedOption : null;
                    if (!target) target = step > 0 ? enabled[0] : enabled[enabled.length - 1];
                    activeByKeyRef.current = !!target;
                    setActiveValue(target ? target.value : null);
                    return;
                }
                moveActive(step);
                break;
            }
            case 'Enter':
                if (event.nativeEvent && event.nativeEvent.isComposing) return;
                // Como el <select>: Enter nunca envía el formulario desde este campo
                event.preventDefault();
                if (!isOpen) {
                    openList();
                    return;
                }
                if (activeIndex >= 0) selectOption(visible[activeIndex]);
                break;
            case 'Escape':
                if (isOpen) {
                    // Que no cierre también el modal que contiene al campo
                    event.preventDefault();
                    event.stopPropagation();
                    closeList();
                }
                break;
            case 'Tab':
                if (!isOpen) break;
                // Como escribir en el <select> nativo (que elige al instante): si se escribió algo o se
                // movió con las flechas, Tab elige la opción resaltada y el foco sigue (sin preventDefault).
                // Si solo se pasa por el campo, el mouse encima no cuenta: cierra sin cambiar.
                if (activeIndex >= 0 && (hasQuery || activeByKeyRef.current)) selectOption(visible[activeIndex]);
                else closeList();
                break;
            default:
                break;
        }
    };

    const handleClear = () => {
        if (disabled) return;
        if (currentValue !== '') emitChange('');
        closeList();
        // Al tocar la x en el celular no se enfoca el campo (abriría el teclado sin lista)
        const byTouch = pointerTypeRef.current === 'touch';
        pointerTypeRef.current = '';
        if (!byTouch) focusWithoutOpening();
    };

    const handleChevronMouseDown = (event) => {
        event.preventDefault();
        if (disabled) return;
        if (isOpen) {
            closeList();
            return;
        }
        if (inputRef.current && document.activeElement !== inputRef.current) inputRef.current.focus();
        else openList();
    };

    // Validación del formulario: el campo visible (primero en el DOM) lleva el mismo error, así
    // que el navegador enfoca el combobox y muestra ahí el aviso. Si algo enfoca el oculto, el foco
    // pasa al combobox. No se usa onInvalid: form.checkValidity() también lo dispara y robaría el foco.
    const focusCombobox = () => {
        if (inputRef.current && !disabled) inputRef.current.focus();
    };

    // Clic fuera (campo y lista) cierra sin cambiar el valor
    useEffect(() => {
        if (!isOpen) return undefined;
        const handlePointerDown = (event) => {
            const target = event.target;
            if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return;
            latestRef.current.closeList();
        };
        document.addEventListener('mousedown', handlePointerDown);
        return () => document.removeEventListener('mousedown', handlePointerDown);
    }, [isOpen]);

    // Posición de la lista: al abrir y en cada scroll (de cualquier contenedor) o cambio de tamaño
    useLayoutEffect(() => {
        if (!isOpen) return undefined;
        let frame = 0;
        const update = () => {
            frame = 0;
            const next = computePanelPosition(inputRef.current);
            setPosition((prev) => (samePosition(prev, next) ? prev : next));
        };
        const schedule = (event) => {
            if (event && event.type === 'scroll' && panelRef.current && event.target instanceof Node
                && panelRef.current.contains(event.target)) return;
            if (!frame) frame = requestFrame(update);
        };
        update();
        const viewport = window.visualViewport;
        window.addEventListener('scroll', schedule, true);
        window.addEventListener('resize', schedule);
        if (viewport) {
            viewport.addEventListener('resize', schedule);
            viewport.addEventListener('scroll', schedule);
        }
        return () => {
            if (frame) cancelFrame(frame);
            window.removeEventListener('scroll', schedule, true);
            window.removeEventListener('resize', schedule);
            if (viewport) {
                viewport.removeEventListener('resize', schedule);
                viewport.removeEventListener('scroll', schedule);
            }
        };
    }, [isOpen]);

    // Cada búsqueda nueva empieza arriba de la lista (la primera coincidencia es la activa)
    useEffect(() => {
        if (isOpen && listRef.current) listRef.current.scrollTop = 0;
    }, [isOpen, currentQuery]);

    // La opción activa por teclado (o la elegida al abrir) queda a la vista dentro de la lista.
    // Solo con la lista ya dimensionada (position): sin max-height la <ul> no tiene scroll propio.
    useEffect(() => {
        if (!isOpen || !position || !activeOptionId || !scrollActiveRef.current) return;
        scrollActiveRef.current = false;
        const node = document.getElementById(activeOptionId);
        if (node && typeof node.scrollIntoView === 'function') node.scrollIntoView({ block: 'nearest' });
    }, [isOpen, position, activeOptionId]);

    useEffect(() => {
        if (disabled && latestRef.current.open) latestRef.current.closeList();
    }, [disabled]);

    // El campo visible avisa (mensaje del navegador) cuando es obligatorio y no hay nada elegido
    useEffect(() => {
        const input = inputRef.current;
        if (!input || typeof input.setCustomValidity !== 'function') return;
        input.setCustomValidity(required && !disabled && currentValue === '' ? requiredMessage : '');
    }, [required, disabled, currentValue, requiredMessage]);

    // Limpiar manda '': solo si el <select> original también podía (opción vacía) o se pide clearable
    const showClear = !disabled && !required && currentValue !== '' && (clearable === true || emptyLabel !== null);
    const displayValue = isOpen ? currentQuery : (selectedOption ? selectedOption.label : '');
    const tokensKey = tokens.join(' ');
    const hiddenCount = filtered.length - visible.length;

    let liveMessage = '';
    if (isOpen) {
        if (loading && filtered.length === 0) liveMessage = loadingText;
        else if (filtered.length === 0) liveMessage = noResultsText;
        else {
            liveMessage = `${filtered.length} ${filtered.length === 1 ? 'resultado disponible' : 'resultados disponibles'}`;
            if (hiddenCount > 0) liveMessage += `; se muestran ${visible.length}`;
        }
    }

    const extraClasses = String(className || '').split(/\s+/)
        .filter((cls) => cls && !IGNORED_ROOT_CLASSES.includes(cls));
    const rootClassName = [
        'ui-combobox',
        isOpen && 'is-open',
        disabled && 'is-disabled',
        currentValue !== '' && 'has-value',
        showClear && 'has-clear',
        ...extraClasses,
    ].filter(Boolean).join(' ');

    let panelStyle = { top: 0, left: 0 };
    if (position) {
        panelStyle = position.placement === 'top'
            ? { bottom: position.bottom, left: position.left, width: position.width, maxHeight: position.maxHeight }
            : { top: position.top, left: position.left, width: position.width, maxHeight: position.maxHeight };
    }
    const listNameProps = ariaLabelledby
        ? { 'aria-labelledby': ariaLabelledby }
        : { 'aria-label': listLabel || ariaLabel || 'Opciones' };

    const panel = isOpen && typeof document !== 'undefined' ? createPortal(
        <div
            ref={panelRef}
            className={`ui-combobox-panel${position?.placement === 'top' ? ' is-top' : ''}`}
            style={panelStyle}
            // Mantener el foco en el campo (y que el clic no llegue a lo que hay detrás)
            onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
            onPointerDown={(event) => { pointerTypeRef.current = event.pointerType || ''; }}
            onClick={(event) => event.stopPropagation()}
        >
            {loading && (
                <div className="ui-combobox-status">
                    <span className="ui-spinner ui-spinner--sm" aria-hidden="true" />
                    {loadingText}
                </div>
            )}
            <ul ref={listRef} id={listId} role="listbox" className="ui-combobox-list" aria-busy={loading || undefined} {...listNameProps}>
                {visible.map((option, index) => (
                    <ComboboxOption
                        key={option.key}
                        id={`${listId}-${index}`}
                        option={option}
                        active={index === activeIndex}
                        selected={option === selectedOption}
                        tokensKey={tokensKey}
                        onPick={handlePick}
                        onHover={handleHover}
                    />
                ))}
            </ul>
            {!loading && filtered.length === 0 && (
                <div className="ui-combobox-status ui-combobox-empty">
                    <span className="material-icons-round" aria-hidden="true">search_off</span>
                    {noResultsText}
                </div>
            )}
            {hiddenCount > 0 && (
                <div className="ui-combobox-footer">
                    {`Mostrando ${visible.length} de ${filtered.length}. Escribe para filtrar.`}
                </div>
            )}
        </div>,
        portalNode || document.body
    ) : null;

    return (
        <div ref={rootRef} className={rootClassName} style={style}>
            <div className="ui-combobox-control">
                <span className="material-icons-round ui-combobox-icon" aria-hidden="true">search</span>
                <input
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    {...inputProps}
                    ref={inputRef}
                    id={inputId}
                    type="text"
                    role="combobox"
                    className={`ui-combobox-input${inputClassName ? ` ${inputClassName}` : ''}`}
                    value={displayValue}
                    placeholder={isOpen ? searchPlaceholder : placeholder}
                    disabled={disabled}
                    aria-label={ariaLabel}
                    aria-labelledby={ariaLabelledby}
                    aria-required={required || undefined}
                    aria-expanded={isOpen}
                    aria-controls={isOpen ? listId : undefined}
                    aria-autocomplete="list"
                    aria-activedescendant={activeOptionId}
                    onChange={handleInputChange}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    onClick={handleClick}
                    onKeyDown={handleKeyDown}
                />
                {showClear && (
                    <button
                        type="button"
                        className="ui-combobox-clear"
                        aria-label="Limpiar selección"
                        title="Limpiar selección"
                        onPointerDown={(event) => { pointerTypeRef.current = event.pointerType || ''; }}
                        onKeyDown={() => { pointerTypeRef.current = ''; }}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={handleClear}
                    >
                        <span className="material-icons-round" aria-hidden="true">close</span>
                    </button>
                )}
                <span
                    className="material-icons-round ui-combobox-chevron"
                    aria-hidden="true"
                    onMouseDown={handleChevronMouseDown}
                >
                    expand_more
                </span>
            </div>
            {(required || name) && (
                <input
                    className="ui-combobox-native"
                    type="text"
                    tabIndex={-1}
                    aria-hidden="true"
                    autoComplete="off"
                    name={name}
                    value={currentValue}
                    required={required}
                    disabled={disabled}
                    onChange={noop}
                    onFocus={focusCombobox}
                />
            )}
            <div className="ui-sr-only" aria-live="polite" aria-atomic="true">{liveMessage}</div>
            {panel}
        </div>
    );
}
