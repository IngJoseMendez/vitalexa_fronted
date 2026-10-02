import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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

// refreshTrigger (INVENTORY_UPDATE o "Actualizar" del panel de admin): vuelve a pedir las
// promociones y las reemplaza en su lugar, sin cerrar el formulario abierto ni perder la
// búsqueda o la pestaña (Activas/Inactivas/Todas). handleFormSuccess/handleFormClose ya cierran
// y limpian el formulario de forma explícita.
function PromotionsPanel({ refreshTrigger }) {
    const [promotions, setPromotions] = useState([]);
    const [loading, setLoading] = useState(true);
    const reqRef = useRef(0); // solo la última petición aplica su respuesta
    const loadedRef = useRef(false); // ya terminó la carga inicial: las siguientes son silenciosas
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
        const reqId = ++reqRef.current;
        try {
            if (!loadedRef.current) setLoading(true);
            const response = await promotionService.getAll();
            if (reqId !== reqRef.current) return;
            setPromotions(response.data || []);
        } catch (error) {
            if (reqId !== reqRef.current) return;
            // Si falla, las promociones que ya se ven se conservan (el aviso es el mismo de antes)
            console.error('Error al cargar promociones:', error);
            toast.error('Error al cargar promociones');
        } finally {
            if (reqId === reqRef.current) {
                loadedRef.current = true;
                setLoading(false);
            }
        }
    }, [toast]);

    useEffect(() => {
        fetchPromotions();
    }, [fetchPromotions, refreshTrigger]);

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

    // Solo en la carga inicial (las recargas no vuelven a poner loading en true)
    if (loading) {
        return (
            <div className="ui-loading">
                <span className="ui-spinner" aria-hidden="true" />
                Cargando promociones...
            </div>
        );
    }

    return (
        <div className="promotions-panel">
            <header className="ui-page-header">
                <div className="ui-page-heading">
                    <h2 className="ui-page-title">
                        <span className="material-icons-round" aria-hidden="true">local_offer</span>
                        Gestión de Promociones
                    </h2>
                    <p className="ui-page-desc">Paquetes y regalos que pueden vender las vendedoras.</p>
                </div>
                <div className="ui-page-actions">
                    <button type="button" className="ui-btn ui-btn--primary" onClick={() => setShowForm(true)}>
                        <span className="material-icons-round" aria-hidden="true">add</span>
                        Nueva Promoción
                    </button>
                </div>
            </header>

            {promotions.length === 0 ? (
                <div className="ui-empty">
                    <span className="material-icons-round ui-empty-icon" aria-hidden="true">local_offer</span>
                    <p className="ui-empty-title">No hay promociones creadas</p>
                    <p className="ui-empty-text">Crea la primera con “Nueva Promoción”.</p>
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
                    <div className="ui-empty promo-no-results">
                        <span className="material-icons-round ui-empty-icon" aria-hidden="true">search_off</span>
                        <p className="ui-empty-text">
                            {searchTerm.trim()
                                ? `No hay promociones ${statusTab === PROMO_TABS.ACTIVE ? 'activas ' : statusTab === PROMO_TABS.INACTIVE ? 'inactivas ' : ''}que coincidan con "${searchTerm.trim()}".`
                                : statusTab === PROMO_TABS.ACTIVE ? 'No hay promociones activas.' : 'No hay promociones inactivas.'}
                        </p>
                        {statusTab !== PROMO_TABS.ALL && tabCounts.all > 0 && (
                            <button type="button" className="ui-btn ui-btn--secondary ui-btn--sm ui-empty-action" onClick={() => setStatusTab(PROMO_TABS.ALL)}>
                                Ver en Todas ({tabCounts.all})
                            </button>
                        )}
                        {searchTerm && (statusTab === PROMO_TABS.ALL || tabCounts.all === 0) && (
                            <button type="button" className="ui-btn ui-btn--secondary ui-btn--sm ui-empty-action" onClick={() => setSearchTerm('')}>
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
                            <article
                                key={promotion.id}
                                className={`ui-card promotion-card${!promotion.active ? ' inactive' : ''}`}
                            >
                                <div className="ui-card-header promotion-header">
                                    <div className="promotion-heading">
                                        <h3 className="ui-card-title promotion-title">{promotion.nombre}</h3>
                                        <div className="promotion-badges">
                                            <span className="ui-badge ui-badge--neutral">
                                                {getPromotionTypeLabel(promotion.type)}
                                            </span>
                                            <span className={`ui-badge ${promotion.active ? 'ui-badge--success' : 'ui-badge--neutral'}`}>
                                                {promotion.active ? 'Activa' : 'Inactiva'}
                                            </span>
                                            {isValid && promotion.active && (
                                                <span className="ui-badge ui-badge--primary">
                                                    <span className="material-icons-round" aria-hidden="true">check_circle</span>
                                                    Válida Ahora
                                                </span>
                                            )}
                                            {dateLabel && (
                                                <span className={`ui-badge ${dateLabel === 'Vencida' ? 'ui-badge--danger' : 'ui-badge--warning'}`}>
                                                    <span className="material-icons-round" aria-hidden="true">
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
                                        <span className="ui-badge ui-badge--success">Todas</span>
                                    ) : vendorNames.length > 0 ? (
                                        vendorNames.map((name, i) => (
                                            <span key={`${name}-${i}`} className="ui-badge ui-badge--neutral">{name}</span>
                                        ))
                                    ) : (
                                        <span className="ui-badge ui-badge--warning">Ninguna (solo admin)</span>
                                    )}
                                </div>

                                <div className="ui-meta promotion-info">
                                    <div className="ui-meta-row">
                                        <span className="ui-meta-label">Compra:</span>
                                        <span className="ui-meta-value">
                                            {promotion.buyQuantity} {promotion.mainProduct?.nombre}
                                        </span>
                                    </div>

                                    <div className="ui-meta-row">
                                        <span className="ui-meta-label">Recibe Gratis:</span>
                                        <div className="ui-meta-value promotion-gifts-list">
                                            {promotion.type === PromotionType.PACK ? (
                                                promotion.giftItems && promotion.giftItems.length > 0 ? (
                                                    promotion.giftItems.map((gift, idx) => (
                                                        <span key={idx}>
                                                            {gift.quantity}x {gift.product ? gift.product.nombre : 'Producto'}
                                                        </span>
                                                    ))
                                                ) : (
                                                    <span className="ui-muted">Sin regalos definidos</span>
                                                )
                                            ) : (
                                                <span>
                                                    {/* Un backend anterior no envía freeQuantity: no mostrar "undefined" */}
                                                    {promotion.freeQuantity != null
                                                        ? `Hasta ${promotion.freeQuantity} a elección`
                                                        : 'Unidades a elección'}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {promotion.packPrice != null && promotion.packPrice !== '' && (
                                        <div className="ui-meta-row promotion-price-row">
                                            <span className="ui-meta-label">Precio del paquete:</span>
                                            <span className="ui-meta-value ui-amount promotion-price">${formatCurrency(promotion.packPrice)}</span>
                                        </div>
                                    )}

                                    <div className="ui-meta-row">
                                        <span className="ui-meta-label">Combinar con descuentos:</span>
                                        <span className="ui-meta-value">
                                            {promotion.allowStackWithDiscounts ? 'Sí' : 'No'}
                                        </span>
                                    </div>

                                    <div className="ui-meta-row">
                                        <span className="ui-meta-label">Surtidos Extra:</span>
                                        <span className="ui-meta-value">
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
                                                    width="40"
                                                    height="40"
                                                    loading="lazy"
                                                    decoding="async"
                                                    onError={(e) => {
                                                        e.target.style.display = 'none';
                                                    }}
                                                />
                                            )}
                                            <div className="promotion-product-text">
                                                <div className="promotion-product-name">
                                                    {promotion.mainProduct.nombre}
                                                </div>
                                                <div className="promotion-product-caption">
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
                                                <span className="material-icons-round" aria-hidden="true">
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

                                <div className="ui-card-footer promotion-actions">
                                    <button
                                        type="button"
                                        className="ui-btn ui-btn--secondary ui-btn--sm"
                                        onClick={() => handleEdit(promotion)}
                                        title="Editar promoción"
                                    >
                                        <span className="material-icons-round" aria-hidden="true">edit</span>
                                        Editar
                                    </button>
                                    <button
                                        type="button"
                                        className="ui-btn ui-btn--secondary ui-btn--sm"
                                        onClick={() => handleToggleStatus(promotion.id, promotion.active)}
                                        title={promotion.active ? 'Desactivar' : 'Activar'}
                                    >
                                        <span className="material-icons-round" aria-hidden="true">
                                            {promotion.active ? 'visibility_off' : 'visibility'}
                                        </span>
                                        {promotion.active ? 'Desactivar' : 'Activar'}
                                    </button>
                                    <button
                                        type="button"
                                        className="ui-btn ui-btn--secondary ui-btn--sm promo-action-delete"
                                        onClick={() => handleDelete(promotion)}
                                        title="Eliminar promoción"
                                    >
                                        <span className="material-icons-round" aria-hidden="true">delete_outline</span>
                                        Eliminar
                                    </button>
                                </div>
                            </article>
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
