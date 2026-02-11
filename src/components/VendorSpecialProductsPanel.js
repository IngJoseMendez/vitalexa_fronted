import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from './ToastContainer';
import specialProductService from '../api/specialProductService';
import '../styles/SpecialProducts.css';

const PLACEHOLDER_IMAGE = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23f3f4f6" width="200" height="200"/%3E%3Ctext fill="%239ca3af" font-family="Arial,sans-serif" font-size="16" dy="10" font-weight="bold" x="50%25" y="50%25" text-anchor="middle"%3ESin Imagen%3C/text%3E%3C/svg%3E';

export default function VendorSpecialProductsPanel({ refreshTrigger }) {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(0);
    const [totalPages, setTotalPages] = useState(0);

    const toast = useToast();

    const fetchProducts = useCallback(async () => {
        setLoading(true);
        try {
            const res = await specialProductService.getVendorProducts(page, 20);
            const data = res.data;
            if (data && data.content) {
                setProducts(data.content);
                setTotalPages(data.totalPages || 0);
            } else if (Array.isArray(data)) {
                setProducts(data);
                setTotalPages(1);
            } else {
                setProducts([]);
                setTotalPages(0);
            }
        } catch (err) {
            console.error('Error loading vendor special products:', err);
            toast.error('Error al cargar productos especiales');
        } finally {
            setLoading(false);
        }
    }, [page, toast]);

    useEffect(() => {
        fetchProducts();
    }, [fetchProducts, refreshTrigger]);

    if (loading) {
        return (
            <div className="vendor-sp-panel">
                <h2>
                    <span className="material-icons-round" style={{ color: 'var(--primary)' }}>star</span>
                    Mis Productos Especiales
                </h2>
                <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <div className="loading">Cargando...</div>
                </div>
            </div>
        );
    }

    return (
        <div className="vendor-sp-panel">
            <h2>
                <span className="material-icons-round" style={{ color: 'var(--primary)' }}>star</span>
                Mis Productos Especiales
            </h2>

            {products.length === 0 ? (
                <div className="sp-empty">
                    <span className="material-icons-round">search_off</span>
                    <p>No tienes productos especiales asignados.</p>
                </div>
            ) : (
                <div className="vendor-sp-grid">
                    {products.map(product => (
                        <div key={product.id} className="vendor-sp-card">
                            <div className="vendor-sp-card-img">
                                <img src={product.imageUrl || PLACEHOLDER_IMAGE} alt={product.nombre}
                                    onError={e => e.target.src = PLACEHOLDER_IMAGE} />
                            </div>
                            <div className="vendor-sp-card-body">
                                <h4>{product.nombre}</h4>
                                {product.descripcion && (
                                    <p style={{
                                        color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '0.5rem',
                                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'
                                    }}>
                                        {product.descripcion}
                                    </p>
                                )}
                                <div className="price">${parseFloat(product.precio).toFixed(2)}</div>
                                <div className="stock-info">
                                    <span className="material-icons-round" style={{ fontSize: '14px', verticalAlign: 'middle' }}>inventory</span>
                                    {' '}Stock: {product.stock}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="sp-pagination">
                    <button disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                        <span className="material-icons-round" style={{ fontSize: '18px' }}>chevron_left</span>
                    </button>
                    <span>Página {page + 1} de {totalPages}</span>
                    <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                        <span className="material-icons-round" style={{ fontSize: '18px' }}>chevron_right</span>
                    </button>
                </div>
            )}
        </div>
    );
}
