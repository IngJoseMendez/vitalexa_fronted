import { useState, useEffect, useRef, useId } from 'react';
import client from '../api/client';
import { normalizeSearchText } from '../utils/promotionFilters';
import '../styles/SpecialProducts.css';
import '../styles/VendorMultiSelect.css';

// Usuarias que el backend trata como una sola (UserUnificationUtil): comparten asignación
const SHARED_VENDOR_USERNAMES = ['ninatorres', 'yicelasandoval'];

/**
 * Selector múltiple de vendedoras (extraído de SpecialProductFormModal).
 * Carga la lista desde GET /admin/clients/vendedores ({ id, username }).
 *
 * - selectedIds: ids (UUID) seleccionados.
 * - onChange(ids): nueva lista de ids.
 * - nameHints: { [id]: username } para mostrar ids que ya no vienen en la lista
 *   (p.ej. una usuaria que dejó de ser VENDEDOR); así el admin puede verlos y quitarlos.
 * - emptyWarning: aviso cuando no hay ninguna seleccionada.
 * - sharedUsersHint: avisa que NinaTorres y YicelaSandoval comparten asignación.
 */
export default function VendorMultiSelect({
    selectedIds = [],
    onChange,
    nameHints = {},
    label = 'Vendedoras asignadas',
    placeholder = 'Seleccionar vendedoras...',
    emptyWarning,
    sharedUsersHint = false,
    disabled = false,
}) {
    const [vendedores, setVendedores] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const wrapperRef = useRef(null);
    const labelId = useId();

    useEffect(() => {
        let cancelled = false;
        const fetchVendors = async () => {
            try {
                const res = await client.get('/admin/clients/vendedores');
                if (!cancelled) setVendedores(Array.isArray(res?.data) ? res.data : []);
            } catch (err) {
                console.error('Error cargando vendedoras:', err);
                if (!cancelled) setLoadError(true);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        fetchVendors();
        return () => { cancelled = true; };
    }, []);

    // Cerrar al hacer clic fuera o con Escape
    useEffect(() => {
        if (!open) return undefined;
        const onMouseDown = (e) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
        };
        const onKeyDown = (e) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onMouseDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onMouseDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    const toggleVendor = (vendorId) => {
        if (disabled || !onChange) return;
        onChange(selectedIds.includes(vendorId)
            ? selectedIds.filter(id => id !== vendorId)
            : [...selectedIds, vendorId]);
    };

    const nameFor = (id) =>
        vendedores.find(v => v.id === id)?.username || nameHints[id] || 'Vendedora no disponible';

    const toggleOpen = () => { if (!disabled) setOpen(prev => !prev); };

    const term = normalizeSearchText(search);
    const filteredVendors = vendedores.filter(v => !term || normalizeSearchText(v.username).includes(term));

    const hasSharedSelected = selectedIds.some(id =>
        SHARED_VENDOR_USERNAMES.includes(String(nameFor(id)).toLowerCase()));

    return (
        <div className="vms" ref={wrapperRef}>
            {label && <span id={labelId} className="vms-label">{label}</span>}
            <div className="sp-vendor-wrapper vms-wrapper">
                <div
                    role="button"
                    tabIndex={disabled ? -1 : 0}
                    aria-labelledby={label ? labelId : undefined}
                    aria-haspopup="listbox"
                    aria-expanded={open}
                    aria-disabled={disabled || undefined}
                    className={`sp-vendor-select vms-control${disabled ? ' is-disabled' : ''}${open ? ' is-open' : ''}`}
                    onClick={toggleOpen}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleOpen(); }
                    }}
                >
                    {selectedIds.length === 0 && (
                        <span className="vms-placeholder">{loading ? 'Cargando vendedoras...' : placeholder}</span>
                    )}
                    {selectedIds.map(id => {
                        const name = nameFor(id);
                        return (
                            <span key={id} className="sp-vendor-tag">
                                {name}
                                {!disabled && (
                                    <button
                                        type="button"
                                        aria-label={`Quitar ${name}`}
                                        onClick={e => { e.stopPropagation(); toggleVendor(id); }}
                                    >
                                        <span className="material-icons-round" style={{ fontSize: '14px' }}>close</span>
                                    </button>
                                )}
                            </span>
                        );
                    })}
                    <span className="material-icons-round vms-caret" aria-hidden="true">
                        {open ? 'expand_less' : 'expand_more'}
                    </span>
                </div>

                {open && (
                    <div className="sp-vendor-dropdown vms-dropdown" role="listbox" aria-multiselectable="true">
                        <div className="vms-filter">
                            <input
                                type="text"
                                placeholder="Filtrar vendedoras..."
                                aria-label="Filtrar vendedoras"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                autoFocus
                            />
                        </div>
                        {filteredVendors.map(v => {
                            const selected = selectedIds.includes(v.id);
                            return (
                                <div
                                    key={v.id}
                                    role="option"
                                    tabIndex={0}
                                    aria-selected={selected}
                                    className={`sp-vendor-dropdown-item vms-option${selected ? ' selected' : ''}`}
                                    onClick={() => toggleVendor(v.id)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleVendor(v.id); }
                                    }}
                                >
                                    <span className="material-icons-round vms-check" aria-hidden="true">
                                        {selected ? 'check_box' : 'check_box_outline_blank'}
                                    </span>
                                    {v.username}
                                </div>
                            );
                        })}
                        {!loading && filteredVendors.length === 0 && (
                            <div className="vms-empty">Sin resultados</div>
                        )}
                    </div>
                )}
            </div>

            {loadError && (
                <p className="vms-message vms-error">No se pudo cargar la lista de vendedoras. Cierra y vuelve a abrir el formulario.</p>
            )}
            {emptyWarning && selectedIds.length === 0 && (
                <p className="vms-message vms-warning">
                    <span className="material-icons-round" aria-hidden="true">warning_amber</span>
                    {emptyWarning}
                </p>
            )}
            {sharedUsersHint && hasSharedSelected && (
                <p className="vms-message vms-hint">
                    <span className="material-icons-round" aria-hidden="true">info</span>
                    NinaTorres y YicelaSandoval comparten asignación: si eliges una, la otra también la verá.
                </p>
            )}
        </div>
    );
}
