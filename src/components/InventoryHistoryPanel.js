import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from './ToastContainer';
import productService from '../api/productService';

export default function InventoryHistoryPanel() {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const [totalElements, setTotalElements] = useState(0);

    // Filters
    const [type, setType] = useState('');
    // const [productId, setProductId] = useState('');
    const productId = null; // Filter not yet implemented in UI
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    // Product search suggestions
    // const [productSuggestions, setProductSuggestions] = useState([]);
    // const [showSuggestions, setShowSuggestions] = useState(false);

    const toast = useToast();

    // Movement Types Enum
    const movementTypes = [
        { value: 'CREATION', label: 'Creación' },
        { value: 'UPDATE', label: 'Actualización' },
        { value: 'STOCK_ADJUSTMENT', label: 'Ajuste Stock' },
        { value: 'SALE', label: 'Venta' },
        { value: 'RESTOCK', label: 'Reabastecimiento' },
        { value: 'DELETION', label: 'Eliminación' },
        { value: 'RETURN', label: 'Devolución' }
    ];

    const fetchHistory = useCallback(async () => {
        setLoading(true);
        try {
            const params = {
                page,
                size: 20,
                sort: 'timestamp,desc',
                type: type || null,
                productId: productId || null,
                startDate: startDate ? new Date(startDate).toISOString() : null,
                endDate: endDate ? new Date(endDate).toISOString() : null
            };

            const response = await productService.getInventoryHistory(params);
            setHistory(response.data.content);
            setTotalPages(response.data.totalPages);
            setTotalElements(response.data.totalElements);
        } catch (error) {
            console.error('Error fetching history:', error);
            toast.error('Error al cargar historial');
        } finally {
            setLoading(false);
        }
    }, [page, type, productId, startDate, endDate, toast]);

    useEffect(() => {
        fetchHistory();
    }, [fetchHistory]);

    // Debounced Product Search - Future Implementation
    // useEffect(() => {
    //     if (searchTerm.length > 2) {
    //         const timer = setTimeout(async () => {
    //             try {
    //                 // Search logic
    //             } catch (e) { }
    //         }, 300);
    //         return () => clearTimeout(timer);
    //     } else {
    //         setProductSuggestions([]);
    //     }
    // }, [searchTerm]);

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
            toast.error('Error al descargar PDF');
        }
    };

    const handleExportReport = async () => {
        try {
            const params = {
                type: type || null,
                productId: productId || null,
                startDate: startDate ? new Date(startDate).toISOString() : null,
                endDate: endDate ? new Date(endDate).toISOString() : null
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
            toast.error('Error al exportar reporte');
        }
    };

    return (
        <div style={{ padding: '1.5rem', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                        <span className="material-icons-round" style={{ color: 'var(--primary)' }}>history</span>
                        Historial de Inventario
                    </h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.2rem' }}>
                        Auditoría y trazabilidad de movimientos
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
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Tipo de Movimiento</label>
                    <select
                        value={type}
                        onChange={e => { setType(e.target.value); setPage(0); }}
                        style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)', minWidth: '150px' }}
                    >
                        <option value="">Todos</option>
                        {movementTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Desde</label>
                    <input
                        type="date"
                        value={startDate}
                        onChange={e => { setStartDate(e.target.value); setPage(0); }}
                        style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)' }}
                    />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Hasta</label>
                    <input
                        type="date"
                        value={endDate}
                        onChange={e => { setEndDate(e.target.value); setPage(0); }}
                        style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)' }}
                    />
                </div>

                {/* Product Search could go here too, but simplifying for now */}
            </div>

            {/* Table */}
            <div style={{ flex: 1, overflow: 'auto', background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                    <thead style={{ background: '#f9fafb', position: 'sticky', top: 0, zIndex: 1 }}>
                        <tr style={{ textAlign: 'left', color: 'var(--text-secondary)' }}>
                            <th style={{ padding: '1rem', fontWeight: 600 }}>Fecha</th>
                            <th style={{ padding: '1rem', fontWeight: 600 }}>Producto</th>
                            <th style={{ padding: '1rem', fontWeight: 600 }}>Tipo</th>
                            <th style={{ padding: '1rem', fontWeight: 600 }}>Razón</th>
                            <th style={{ padding: '1rem', fontWeight: 600 }}>Usuario</th>
                            <th style={{ padding: '1rem', fontWeight: 600, textAlign: 'right' }}>Stock Ant.</th>
                            <th style={{ padding: '1rem', fontWeight: 600, textAlign: 'center' }}>Cambio</th>
                            <th style={{ padding: '1rem', fontWeight: 600, textAlign: 'right' }}>Stock Nuevo</th>
                            <th style={{ padding: '1rem', fontWeight: 600, textAlign: 'center' }}>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan="9" style={{ padding: '2rem', textAlign: 'center' }}>Cargando...</td></tr>
                        ) : history.length === 0 ? (
                            <tr><td colSpan="9" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>No se encontraron movimientos.</td></tr>
                        ) : (
                            history.map(item => (
                                <tr key={item.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                    <td style={{ padding: '1rem' }}>{new Date(item.timestamp).toLocaleString()}</td>
                                    <td style={{ padding: '1rem', fontWeight: 500 }}>{item.productName || 'Producto Eliminado'}</td>
                                    <td style={{ padding: '1rem' }}>
                                        <span style={{
                                            padding: '0.2rem 0.6rem',
                                            borderRadius: '99px',
                                            fontSize: '0.75rem',
                                            fontWeight: 600,
                                            background: item.type === 'CREATION' ? '#dcfce7' : item.type === 'DELETION' ? '#fee2e2' : '#f3f4f6',
                                            color: item.type === 'CREATION' ? '#166534' : item.type === 'DELETION' ? '#991b1b' : '#374151'
                                        }}>
                                            {movementTypes.find(t => t.value === item.type)?.label || item.type}
                                        </span>
                                    </td>
                                    <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>{item.reason || '-'}</td>
                                    <td style={{ padding: '1rem' }}>{item.username}</td>
                                    <td style={{ padding: '1rem', textAlign: 'right', fontFamily: 'monospace' }}>{item.previousStock}</td>
                                    <td style={{ padding: '1rem', textAlign: 'center', fontWeight: 'bold', color: item.quantityChange > 0 ? '#10b981' : '#ef4444' }}>
                                        {item.quantityChange > 0 ? '+' : ''}{item.quantityChange}
                                    </td>
                                    <td style={{ padding: '1rem', textAlign: 'right', fontFamily: 'monospace' }}>{item.newStock}</td>
                                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                                        <button
                                            onClick={() => handleDownloadPdf(item.id)}
                                            style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer' }}
                                            title="Descargar Comprobante"
                                        >
                                            <span className="material-icons-round">description</span>
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination Controls could go here */}
            <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'center', gap: '1rem', alignItems: 'center' }}>
                <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="btn-secondary">Anterior</button>
                <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Página {page + 1} de {totalPages || 1} (Total: {totalElements})</span>
                <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="btn-secondary">Siguiente</button>
            </div>
        </div>
    );
}
