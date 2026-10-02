import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from './ToastContainer';
import productService from '../api/productService';
import PhysicalCountModal from './modals/PhysicalCountModal';
import { bodegaInfo, committedUnits, hasCommitted } from '../utils/inventoryMovements';
import '../styles/areas/StockReportPanel.css';

/**
 * StockReportPanel
 * Shows the full inventory context: stockFisicoReal (en bodega),
 * stockComprometido (en pedidos activos), stockEnBD (lo que ve el sistema).
 *
 * "En Bodega" nunca se muestra negativa: si el cálculo da menos de 0 (salió más de lo que se
 * registró como entrada) se muestra 0 con "faltan N por registrar". Para corregir el número
 * está el "Conteo físico" de cada producto.
 *
 * @param {'admin'|'owner'} role  - Used to build the API URL
 */
export default function StockReportPanel({ role = 'admin', refreshTrigger }) {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    // Recarga con datos ya visibles ("Actualizar", después de un conteo físico o refreshTrigger):
    // spinner solo en el botón; la tabla, los filtros, la búsqueda y el modal siguen como estaban
    const [refreshing, setRefreshing] = useState(false);
    // 'all' | 'alerts' (sistema negativo) | 'missing' (faltan por registrar) | 'committed'
    const [viewMode, setViewMode] = useState('all');
    const [search, setSearch] = useState('');
    const [countProduct, setCountProduct] = useState(null);
    const toast = useToast();
    const reqRef = useRef(0); // solo la última petición aplica su respuesta
    const loadedRef = useRef(false); // ya terminó la carga inicial

    // Siempre el reporte completo: los filtros son locales, así las tarjetas y "Todos (N)"
    // no cambian al filtrar (antes "Solo Alertas" reemplazaba la lista y los totales)
    const fetchData = useCallback(async () => {
        const reqId = ++reqRef.current;
        if (loadedRef.current) setRefreshing(true);
        else setLoading(true);
        try {
            const response = await productService.getStockReport(role);
            if (reqId !== reqRef.current) return;
            setItems(response.data || []);
        } catch (error) {
            if (reqId !== reqRef.current) return;
            // Si falla, el reporte que ya se ve se conserva (el aviso es el mismo de antes)
            console.error('Error al cargar reporte de stock:', error);
            toast.error('Error al cargar el reporte de inventario');
        } finally {
            if (reqId === reqRef.current) {
                loadedRef.current = true;
                setLoading(false);
                setRefreshing(false);
            }
        }
    }, [role, toast]);

    // refreshTrigger es opcional: si el dashboard lo pasa, cada cambio recarga en silencio
    useEffect(() => {
        fetchData();
    }, [fetchData, refreshTrigger]);

    const busy = loading || refreshing;

    const isAlert = (i) => i.alertaCritica === true || Number(i.stockEnBD) < 0;
    const isMissing = (i) => bodegaInfo(i).faltante > 0;

    // Summary counts (sobre TODO el inventario)
    const criticalCount = items.filter(isAlert).length;
    const missingCount = items.filter(isMissing).length;
    const committedCount = items.filter(hasCommitted).length;

    // Filtro de vista + búsqueda
    const filtered = items.filter(item => {
        if (viewMode === 'alerts' && !isAlert(item)) return false;
        if (viewMode === 'missing' && !isMissing(item)) return false;
        if (viewMode === 'committed' && !hasCommitted(item)) return false;
        return !search.trim() || (item.nombre || '').toLowerCase().includes(search.toLowerCase());
    });

    // Tono de la columna "Sistema": negativo = peligro, 0 = advertencia, positivo = normal
    const sistemaTone = (val) => {
        if (val == null) return 'muted';
        if (val < 0) return 'danger';
        if (val === 0) return 'warning';
        return '';
    };

    // Punto de color de la columna "Sistema" (antes eran emojis de colores)
    const sistemaDot = (val) => {
        if (val == null) return '';
        if (val < 0) return 'danger';
        if (val === 0) return 'warning';
        return 'success';
    };

    const emptyMessage = () => {
        if (search) return `No se encontraron productos para "${search}"`;
        if (viewMode === 'alerts') return '¡Sin alertas! Ningún producto tiene el sistema en negativo.';
        if (viewMode === 'missing') return 'No hay unidades pendientes por registrar.';
        if (viewMode === 'committed') return 'No hay productos en pedidos activos.';
        return 'No hay datos de inventario.';
    };

    return (
        <div className="isr-page">

            {/* ── Header ── */}
            <header className="ui-page-header">
                <div className="ui-page-heading">
                    <h2 className="ui-page-title">
                        <span className="material-icons-round" aria-hidden="true">warehouse</span>
                        Reporte de Stock Real
                    </h2>
                    <p className="ui-page-desc isr-desc">
                        <strong className="isr-key isr-key--success">En Bodega</strong> = stock físico&nbsp;&nbsp;|&nbsp;&nbsp;
                        <strong className="isr-key isr-key--primary">En Pedidos</strong> = comprometido en pedidos activos&nbsp;&nbsp;|&nbsp;&nbsp;
                        <strong className="isr-key">Sistema</strong> = lo que muestra la BD (ya descontó pedidos)
                    </p>
                </div>
                <div className="ui-page-actions">
                    {/* Mientras recarga: spinner en lugar del icono (sin deshabilitar, como hoy) */}
                    <button
                        type="button"
                        className="ui-btn ui-btn--secondary"
                        aria-busy={busy || undefined}
                        onClick={fetchData}
                        title="Actualizar datos"
                    >
                        {busy
                            ? <span className="ui-spinner" aria-hidden="true" />
                            : <span className="material-icons-round isr-icon--primary" aria-hidden="true">sync</span>}
                        Actualizar
                    </button>
                </div>
            </header>

            {/* ── Summary Cards ── (el número va en el color de su significado) */}
            <div className="ui-stat-grid ui-stagger">
                <SummaryCard
                    icon="inventory_2"
                    label="Total productos"
                    value={items.length}
                    tone="teal"
                />
                <SummaryCard
                    icon="report_problem"
                    label="Faltan unidades por registrar"
                    value={missingCount}
                    tone={missingCount > 0 ? 'warning' : 'success'}
                    valueTone={missingCount > 0 ? 'warning' : 'success'}
                />
                <SummaryCard
                    icon="warning_amber"
                    label="Sistema en negativo (vendido sin stock)"
                    value={criticalCount}
                    tone={criticalCount > 0 ? 'danger' : 'success'}
                    valueTone={criticalCount > 0 ? 'danger' : 'success'}
                />
                <SummaryCard
                    icon="local_shipping"
                    label="Con pedidos activos"
                    value={committedCount}
                    tone="primary"
                    valueTone="primary"
                />
            </div>

            {/* ── Controls ── */}
            <div className="ui-toolbar">
                {/* Search */}
                <div className="ui-search">
                    <span className="material-icons-round ui-search-icon" aria-hidden="true">search</span>
                    <input
                        type="text"
                        className="ui-input"
                        aria-label="Buscar producto"
                        placeholder="Buscar producto..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>

                {/* View filter toggle */}
                <div className="ui-tabs" role="group" aria-label="Vista del reporte">
                    <FilterBtn active={viewMode === 'all'} onClick={() => setViewMode('all')} icon="list_alt" tone="primary">
                        Todos ({items.length})
                    </FilterBtn>
                    <FilterBtn
                        active={viewMode === 'missing'}
                        onClick={() => setViewMode('missing')}
                        icon="report_problem"
                        tone="warning"
                    >
                        Faltan por registrar ({missingCount})
                    </FilterBtn>
                    <FilterBtn
                        active={viewMode === 'alerts'}
                        onClick={() => setViewMode('alerts')}
                        icon="warning_amber"
                        tone="danger"
                    >
                        Sistema negativo ({criticalCount})
                    </FilterBtn>
                    <FilterBtn
                        active={viewMode === 'committed'}
                        onClick={() => setViewMode('committed')}
                        icon="local_shipping"
                        tone="primary"
                    >
                        En pedidos ({committedCount})
                    </FilterBtn>
                </div>
            </div>

            {/* ── Table ── */}
            <div className="ui-table-wrap">
                {loading ? (
                    // Carga: filas de esqueleto con la forma de la tabla (texto para lectores)
                    <div className="isr-skeleton" role="status" aria-busy="true">
                        <span className="ui-sr-only">Cargando inventario...</span>
                        {[0, 1, 2, 3, 4].map(i => (
                            <div key={i} className="isr-skeleton-row" aria-hidden="true">
                                <span className="ui-skeleton isr-skeleton-tile" />
                                <span className="ui-skeleton-stack isr-skeleton-grow">
                                    <span className="ui-skeleton ui-skeleton--title" />
                                    <span className="ui-skeleton ui-skeleton--text isr-skeleton-short" />
                                </span>
                                <span className="ui-skeleton ui-skeleton--text isr-skeleton-qty" />
                                <span className="ui-skeleton ui-skeleton--text isr-skeleton-qty" />
                            </div>
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="ui-empty ui-empty--plain">
                        <span className={`material-icons-round ui-empty-icon ${viewMode === 'all' || search ? 'isr-icon--primary' : 'isr-icon--success'}`} aria-hidden="true">
                            {viewMode === 'all' || search ? 'search_off' : 'check_circle'}
                        </span>
                        <p className="ui-empty-text">{emptyMessage()}</p>
                    </div>
                ) : (
                    <table className="ui-table isr-table">
                        <thead>
                            <tr>
                                <th className="isr-col-product">Producto</th>
                                <th className="ui-num">
                                    <span className="isr-th-help" title="Cuánto hay físicamente en bodega ahora mismo">
                                        En Bodega <span className="material-icons-round" aria-hidden="true">info</span>
                                    </span>
                                </th>
                                <th className="ui-num">
                                    <span className="isr-th-help" title="Cuánto está comprometido en pedidos activos pendientes de despacho">
                                        En Pedidos <span className="material-icons-round" aria-hidden="true">info</span>
                                    </span>
                                </th>
                                <th className="ui-num">
                                    <span className="isr-th-help" title="Lo que muestra el sistema (ya descontó todos los pedidos creados)">
                                        Sistema <span className="material-icons-round" aria-hidden="true">info</span>
                                    </span>
                                </th>
                                <th>Estado</th>
                                <th className="isr-col-action">Acción</th>
                            </tr>
                        </thead>
                        {/* Las primeras 8 filas entran escalonadas (key = productId) */}
                        <tbody className="ui-stagger">
                            {filtered.map((item) => {
                                const { bodega, faltante } = bodegaInfo(item);
                                const comprometido = committedUnits(item);
                                const alert = isAlert(item);
                                const enPedidos = hasCommitted(item);
                                const tone = sistemaTone(item.stockEnBD);
                                const dot = sistemaDot(item.stockEnBD);
                                const rowState = productState({ faltante, alert, enPedidos });
                                return (
                                    <tr
                                        key={item.productId}
                                        className={faltante > 0 ? 'is-missing' : undefined}
                                    >
                                        {/* Product name (baldosa con el color del estado del producto) */}
                                        <td className="isr-col-product">
                                            <div className="isr-product">
                                                <span className={`ui-icon-tile ui-icon-tile--sm ui-icon-tile--${rowState.tone}`} aria-hidden="true">
                                                    <span className="material-icons-round">{rowState.icon}</span>
                                                </span>
                                                <div className="isr-product-text">
                                                    <div className="isr-product-name">{item.nombre}</div>
                                                    <div className="isr-product-id">
                                                        {item.productId?.substring(0, 8)}...
                                                    </div>
                                                </div>
                                            </div>
                                        </td>

                                        {/* En Bodega: nunca negativa; el faltante se avisa aparte.
                                            Con unidades = verde; en 0 = ámbar */}
                                        <td className="ui-num" data-label="En Bodega">
                                            <div className="isr-cell-stack">
                                                <div data-testid="bodega" className={`isr-qty ${bodega > 0 ? 'isr-qty--success' : 'isr-qty--warning'}`}>{bodega}</div>
                                                {faltante > 0 && (
                                                    <div className="isr-missing">
                                                        faltan {faltante} por registrar
                                                    </div>
                                                )}
                                            </div>
                                        </td>

                                        {/* En Pedidos = stockComprometido */}
                                        <td className="ui-num" data-label="En Pedidos">
                                            {comprometido > 0 ? (
                                                <span className="isr-qty isr-qty--primary">{comprometido}</span>
                                            ) : (
                                                <span className="isr-qty isr-qty--muted">0</span>
                                            )}
                                        </td>

                                        {/* Sistema = stockEnBD */}
                                        <td className="ui-num" data-label="Sistema">
                                            <span className={`isr-qty isr-sistema${tone ? ` isr-sistema--${tone}` : ''}`}>
                                                {dot && <span className={`isr-dot isr-dot--${dot}`} aria-hidden="true" />}
                                                {item.stockEnBD ?? '-'}
                                            </span>
                                        </td>

                                        {/* Estado badges */}
                                        <td data-label="Estado">
                                            <div className="isr-badges">
                                                {faltante > 0 && (
                                                    <Badge icon="report_problem" tone="warning">Faltan por registrar</Badge>
                                                )}
                                                {alert && (
                                                    <Badge icon="warning" tone="danger">Sistema negativo</Badge>
                                                )}
                                                {enPedidos && (
                                                    <Badge icon="local_shipping" tone="primary">En pedidos</Badge>
                                                )}
                                                {faltante === 0 && !alert && !enPedidos && (
                                                    <Badge tone="success">✓ OK</Badge>
                                                )}
                                            </div>
                                        </td>

                                        <td className="isr-col-action">
                                            <button
                                                type="button"
                                                className="ui-btn ui-btn--secondary ui-btn--sm"
                                                onClick={() => setCountProduct({
                                                    id: item.productId,
                                                    nombre: item.nombre,
                                                    stockEnBD: item.stockEnBD,
                                                    stockComprometido: comprometido,
                                                })}
                                                title="Ajustar el sistema a lo que hay en bodega"
                                            >
                                                <span className="material-icons-round isr-icon--warning" aria-hidden="true">fact_check</span>
                                                Conteo físico
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* ── Legend ── */}
            <div className="isr-legend">
                <span className="isr-legend-title">Leyenda Sistema:</span>
                <span className="isr-legend-item">
                    <span className="isr-dot isr-dot--danger" aria-hidden="true" />
                    Stock BD negativo (vendido sin stock)
                </span>
                <span className="isr-legend-item">
                    <span className="isr-dot isr-dot--warning" aria-hidden="true" />
                    Stock BD = 0
                </span>
                <span className="isr-legend-item">
                    <span className="isr-dot isr-dot--success" aria-hidden="true" />
                    Stock BD positivo
                </span>
                <span className="isr-legend-note">
                    En Bodega = Sistema + Pedidos activos (nunca menos de 0; si falta, se avisa)
                </span>
            </div>

            {countProduct && (
                <PhysicalCountModal
                    product={countProduct}
                    onClose={() => setCountProduct(null)}
                    onSuccess={() => fetchData()}
                />
            )}
        </div>
    );
}

// ── Helper sub-components ─────────────────────────────────────────────────────

// Baldosa de la fila según el estado más importante del producto (mismo orden que las
// insignias): faltan por registrar (ámbar) > sistema negativo (rojo) > en pedidos (azul) > OK
// (verde). Solo presentación.
function productState({ faltante, alert, enPedidos }) {
    if (faltante > 0) return { tone: 'warning', icon: 'report_problem' };
    if (alert) return { tone: 'danger', icon: 'warning' };
    if (enPedidos) return { tone: 'primary', icon: 'local_shipping' };
    return { tone: 'success', icon: 'inventory_2' };
}

// tone: 'primary' | 'success' | 'warning' | 'danger' | 'neutral' (.ui-badge)
function Badge({ icon, tone = 'neutral', children }) {
    return (
        <span className={`ui-badge ui-badge--${tone}`}>
            {icon && <span className="material-icons-round" aria-hidden="true">{icon}</span>}
            {children}
        </span>
    );
}

// tone: '' (primario) | 'neutral' | 'success' | 'warning' | 'danger' | 'primary' | 'teal' | 'sky'
// (.ui-stat-icon). valueTone: color del número ('success' | 'warning' | 'danger' | 'primary').
function SummaryCard({ icon, label, value, tone, valueTone }) {
    return (
        <div className="ui-stat isr-stat">
            <span className={`ui-stat-icon${tone ? ` ui-stat-icon--${tone}` : ''}`} aria-hidden="true">
                <span className="material-icons-round">{icon}</span>
            </span>
            <div className="ui-stat-content">
                <span className={`ui-stat-value${valueTone ? ` ui-text-${valueTone}` : ''}`}>{value}</span>
                <span className="ui-stat-label">{label}</span>
            </div>
        </div>
    );
}

// Pestaña de vista; el icono lleva el tono del estado que filtra
function FilterBtn({ active, onClick, icon, children, tone }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={`ui-tab${active ? ' is-active' : ''}`}
        >
            <span className={`material-icons-round${tone ? ` isr-tab-icon--${tone}` : ''}`} aria-hidden="true">{icon}</span>
            {children}
        </button>
    );
}
