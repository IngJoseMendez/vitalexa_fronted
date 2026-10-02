import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from './ToastContainer';
import productService from '../api/productService';
import { formatOrderLabel } from '../utils/formatters';
import {
    MOVEMENT_TYPES,
    movementTypeLabel,
    movementDelta,
    formatDelta,
    deltaTone,
    historyDateParams,
} from '../utils/inventoryMovements';

// Colores por sentido del cambio real de stock (no por el tipo)
const TONE_STYLES = {
    in: { color: '#059669', badgeBg: '#dcfce7', badgeColor: '#166534' },
    out: { color: '#dc2626', badgeBg: '#fee2e2', badgeColor: '#991b1b' },
    none: { color: '#6b7280', badgeBg: '#f3f4f6', badgeColor: '#374151' },
};

/** Mensaje del backend cuando la respuesta es un blob (descargas) o JSON */
async function errorMessage(error, fallback) {
    const data = error?.response?.data;
    if (data instanceof Blob) {
        try {
            const json = JSON.parse(await data.text());
            return json.message || fallback;
        } catch (e) {
            return fallback;
        }
    }
    return data?.message || fallback;
}

export default function InventoryHistoryPanel() {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const [totalElements, setTotalElements] = useState(0);

    // Filters
    const [type, setType] = useState('');
    const [productId, setProductId] = useState('');
    const [productNameSearch, setProductNameSearch] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // Product search suggestions
    const [productSuggestions, setProductSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [searchLoading, setSearchLoading] = useState(false);

    const toast = useToast();

    // "Desde" posterior a "Hasta": no se consulta (el backend respondería 400)
    const invalidRange = Boolean(startDate && endDate && startDate > endDate);

    const fetchHistory = useCallback(async () => {
        if (invalidRange) {
            setHistory([]);
            setTotalPages(0);
            setTotalElements(0);
            return;
        }
        setLoading(true);
        try {
            const params = {
                page,
                size: 20,
                sort: 'timestamp,desc',
                type: type || null,
                productId: productId || null,
                ...historyDateParams(startDate, endDate)
            };

            const response = await productService.getInventoryHistory(params);
            setHistory(response.data.content || []);
            setTotalPages(response.data.totalPages);
            setTotalElements(response.data.totalElements);
        } catch (error) {
            console.error('Error fetching history:', error);
            toast.error(await errorMessage(error, 'Error al cargar historial'));
        } finally {
            setLoading(false);
        }
    }, [page, type, productId, startDate, endDate, invalidRange, toast]);

    useEffect(() => {
        fetchHistory();
    }, [fetchHistory]);

    // Debounced Product Search (incluye productos inactivos: también se auditan)
    useEffect(() => {
        if (productNameSearch.length > 2 && !productId) {
            const timer = setTimeout(async () => {
                setSearchLoading(true);
                try {
                    const response = await productService.searchProductsForHistory(productNameSearch);
                    setProductSuggestions(response.data.content || []);
                    setShowSuggestions(true);
                } catch (e) {
                    console.error('Error searching products:', e);
                } finally {
                    setSearchLoading(false);
                }
            }, 400);
            return () => clearTimeout(timer);
        } else if (productNameSearch.length <= 2) {
            setProductSuggestions([]);
            setShowSuggestions(false);
            if (productId && productNameSearch === '') {
                setProductId('');
                setPage(0);
            }
        }
    }, [productNameSearch, productId]);

    const clearProduct = () => {
        setProductNameSearch('');
        setProductId('');
        setProductSuggestions([]);
        setPage(0);
    };

    const clearFilters = () => {
        setType('');
        setStartDate('');
        setEndDate('');
        clearProduct();
    };

    const hasFilters = Boolean(type || productId || productNameSearch || startDate || endDate);

    const handleDownloadPdf = async (id) => {
        try {
            const response = await productService.exportInventoryMovement(id);
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `movimiento_${id.substring(0, 8)}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.parentNode.removeChild(link);
        } catch (error) {
            console.error('Error downloading PDF:', error);
            toast.error(await errorMessage(error, 'Error al descargar PDF'));
        }
    };

    const handleExportReport = async () => {
        if (invalidRange) {
            toast.warning("La fecha 'Desde' es posterior a 'Hasta'");
            return;
        }
        try {
            const params = {
                type: type || null,
                productId: productId || null,
                ...historyDateParams(startDate, endDate)
            };
            const response = await productService.exportInventoryHistory(params);
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'historial_inventario.pdf');
            document.body.appendChild(link);
            link.click();
            link.parentNode.removeChild(link);
            toast.success('Reporte descargado correctamente');
        } catch (error) {
            console.error('Error exporting report:', error);
            toast.error(await errorMessage(error, 'Error al exportar reporte'));
        }
    };

    return (
        <div style={{ padding: '1.5rem', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', gap: '1rem', flexWrap: 'wrap' }}>
                <div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                        <span className="material-icons-round" style={{ color: 'var(--primary)' }}>history</span>
                        Historial de Inventario
                    </h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.2rem' }}>
                        Auditoría y trazabilidad de movimientos (más reciente primero)
                    </p>
                </div>
                <button
                    onClick={handleExportReport}
                    className="btn-primary"
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                    <span className="material-icons-round">picture_as_pdf</span>
                    Exportar Reporte
                </button>
            </div>

            {/* Filters */}
            <div style={{ background: 'white', padding: '1rem', borderRadius: '12px', marginBottom: '1rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'end', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    <label htmlFor="ih-type" style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Tipo de Movimiento</label>
                    <select
                        id="ih-type"
                        value={type}
                        onChange={e => { setType(e.target.value); setPage(0); }}
                        style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)', minWidth: '150px' }}
                    >
                        <option value="">Todos</option>
                        {MOVEMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    <label htmlFor="ih-start" style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Desde</label>
                    <input
                        id="ih-start"
                        type="date"
                        value={startDate}
                        onChange={e => { setStartDate(e.target.value); setPage(0); }}
                        style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)' }}
                    />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    <label htmlFor="ih-end" style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Hasta (incluido)</label>
                    <input
                        id="ih-end"
                        type="date"
                        value={endDate}
                        onChange={e => { setEndDate(e.target.value); setPage(0); }}
                        style={{ padding: '0.5rem', borderRadius: '6px', border: `1px solid ${invalidRange ? '#ef4444' : 'var(--border)'}` }}
                    />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', position: 'relative', flex: 1, minWidth: '200px' }}>
                    <label htmlFor="ih-product" style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Producto (incluye inactivos)</label>
                    <div style={{ display: 'flex', alignItems: 'center', background: 'white', borderRadius: '6px', border: '1px solid var(--border)', padding: '0 0.5rem', transition: 'box-shadow 0.2s', boxShadow: showSuggestions ? '0 0 0 2px var(--primary-light)' : 'none' }}>
                        <span className="material-icons-round" style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>search</span>
                        <input
                            id="ih-product"
                            type="text"
                            placeholder="Buscar producto por nombre..."
                            value={productNameSearch}
                            onChange={(e) => {
                                setProductNameSearch(e.target.value);
                                // Cambiar el texto quita el producto elegido: volver a la página 1
                                if (productId) {
                                    setProductId('');
                                    setPage(0);
                                }
                            }}
                            onFocus={() => {
                                if (productSuggestions.length > 0) setShowSuggestions(true);
                            }}
                            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                            style={{ flex: 1, padding: '0.5rem', border: 'none', background: 'transparent', outline: 'none' }}
                        />
                        {productNameSearch && (
                            <button
                                type="button"
                                aria-label="Quitar producto"
                                onClick={clearProduct}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}
                            >
                                <span className="material-icons-round" style={{ fontSize: '1.1rem' }}>close</span>
                            </button>
                        )}
                    </div>
                    {/* Autocomplete Dropdown */}
                    {showSuggestions && (productSuggestions.length > 0 || searchLoading) && (
                        <div style={{
                            position: 'absolute',
                            top: '100%',
                            left: 0,
                            right: 0,
                            background: 'white',
                            border: '1px solid var(--border)',
                            borderRadius: '8px',
                            marginTop: '0.5rem',
                            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)',
                            zIndex: 10,
                            maxHeight: '200px',
                            overflowY: 'auto'
                        }}>
                            {searchLoading ? (
                                <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Buscando...</div>
                            ) : (
                                productSuggestions.map(product => (
                                    <div
                                        key={product.id}
                                        onClick={() => {
                                            setProductNameSearch(product.nombre);
                                            setProductId(product.id);
                                            setShowSuggestions(false);
                                            setPage(0);
                                        }}
                                        style={{
                                            padding: '0.75rem 1rem',
                                            cursor: 'pointer',
                                            borderBottom: '1px solid #f3f4f6',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            gap: '0.5rem'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                                    >
                                        <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>
                                            <span>{product.nombre}</span>
                                            {product.active === false && (
                                                <span style={{ marginLeft: '0.4rem', fontSize: '0.72rem', color: '#9ca3af', fontWeight: 600 }}>(inactivo)</span>
                                            )}
                                        </span>
                                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', background: '#f3f4f6', padding: '0.1rem 0.4rem', borderRadius: '99px', whiteSpace: 'nowrap' }}>
                                            Stock: {product.stock}
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>

                {hasFilters && (
                    <button type="button" onClick={clearFilters} className="btn-secondary" style={{ whiteSpace: 'nowrap' }}>
                        Limpiar filtros
                    </button>
                )}
            </div>

            {invalidRange && (
                <div role="alert" style={{ background: '#fef2f2', color: '#b91c1c', padding: '0.6rem 0.9rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.9rem' }}>
                    La fecha "Desde" es posterior a "Hasta".
                </div>
            )}

            {/* Table */}
            <div style={{ flex: 1, overflow: 'auto', background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                    <thead style={{ background: '#f9fafb', position: 'sticky', top: 0, zIndex: 1 }}>
                        <tr style={{ textAlign: 'left', color: 'var(--text-secondary)' }}>
                            <th style={{ padding: '1rem', fontWeight: 600 }}>Fecha</th>
                            <th style={{ padding: '1rem', fontWeight: 600 }}>Producto</th>
                            <th style={{ padding: '1rem', fontWeight: 600 }}>Tipo</th>
                            <th style={{ padding: '1rem', fontWeight: 600 }}>Razón</th>
                            <th style={{ padding: '1rem', fontWeight: 600 }}>Orden</th>
                            <th style={{ padding: '1rem', fontWeight: 600 }}>Usuario</th>
                            <th style={{ padding: '1rem', fontWeight: 600, textAlign: 'right' }}>Stock Ant.</th>
                            <th style={{ padding: '1rem', fontWeight: 600, textAlign: 'center' }}>Cambio</th>
                            <th style={{ padding: '1rem', fontWeight: 600, textAlign: 'right' }}>Stock Nuevo</th>
                            <th style={{ padding: '1rem', fontWeight: 600, textAlign: 'center' }}>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan="10" style={{ padding: '2rem', textAlign: 'center' }}>Cargando...</td></tr>
                        ) : history.length === 0 ? (
                            <tr><td colSpan="10" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>No se encontraron movimientos.</td></tr>
                        ) : (
                            history.map(item => {
                                const delta = movementDelta(item);
                                const tone = TONE_STYLES[deltaTone(delta)];
                                return (
                                    <tr key={item.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                        <td style={{ padding: '1rem', whiteSpace: 'nowrap' }}>{item.timestamp ? new Date(item.timestamp).toLocaleString('es-CO') : '-'}</td>
                                        <td style={{ padding: '1rem', fontWeight: 500 }}>{item.productName || 'Producto Eliminado'}</td>
                                        <td style={{ padding: '1rem' }}>
                                            <span style={{
                                                padding: '0.2rem 0.6rem',
                                                borderRadius: '99px',
                                                fontSize: '0.75rem',
                                                fontWeight: 600,
                                                whiteSpace: 'nowrap',
                                                background: tone.badgeBg,
                                                color: tone.badgeColor
                                            }}>
                                                {movementTypeLabel(item.type)}
                                            </span>
                                        </td>
                                        <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>{item.reason || '-'}</td>
                                        <td style={{ padding: '1rem', whiteSpace: 'nowrap' }} title={item.orderId || ''}>
                                            {/* orderLabel viene del backend ("Factura #N · Pedido P-N") */}
                                            {item.orderLabel || formatOrderLabel({ orderId: item.orderId }) || '-'}
                                        </td>
                                        <td style={{ padding: '1rem' }}>{item.username || '-'}</td>
                                        <td style={{ padding: '1rem', textAlign: 'right', fontFamily: 'monospace' }}>{item.previousStock ?? '-'}</td>
                                        <td
                                            data-testid="movement-delta"
                                            style={{ padding: '1rem', textAlign: 'center', fontWeight: 'bold', color: tone.color }}
                                        >
                                            {formatDelta(delta)}
                                        </td>
                                        <td style={{ padding: '1rem', textAlign: 'right', fontFamily: 'monospace' }}>{item.newStock ?? '-'}</td>
                                        <td style={{ padding: '1rem', textAlign: 'center' }}>
                                            <button
                                                onClick={() => handleDownloadPdf(item.id)}
                                                style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer' }}
                                                title="Descargar Comprobante"
                                                aria-label="Descargar comprobante"
                                            >
                                                <span className="material-icons-round">description</span>
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'center', gap: '1rem', alignItems: 'center' }}>
                <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="btn-secondary">Anterior</button>
                <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Página {page + 1} de {totalPages || 1} (Total: {totalElements})</span>
                <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="btn-secondary">Siguiente</button>
            </div>
        </div>
    );
}
