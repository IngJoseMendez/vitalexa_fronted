import React, { useState, useEffect, useCallback, useRef } from 'react';
import { formatCurrency } from '../utils/formatters';
import { PLACEHOLDER_IMAGE } from '../utils/placeholderImage';
import { useToast } from './ToastContainer';
import specialProductService from '../api/specialProductService';
import '../styles/SpecialProducts.css';


export default function VendorSpecialProductsPanel({ refreshTrigger }) {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(0);
    const [totalPages, setTotalPages] = useState(0);

    const toast = useToast();

    // Recarga silenciosa: el panel entero en "Cargando..." solo en la carga inicial y al cambiar
    // de página (lo pide la vendedora). Los refrescos de la misma página (INVENTORY_UPDATE de
    // cualquier usuario, "Actualizar") reemplazan las tarjetas en su lugar, sin salto de scroll
    // ni animaciones repetidas. Solo la última petición aplica su respuesta.
    const reqRef = useRef(0);
    const shownPageRef = useRef(null); // página de los productos que se ven

    const fetchProducts = useCallback(async () => {
        const reqId = ++reqRef.current;
        if (shownPageRef.current !== page) setLoading(true);
        try {
            const res = await specialProductService.getVendorProducts(page, 20);
            if (reqId !== reqRef.current) return; // llegó una petición más nueva
            shownPageRef.current = page;
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
            if (reqId !== reqRef.current) return;
            // Si falla, los productos que ya se ven se conservan (el aviso es el mismo de antes)
            console.error('Error loading vendor special products:', err);
            toast.error('Error al cargar productos especiales');
        } finally {
            if (reqId === reqRef.current) setLoading(false);
        }
    }, [page, toast]);

    useEffect(() => {
        fetchProducts();
    }, [fetchProducts, refreshTrigger]);

    if (loading) {
        return (
            <div className="vendor-sp-panel">
                <header className="ui-page-header">
                    <div className="ui-page-heading">
                        <h2 className="ui-page-title">
                            <span className="material-icons-round" aria-hidden="true">star</span>
                            Mis Productos Especiales
                        </h2>
                    </div>
                </header>
                <div className="ui-loading">
                    <span className="ui-spinner" aria-hidden="true" />
                    Cargando...
                </div>
            </div>
        );
    }

    return (
        <div className="vendor-sp-panel">
            <header className="ui-page-header">
                <div className="ui-page-heading">
                    <h2 className="ui-page-title">
                        <span className="material-icons-round" aria-hidden="true">star</span>
                        Mis Productos Especiales
                    </h2>
                </div>
            </header>

            {products.length === 0 ? (
                <div className="ui-empty">
                    <span className="material-icons-round ui-empty-icon" aria-hidden="true">search_off</span>
                    <p className="ui-empty-text">No tienes productos especiales asignados.</p>
                </div>
            ) : (
                <div className="vendor-sp-grid">
                    {products.map(product => (
                        <article key={product.id} className="ui-card ui-card--flush vendor-sp-card">
                            <div className="vendor-sp-card-img">
                                <img src={product.imageUrl || PLACEHOLDER_IMAGE} alt={product.nombre} loading="lazy" decoding="async"
                                    onError={e => e.target.src = PLACEHOLDER_IMAGE} />
                            </div>
                            <div className="vendor-sp-card-body">
                                <h4 className="ui-card-title">{product.nombre}</h4>
                                {product.descripcion && (
                                    <p className="vendor-sp-desc">
                                        {product.descripcion}
                                    </p>
                                )}
                                <div className="vendor-sp-price">${formatCurrency(parseFloat(product.precio))}</div>
                                <div className="vendor-sp-stock">
                                    <span className="material-icons-round" aria-hidden="true">inventory</span>
                                    {' '}Stock: {product.stock}
                                </div>
                            </div>
                        </article>
                    ))}
                </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <nav className="sp-pagination" aria-label="Paginación">
                    <button type="button" className="ui-icon-btn ui-icon-btn--bordered" disabled={page === 0} onClick={() => setPage(p => p - 1)} aria-label="Página anterior">
                        <span className="material-icons-round" aria-hidden="true">chevron_left</span>
                    </button>
                    <span className="sp-pagination-label">Página {page + 1} de {totalPages}</span>
                    <button type="button" className="ui-icon-btn ui-icon-btn--bordered" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} aria-label="Página siguiente">
                        <span className="material-icons-round" aria-hidden="true">chevron_right</span>
                    </button>
                </nav>
            )}
        </div>
    );
}
