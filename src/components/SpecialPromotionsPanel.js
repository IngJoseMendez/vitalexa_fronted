import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useToast } from './ToastContainer';
import { useConfirm } from './ConfirmDialog';
import specialPromotionService from '../api/specialPromotionService';
import promotionService from '../api/promotionService';
import SpecialPromotionFormModal from './modals/SpecialPromotionFormModal';
import PromotionListToolbar from './PromotionListToolbar';
import { getPromotionTypeLabel, PromotionType } from '../utils/types';
import { formatCurrency } from '../utils/formatters';
import {
    PROMO_TABS,
    matchesPromotionSearch,
    filterByTab,
    countByTab,
    getPromotionDateState,
    getDateStateLabel,
    getParentBlockReason,
    sortByName,
    isSpecialVisibleToAll,
} from '../utils/promotionFilters';
import '../styles/SpecialProducts.css'; // Reuse styles
import '../styles/Promotions.css';

// Se cargan todas de una vez y se filtran en el cliente: antes solo se veía la página 0 de 20
// y la búsqueda del servidor (/search) excluía las inactivas.
const MAX_SPECIAL_PROMOTIONS = 500;

export default function SpecialPromotionsPanel({ refreshTrigger }) {
    const [promotions, setPromotions] = useState([]);
    // Promociones normales por id: para saber si el PADRE de una especial está activo y vigente
    const [parentsById, setParentsById] = useState({});
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusTab, setStatusTab] = useState(PROMO_TABS.ACTIVE);

    // Modal
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingPromotion, setEditingPromotion] = useState(null);

    const toast = useToast();
    const askConfirm = useConfirm();

    const fetchPromotions = useCallback(async () => {
        setLoading(true);
        try {
            const [specialsRes, parentsRes] = await Promise.allSettled([
                specialPromotionService.getAll(0, MAX_SPECIAL_PROMOTIONS),
                promotionService.getAll(),
            ]);

            if (specialsRes.status === 'fulfilled') {
                const data = specialsRes.value?.data;
                const list = Array.isArray(data?.content) ? data.content : (Array.isArray(data) ? data : []);
                setPromotions(sortByName(list));
            } else {
                console.error('Error loading special promotions:', specialsRes.reason);
                toast.error('Error al cargar promociones especiales');
            }

            // Si las normales no cargan, solo se pierde el aviso del padre: no se bloquea el panel
            if (parentsRes.status === 'fulfilled' && Array.isArray(parentsRes.value?.data)) {
                const map = {};
                parentsRes.value.data.forEach(p => { if (p?.id) map[p.id] = p; });
                setParentsById(map);
            } else if (parentsRes.status === 'rejected') {
                console.warn('No se pudieron cargar las promociones base:', parentsRes.reason);
            }
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        fetchPromotions();
    }, [fetchPromotions, refreshTrigger]);

    const searchedPromotions = useMemo(() => promotions.filter(promo => {
        // También se busca por el producto principal y los regalos del PADRE (son los que se venden)
        const parent = promo.parentPromotionId ? parentsById[promo.parentPromotionId] : null;
        const parentFields = parent
            ? [parent.mainProduct?.nombre, ...(parent.giftItems || []).map(g => g?.product?.nombre)]
            : [];
        return matchesPromotionSearch(promo, searchTerm, parentFields);
    }), [promotions, parentsById, searchTerm]);
    const tabCounts = useMemo(() => countByTab(searchedPromotions), [searchedPromotions]);
    const visiblePromotions = useMemo(
        () => filterByTab(searchedPromotions, statusTab),
        [searchedPromotions, statusTab]
    );

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
        // El backend hace borrado lógico: la especial queda desactivada (pestaña Inactivas)
        const ok = await askConfirm({
            title: 'Eliminar promoción',
            message: `¿Eliminar "${promotion.nombre}"? Quedará desactivada y pasará a Inactivas.`,
            confirmText: 'Eliminar',
            cancelText: 'Cancelar'
        });
        if (!ok) return;
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

    const renderCard = (promo) => {
        const isLinked = !!promo.parentPromotionId;
        const parent = isLinked ? parentsById[promo.parentPromotionId] : null;
        // En una vinculada la venta usa tipo, cantidad, producto y regalos del PADRE
        const type = parent?.type || promo.type;
        const buyQuantity = parent?.buyQuantity ?? promo.buyQuantity;
        const mainProductName = parent?.mainProduct?.nombre || promo.mainProductName;
        const parentReason = parent ? getParentBlockReason(parent) : null;
        // La vigencia propia de una vinculada no se valida al vender (manda la del padre):
        // solo se etiqueta con sus fechas cuando no se conoce el padre.
        const dateLabel = promo.active && !parent ? getDateStateLabel(getPromotionDateState(promo)) : null;
        const vendorNames = Array.isArray(promo.allowedVendorNames) ? promo.allowedVendorNames : [];

        return (
            <article key={promo.id} className="ui-card sp-card promo-sp-card">
                {/* Badge */}
                <span className="ui-badge ui-badge--neutral promo-sp-kind">
                    <span className="material-icons-round" aria-hidden="true">
                        {isLinked ? 'link' : 'add_circle'}
                    </span>
                    {isLinked ? 'Vinculada' : 'Standalone'}
                </span>

                <div className="promo-sp-body">
                    <div className="promo-sp-title-row">
                        <h3 className="ui-card-title">{promo.nombre}</h3>
                        <label className="ui-switch ui-switch--plain sp-switch" onClick={e => e.stopPropagation()} title={promo.active ? 'Desactivar' : 'Activar'}>
                            <input
                                type="checkbox"
                                checked={!!promo.active}
                                onChange={() => handleToggleStatus(promo)}
                                aria-label={`${promo.active ? 'Desactivar' : 'Activar'} ${promo.nombre}`}
                            />
                            <span className="ui-switch-track" aria-hidden="true"><span className="ui-switch-thumb" /></span>
                        </label>
                    </div>

                    {isLinked && (
                        <div className="sp-card-parent">
                            <span className="material-icons-round" aria-hidden="true">subdirectory_arrow_right</span>
                            Base: {promo.parentPromotionName}
                        </div>
                    )}

                    <div className="promo-sp-meta">
                        <span className="promo-sp-type">{getPromotionTypeLabel(type)}</span>
                        {' • '}Compra {buyQuantity} {mainProductName}
                        {type === PromotionType.BUY_GET_FREE && parent?.freeQuantity != null && (
                            <> + hasta {parent.freeQuantity} gratis</>
                        )}
                    </div>

                    {promo.packPrice != null && (
                        <div className="promo-sp-price">Precio: ${formatCurrency(promo.packPrice)}</div>
                    )}

                    {(parentReason || !isLinked || dateLabel) && (
                        <div className="promo-sp-badges">
                            {parentReason && (
                                <span className="ui-badge ui-badge--danger">
                                    <span className="material-icons-round" aria-hidden="true">block</span>
                                    {parentReason}
                                </span>
                            )}
                            {!isLinked && (
                                <span className="ui-badge ui-badge--danger">
                                    <span className="material-icons-round" aria-hidden="true">block</span>
                                    Standalone: no se puede vender
                                </span>
                            )}
                            {dateLabel && (
                                <span className={`ui-badge ${dateLabel === 'Vencida' ? 'ui-badge--danger' : 'ui-badge--warning'}`}>
                                    {dateLabel}
                                </span>
                            )}
                        </div>
                    )}

                    {/* Vendors */}
                    <div className="sp-card-vendors">
                        {isSpecialVisibleToAll(promo) ? (
                            <span className="ui-badge ui-badge--success">Todas las vendedoras</span>
                        ) : vendorNames.length > 0 ? (
                            vendorNames.map((name, i) => (
                                <span key={`${name}-${i}`} className="ui-badge ui-badge--neutral">{name}</span>
                            ))
                        ) : (
                            <span className="ui-badge ui-badge--warning">Sin vendedoras</span>
                        )}
                    </div>
                </div>

                <div className="ui-card-footer sp-card-actions">
                    <button type="button" className="ui-btn ui-btn--secondary ui-btn--sm" onClick={() => openEdit(promo)}>
                        <span className="material-icons-round" aria-hidden="true">edit</span> Editar
                    </button>
                    <button type="button" className="ui-icon-btn ui-icon-btn--bordered ui-icon-btn--danger" onClick={() => handleDelete(promo)} title="Eliminar" aria-label={`Eliminar ${promo.nombre}`}>
                        <span className="material-icons-round" aria-hidden="true">delete</span>
                    </button>
                </div>
            </article>
        );
    };

    return (
        <div className="special-products-panel">
            {/* Header */}
            <header className="ui-page-header">
                <div className="ui-page-heading">
                    <h2 className="ui-page-title">
                        <span className="material-icons-round" aria-hidden="true">local_offer</span>
                        Promociones Especiales
                    </h2>
                    <p className="ui-page-desc">
                        Promociones exclusivas para vendedores específicos
                    </p>
                </div>
                <div className="ui-page-actions">
                    <button type="button" className="ui-btn ui-btn--primary" onClick={openCreate}>
                        <span className="material-icons-round" aria-hidden="true">add</span>
                        Nueva Promoción
                    </button>
                </div>
            </header>

            {!loading && promotions.length > 0 && (
                <PromotionListToolbar
                    searchTerm={searchTerm}
                    onSearchChange={setSearchTerm}
                    tab={statusTab}
                    onTabChange={setStatusTab}
                    counts={tabCounts}
                    shownCount={visiblePromotions.length}
                    placeholder="Buscar por nombre, promoción base, producto o vendedora..."
                />
            )}

            {/* Grid */}
            {loading ? (
                <div className="ui-loading">
                    <span className="ui-spinner" aria-hidden="true" />
                    Cargando...
                </div>
            ) : promotions.length === 0 ? (
                <div className="ui-empty">
                    <span className="material-icons-round ui-empty-icon" aria-hidden="true">search_off</span>
                    <p className="ui-empty-text">No hay promociones especiales creadas.</p>
                </div>
            ) : visiblePromotions.length === 0 ? (
                <div className="ui-empty promo-no-results">
                    <span className="material-icons-round ui-empty-icon" aria-hidden="true">search_off</span>
                    <p className="ui-empty-text">
                        {searchTerm.trim()
                            ? `No hay promociones especiales ${statusTab === PROMO_TABS.ACTIVE ? 'activas ' : statusTab === PROMO_TABS.INACTIVE ? 'inactivas ' : ''}que coincidan con "${searchTerm.trim()}".`
                            : statusTab === PROMO_TABS.ACTIVE ? 'No hay promociones especiales activas.' : 'No hay promociones especiales inactivas.'}
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
                <div className="promo-sp-grid">
                    {visiblePromotions.map(renderCard)}
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
