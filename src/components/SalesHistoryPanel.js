import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from './ToastContainer';
import orderService from '../api/orderService';
import { formatCurrency, formatDate, formatDateTime } from '../utils/formatters';

// Etiquetas y colores para el tipo de línea de cada factura
const ITEM_TYPE_META = {
    NORMAL: { label: 'Normal', bg: '#f3f4f6', color: '#374151' },
    PROMOCION: { label: 'Promoción', bg: '#ede9fe', color: '#6d28d9' },
    PROMO_REGALO: { label: 'Regalo', bg: '#fef3c7', color: '#92400e' },
    BONIFICADO: { label: 'Bonificado', bg: '#dbeafe', color: '#1e40af' },
    FLETE: { label: 'Flete', bg: '#e0f2fe', color: '#075985' },
};

function ItemTypeBadge({ tipo }) {
    const meta = ITEM_TYPE_META[tipo] || { label: tipo, bg: '#f3f4f6', color: '#374151' };
    return (
        <span style={{
            padding: '0.1rem 0.5rem', borderRadius: '99px', fontSize: '0.7rem',
            fontWeight: 600, background: meta.bg, color: meta.color, whiteSpace: 'nowrap'
        }}>
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
        <div style={{ borderBottom: '1px solid #f3f4f6' }}>
            {/* Barra principal (clic para desplegar) */}
            <button
                onClick={() => setExpanded(e => !e)}
                style={{
                    width: '100%', background: expanded ? '#eef1fd' : 'white', border: 'none',
                    cursor: 'pointer', padding: '0.9rem 1rem', display: 'flex', alignItems: 'center',
                    gap: '1rem', textAlign: 'left', transition: 'background 0.15s ease'
                }}
                onMouseEnter={(e) => { if (!expanded) e.currentTarget.style.background = '#f5f5fe'; }}
                onMouseLeave={(e) => { if (!expanded) e.currentTarget.style.background = 'white'; }}
            >
                <span className="material-icons-round" style={{ color: 'var(--text-secondary)', transition: 'transform 0.15s', transform: expanded ? 'rotate(90deg)' : 'none' }}>
                    chevron_right
                </span>

                {/* Número de factura */}
                <span style={{
                    fontWeight: 700, fontFamily: 'monospace', fontSize: '0.95rem',
                    background: 'var(--primary)', color: '#fff',
                    padding: '0.25rem 0.65rem', borderRadius: '8px', minWidth: '70px', textAlign: 'center',
                    boxShadow: '0 1px 3px rgba(99, 102, 241, 0.3)', letterSpacing: '0.02em'
                }}>
                    #{sale.invoiceNumber ?? '—'}
                </span>

                {/* Cliente */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {sale.cliente || 'Sin cliente'}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        Vendedor: {sale.vendedor || '—'} · {sale.totalProductos} producto(s)
                    </div>
                </div>

                {/* Fechas: llegó → salió */}
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textAlign: 'right', minWidth: '180px' }}>
                    <div><strong>Llegó:</strong> {llego}</div>
                    <div><strong>Salió:</strong> {salio}</div>
                </div>

                {/* Total */}
                <span style={{ fontWeight: 700, fontSize: '1rem', minWidth: '110px', textAlign: 'right' }}>
                    {formatCurrency(sale.total)}
                </span>
            </button>

            {/* Detalle desplegado */}
            {expanded && (
                <div style={{ background: '#fcfcfd', padding: '0.5rem 1rem 1.25rem 3rem' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                            <tr style={{ textAlign: 'left', color: 'var(--text-secondary)' }}>
                                <th style={{ padding: '0.5rem 0.5rem', fontWeight: 600 }}>Producto</th>
                                <th style={{ padding: '0.5rem 0.5rem', fontWeight: 600, textAlign: 'center' }}>Tipo</th>
                                <th style={{ padding: '0.5rem 0.5rem', fontWeight: 600, textAlign: 'center' }}>Cant.</th>
                                <th style={{ padding: '0.5rem 0.5rem', fontWeight: 600, textAlign: 'right' }}>P. Unit.</th>
                                <th style={{ padding: '0.5rem 0.5rem', fontWeight: 600, textAlign: 'right' }}>Subtotal</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(sale.items || []).length === 0 ? (
                                <tr><td colSpan="5" style={{ padding: '0.75rem', color: 'var(--text-secondary)' }}>Sin items.</td></tr>
                            ) : (
                                sale.items.map((it, idx) => (
                                    <tr key={idx} style={{ borderTop: '1px solid #f0f0f3' }}>
                                        <td style={{ padding: '0.5rem', fontWeight: 500 }}>{it.producto}</td>
                                        <td style={{ padding: '0.5rem', textAlign: 'center' }}><ItemTypeBadge tipo={it.tipo} /></td>
                                        <td style={{ padding: '0.5rem', textAlign: 'center', fontFamily: 'monospace' }}>{it.cantidad}</td>
                                        <td style={{ padding: '0.5rem', textAlign: 'right', fontFamily: 'monospace' }}>{formatCurrency(it.precioUnitario)}</td>
                                        <td style={{ padding: '0.5rem', textAlign: 'right', fontFamily: 'monospace' }}>{formatCurrency(it.subtotal)}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
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
        <div style={{ padding: '1.5rem', height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Encabezado */}
            <div style={{ marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                    <span className="material-icons-round" style={{ color: 'var(--primary)' }}>receipt_long</span>
                    Historial de Ventas
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.2rem' }}>
                    Facturas completadas. Haz clic en una factura para ver su contenido.
                </p>
            </div>

            {/* Filtros */}
            <div style={{ background: 'white', padding: '1rem', borderRadius: '12px', marginBottom: '1rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'end', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', flex: 1, minWidth: '220px' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Buscar</label>
                    <div style={{ display: 'flex', alignItems: 'center', background: 'white', borderRadius: '6px', border: '1px solid var(--border)', padding: '0 0.5rem' }}>
                        <span className="material-icons-round" style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>search</span>
                        <input
                            type="text"
                            placeholder="N° de factura, cliente o vendedor..."
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            style={{ flex: 1, padding: '0.5rem', border: 'none', background: 'transparent', outline: 'none' }}
                        />
                        {searchInput && (
                            <button
                                onClick={() => setSearchInput('')}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}
                            >
                                <span className="material-icons-round" style={{ fontSize: '1.1rem' }}>close</span>
                            </button>
                        )}
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Desde (facturación)</label>
                    <input
                        type="date"
                        value={startDate}
                        onChange={e => { setStartDate(e.target.value); setPage(0); }}
                        style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)' }}
                    />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Hasta (facturación)</label>
                    <input
                        type="date"
                        value={endDate}
                        onChange={e => { setEndDate(e.target.value); setPage(0); }}
                        style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)' }}
                    />
                </div>

                {(startDate || endDate || search) && (
                    <button
                        onClick={() => { setSearchInput(''); setStartDate(''); setEndDate(''); setPage(0); }}
                        className="btn-secondary"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                    >
                        <span className="material-icons-round" style={{ fontSize: '1.1rem' }}>filter_alt_off</span>
                        Limpiar
                    </button>
                )}
            </div>

            {/* Lista de facturas */}
            <div style={{ flex: 1, overflow: 'auto', background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                {loading ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Cargando...</div>
                ) : sales.length === 0 ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        No se encontraron ventas.
                    </div>
                ) : (
                    sales.map(sale => <InvoiceRow key={sale.orderId} sale={sale} />)
                )}
            </div>

            {/* Paginación */}
            <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'center', gap: '1rem', alignItems: 'center' }}>
                <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="btn-secondary">Anterior</button>
                <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    Página {page + 1} de {totalPages || 1} (Total: {totalElements})
                </span>
                <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="btn-secondary">Siguiente</button>
            </div>
        </div>
    );
}
