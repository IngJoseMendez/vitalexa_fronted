import { useState, useEffect, useCallback } from 'react';
import productService from '../api/productService';
import { useToast } from '../components/ToastContainer';
import NotificationService from '../services/NotificationService';
import '../styles/EmpacadorDashboard.css';

// ============================================================
//  EMPACADOR DASHBOARD — Solo visor de inventario (mobile-first)
// ============================================================

function EmpacadorDashboard() {
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [lastUpdate, setLastUpdate] = useState(new Date());

    useEffect(() => {
        NotificationService.connect((notification) => {
            if (notification.type === 'INVENTORY_UPDATE') {
                console.log('📦 Inventory update received, refreshing...');
                setRefreshTrigger(Date.now());
                setLastUpdate(new Date());
            }
        }, 'empacador');
        return () => NotificationService.disconnect();
    }, []);

    const handleRefresh = () => {
        setRefreshTrigger(Date.now());
        setLastUpdate(new Date());
    };

    return (
        <div className="emp-dashboard">
            {/* ── Top Bar ── */}
            <header className="emp-topbar">
                <div className="emp-topbar-left">
                    <span className="material-icons-round emp-logo-icon">inventory_2</span>
                    <div>
                        <h1 className="emp-title">Inventario</h1>
                        <p className="emp-subtitle">
                            Actualizado: {lastUpdate.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                    </div>
                </div>
                <button className="emp-refresh-btn" onClick={handleRefresh} title="Actualizar inventario">
                    <span className="material-icons-round">sync</span>
                </button>
            </header>

            {/* ── Main Content ── */}
            <main className="emp-main">
                <InventarioPanel key={refreshTrigger} onRefresh={handleRefresh} />
            </main>
        </div>
    );
}

// ============================================================
//  PANEL PRINCIPAL DE INVENTARIO
// ============================================================
function InventarioPanel() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('all');   // 'all' | 'alerts' | 'committed'
    const [viewMode, setViewMode] = useState('cards'); // 'cards' | 'list'
    const [sortBy, setSortBy] = useState('nombre'); // 'nombre' | 'stock_asc' | 'stock_desc' | 'alerta'
    const toast = useToast();

    const fetchInventario = useCallback(async () => {
        setLoading(true);
        try {
            // Endpoint propio del empacador (requiere ROLE_EMPACADOR)
            const response = await productService.getStockReportForEmpacador();
            setItems(response.data || []);
        } catch (error) {
            console.error('Error al cargar inventario:', error);
            toast.error('Error al cargar inventario: ' + (error.response?.data?.message || error.message));
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        fetchInventario();
    }, [fetchInventario]);

    // ── Derived data ──
    const totalProductos = items.length;
    const alertasCriticas = items.filter(i => i.alertaCritica || i.stockEnBD < 0).length;
    const conComprometido = items.filter(i => i.stockComprometido > 0).length;
    const totalUnidades = items.reduce((acc, i) => {
        const f = i.stockFisicoReal != null
            ? i.stockFisicoReal
            : (Number(i.stockEnBD) || 0) + (Number(i.stockComprometido) || 0);
        return acc + f;
    }, 0);

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
                <StatCard icon="category" label="Productos" value={totalProductos} color="#6366f1" bg="#eef2ff" />
                <StatCard icon="layers" label="Total Unidades" value={totalUnidades} color="#0ea5e9" bg="#e0f2fe" />
                <StatCard
                    icon="warning_amber"
                    label="Alertas"
                    value={alertasCriticas}
                    color={alertasCriticas > 0 ? '#dc2626' : '#16a34a'}
                    bg={alertasCriticas > 0 ? '#fef2f2' : '#f0fdf4'}
                    onClick={() => setFilter(filter === 'alerts' ? 'all' : 'alerts')}
                    active={filter === 'alerts'}
                />
                <StatCard
                    icon="local_shipping"
                    label="En Pedidos"
                    value={conComprometido}
                    color="#d97706"
                    bg="#fffbeb"
                    onClick={() => setFilter(filter === 'committed' ? 'all' : 'committed')}
                    active={filter === 'committed'}
                />
            </div>

            {/* ── Controls ── */}
            <div className="emp-controls">
                {/* Buscador */}
                <div className="emp-search-wrap">
                    <span className="material-icons-round emp-search-icon">search</span>
                    <input
                        className="emp-search-input"
                        type="text"
                        placeholder="Buscar producto..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                    {search && (
                        <button className="emp-clear-btn" onClick={() => setSearch('')}>
                            <span className="material-icons-round">close</span>
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
                            className="emp-sort-select"
                            value={sortBy}
                            onChange={e => setSortBy(e.target.value)}
                        >
                            <option value="nombre">A → Z</option>
                            <option value="stock_desc">Mayor stock</option>
                            <option value="stock_asc">Menor stock</option>
                            <option value="alerta">Alertas primero</option>
                        </select>

                        <div className="emp-view-toggle">
                            <button
                                className={viewMode === 'cards' ? 'active' : ''}
                                onClick={() => setViewMode('cards')}
                                title="Vista tarjetas"
                            >
                                <span className="material-icons-round">grid_view</span>
                            </button>
                            <button
                                className={viewMode === 'list' ? 'active' : ''}
                                onClick={() => setViewMode('list')}
                                title="Vista lista"
                            >
                                <span className="material-icons-round">view_list</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Contador de resultados */}
                <p className="emp-result-count">
                    {loading ? 'Cargando...' : `${filtered.length} producto${filtered.length !== 1 ? 's' : ''}`}
                    {filter !== 'all' || search ? (
                        <button className="emp-reset-filter" onClick={() => { setFilter('all'); setSearch(''); }}>
                            Limpiar filtros
                        </button>
                    ) : null}
                </p>
            </div>

            {/* ── Content ── */}
            {loading ? (
                <div className="emp-loading">
                    <span className="material-icons-round emp-spin">hourglass_top</span>
                    <p>Cargando inventario...</p>
                </div>
            ) : filtered.length === 0 ? (
                <div className="emp-empty">
                    <span className="material-icons-round">
                        {filter === 'alerts' ? 'check_circle' : 'search_off'}
                    </span>
                    <p>
                        {filter === 'alerts'
                            ? '¡Sin alertas críticas! Inventario en orden.'
                            : search
                                ? `Sin resultados para "${search}"`
                                : 'No hay productos en inventario.'}
                    </p>
                </div>
            ) : viewMode === 'cards' ? (
                <div className="emp-cards-grid">
                    {filtered.map(item => (
                        <ProductCardMobile key={item.productId} item={item} />
                    ))}
                </div>
            ) : (
                <div className="emp-list">
                    {filtered.map(item => (
                        <ProductRowMobile key={item.productId} item={item} />
                    ))}
                </div>
            )}

            {/* ── Leyenda ── */}
            {!loading && filtered.length > 0 && (
                <div className="emp-legend">
                    <span className="emp-legend-item">
                        <span className="material-icons-round" style={{ color: '#dc2626', fontSize: '14px' }}>circle</span>
                        Stock negativo
                    </span>
                    <span className="emp-legend-item">
                        <span className="material-icons-round" style={{ color: '#d97706', fontSize: '14px' }}>circle</span>
                        Stock = 0
                    </span>
                    <span className="emp-legend-item">
                        <span className="material-icons-round" style={{ color: '#16a34a', fontSize: '14px' }}>circle</span>
                        Stock positivo
                    </span>
                    <span className="emp-legend-item">
                        <span className="material-icons-round" style={{ color: '#d97706', fontSize: '14px' }}>local_shipping</span>
                        En pedidos activos
                    </span>
                </div>
            )}
        </div>
    );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getBodega(item) {
    return item.stockFisicoReal != null
        ? item.stockFisicoReal
        : (Number(item.stockEnBD) || 0) + (Number(item.stockComprometido) || 0);
}

