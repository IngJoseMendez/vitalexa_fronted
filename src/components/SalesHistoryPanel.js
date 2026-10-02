import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from './ToastContainer';
import orderService from '../api/orderService';
import { formatCurrency, formatDate, formatDateTime, formatOrderLabel } from '../utils/formatters';
import { avatarTone, avatarInitials } from '../utils/avatarTone';
import '../styles/areas/Inventory.css';

// Etiquetas, tono e icono para el tipo de línea de cada factura (insignias con color de
// significado: venta normal celeste, promoción azul, regalo/bonificado verde, flete teal).
// Los tonos teal/sky son de la hoja del área (.inv-type-badge--*).
const ITEM_TYPE_META = {
    NORMAL: { label: 'Normal', tone: 'sky', icon: 'inventory_2' },
    PROMOCION: { label: 'Promoción', tone: 'primary', icon: 'sell' },
    PROMO_REGALO: { label: 'Regalo', tone: 'success', icon: 'redeem' },
    BONIFICADO: { label: 'Bonificado', tone: 'success', icon: 'card_giftcard' },
    FLETE: { label: 'Flete', tone: 'teal', icon: 'local_shipping' },
};

function ItemTypeBadge({ tipo }) {
    const meta = ITEM_TYPE_META[tipo] || { label: tipo, tone: 'neutral' };
    return (
        <span className={`ui-badge inv-type-badge inv-type-badge--${meta.tone}`}>
            {meta.icon && <span className="material-icons-round" aria-hidden="true">{meta.icon}</span>}
            {meta.label}
        </span>
    );
}

