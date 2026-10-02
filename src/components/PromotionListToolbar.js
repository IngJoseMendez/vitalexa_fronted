import { PROMO_TABS } from '../utils/promotionFilters';

/**
 * Barra de los paneles de promociones: buscador, pestañas Activas/Inactivas/Todas y contador.
 * counts: { active, inactive, all } ya filtrados por la búsqueda.
 */
export default function PromotionListToolbar({
    searchTerm,
    onSearchChange,
    tab,
    onTabChange,
    counts,
    shownCount,
    placeholder = 'Buscar promociones...',
}) {
    const tabs = [
        { id: PROMO_TABS.ACTIVE, label: `Activas (${counts.active})` },
        { id: PROMO_TABS.INACTIVE, label: `Inactivas (${counts.inactive})` },
        { id: PROMO_TABS.ALL, label: 'Todas' },
    ];
    const term = searchTerm.trim();

    return (
        <div className="promo-toolbar">
            <div className="promo-search">
                <span className="material-icons-round promo-search-icon" aria-hidden="true">search</span>
                <input
                    type="text"
                    placeholder={placeholder}
                    aria-label={placeholder}
                    value={searchTerm}
                    onChange={(e) => onSearchChange(e.target.value)}
                />
                {searchTerm && (
                    <button
                        type="button"
                        className="promo-search-clear"
                        onClick={() => onSearchChange('')}
                        title="Limpiar búsqueda"
                        aria-label="Limpiar búsqueda"
                    >
                        <span className="material-icons-round">close</span>
                    </button>
                )}
            </div>

            <div className="promo-tabs" role="tablist" aria-label="Estado de las promociones">
                {tabs.map(t => (
                    <button
                        key={t.id}
                        type="button"
                        role="tab"
                        aria-selected={tab === t.id}
                        className={`promo-tab${tab === t.id ? ' is-active' : ''}`}
                        onClick={() => onTabChange(t.id)}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            <span className="promo-result-count" aria-live="polite">
                {term
                    ? `${shownCount} ${shownCount === 1 ? 'resultado' : 'resultados'} para "${term}"`
                    : `${shownCount} ${shownCount === 1 ? 'promoción' : 'promociones'}`}
            </span>
        </div>
    );
}