function getSistemaIcon(val) {
    if (val < 0) return <span className="material-icons-round" style={{ fontSize: '14px', color: '#dc2626' }}>cancel</span>;
    if (val === 0) return <span className="material-icons-round" style={{ fontSize: '14px', color: '#d97706' }}>warning_amber</span>;
    return <span className="material-icons-round" style={{ fontSize: '14px', color: '#16a34a' }}>check_circle</span>;
}

function getSistemaColor(val) {
    if (val < 0) return '#dc2626';
    if (val === 0) return '#d97706';
    return '#16a34a';
}

// ── Sub-componentes ───────────────────────────────────────────────────────────

function StatCard({ icon, label, value, color, bg, onClick, active }) {
    return (
        <div
            className={`emp-stat-card${onClick ? ' clickable' : ''}${active ? ' active' : ''}`}
            style={{ '--stat-color': color, '--stat-bg': bg }}
            onClick={onClick}
        >
            <span className="material-icons-round emp-stat-icon">{icon}</span>
            <div className="emp-stat-value">{value}</div>
            <div className="emp-stat-label">{label}</div>
        </div>
    );
}

function FilterChip({ active, danger, warning, onClick, icon, children }) {
    let cls = 'emp-chip';
    if (active && danger) cls += ' active-danger';
    else if (active && warning) cls += ' active-warning';
    else if (active) cls += ' active';
    return (
        <button className={cls} onClick={onClick}>
            {icon && <span className="material-icons-round" style={{ fontSize: '14px' }}>{icon}</span>}
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
    const barColor = sistema < 0 ? '#dc2626' : sistema === 0 ? '#d97706' : bodega < 5 ? '#f59e0b' : '#10b981';

    return (
        <div className={`emp-pcard${isCritical ? ' critical' : hasCommitted ? ' committed' : ''}`}>
            {/* Status badge */}
            {isCritical && (
                <span className="emp-badge danger">
                    <span className="material-icons-round" style={{ fontSize: '12px' }}>error</span>
                    Alerta
                </span>
            )}
            {!isCritical && hasCommitted && (
                <span className="emp-badge warning">
                    <span className="material-icons-round" style={{ fontSize: '12px' }}>local_shipping</span>
                    Pedidos
                </span>
            )}

            <div className="emp-pcard-name">{item.nombre}</div>
            <div className="emp-pcard-id">{item.productId?.substring(0, 8)}…</div>

            {/* Barra visual */}
            <div className="emp-stock-bar-wrap">
                <div className="emp-stock-bar">
                    <div className="emp-stock-fill" style={{ width: `${pct}%`, background: barColor }} />
                </div>
            </div>

            {/* Números */}
            <div className="emp-pcard-nums">
                <div className="emp-pcard-num">
                    <span className="emp-num-label">Bodega</span>
                    <span className="emp-num-value" style={{ color: barColor }}>{bodega}</span>
                </div>
                {hasCommitted && (
                    <div className="emp-pcard-num">
                        <span className="emp-num-label">Pedidos</span>
                        <span className="emp-num-value" style={{ color: '#d97706' }}>{comprometido}</span>
                    </div>
                )}
                <div className="emp-pcard-num">
                    <span className="emp-num-label">Sistema</span>
                    <span className="emp-num-value" style={{ color: getSistemaColor(sistema) }}>
                        {getSistemaIcon(sistema)} {sistema}
                    </span>
                </div>
            </div>
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
                <div className="emp-prow-dot" style={{ background: getSistemaColor(sistema) }} />
                <div>
                    <div className="emp-prow-name">{item.nombre}</div>
                    <div className="emp-prow-id">{item.productId?.substring(0, 8)}…</div>
                </div>
            </div>
            <div className="emp-prow-nums">
                <span className="emp-prow-badge bodega">{bodega}</span>
                {comprometido > 0 && (
                    <span className="emp-prow-badge ped">
                        <span className="material-icons-round" style={{ fontSize: '12px' }}>local_shipping</span>
                        {comprometido}
                    </span>
                )}
                <span className="emp-prow-badge sistema" style={{ color: getSistemaColor(sistema) }}>
                    {getSistemaIcon(sistema)}{sistema}
                </span>
            </div>
        </div>
    );
}

export default EmpacadorDashboard;