// Fila desplegable de una factura
function InvoiceRow({ sale }) {
    const [expanded, setExpanded] = useState(false);

    const llego = sale.fecha ? formatDateTime(sale.fecha) : '—';
    const salio = sale.completedAt ? formatDate(sale.completedAt) : '—';

    return (
        <div className="inv-invoice">
            {/* Barra principal (clic para desplegar). Desplegada: franja azul a la izquierda */}
            <button
                type="button"
                className={`inv-invoice-toggle${expanded ? ' is-expanded ui-stripe ui-stripe--primary' : ''}`}
                aria-expanded={expanded}
                onClick={() => setExpanded(e => !e)}
                style={{ background: expanded ? 'var(--color-primary-soft)' : 'var(--color-surface)' }}
                onMouseEnter={(e) => { if (!expanded) e.currentTarget.style.background = 'var(--color-surface-hover)'; }}
                onMouseLeave={(e) => { if (!expanded) e.currentTarget.style.background = 'var(--color-surface)'; }}
            >
                <span className="material-icons-round inv-invoice-chevron" aria-hidden="true">
                    chevron_right
                </span>

                {/* Número de factura y de pedido ("Factura #1500 · Pedido P-123") */}
                <span className="inv-invoice-number">
                    {formatOrderLabel(sale) || '—'}
                </span>

                {/* Cliente (avatar de iniciales con tono estable por nombre) */}
                <div className="inv-invoice-client">
                    <span className={`ui-avatar ui-avatar--sm ui-avatar--${avatarTone(sale.cliente)}`} aria-hidden="true">
                        {avatarInitials(sale.cliente)}
                    </span>
                    <div className="inv-invoice-client-text">
                        <div className="inv-invoice-name">
                            {sale.cliente || 'Sin cliente'}
                        </div>
                        <div className="inv-invoice-meta">
                            Vendedor: {sale.vendedor || '—'} · {sale.totalProductos} producto(s)
                        </div>
                    </div>
                </div>

                {/* Fechas: llegó → salió */}
                <div className="inv-invoice-dates">
                    <div>
                        <span className="material-icons-round inv-icon--primary" aria-hidden="true">schedule</span>
                        <strong>Llegó:</strong> {llego}
                    </div>
                    <div>
                        <span className="material-icons-round inv-icon--success" aria-hidden="true">local_shipping</span>
                        <strong>Salió:</strong> {salio}
                    </div>
                </div>

                {/* Total (dinero facturado: verde) */}
                <span className="inv-invoice-total">
                    {formatCurrency(sale.total)}
                </span>
            </button>

            {/* Detalle desplegado */}
            {expanded && (
                <div className="inv-invoice-detail">
                    <div className="ui-table-wrap">
                        <table className="ui-table ui-table--compact">
                            <thead>
                                <tr>
                                    <th>Producto</th>
                                    <th>Tipo</th>
                                    <th className="ui-num">Cant.</th>
                                    <th className="ui-num">P. Unit.</th>
                                    <th className="ui-num">Subtotal</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(sale.items || []).length === 0 ? (
                                    <tr><td colSpan="5" className="inv-cell-muted">Sin items.</td></tr>
                                ) : (
                                    sale.items.map((it, idx) => (
                                        <tr key={idx}>
                                            <td className="inv-cell-name">{it.producto}</td>
                                            <td><ItemTypeBadge tipo={it.tipo} /></td>
                                            <td className="ui-num">{it.cantidad}</td>
                                            <td className="ui-num">{formatCurrency(it.precioUnitario)}</td>
                                            <td className="ui-num ui-amount--success">{formatCurrency(it.subtotal)}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function SalesHistoryPanel() {
    const [sales, setSales] = useState([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const [totalElements, setTotalElements] = useState(0);

    // Filtros
    const [search, setSearch] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    const toast = useToast();

    const fetchSales = useCallback(async () => {
        setLoading(true);
        try {
            const params = {
                page,
                size: 20,
                search: search || undefined,
                startDate: startDate || undefined,
                endDate: endDate || undefined,
            };
            const response = await orderService.getSalesHistory(params);
            setSales(response.data.content || []);
            setTotalPages(response.data.totalPages || 0);
            setTotalElements(response.data.totalElements || 0);
        } catch (error) {
            console.error('Error fetching sales history:', error);
            toast.error('Error al cargar el historial de ventas');
        } finally {
            setLoading(false);
        }
    }, [page, search, startDate, endDate, toast]);

    useEffect(() => {
        fetchSales();
    }, [fetchSales]);

    // Búsqueda con debounce
    useEffect(() => {
        const timer = setTimeout(() => {
            setSearch(searchInput.trim());
            setPage(0);
        }, 400);
        return () => clearTimeout(timer);
    }, [searchInput]);

    return (
        <div className="inv-page inv-sales">
            {/* Encabezado */}
            <header className="ui-page-header">
                <div className="ui-page-heading">
                    <h2 className="ui-page-title">
                        <span className="material-icons-round" aria-hidden="true">receipt_long</span>
                        Historial de Ventas
                    </h2>
                    <p className="ui-page-desc">
                        Facturas completadas. Haz clic en una factura para ver su contenido.
                    </p>
                </div>
            </header>

            {/* Filtros */}
            <div className="inv-filters">
                <div className="ui-field inv-field-grow">
                    <label className="ui-label" htmlFor="sh-search">Buscar</label>
                    <div className="ui-search inv-field-search">
                        <span className="material-icons-round ui-search-icon" aria-hidden="true">search</span>
                        <input
                            id="sh-search"
                            type="text"
                            className="ui-input"
                            placeholder="N° de factura, pedido (P-123), cliente o vendedor..."
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                        />
                        {searchInput && (
                            <button
                                type="button"
                                className="ui-icon-btn ui-search-clear"
                                aria-label="Limpiar búsqueda"
                                onClick={() => setSearchInput('')}
                            >
                                <span className="material-icons-round" aria-hidden="true">close</span>
                            </button>
                        )}
                    </div>
                </div>

                <div className="ui-field">
                    <label className="ui-label" htmlFor="sh-start">Desde (facturación)</label>
                    <input
                        id="sh-start"
                        type="date"
                        className="ui-input"
                        value={startDate}
                        onChange={e => { setStartDate(e.target.value); setPage(0); }}
                    />
                </div>

                <div className="ui-field">
                    <label className="ui-label" htmlFor="sh-end">Hasta (facturación)</label>
                    <input
                        id="sh-end"
                        type="date"
                        className="ui-input"
                        value={endDate}
                        onChange={e => { setEndDate(e.target.value); setPage(0); }}
                    />
                </div>

                {(startDate || endDate || search) && (
                    <button
                        type="button"
                        onClick={() => { setSearchInput(''); setStartDate(''); setEndDate(''); setPage(0); }}
                        className="ui-btn ui-btn--secondary"
                    >
                        <span className="material-icons-round" aria-hidden="true">filter_alt_off</span>
                        Limpiar
                    </button>
                )}
            </div>

            {/* Lista de facturas */}
            {/* Las primeras 8 facturas entran escalonadas (key = orderId) */}
            <div className="inv-sales-list ui-stagger">
                {loading ? (
                    <div className="inv-sales-skeleton" role="status" aria-busy="true">
                        <span className="ui-sr-only">Cargando...</span>
                        {[0, 1, 2, 3, 4].map(i => (
                            <div key={i} className="inv-sales-skeleton-row" aria-hidden="true">
                                <span className="ui-skeleton ui-skeleton--circle inv-skeleton-avatar" />
                                <span className="ui-skeleton-stack inv-skeleton-grow">
                                    <span className="ui-skeleton ui-skeleton--title" />
                                    <span className="ui-skeleton ui-skeleton--text inv-skeleton-short" />
                                </span>
                                <span className="ui-skeleton ui-skeleton--text inv-skeleton-amount" />
                            </div>
                        ))}
                    </div>
                ) : sales.length === 0 ? (
                    <div className="ui-empty ui-empty--plain">
                        <span className="material-icons-round ui-empty-icon" aria-hidden="true">receipt_long</span>
                        <p className="ui-empty-text">No se encontraron ventas.</p>
                    </div>
                ) : (
                    sales.map(sale => <InvoiceRow key={sale.orderId} sale={sale} />)
                )}
            </div>

            {/* Paginación */}
            <div className="inv-pagination">
                <button type="button" disabled={page === 0} onClick={() => setPage(p => p - 1)} className="ui-btn ui-btn--secondary ui-btn--sm">Anterior</button>
                <span className="inv-pagination-info">
                    Página {page + 1} de {totalPages || 1} (Total: {totalElements})
                </span>
                <button type="button" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="ui-btn ui-btn--secondary ui-btn--sm">Siguiente</button>
            </div>
        </div>
    );
}
