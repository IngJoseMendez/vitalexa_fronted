import { useState, useEffect, useCallback, useRef } from 'react';
import productService from '../api/productService';
import { useToast } from '../components/ToastContainer';
import NotificationService from '../services/NotificationService';
import { bodegaInfo } from '../utils/inventoryMovements';
import usePersistentState from '../hooks/usePersistentState';
import '../styles/EmpacadorDashboard.css';

// Preferencias de CÓMO VER el inventario que se recuerdan (usePersistentState): exactamente las
// opciones de cada control; lo guardado que no esté aquí vuelve al valor por defecto.
const VIEW_MODE_OPTIONS = ['cards', 'list']; // botones "Vista tarjetas" / "Vista lista"
const SORT_OPTIONS = ['nombre', 'stock_desc', 'stock_asc', 'alerta']; // select "Ordenar productos"

// ============================================================
//  EMPACADOR DASHBOARD — Solo visor de inventario (mobile-first)
// ============================================================

function EmpacadorDashboard() {
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [lastUpdate, setLastUpdate] = useState(new Date());

    useEffect(() => {
        // Al desmontar se quita solo este oyente: la conexión es compartida con la campana
        return NotificationService.connect((notification) => {
            if (notification.type === 'INVENTORY_UPDATE') {
                console.log('📦 Inventory update received, refreshing...');
                setRefreshTrigger(Date.now());
                setLastUpdate(new Date());
            }
        }, 'empacador');
    }, []);

    const handleRefresh = () => {
        setRefreshTrigger(Date.now());
        setLastUpdate(new Date());
    };

    return (
        <div className="emp-dashboard">
            {/* ── Encabezado de página ── */}
            <header className="emp-topbar">
                <div className="emp-topbar-left">
                    <span className="material-icons-round emp-logo-icon" aria-hidden="true">inventory_2</span>
                    <div className="emp-topbar-heading">
                        <h1 className="emp-title">Inventario</h1>
                        <p className="emp-subtitle">
                            Actualizado: {lastUpdate.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                    </div>
                </div>
                <button
                    type="button"
                    className="emp-refresh-btn ui-icon-btn ui-icon-btn--bordered ui-icon-btn--lg"
                    onClick={handleRefresh}
                    title="Actualizar inventario"
                    aria-label="Actualizar inventario"
                >
                    <span className="material-icons-round" aria-hidden="true">sync</span>
                </button>
            </header>

            {/* ── Main Content ──
                Actualización silenciosa: con cada INVENTORY_UPDATE o "Actualizar" el panel vuelve
                a pedir el inventario y lo reemplaza en su lugar (antes key={refreshTrigger} lo
                montaba de cero: se borraba la búsqueda, filtros, vista y orden, y el scroll
                volvía arriba). */}
            <main className="emp-main">
                <InventarioPanel refreshTrigger={refreshTrigger} onRefresh={handleRefresh} />
            </main>
        </div>
    );
}

// ============================================================
//  PANEL PRINCIPAL DE INVENTARIO
// ============================================================
function InventarioPanel({ refreshTrigger }) {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('all');   // 'all' | 'alerts' | 'committed' (no se recuerda)
    // Vista y orden se recuerdan al recargar (por usuario); la búsqueda y el filtro no
    const [viewMode, setViewMode] = usePersistentState('empacador.inventory.view', 'cards', {
        allowed: VIEW_MODE_OPTIONS,
        sync: true,
    });
    const [sortBy, setSortBy] = usePersistentState('empacador.inventory.sort', 'nombre', {
        allowed: SORT_OPTIONS,
        sync: true,
    });
    const toast = useToast();
    // Recarga silenciosa: solo la última petición aplica su respuesta (ráfagas de
    // INVENTORY_UPDATE) y el esqueleto solo se ve en la carga inicial
    const reqRef = useRef(0);
    const loadedRef = useRef(false);

    const fetchInventario = useCallback(async () => {
        const reqId = ++reqRef.current;
        if (!loadedRef.current) setLoading(true);
        try {
            // Endpoint propio del empacador (requiere ROLE_EMPACADOR)
            const response = await productService.getStockReportForEmpacador();
            if (reqId !== reqRef.current) return; // llegó una petición más nueva
            setItems(response.data || []);
        } catch (error) {
            if (reqId !== reqRef.current) return;
            // Si falla, el inventario que ya se ve se conserva (el aviso es el mismo de antes)
            console.error('Error al cargar inventario:', error);
            toast.error('Error al cargar inventario: ' + (error.response?.data?.message || error.message));
        } finally {
            if (reqId === reqRef.current) {
                loadedRef.current = true;
                setLoading(false);
            }
        }
    }, [toast]);

    useEffect(() => {
        fetchInventario();
    }, [fetchInventario, refreshTrigger]);

    // ── Derived data ──
    const totalProductos = items.length;
    const alertasCriticas = items.filter(i => i.alertaCritica || i.stockEnBD < 0).length;
    const conComprometido = items.filter(i => i.stockComprometido > 0).length;
    // Unidades en bodega: cada producto aporta su bodega (nunca negativa), así un faltante no
    // descuenta unidades de otros productos del total
    const totalUnidades = items.reduce((acc, i) => acc + getBodega(i), 0);
    const conFaltante = items.filter(i => bodegaInfo(i).faltante > 0).length;

    // ── Filter ──
    let filtered = items.filter(i => {
        if (filter === 'alerts') return i.alertaCritica || i.stockEnBD < 0;
        if (filter === 'committed') return i.stockComprometido > 0;
        return true;
    });

    // ── Search ──
    if (search.trim()) {
        filtered = filtered.filter(i =>
            (i.nombre || '').toLowerCase().includes(search.toLowerCase())
        );
    }

    // ── Sort ──
    filtered = [...filtered].sort((a, b) => {
        if (sortBy === 'stock_asc') {
            const fa = getBodega(a), fb = getBodega(b);
            return fa - fb;
        }
        if (sortBy === 'stock_desc') {
            const fa = getBodega(a), fb = getBodega(b);
            return fb - fa;
        }
        if (sortBy === 'alerta') {
            return (b.alertaCritica ? 1 : 0) - (a.alertaCritica ? 1 : 0);
        }
        return (a.nombre || '').localeCompare(b.nombre || '');
    });

    return (
        <div className="emp-inv-panel">

            {/* ── Summary Cards ── */}
            <div className="emp-stats-row">
                <StatCard icon="category" label="Productos" value={totalProductos} tone="primary" />
                <StatCard icon="layers" label="Unidades en bodega" value={totalUnidades} tone="teal" />
                <StatCard
                    icon="warning_amber"
                    label="Alertas"
                    value={alertasCriticas}
                    tone={alertasCriticas > 0 ? 'danger' : 'success'}
                    onClick={() => setFilter(filter === 'alerts' ? 'all' : 'alerts')}
                    active={filter === 'alerts'}
                />
                <StatCard
                    icon="local_shipping"
                    label="En Pedidos"
                    value={conComprometido}
                    tone="warning"
                    onClick={() => setFilter(filter === 'committed' ? 'all' : 'committed')}
                    active={filter === 'committed'}
                />
            </div>

            {/* ── Controls ── */}
            <div className="emp-controls">
                {/* Buscador */}
                <div className="emp-search-wrap ui-search">
                    <span className="material-icons-round ui-search-icon emp-search-icon" aria-hidden="true">search</span>
                    <input
                        className="emp-search-input ui-input"
                        type="text"
                        placeholder="Buscar producto..."
                        aria-label="Buscar producto"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                    {search && (
                        <button
                            type="button"
                            className="emp-clear-btn ui-icon-btn ui-search-clear"
                            onClick={() => setSearch('')}
                            aria-label="Limpiar búsqueda"
                        >
                            <span className="material-icons-round" aria-hidden="true">close</span>
                        </button>
                    )}
                </div>

                {/* Fila de controles secundarios */}
                <div className="emp-controls-row">
                    {/* Filtros rápidos */}
                    <div className="emp-filter-chips">
                        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} icon="apps">Todos</FilterChip>
                        <FilterChip active={filter === 'alerts'} danger onClick={() => setFilter(filter === 'alerts' ? 'all' : 'alerts')} icon="error_outline">
                            Alertas {alertasCriticas > 0 && `(${alertasCriticas})`}
                        </FilterChip>
                        <FilterChip active={filter === 'committed'} warning onClick={() => setFilter(filter === 'committed' ? 'all' : 'committed')} icon="local_shipping">
                            En pedidos {conComprometido > 0 && `(${conComprometido})`}
                        </FilterChip>
                    </div>

                    {/* Sort + View toggle */}
                    <div className="emp-right-controls">
                        <select
                            className="emp-sort-select ui-select"
                            aria-label="Ordenar productos"
                            value={sortBy}
                            onChange={e => setSortBy(e.target.value)}
                        >
                            <option value="nombre">A → Z</option>
                            <option value="stock_desc">Mayor stock</option>
                            <option value="stock_asc">Menor stock</option>
                            <option value="alerta">Alertas primero</option>
                        </select>

                        <div className="emp-view-toggle ui-tabs">
                            <button
                                type="button"
                                className={`ui-tab${viewMode === 'cards' ? ' active is-active' : ''}`}
                                onClick={() => setViewMode('cards')}
                                title="Vista tarjetas"
                                aria-label="Vista tarjetas"
                                aria-pressed={viewMode === 'cards'}
                            >
                                <span className="material-icons-round" aria-hidden="true">grid_view</span>
                            </button>
                            <button
                                type="button"
                                className={`ui-tab${viewMode === 'list' ? ' active is-active' : ''}`}
                                onClick={() => setViewMode('list')}
                                title="Vista lista"
                                aria-label="Vista lista"
                                aria-pressed={viewMode === 'list'}
                            >
                                <span className="material-icons-round" aria-hidden="true">view_list</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Contador de resultados */}
                <p className="emp-result-count" aria-live="polite">
                    {loading ? 'Cargando...' : `${filtered.length} producto${filtered.length !== 1 ? 's' : ''}`}
                    {filter !== 'all' || search ? (
                        <button
                            type="button"
                            className="emp-reset-filter ui-btn ui-btn--ghost ui-btn--sm"
                            onClick={() => { setFilter('all'); setSearch(''); }}
                        >
                            Limpiar filtros
                        </button>
                    ) : null}
                </p>
            </div>

            {/* ── Content ── */}
            {loading ? (
                // Esqueletos con la forma de las tarjetas; el texto queda para lectores de pantalla
                <div className="emp-loading emp-skeleton-grid" role="status" aria-busy="true">
                    <p className="ui-sr-only">Cargando inventario...</p>
                    {[0, 1, 2, 3, 4, 5].map(i => (
                        <div key={i} className="emp-skeleton-card" aria-hidden="true">
                            <span className="ui-skeleton ui-skeleton--title" />
                            <span className="ui-skeleton ui-skeleton--text emp-skeleton-short" />
                            <span className="ui-skeleton emp-skeleton-bar" />
                            <span className="ui-skeleton ui-skeleton--text" />
                            <span className="ui-skeleton ui-skeleton--text" />
                        </div>
                    ))}
                </div>
            ) : filtered.length === 0 ? (
                <div className={`emp-empty ui-empty${filter === 'alerts' ? ' emp-empty--ok' : ''}`}>
                    <span className="material-icons-round ui-empty-icon" aria-hidden="true">
                        {filter === 'alerts' ? 'check_circle' : 'search_off'}
                    </span>
                    <p className="ui-empty-title">
                        {filter === 'alerts'
                            ? '¡Sin alertas críticas! Inventario en orden.'
                            : search
                                ? `Sin resultados para "${search}"`
                                : 'No hay productos en inventario.'}
                    </p>
                </div>
            ) : viewMode === 'cards' ? (
                <div className="emp-cards-grid ui-stagger">
                    {filtered.map(item => (
                        <ProductCardMobile key={item.productId} item={item} />
                    ))}
                </div>
            ) : (
                <div className="emp-list ui-stagger">
                    {filtered.map(item => (
                        <ProductRowMobile key={item.productId} item={item} />
                    ))}
                </div>
            )}

            {/* ── Leyenda ── */}
            {!loading && filtered.length > 0 && (
                <div className="emp-legend">
                    <span className="emp-legend-item">
                        <span className="material-icons-round emp-legend-icon emp-fg--danger" aria-hidden="true">circle</span>
                        Stock negativo
                    </span>
                    <span className="emp-legend-item">
                        <span className="material-icons-round emp-legend-icon emp-fg--warning" aria-hidden="true">circle</span>
                        Stock = 0
                    </span>
                    <span className="emp-legend-item">
                        <span className="material-icons-round emp-legend-icon emp-fg--success" aria-hidden="true">circle</span>
                        Stock positivo
                    </span>
                    <span className="emp-legend-item">
                        <span className="material-icons-round emp-legend-icon emp-fg--warning" aria-hidden="true">local_shipping</span>
                        En pedidos activos
                    </span>
                    {conFaltante > 0 && (
                        <span className="emp-legend-item">
                            <span className="material-icons-round emp-legend-icon emp-fg--warning" aria-hidden="true">report_problem</span>
                            {conFaltante} con unidades por registrar (bodega en 0)
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// Bodega nunca negativa: si el cálculo da menos de 0 se muestra 0 y "faltan N por registrar"
function getBodega(item) {
    return bodegaInfo(item).bodega;
}

function FaltanteNote({ item }) {
    const { faltante } = bodegaInfo(item);
    if (faltante <= 0) return null;
    return (
        <div className="emp-faltante">
            faltan {faltante} por registrar
        </div>
    );
}

// Tono (color con significado) del stock del sistema: negativo, en cero o positivo
function getSistemaTone(val) {
    if (val < 0) return 'danger';
    if (val === 0) return 'warning';
    return 'success';
}

function getSistemaIcon(val) {
    if (val < 0) return <span className="material-icons-round emp-sys-icon emp-fg--danger" aria-hidden="true">cancel</span>;
    if (val === 0) return <span className="material-icons-round emp-sys-icon emp-fg--warning" aria-hidden="true">warning_amber</span>;
    return <span className="material-icons-round emp-sys-icon emp-fg--success" aria-hidden="true">check_circle</span>;
}

// ── Sub-componentes ───────────────────────────────────────────────────────────

// Color de la cifra según el tono de la tarjeta (mismo significado que su baldosa)
const STAT_VALUE_TONE = {
    primary: 'ui-text-primary',
    success: 'ui-text-success',
    warning: 'ui-text-warning',
    danger: 'ui-text-danger',
    teal: 'emp-fg--teal',
};

function StatCard({ icon, label, value, tone = 'primary', onClick, active }) {
    return (
        <div
            className={`emp-stat-card ui-stat${onClick ? ' clickable' : ''}${active ? ' active' : ''}`}
            onClick={onClick}
        >
            <span className={`ui-stat-icon${tone !== 'primary' ? ` ui-stat-icon--${tone}` : ''}`} aria-hidden="true">
                <span className="material-icons-round emp-stat-icon">{icon}</span>
            </span>
            <div className="ui-stat-content">
                <div className={`emp-stat-value ui-stat-value ${STAT_VALUE_TONE[tone] || ''}`}>{value}</div>
                <div className="emp-stat-label ui-stat-label">{label}</div>
            </div>
        </div>
    );
}

function FilterChip({ active, danger, warning, onClick, icon, children }) {
    let cls = 'emp-chip';
    if (active && danger) cls += ' active-danger';
    else if (active && warning) cls += ' active-warning';
    else if (active) cls += ' active';
    return (
        <button type="button" className={cls} onClick={onClick} aria-pressed={!!active}>
            {icon && <span className="material-icons-round" aria-hidden="true">{icon}</span>}
            {children}
        </button>
    );
}

// Vista TARJETAS (2 columnas en móvil)
function ProductCardMobile({ item }) {
    const bodega = getBodega(item);
    const sistema = item.stockEnBD;
    const comprometido = item.stockComprometido || 0;
    const isCritical = item.alertaCritica || sistema < 0;
    const hasCommitted = comprometido > 0;

    // Barra de stock visual
    const maxStock = Math.max(bodega, 1);
    const pct = Math.min(100, Math.max(0, (bodega / maxStock) * 100));
    // Mismo criterio de color que antes, con los tonos del sistema (bodega < 5 = advertencia)
    const barTone = sistema < 0 ? 'danger' : sistema === 0 ? 'warning' : bodega < 5 ? 'warning' : 'success';

    return (
        <div className={`emp-pcard ui-stripe ui-stripe--${isCritical ? 'danger' : barTone}${isCritical ? ' critical' : hasCommitted ? ' committed' : ''}`}>
            {/* Status badge */}
            {isCritical && (
                <span className="emp-badge danger ui-badge ui-badge--danger">
                    <span className="material-icons-round" aria-hidden="true">error</span>
                    Alerta
                </span>
            )}
            {!isCritical && hasCommitted && (
                <span className="emp-badge warning ui-badge ui-badge--warning">
                    <span className="material-icons-round" aria-hidden="true">local_shipping</span>
                    Pedidos
                </span>
            )}

            <div className="emp-pcard-name">{item.nombre}</div>
            <div className="emp-pcard-id">{item.productId?.substring(0, 8)}…</div>

            {/* Barra visual */}
            <div className="emp-stock-bar-wrap" aria-hidden="true">
                <div className={`emp-stock-bar ui-progress ui-progress--${barTone}`} style={{ '--value': pct }}>
                    <span className="emp-stock-fill ui-progress-bar" />
                </div>
            </div>

            {/* Números */}
            <div className="emp-pcard-nums">
                <div className="emp-pcard-num">
                    <span className="emp-num-label">Bodega</span>
                    <span className={`emp-num-value emp-fg--${barTone}`}>{bodega}</span>
                </div>
                {hasCommitted && (
                    <div className="emp-pcard-num">
                        <span className="emp-num-label">Pedidos</span>
                        <span className="emp-num-value emp-fg--warning">{comprometido}</span>
                    </div>
                )}
                <div className="emp-pcard-num">
                    <span className="emp-num-label">Sistema</span>
                    <span className={`emp-num-value emp-fg--${getSistemaTone(sistema)}`}>
                        {getSistemaIcon(sistema)} {sistema}
                    </span>
                </div>
            </div>
            <FaltanteNote item={item} />
        </div>
    );
}

// Vista LISTA (más compacta, buena para auditar rápido)
function ProductRowMobile({ item }) {
    const bodega = getBodega(item);
    const sistema = item.stockEnBD;
    const comprometido = item.stockComprometido || 0;
    const isCritical = item.alertaCritica || sistema < 0;

    return (
        <div className={`emp-prow${isCritical ? ' critical' : comprometido > 0 ? ' committed' : ''}`}>
            <div className="emp-prow-left">
                <div className={`emp-prow-dot emp-bg--${getSistemaTone(sistema)}`} aria-hidden="true" />
                <div className="emp-prow-text">
                    <div className="emp-prow-name">{item.nombre}</div>
                    <div className="emp-prow-id">{item.productId?.substring(0, 8)}…</div>
                    <FaltanteNote item={item} />
                </div>
            </div>
            <div className="emp-prow-nums">
                <span className="emp-prow-badge bodega" title="Bodega">{bodega}</span>
                {comprometido > 0 && (
                    <span className="emp-prow-badge ped" title="En pedidos">
                        <span className="material-icons-round" aria-hidden="true">local_shipping</span>
                        {comprometido}
                    </span>
                )}
                <span className={`emp-prow-badge sistema emp-fg--${getSistemaTone(sistema)}`} title="Sistema">
                    {getSistemaIcon(sistema)}{sistema}
                </span>
            </div>
        </div>
    );
}

export default EmpacadorDashboard;
