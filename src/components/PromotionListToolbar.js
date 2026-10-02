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
        <div className="ui-toolbar promo-toolbar">
            <div className="ui-search promo-search">
                <span className="material-icons-round ui-search-icon" aria-hidden="true">search</span>
                <input
                    type="text"
                    className="ui-input"
                    placeholder={placeholder}
                    aria-label={placeholder}
                    value={searchTerm}
                    onChange={(e) => onSearchChange(e.target.value)}
                />
                {searchTerm && (
                    <button
                        type="button"
                        className="ui-icon-btn ui-search-clear"
                        onClick={() => onSearchChange('')}
                        title="Limpiar búsqueda"
                        aria-label="Limpiar búsqueda"
                    >
                        <span className="material-icons-round" aria-hidden="true">close</span>
                    </button>
                )}
            </div>

            <div className="ui-tabs promo-tabs" role="tablist" aria-label="Estado de las promociones">
                {tabs.map(t => (
                    <button
                        key={t.id}
                        type="button"
                        role="tab"
                        aria-selected={tab === t.id}
                        className={`ui-tab${tab === t.id ? ' is-active' : ''}`}
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
