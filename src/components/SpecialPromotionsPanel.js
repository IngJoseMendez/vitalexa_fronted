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
            <div key={promo.id} className="sp-card">
                {/* Badge */}
                <span className={`sp-type-badge ${isLinked ? 'linked' : 'standalone'}`}>
                    <span className="material-icons-round" style={{ fontSize: '12px' }}>
                        {isLinked ? 'link' : 'add_circle'}
                    </span>
                    {isLinked ? 'Vinculada' : 'Standalone'}
                </span>

                <div className="sp-card-body" style={{ marginTop: '2rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                        <h3>{promo.nombre}</h3>
                        <label className="switch" onClick={e => e.stopPropagation()} title={promo.active ? 'Desactivar' : 'Activar'}>
                            <input
                                type="checkbox"
                                checked={!!promo.active}
                                onChange={() => handleToggleStatus(promo)}
                                aria-label={`${promo.active ? 'Desactivar' : 'Activar'} ${promo.nombre}`}
                            />
                            <span className="slider round"></span>
                        </label>
                    </div>

                    {isLinked && (
                        <div className="sp-card-parent" style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
                            <span className="material-icons-round" style={{ fontSize: '14px', marginRight: '4px' }}>subdirectory_arrow_right</span>
                            Base: {promo.parentPromotionName}
                        </div>
                    )}

                    <div className="promo-sp-meta">
                        <span style={{ fontWeight: 600 }}>{getPromotionTypeLabel(type)}</span>
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
                                <span className="promo-sp-warning">
                                    <span className="material-icons-round" aria-hidden="true">block</span>
                                    {parentReason}
                                </span>
                            )}
                            {!isLinked && (
                                <span className="promo-sp-warning">
                                    <span className="material-icons-round" aria-hidden="true">block</span>
                                    Standalone: no se puede vender
                                </span>
                            )}
                            {dateLabel && (
                                <span className={`promotion-badge date-${dateLabel === 'Vencida' ? 'expired' : 'scheduled'}`}>
                                    {dateLabel}
                                </span>
                            )}
                        </div>
                    )}

                    {/* Vendors */}
                    <div className="sp-card-vendors" style={{ marginTop: '1rem' }}>
                        {isSpecialVisibleToAll(promo) ? (
                            <span className="promo-chip all">Todas las vendedoras</span>
                        ) : vendorNames.length > 0 ? (
                            vendorNames.map((name, i) => (
                                <span key={`${name}-${i}`} className="sp-vendor-chip">{name}</span>
                            ))
                        ) : (
                            <span className="promo-chip none">Sin vendedoras</span>
                        )}
                    </div>
                </div>

                <div className="sp-card-actions">
                    <button type="button" onClick={() => openEdit(promo)}>
                        <span className="material-icons-round" style={{ fontSize: '16px' }}>edit</span> Editar
                    </button>
                    <button type="button" className="btn-delete" onClick={() => handleDelete(promo)} title="Eliminar" aria-label={`Eliminar ${promo.nombre}`}>
                        <span className="material-icons-round" style={{ fontSize: '18px' }}>delete</span>
                    </button>
                </div>
            </div>
        );
    };

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
                    <button className="sp-btn-create" onClick={openCreate}>
                        <span className="material-icons-round">add</span>
                        Nueva Promoción
                    </button>
                </div>
            </div>

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
                <div className="loading">Cargando...</div>
            ) : promotions.length === 0 ? (
                <div className="sp-empty">
                    <span className="material-icons-round">search_off</span>
                    <p>No hay promociones especiales creadas.</p>
                </div>
            ) : visiblePromotions.length === 0 ? (
                <div className="promo-no-results">
                    <span className="material-icons-round" aria-hidden="true">search_off</span>
                    <p>
                        {searchTerm.trim()
                            ? `No hay promociones especiales ${statusTab === PROMO_TABS.ACTIVE ? 'activas ' : statusTab === PROMO_TABS.INACTIVE ? 'inactivas ' : ''}que coincidan con "${searchTerm.trim()}".`
                            : statusTab === PROMO_TABS.ACTIVE ? 'No hay promociones especiales activas.' : 'No hay promociones especiales inactivas.'}
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
                <div className="sp-grid promo-sp-grid">
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
