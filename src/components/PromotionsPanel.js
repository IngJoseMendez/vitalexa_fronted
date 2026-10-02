import { useState, useEffect, useCallback, useMemo } from 'react';
import { formatCurrency } from '../utils/formatters';
import promotionService from '../api/promotionService';
import { useToast } from './ToastContainer';
import { useConfirm } from './ConfirmDialog';
import { getPromotionTypeLabel, isPromotionValid, PromotionType } from '../utils/types';
import {
    PROMO_TABS,
    matchesPromotionSearch,
    filterByTab,
    countByTab,
    getPromotionDateState,
    getDateStateLabel,
    isVisibleToAll,
} from '../utils/promotionFilters';
import PromotionFormModal from './modals/PromotionFormModal';
import PromotionListToolbar from './PromotionListToolbar';
import '../styles/Promotions.css';

function PromotionsPanel() {
    const [promotions, setPromotions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingPromotion, setEditingPromotion] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusTab, setStatusTab] = useState(PROMO_TABS.ACTIVE);
    const toast = useToast();
    const confirm = useConfirm();

    // Búsqueda en el cliente (GET /admin/promotions ya trae todas, activas e inactivas).
    // Los contadores de las pestañas reflejan la búsqueda para ver dónde quedaron los resultados.
    const searchedPromotions = useMemo(
        () => promotions.filter(p => matchesPromotionSearch(p, searchTerm)),
        [promotions, searchTerm]
    );
    const tabCounts = useMemo(() => countByTab(searchedPromotions), [searchedPromotions]);
    const visiblePromotions = useMemo(
        () => filterByTab(searchedPromotions, statusTab),
        [searchedPromotions, statusTab]
    );

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
            message: `¿Estás seguro de eliminar "${promotion.nombre}"? Esta acción no se puede deshacer. Si solo quieres que deje de venderse, usa "Desactivar".`
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
        // Evitar bug UTC: "2026-02-14" interpretado como UTC medianoche
        // muestra el día anterior en zonas UTC-5 (Colombia).
        if (typeof dateString === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
            const [year, month, day] = dateString.split('-');
            return new Date(Number(year), Number(month) - 1, Number(day))
                .toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric' });
        }
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
                <>
                <PromotionListToolbar
                    searchTerm={searchTerm}
                    onSearchChange={setSearchTerm}
                    tab={statusTab}
                    onTabChange={setStatusTab}
                    counts={tabCounts}
                    shownCount={visiblePromotions.length}
                    placeholder="Buscar por nombre, producto, regalo o vendedora..."
                />

                {visiblePromotions.length === 0 ? (
                    <div className="promo-no-results">
                        <span className="material-icons-round" aria-hidden="true">search_off</span>
                        <p>
                            {searchTerm.trim()
                                ? `No hay promociones ${statusTab === PROMO_TABS.ACTIVE ? 'activas ' : statusTab === PROMO_TABS.INACTIVE ? 'inactivas ' : ''}que coincidan con "${searchTerm.trim()}".`
                                : statusTab === PROMO_TABS.ACTIVE ? 'No hay promociones activas.' : 'No hay promociones inactivas.'}
                        </p>
                        {statusTab !== PROMO_TABS.ALL && tabCounts.all > 0 && (
                            <button type="button" className="promo-link-btn" onClick={() => setStatusTab(PROMO_TABS.ALL)}>
                                Ver en Todas ({tabCounts.all})
                            </button>
                        )}
                        {searchTerm && (statusTab === PROMO_TABS.ALL || tabCounts.all === 0) && (
                            <button type="button" className="promo-link-btn" onClick={() => setSearchTerm('')}>
                                Limpiar búsqueda
                            </button>
                        )}
                    </div>
                ) : (
                <div className="promotions-grid">
                    {visiblePromotions.map(promotion => {
                        const isValid = isPromotionValid(promotion);
                        // Vencida / Programada solo tiene sentido en las activas (las inactivas no se venden igual)
                        const dateLabel = promotion.active ? getDateStateLabel(getPromotionDateState(promotion)) : null;
                        const vendorNames = Array.isArray(promotion.allowedVendorNames) ? promotion.allowedVendorNames : [];

                        return (
                            <div
                                key={promotion.id}
                                className={`promotion-card ${!promotion.active ? 'inactive' : ''}`}
                            >
                                <div className="promotion-header">
                                    <div>
                                        <h3 className="promotion-title">{promotion.nombre}</h3>
                                        <div className="promotion-badges">
                                            <span className={`promotion-badge type-${(promotion.type || '').toLowerCase().replace(/_/g, '-')}`}>
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
                                            {dateLabel && (
                                                <span className={`promotion-badge date-${dateLabel === 'Vencida' ? 'expired' : 'scheduled'}`}>
                                                    <span className="material-icons-round" style={{ fontSize: '14px' }}>
                                                        {dateLabel === 'Vencida' ? 'event_busy' : 'schedule'}
                                                    </span>
                                                    {dateLabel}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {promotion.descripcion && (
                                    <p className="promotion-description">{promotion.descripcion}</p>
                                )}

                                {/* Quién la ve: "Todas" o las vendedoras asignadas */}
                                <div className="promo-vendors">
                                    <span className="promo-vendors-label">
                                        <span className="material-icons-round" aria-hidden="true">visibility</span>
                                        Vendedoras:
                                    </span>
                                    {isVisibleToAll(promotion) ? (
                                        <span className="promo-chip all">Todas</span>
                                    ) : vendorNames.length > 0 ? (
                                        vendorNames.map((name, i) => (
                                            <span key={`${name}-${i}`} className="promo-chip">{name}</span>
                                        ))
                                    ) : (
                                        <span className="promo-chip none">Ninguna (solo admin)</span>
                                    )}
                                </div>

                                <div className="promotion-info">
                                    <div className="promotion-info-row">
                                        <span className="promotion-info-label">Compra:</span>
                                        <span className="promotion-quantities">
                                            {promotion.buyQuantity} {promotion.mainProduct?.nombre}
                                        </span>
                                    </div>

                                    <div className="promotion-info-row" style={{ alignItems: 'flex-start' }}>
                                        <span className="promotion-info-label">Recibe Gratis:</span>
                                        <div className="promotion-gifts-list" style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
                                            {promotion.type === PromotionType.PACK ? (
                                                promotion.giftItems && promotion.giftItems.length > 0 ? (
                                                    promotion.giftItems.map((gift, idx) => (
                                                        <span key={idx} className="promotion-quantities" style={{ fontSize: '0.85rem' }}>
                                                            {gift.quantity}x {gift.product ? gift.product.nombre : 'Producto'}
                                                        </span>
                                                    ))
                                                ) : (
                                                    <span className="promotion-quantities" style={{ color: 'var(--text-muted)' }}>Sin regalos definidos</span>
                                                )
                                            ) : (
                                                <span className="promotion-quantities">
                                                    {/* Un backend anterior no envía freeQuantity: no mostrar "undefined" */}
                                                    {promotion.freeQuantity != null
                                                        ? `Hasta ${promotion.freeQuantity} a elección`
                                                        : 'Unidades a elección'}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {promotion.packPrice != null && promotion.packPrice !== '' && (
                                        <div className="promotion-info-row price-row">
                                            <span className="promotion-info-label">Precio del paquete:</span>
                                            <span className="promotion-price">${formatCurrency(promotion.packPrice)}</span>
                                        </div>
                                    )}

                                    <div className="promotion-info-row">
                                        <span className="promotion-info-label">Combinar con descuentos:</span>
                                        <span className="promotion-info-value">
                                            {promotion.allowStackWithDiscounts ? 'Sí' : 'No'}
                                        </span>
                                    </div>

                                    <div className="promotion-info-row">
                                        <span className="promotion-info-label">Surtidos Extra:</span>
                                        <span className="promotion-info-value">
                                            {promotion.requiresAssortmentSelection ? 'Sí' : 'No'}
                                        </span>
                                    </div>
                                </div>

                                {
                                    promotion.mainProduct && (
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
                                    )
                                }

                                {
                                    (promotion.validFrom || promotion.validUntil) && (
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
                                    )
                                }

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
                </>
            )
            }

            {
                showForm && (
                    <PromotionFormModal
                        promotion={editingPromotion}
                        onClose={handleFormClose}
                        onSuccess={handleFormSuccess}
                    />
                )
            }
        </div >
    );
}

export default PromotionsPanel;
