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
import { avatarTone, avatarInitials } from '../utils/avatarTone';
import '../styles/areas/Inventory.css';

// Colores por sentido del cambio real de stock (no por el tipo).
// `color` va en línea en la celda "Cambio" (lo verifica InventoryHistoryPanel.test.js) y
// coincide con los tokens --color-success / --color-danger. `icon` = flecha del sentido.
const TONE_STYLES = {
    in: { color: '#059669', icon: 'arrow_upward' },
    out: { color: '#dc2626', icon: 'arrow_downward' },
    none: { color: '#6b7280', icon: null },
};

// Color de significado por TIPO de movimiento (insignia + icono): entrada = verde,
// salida/venta = azul, devolución = teal, ajuste = ámbar, eliminación = rojo, edición de
// datos = celeste. Solo presentación: la etiqueta sigue saliendo de movementTypeLabel.
const MOVEMENT_TYPE_META = {
    RESTOCK: { tone: 'success', icon: 'local_shipping' },
    CREATION: { tone: 'success', icon: 'add_circle' },
    SALE: { tone: 'primary', icon: 'point_of_sale' },
    ANNULMENT_REVERSAL: { tone: 'primary', icon: 'restore' },
    RETURN: { tone: 'teal', icon: 'assignment_return' },
    ORDER_EDIT_RESTORE: { tone: 'teal', icon: 'undo' },
    ORDER_ITEM_REMOVAL: { tone: 'teal', icon: 'remove_shopping_cart' },
    STOCK_ADJUSTMENT: { tone: 'warning', icon: 'tune' },
    PHYSICAL_COUNT: { tone: 'warning', icon: 'fact_check' },
    UPDATE: { tone: 'sky', icon: 'edit_note' },
    DELETION: { tone: 'danger', icon: 'delete' },
};
const DEFAULT_TYPE_META = { tone: 'neutral', icon: 'swap_vert' };

