import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from './ToastContainer';
import productService from '../api/productService';

/**
 * StockReportPanel
 * Shows the full inventory context: stockFisicoReal (en bodega),
 * stockComprometido (en pedidos activos), stockEnBD (lo que ve el sistema).
 *
 * @param {'admin'|'owner'} role  - Used to build the API URL
 */
export default function StockReportPanel({ role = 'admin' }) {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [viewMode, setViewMode] = useState('all'); // 'all' | 'alerts'
    const [search, setSearch] = useState('');
    const toast = useToast();

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const response = viewMode === 'alerts'
                ? await productService.getStockAlerts(role)
                : await productService.getStockReport(role);
            setItems(response.data || []);
        } catch (error) {
            console.error('Error al cargar reporte de stock:', error);
            toast.error('Error al cargar el reporte de inventario');
        } finally {
            setLoading(false);
        }
    }, [viewMode, role, toast]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Filtered by search
    const filtered = items.filter(item =>
        !search.trim() ||
        (item.nombre || '').toLowerCase().includes(search.toLowerCase())
    );

    // Summary counts
    const criticalCount = items.filter(i => i.alertaCritica).length;
    const committedCount = items.filter(i => i.tieneStockComprometido).length;

    // Color for "Sistema" column
    const sistemaColor = (val) => {
        if (val < 0) return { color: '#dc2626', fontWeight: 700 };
        if (val === 0) return { color: '#d97706', fontWeight: 700 };
        return { color: '#16a34a', fontWeight: 700 };
    };

    const sistemaIcon = (val) => {
        if (val < 0) return '🔴';
        if (val === 0) return '🟡';
        return '✅';
    };

    return (
        <div style={{ padding: '1.5rem', height: '100%', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

            {/* ── Header ── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                        <span className="material-icons-round" style={{ color: 'var(--primary)' }}>warehouse</span>
                        Reporte de Stock Real
                    </h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.3rem', lineHeight: 1.5 }}>
                        <strong>En Bodega</strong> = stock físico&nbsp;&nbsp;|&nbsp;&nbsp;
                        <strong>En Pedidos</strong> = comprometido en pedidos activos&nbsp;&nbsp;|&nbsp;&nbsp;
                        <strong>Sistema</strong> = lo que muestra la BD (ya descontó pedidos)
                    </p>
                </div>
                <button
                    onClick={fetchData}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '0.4rem',
                        padding: '0.55rem 1rem', borderRadius: '8px',
                        border: '1px solid var(--border)', background: 'white',
                        cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem',
                        color: 'var(--text-main)'
                    }}
                    title="Actualizar datos"
                >
                    <span className="material-icons-round" style={{ fontSize: '18px' }}>sync</span>
                    Actualizar
                </button>
            </div>

            {/* ── Summary Cards ── */}
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <SummaryCard
                    icon="inventory_2"
                    label="Total productos"
                    value={items.length}
                    color="#6366f1"
                    bg="#eef2ff"
                />
                <SummaryCard
                    icon="warning_amber"
                    label="Alertas críticas (stock negativo)"
                    value={criticalCount}
                    color={criticalCount > 0 ? '#dc2626' : '#16a34a'}
                    bg={criticalCount > 0 ? '#fef2f2' : '#f0fdf4'}
                />
                <SummaryCard
                    icon="local_shipping"
                    label="Con stock comprometido"
                    value={committedCount}
                    color="#d97706"
                    bg="#fffbeb"
                />
            </div>

            {/* ── Controls ── */}
            <div style={{
                background: 'white', padding: '1rem', borderRadius: '12px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center'
            }}>
                {/* Search */}
                <div style={{ position: 'relative', flex: '1 1 220px' }}>
                    <span className="material-icons-round" style={{
                        position: 'absolute', left: '0.7rem', top: '50%',
                        transform: 'translateY(-50%)', color: 'var(--text-secondary)', fontSize: '18px'
                    }}>search</span>
                    <input
                        type="text"
                        placeholder="Buscar producto..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{
                            width: '100%', padding: '0.55rem 0.75rem 0.55rem 2.25rem',
                            borderRadius: '8px', border: '1px solid var(--border)',
                            fontSize: '0.9rem', boxSizing: 'border-box'
                        }}
                    />
                </div>

                {/* View filter toggle */}
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <FilterBtn active={viewMode === 'all'} onClick={() => setViewMode('all')} icon="list_alt">
                        Todos ({items.length})
                    </FilterBtn>
                    <FilterBtn
                        active={viewMode === 'alerts'}
                        onClick={() => setViewMode('alerts')}
                        icon="warning_amber"
                        activeColor="#dc2626"
                        activeBackground="#fef2f2"
                    >
                        🔴 Solo Alertas ({criticalCount})
                    </FilterBtn>
                </div>
            </div>

            {/* ── Table ── */}
            <div style={{ flex: 1, overflow: 'auto', background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                {loading ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        <span className="material-icons-round" style={{ fontSize: '40px', display: 'block', marginBottom: '0.75rem', animation: 'spin 1s linear infinite' }}>hourglass_top</span>
                        Cargando inventario...
                    </div>
                ) : filtered.length === 0 ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        <span className="material-icons-round" style={{ fontSize: '48px', display: 'block', marginBottom: '0.75rem' }}>
                            {viewMode === 'alerts' ? 'check_circle' : 'search_off'}
                        </span>
                        {viewMode === 'alerts'
                            ? '¡Sin alertas críticas! Todo el stock del sistema es positivo.'
                            : search ? `No se encontraron productos para "${search}"` : 'No hay datos de inventario.'}
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                        <thead style={{ background: '#f9fafb', position: 'sticky', top: 0, zIndex: 1 }}>
                            <tr style={{ textAlign: 'left' }}>
                                <th style={{ padding: '0.875rem 1rem', fontWeight: 600, color: 'var(--text-secondary)', minWidth: '200px' }}>Producto</th>
                                <th style={{ padding: '0.875rem 1rem', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'center' }}>
                                    <span title="Cuánto hay físicamente en bodega ahora mismo">En Bodega 🏭</span>
                                </th>
                                <th style={{ padding: '0.875rem 1rem', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'center' }}>
                                    <span title="Cuánto está comprometido en pedidos activos pendientes de despacho">En Pedidos 📦</span>
                                </th>
                                <th style={{ padding: '0.875rem 1rem', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'center' }}>
                                    <span title="Lo que muestra el sistema (ya descontó todos los pedidos creados)">Sistema 💾</span>
                                </th>
                                <th style={{ padding: '0.875rem 1rem', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'center' }}>Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((item, idx) => (
                                <tr
                                    key={item.productId}
                                    style={{
                                        borderBottom: '1px solid #f3f4f6',
                                        background: item.alertaCritica
                                            ? 'rgba(254, 242, 242, 0.5)'
                                            : idx % 2 === 0 ? 'white' : '#fafafa'
                                    }}
                                >
                                    {/* Product name */}
                                    <td style={{ padding: '0.875rem 1rem' }}>
                                        <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{item.nombre}</div>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '2px', fontFamily: 'monospace' }}>
                                            {item.productId?.substring(0, 8)}...
                                        </div>
                                    </td>

                                    {/* En Bodega = stockEnBD + stockComprometido (calculado en frontend
                                         por si el backend no devuelve stockFisicoReal) */}
                                    <td style={{ padding: '0.875rem 1rem', textAlign: 'center', fontFamily: 'monospace', fontSize: '1rem', fontWeight: 700 }}>
                                        {(() => {
                                            const bodega = item.stockFisicoReal != null
                                                ? item.stockFisicoReal
                                                : (Number(item.stockEnBD) || 0) + (Number(item.stockComprometido) || 0);
                                            return bodega;
                                        })()}
                                    </td>

                                    {/* En Pedidos = stockComprometido */}
                                    <td style={{ padding: '0.875rem 1rem', textAlign: 'center', fontFamily: 'monospace', fontSize: '1rem' }}>
                                        {item.stockComprometido > 0 ? (
                                            <span style={{ color: '#d97706', fontWeight: 700 }}>
                                                {item.stockComprometido}
                                            </span>
                                        ) : (
                                            <span style={{ color: 'var(--text-secondary)' }}>0</span>
                                        )}
                                    </td>

                                    {/* Sistema = stockEnBD */}
                                    <td style={{ padding: '0.875rem 1rem', textAlign: 'center', fontFamily: 'monospace', fontSize: '1rem' }}>
                                        <span style={sistemaColor(item.stockEnBD)}>
                                            {sistemaIcon(item.stockEnBD)} {item.stockEnBD}
                                        </span>
                                    </td>

                                    {/* Estado badges */}
                                    <td style={{ padding: '0.875rem 1rem', textAlign: 'center' }}>
                                        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                                            {item.alertaCritica && (
                                                <span style={{
                                                    padding: '0.2rem 0.6rem', borderRadius: '99px',
                                                    fontSize: '0.72rem', fontWeight: 700,
                                                    background: '#fee2e2', color: '#991b1b',
                                                    display: 'flex', alignItems: 'center', gap: '3px'
                                                }}>
                                                    <span className="material-icons-round" style={{ fontSize: '12px' }}>warning</span>
                                                    Alerta crítica
                                                </span>
                                            )}
                                            {item.tieneStockComprometido && (
                                                <span style={{
                                                    padding: '0.2rem 0.6rem', borderRadius: '99px',
                                                    fontSize: '0.72rem', fontWeight: 700,
                                                    background: '#fef3c7', color: '#92400e',
                                                    display: 'flex', alignItems: 'center', gap: '3px'
                                                }}>
                                                    <span className="material-icons-round" style={{ fontSize: '12px' }}>local_shipping</span>
                                                    En pedidos
                                                </span>
                                            )}
                                            {!item.alertaCritica && !item.tieneStockComprometido && (
                                                <span style={{
                                                    padding: '0.2rem 0.6rem', borderRadius: '99px',
                                                    fontSize: '0.72rem', fontWeight: 700,
                                                    background: '#dcfce7', color: '#166534'
                                                }}>
                                                    ✓ OK
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* ── Legend ── */}
            <div style={{
                background: '#f8fafc', borderRadius: '10px', padding: '0.875rem 1rem',
                fontSize: '0.8rem', color: 'var(--text-secondary)',
                display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'center',
                border: '1px solid var(--border)'
            }}>
                <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>Leyenda Sistema:</span>
                <span>🔴 Stock BD negativo</span>
                <span>🟡 Stock BD = 0</span>
                <span>✅ Stock BD positivo</span>
                <span style={{ marginLeft: 'auto', fontStyle: 'italic' }}>
                    En Bodega = Sistema + Pedidos activos (lo real)
                </span>
            </div>
        </div>
    );
}

// ── Helper sub-components ─────────────────────────────────────────────────────

function SummaryCard({ icon, label, value, color, bg }) {
    return (
        <div style={{
            background: bg, borderRadius: '12px', padding: '1rem 1.25rem',
            display: 'flex', alignItems: 'center', gap: '0.75rem',
            flex: '1 1 180px', minWidth: '160px',
            border: `1px solid ${color}22`
        }}>
            <span className="material-icons-round" style={{ color, fontSize: '28px' }}>{icon}</span>
            <div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '3px' }}>{label}</div>
            </div>
        </div>
    );
}

function FilterBtn({ active, onClick, icon, children, activeColor, activeBackground }) {
    const activeBg = activeBackground || 'var(--primary)';
    const activeCol = activeColor || 'white';
    return (
        <button
            onClick={onClick}
            style={{
                display: 'flex', alignItems: 'center', gap: '0.35rem',
                padding: '0.55rem 0.9rem', borderRadius: '8px', cursor: 'pointer',
                fontWeight: 600, fontSize: '0.85rem', whiteSpace: 'nowrap',
                border: active ? 'none' : '1px solid var(--border)',
                background: active ? activeBg : 'white',
                color: active ? activeCol : 'var(--text-secondary)',
                transition: 'all 0.15s'
            }}
        >
            <span className="material-icons-round" style={{ fontSize: '16px' }}>{icon}</span>
            {children}
        </button>
    );
}
