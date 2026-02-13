import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from './ToastContainer';
import specialPromotionService from '../api/specialPromotionService';
import SpecialPromotionFormModal from './modals/SpecialPromotionFormModal';
import { getPromotionTypeLabel } from '../utils/types';
import '../styles/SpecialProducts.css'; // Reuse styles

export default function SpecialPromotionsPanel() {
    const [promotions, setPromotions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [page, setPage] = useState(0);
    // const [totalPages, setTotalPages] = useState(0); // Pagination not yet implemented
    const [gridColumns] = useState(() => parseInt(localStorage.getItem('spIdxCols')) || 3);

    // Modal
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingPromotion, setEditingPromotion] = useState(null);

    const toast = useToast();

    const fetchPromotions = useCallback(async () => {
        setLoading(true);
        try {
            let res;
            if (searchTerm.trim()) {
                res = await specialPromotionService.search(searchTerm, page, 20);
            } else {
                res = await specialPromotionService.getAll(page, 20);
            }
            const data = res.data;
            if (data && data.content) {
                setPromotions(data.content);
                // setTotalPages(data.totalPages || 0);
            } else if (Array.isArray(data)) {
                setPromotions(data);
                // setTotalPages(1);
            } else {
                setPromotions([]);
            }
        } catch (err) {
            console.error('Error loading special promotions:', err);
            toast.error('Error al cargar promociones especiales');
        } finally {
            setLoading(false);
        }
    }, [searchTerm, page, toast]);

    useEffect(() => {
        fetchPromotions();
    }, [fetchPromotions]);

    useEffect(() => { setPage(0); }, [searchTerm]);

    const handleToggleStatus = async (promotion) => {
        try {
            const newStatus = !promotion.active;
            await specialPromotionService.toggleStatus(promotion.id, newStatus);
            setPromotions(prev => prev.map(p => p.id === promotion.id ? { ...p, active: newStatus } : p));
            toast.success(`Promoción ${newStatus ? 'activada' : 'desactivada'}`);
        } catch (err) {
            toast.error('Error al cambiar estado');
        }
    };

    const handleDelete = async (promotion) => {
        if (!window.confirm(`¿Eliminar "${promotion.nombre}"?`)) return;
        try {
            await specialPromotionService.remove(promotion.id);
            toast.success('Promoción eliminada');
            fetchPromotions();
        } catch (err) {
            toast.error('Error al eliminar');
        }
    };

    const openCreate = () => { setEditingPromotion(null); setIsModalOpen(true); };
    const openEdit = (p) => { setEditingPromotion(p); setIsModalOpen(true); };

    return (
        <div className="special-products-panel">
            {/* Header */}
            <div className="sp-header">
                <div>
                    <h2>
                        <span className="material-icons-round">local_offer</span>
                        Promociones Especiales
                    </h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.2rem' }}>
                        Promociones exclusivas para vendedores específicos
                    </p>
                </div>
                <div className="sp-header-actions">
                    <div className="sp-search-box">
                        <span className="material-icons-round">search</span>
                        <input type="text" placeholder="Buscar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                    </div>
                    <button className="sp-btn-create" onClick={openCreate}>
                        <span className="material-icons-round">add</span>
                        Nueva Promoción
                    </button>
                </div>
            </div>

            {/* Grid */}
            {loading ? (
                <div className="loading">Cargando...</div>
            ) : promotions.length === 0 ? (
                <div className="sp-empty">
                    <span className="material-icons-round">search_off</span>
                    <p>No se encontraron promociones especiales.</p>
                </div>
            ) : (
                <div className="sp-grid" style={{ gridTemplateColumns: `repeat(${gridColumns}, 1fr)` }}>
                    {promotions.map(promo => {
                        const isLinked = !!promo.parentPromotionId;
                        return (
                            <div key={promo.id} className="sp-card">
                                {/* Badge */}
                                <span className={`sp-type-badge ${isLinked ? 'linked' : 'standalone'}`}>
                                    <span className="material-icons-round" style={{ fontSize: '12px' }}>
                                        {isLinked ? 'link' : 'add_circle'}
                                    </span>
                                    {isLinked ? 'Vinculada' : 'Standalone'}
                                </span>

                                <div className="sp-card-body" style={{ marginTop: '2rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <h3>{promo.nombre}</h3>
                                        <label className="switch" onClick={e => e.stopPropagation()}>
                                            <input type="checkbox" checked={promo.active} onChange={() => handleToggleStatus(promo)} />
                                            <span className="slider round"></span>
                                        </label>
                                    </div>

                                    {isLinked && (
                                        <div className="sp-card-parent" style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
                                            <span className="material-icons-round" style={{ fontSize: '14px', marginRight: '4px' }}>subdirectory_arrow_right</span>
                                            Base: {promo.parentPromotionName}
                                        </div>
                                    )}

                                    <div style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#4b5563' }}>
                                        <span style={{ fontWeight: 600 }}>{getPromotionTypeLabel(promo.type)}</span> •
                                        Compra {promo.buyQuantity} {promo.mainProduct?.nombre}
                                    </div>

                                    {/* Vendors */}
                                    {promo.allowedVendorNames && promo.allowedVendorNames.length > 0 && (
                                        <div className="sp-card-vendors" style={{ marginTop: '1rem' }}>
                                            {promo.allowedVendorNames.map((name, i) => (
                                                <span key={i} className="sp-vendor-chip">{name}</span>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div className="sp-card-actions">
                                    <button onClick={() => openEdit(promo)}>
                                        <span className="material-icons-round" style={{ fontSize: '16px' }}>edit</span> Editar
                                    </button>
                                    <button className="btn-delete" onClick={() => handleDelete(promo)}>
                                        <span className="material-icons-round" style={{ fontSize: '18px' }}>delete</span>
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {isModalOpen && (
                <SpecialPromotionFormModal
                    promotion={editingPromotion}
                    onClose={() => setIsModalOpen(false)}
                    onSuccess={() => { fetchPromotions(); setIsModalOpen(false); }}
                />
            )}
        </div>
    );
}