// Tono del stock en la sugerencia de producto: negativo rojo, 0 ámbar, con stock verde
const stockBadgeTone = (stock) => {
    const n = Number(stock);
    if (Number.isNaN(n)) return 'neutral';
    if (n < 0) return 'danger';
    if (n === 0) return 'warning';
    return 'success';
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

    // Descarga en curso (solo presentación). Patrón exportingKey: el boolean dice SI se
    // exporta y la clave QUÉ botón lo inició ('report' o 'row:<id>'); solo ese muestra el
    // spinner y "Exportando...", los demás quedan deshabilitados mientras tanto.
    const [exporting, setExporting] = useState(false);
    const [exportingKey, setExportingKey] = useState(null);
    useEffect(() => { if (!exporting) setExportingKey(null); }, [exporting]);
    const exportBusy = (key) => exporting && exportingKey === key;

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
        setExporting(true);
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
        } finally {
            setExporting(false);
        }
    };

    const handleExportReport = async () => {
        if (invalidRange) {
            toast.warning("La fecha 'Desde' es posterior a 'Hasta'");
            return;
        }
        setExporting(true);
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
        } finally {
            setExporting(false);
        }
    };

    return (
        <div className="inv-page inv-history">
            <header className="ui-page-header">
                <div className="ui-page-heading">
                    <h2 className="ui-page-title">
                        <span className="material-icons-round" aria-hidden="true">history</span>
                        Historial de Inventario
                    </h2>
                    <p className="ui-page-desc">
                        Auditoría y trazabilidad de movimientos (más reciente primero)
                    </p>
                </div>
                <div className="ui-page-actions">
                    {/* PDF = rojo (identidad de formato). Mientras exporta: spinner, "Exportando..."
                        y barra fina inferior; la etiqueta normal reserva el ancho */}
                    <button
                        type="button"
                        onClickCapture={() => setExportingKey('report')}
                        onClick={handleExportReport}
                        disabled={exporting}
                        aria-busy={exportBusy('report') || undefined}
                        className={`ui-btn ui-btn--pdf${exportBusy('report') ? ' is-loading' : ''}`}
                    >
                        {exportBusy('report')
                            ? <span className="ui-spinner" aria-hidden="true" />
                            : <span className="material-icons-round" aria-hidden="true">picture_as_pdf</span>}
                        <span className="ui-btn-label">
                            {exportBusy('report') && <span className="ui-btn-label-sizer" aria-hidden="true">Exportar Reporte</span>}
                            <span>{exportBusy('report') ? 'Exportando...' : 'Exportar Reporte'}</span>
                        </span>
                    </button>
                </div>
            </header>

            {/* Filters */}
            <div className="inv-filters">
                <div className="ui-field">
                    <label htmlFor="ih-type" className="ui-label">Tipo de Movimiento</label>
                    <select
                        id="ih-type"
                        className="ui-select"
                        value={type}
                        onChange={e => { setType(e.target.value); setPage(0); }}
                    >
                        <option value="">Todos</option>
                        {MOVEMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                </div>

                <div className="ui-field">
                    <label htmlFor="ih-start" className="ui-label">Desde</label>
                    <input
                        id="ih-start"
                        type="date"
                        className="ui-input"
                        value={startDate}
                        onChange={e => { setStartDate(e.target.value); setPage(0); }}
                    />
                </div>

                <div className="ui-field">
                    <label htmlFor="ih-end" className="ui-label">Hasta (incluido)</label>
                    <input
                        id="ih-end"
                        type="date"
                        className={`ui-input${invalidRange ? ' is-invalid' : ''}`}
                        aria-invalid={invalidRange}
                        value={endDate}
                        onChange={e => { setEndDate(e.target.value); setPage(0); }}
                    />
                </div>

                <div className="ui-field inv-field-grow">
                    <label htmlFor="ih-product" className="ui-label">Producto (incluye inactivos)</label>
                    <div className="ui-search inv-field-search">
                        <span className="material-icons-round ui-search-icon" aria-hidden="true">search</span>
                        <input
                            id="ih-product"
                            type="text"
                            className="ui-input"
                            autoComplete="off"
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
                        />
                        {productNameSearch && (
                            <button
                                type="button"
                                aria-label="Quitar producto"
                                className="ui-icon-btn ui-search-clear"
                                onClick={clearProduct}
                            >
                                <span className="material-icons-round" aria-hidden="true">close</span>
                            </button>
                        )}
                    </div>
                    {/* Autocomplete Dropdown */}
                    {showSuggestions && (productSuggestions.length > 0 || searchLoading) && (
                        <div className="inv-suggest">
                            {searchLoading ? (
                                <div className="inv-suggest-loading">Buscando...</div>
                            ) : (
                                productSuggestions.map(product => (
                                    <div
                                        key={product.id}
                                        className="inv-suggest-item"
                                        onClick={() => {
                                            setProductNameSearch(product.nombre);
                                            setProductId(product.id);
                                            setShowSuggestions(false);
                                            setPage(0);
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-surface-hover)'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = ''}
                                    >
                                        <span className="inv-suggest-name">
                                            <span>{product.nombre}</span>
                                            {product.active === false && (
                                                <span className="inv-suggest-inactive">(inactivo)</span>
                                            )}
                                        </span>
                                        <span className={`ui-badge ui-badge--${stockBadgeTone(product.stock)} ui-tabular`}>
                                            Stock: {product.stock}
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>

                {hasFilters && (
                    <button type="button" onClick={clearFilters} className="ui-btn ui-btn--secondary">
                        Limpiar filtros
                    </button>
                )}
            </div>

            {invalidRange && (
                <div role="alert" className="ui-alert ui-alert--danger">
                    <span className="material-icons-round" aria-hidden="true">error_outline</span>
                    <p>La fecha "Desde" es posterior a "Hasta".</p>
                </div>
            )}

            {/* Table */}
            <div className="ui-table-wrap">
                <table className="ui-table inv-stack-table">
                    <thead>
                        <tr>
                            <th>Fecha</th>
                            <th>Producto</th>
                            <th>Tipo</th>
                            <th>Razón</th>
                            <th>Orden</th>
                            <th>Usuario</th>
                            <th className="ui-num">Stock Ant.</th>
                            <th className="ui-num">Cambio</th>
                            <th className="ui-num">Stock Nuevo</th>
                            <th className="inv-col-actions">Acciones</th>
                        </tr>
                    </thead>
                    {/* Las primeras 8 filas entran escalonadas (keys estables por id) */}
                    <tbody className="ui-stagger">
                        {loading ? (
                            <tr>
                                <td colSpan="10" className="inv-table-state inv-table-state--skeleton">
                                    <span className="ui-sr-only" role="status">Cargando...</span>
                                    <span className="ui-skeleton-stack" aria-hidden="true">
                                        {[0, 1, 2, 3, 4].map(i => (
                                            <span key={i} className="inv-skeleton-line">
                                                <span className="ui-skeleton ui-skeleton--circle inv-skeleton-dot" />
                                                <span className="ui-skeleton ui-skeleton--text inv-skeleton-fill" />
                                                <span className="ui-skeleton ui-skeleton--text inv-skeleton-tail" />
                                            </span>
                                        ))}
                                    </span>
                                </td>
                            </tr>
                        ) : history.length === 0 ? (
                            <tr>
                                <td colSpan="10" className="inv-table-state">
                                    <span className="inv-table-state-inner">
                                        <span className="material-icons-round inv-icon--primary" aria-hidden="true">manage_search</span>
                                        No se encontraron movimientos.
                                    </span>
                                </td>
                            </tr>
                        ) : (
                            history.map(item => {
                                const delta = movementDelta(item);
                                const tone = TONE_STYLES[deltaTone(delta)];
                                const typeMeta = MOVEMENT_TYPE_META[item.type] || DEFAULT_TYPE_META;
                                const orderText = item.orderLabel || formatOrderLabel({ orderId: item.orderId });
                                const rowKey = `row:${item.id}`;
                                return (
                                    <tr key={item.id}>
                                        <td className="inv-nowrap ui-tabular inv-cell-date" data-label="Fecha">{item.timestamp ? new Date(item.timestamp).toLocaleString('es-CO') : '-'}</td>
                                        <td className="inv-cell-name" data-label="Producto">{item.productName || 'Producto Eliminado'}</td>
                                        <td data-label="Tipo">
                                            <span className={`ui-badge inv-type-badge inv-type-badge--${typeMeta.tone}`}>
                                                <span className="material-icons-round" aria-hidden="true">{typeMeta.icon}</span>
                                                {movementTypeLabel(item.type)}
                                            </span>
                                        </td>
                                        <td className="inv-cell-muted" data-label="Razón">{item.reason || '-'}</td>
                                        <td className={`inv-nowrap${orderText ? ' inv-order-ref' : ''}`} data-label="Orden" title={item.orderId || ''}>
                                            {/* orderLabel viene del backend ("Factura #N · Pedido P-N") */}
                                            {item.orderLabel || formatOrderLabel({ orderId: item.orderId }) || '-'}
                                        </td>
                                        <td data-label="Usuario">
                                            {item.username ? (
                                                <span className="inv-user">
                                                    <span className={`ui-avatar ui-avatar--sm ui-avatar--${avatarTone(item.username)}`} aria-hidden="true">
                                                        {avatarInitials(item.username)}
                                                    </span>
                                                    <span>{item.username}</span>
                                                </span>
                                            ) : '-'}
                                        </td>
                                        <td className={`ui-num${item.previousStock < 0 ? ' inv-stock-negative' : ''}`} data-label="Stock Ant.">{item.previousStock ?? '-'}</td>
                                        <td
                                            data-testid="movement-delta"
                                            data-label="Cambio"
                                            className="ui-num inv-delta"
                                            style={{ color: tone.color }}
                                        >
                                            <span className="inv-delta-value">
                                                {tone.icon && <span className="material-icons-round" aria-hidden="true">{tone.icon}</span>}
                                                {formatDelta(delta)}
                                            </span>
                                        </td>
                                        <td className={`ui-num inv-stock-new${item.newStock < 0 ? ' inv-stock-negative' : ''}`} data-label="Stock Nuevo">{item.newStock ?? '-'}</td>
                                        <td className="inv-col-actions" data-label="Acciones">
                                            {/* Comprobante en PDF: icono rojo; spinner solo en la fila pulsada */}
                                            <button
                                                type="button"
                                                className={`ui-icon-btn ui-icon-btn--bordered ui-icon-btn--pdf${exportBusy(rowKey) ? ' is-loading' : ''}`}
                                                aria-busy={exportBusy(rowKey) || undefined}
                                                disabled={exporting}
                                                onClickCapture={() => setExportingKey(rowKey)}
                                                onClick={() => handleDownloadPdf(item.id)}
                                                title="Descargar Comprobante"
                                                aria-label="Descargar comprobante"
                                            >
                                                {exportBusy(rowKey)
                                                    ? <span className="ui-spinner" aria-hidden="true" />
                                                    : <span className="material-icons-round" aria-hidden="true">picture_as_pdf</span>}
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
            <div className="inv-pagination">
                <button type="button" disabled={page === 0} onClick={() => setPage(p => p - 1)} className="ui-btn ui-btn--secondary ui-btn--sm">Anterior</button>
                <span className="inv-pagination-info">Página {page + 1} de {totalPages || 1} (Total: {totalElements})</span>
                <button type="button" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="ui-btn ui-btn--secondary ui-btn--sm">Siguiente</button>
            </div>
        </div>
    );
}
