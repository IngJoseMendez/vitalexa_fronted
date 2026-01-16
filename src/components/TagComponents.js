import React from 'react';

/**
 * TagBadge Component
 * Displays a badge for a tag. Highlights "S/R" specially.
 */
export const TagBadge = ({ tagName, type }) => {
    if (!tagName) return null;

    const isSR = tagName.toUpperCase() === 'S/R' || type === 'SYSTEM';

    return (
        <span className={`tag-badge ${isSR ? 'tag-sr' : 'tag-user'}`}>
            <span className="material-icons-round">local_offer</span>
            {tagName}
        </span>
    );
};

/**
 * TagSelect Component
 * A dropdown to select a tag from a list.
 */
export const TagSelect = ({ tags, value, onChange, disabled }) => {
    return (
        <div className="tag-select-container">
            <label>Etiqueta de Producto</label>
            <select
                value={value || ''}
                onChange={(e) => onChange(e.target.value || null)}
                disabled={disabled}
                className="tag-select"
            >
                <option value="">Sin etiqueta</option>
                {tags.map((tag) => (
                    <option key={tag.id} value={tag.id}>
                        {tag.name} {tag.type === 'SYSTEM' ? '(Sistema)' : ''}
                    </option>
                ))}
            </select>
        </div>
    );
};

/**
 * TagFilterBar Component
 * A set of buttons or a dropdown to filter by tag.
 */
export const TagFilterBar = ({ tags, activeTagId, onSelectTag, onClear }) => {
    return (
        <div className="tag-filter-bar">
            <button
                className={`filter-chip ${!activeTagId ? 'active' : ''}`}
                onClick={onClear}
            >
                Todos
            </button>
            {tags.map((tag) => (
                <button
                    key={tag.id}
                    className={`filter-chip ${activeTagId === tag.id ? 'active' : ''} ${tag.type === 'SYSTEM' ? 'chip-sr' : ''}`}
                    onClick={() => onSelectTag(tag.id)}
                >
                    {tag.name}
                </button>
            ))}
        </div>
    );
};
