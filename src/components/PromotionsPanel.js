import { useState, useEffect, useCallback } from 'react';
import promotionService from '../api/promotionService';
import { useToast } from './ToastContainer';
import { useConfirm } from './ConfirmDialog';
import { getPromotionTypeLabel, isPromotionValid } from '../utils/types';
import PromotionFormModal from './modals/PromotionFormModal';
import '../styles/Promotions.css';

function PromotionsPanel() {
    const [promotions, setPromotions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingPromotion, setEditingPromotion] = useState(null);
    const toast = useToast();
    const confirm = useConfirm();



    const fetchPromotions = useCallback(async () => {
        try {
            setLoading(true);
            const response = await promotionService.getAll();
            setPromotions(response.data || []);
        } catch (error) {
            console.error('Error al cargar promociones:', error);
            toast.error('Error al cargar promociones');
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        fetchPromotions();
    }, [fetchPromotions]);

    const handleToggleStatus = async (id, currentStatus) => {
        try {
            await promotionService.toggleStatus(id, !currentStatus);
            toast.success(currentStatus ? 'Promoción desactivada' : 'Promoción activada');
            // Update local state
            setPromotions(prev => prev.map(p =>
                p.id === id ? { ...p, active: !currentStatus } : p
            ));
        } catch (error) {
            console.error('Error al cambiar estado:', error);
            toast.error('Error al cambiar el estado de la promoción');
        }
    };

    const handleDelete = async (promotion) => {
        const confirmed = await confirm({
            title: '¿Eliminar promoción?',
            message: `¿Estás seguro de eliminar "${promotion.nombre}"? Esta acción no se puede deshacer.`
        });

        if (!confirmed) return;

        try {
            await promotionService.delete(promotion.id);
            toast.success('Promoción eliminada');
            setPromotions(prev => prev.filter(p => p.id !== promotion.id));
        } catch (error) {
            console.error('Error al eliminar promoción:', error);
            toast.error('Error al eliminar promoción');
        }
    };

    const handleEdit = (promotion) => {
        setEditingPromotion(promotion);
        setShowForm(true);
    };

    const handleFormClose = () => {
        setShowForm(false);
        setEditingPromotion(null);
    };

    const handleFormSuccess = () => {
        handleFormClose();
        fetchPromotions();
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleDateString('es-ES', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    if (loading) {
        return <div className="loading">Cargando promociones...</div>;
    }

    return (
        <div className="promotions-panel">
            <div className="panel-header">
                <h2>
                    <span className="material-icons-round" style={{ fontSize: '32px', color: 'var(--primary)' }}>
                        local_offer
                    </span>
                    Gestión de Promociones
                </h2>
                <button className="btn-add" onClick={() => setShowForm(true)}>
                    + Nueva Promoción
                </button>
            </div>

            {promotions.length === 0 ? (
                <div className="empty-state">
                    <p>
                        <span className="material-icons-round" style={{ fontSize: '48px', color: 'var(--text-muted)' }}>
                            local_offer
                        </span>
                        <br />
                        No hay promociones creadas
                    </p>
                </div>
            ) : (
                <div className="promotions-grid">
                    {promotions.map(promotion => {
                        const isValid = isPromotionValid(promotion);

                        return (
                            <div
                                key={promotion.id}
                                className={`promotion-card ${!promotion.active ? 'inactive' : ''}`}
                            >
                                <div className="promotion-header">
                                    <div>
                                        <h3 className="promotion-title">{promotion.nombre}</h3>
                                        <div className="promotion-badges">
                                            <span className={`promotion-badge type-${promotion.type.toLowerCase().replace('_', '-')}`}>
                                                {getPromotionTypeLabel(promotion.type)}
                                            </span>
                                            <span className={`promotion-badge status-${promotion.active ? 'active' : 'inactive'}`}>
                                                {promotion.active ? 'Activa' : 'Inactiva'}
                                            </span>
                                            {isValid && promotion.active && (
                                                <span className="promotion-badge valid-now">
                                                    <span className="material-icons-round" style={{ fontSize: '14px' }}>check_circle</span>
                                                    Válida Ahora
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {promotion.descripcion && (
                                    <p className="promotion-description">{promotion.descripcion}</p>
                                )}

                                <div className="promotion-info">
                                    <div className="promotion-info-row">
                                        <span className="promotion-info-label">Cantidades:</span>
                                        <span className="promotion-quantities">
                                            Compra {promotion.buyQuantity} + {promotion.freeQuantity} Gratis
                                        </span>
                                    </div>

                                    {promotion.packPrice && (
                                        <div className="promotion-info-row">
                                            <span className="promotion-info-label">Precio del Pack:</span>
                                            <span className="promotion-price">${parseFloat(promotion.packPrice).toFixed(2)}</span>
                                        </div>
                                    )}

                                    <div className="promotion-info-row">
                                        <span className="promotion-info-label">Combinar con descuentos:</span>
                                        <span className="promotion-info-value">
                                            {promotion.allowStackWithDiscounts ? 'Sí' : 'No'}
                                        </span>
                                    </div>

                                    <div className="promotion-info-row">
                                        <span className="promotion-info-label">Requiere surtidos:</span>
                                        <span className="promotion-info-value">
                                            {promotion.requiresAssortmentSelection ? 'Sí' : 'No'}
                                        </span>
                                    </div>
                                </div>

                                {promotion.mainProduct && (
                                    <div className="promotion-product">
                                        {promotion.mainProduct.imageUrl && (
                                            <img
                                                src={promotion.mainProduct.imageUrl}
                                                alt={promotion.mainProduct.nombre}
                                                className="promotion-product-image"
                                                onError={(e) => {
                                                    e.target.style.display = 'none';
                                                }}
                                            />
                                        )}
                                        <div>
                                            <div className="promotion-product-name">
                                                {promotion.mainProduct.nombre}
                                            </div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                Producto Principal
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {(promotion.validFrom || promotion.validUntil) && (
                                    <div className="promotion-validity">
                                        <strong>
                                            <span className="material-icons-round" style={{ fontSize: '14px', verticalAlign: 'middle' }}>
                                                event
                                            </span>
                                            {' '}Vigencia
                                        </strong>
                                        <span>
                                            {promotion.validFrom ? `Desde: ${formatDate(promotion.validFrom)}` : 'Sin fecha de inicio'}
                                        </span>
                                        <span>
                                            {promotion.validUntil ? `Hasta: ${formatDate(promotion.validUntil)}` : 'Sin fecha de fin'}
                                        </span>
                                    </div>
                                )}

                                <div className="promotion-actions">
                                    <button
                                        className="btn-promo-action edit"
                                        onClick={() => handleEdit(promotion)}
                                        title="Editar promoción"
                                    >
                                        <span className="material-icons-round" style={{ fontSize: '16px' }}>edit</span>
                                        Editar
                                    </button>
                                    <button
                                        className="btn-promo-action toggle"
                                        onClick={() => handleToggleStatus(promotion.id, promotion.active)}
                                        title={promotion.active ? 'Desactivar' : 'Activar'}
                                    >
                                        <span className="material-icons-round" style={{ fontSize: '16px' }}>
                                            {promotion.active ? 'visibility_off' : 'visibility'}
                                        </span>
                                        {promotion.active ? 'Desactivar' : 'Activar'}
                                    </button>
                                    <button
                                        className="btn-promo-action delete"
                                        onClick={() => handleDelete(promotion)}
                                        title="Eliminar promoción"
                                    >
                                        <span className="material-icons-round" style={{ fontSize: '16px' }}>delete_outline</span>
                                        Eliminar
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {showForm && (
                <PromotionFormModal
                    promotion={editingPromotion}
                    onClose={handleFormClose}
                    onSuccess={handleFormSuccess}
                />
            )}
        </div>
    );
}

export default PromotionsPanel;
