// src/components/DaysOverdueBadge.js
// Badge visual para mostrar días de mora con código de colores
import React from 'react';
import './DaysOverdueBadge.css';

export function DaysOverdueBadge({ days }) {
    if (days === null || days === undefined) {
        return <span className="days-badge days-badge-unknown">N/A</span>;
    }

    let variant = 'success';
    let icon = '✅';
    let label = 'Al día';

    if (days === 0) {
        variant = 'success';
        icon = '✅';
        label = 'Al día';
    } else if (days > 0 && days <= 14) {
        variant = 'success';
        icon = '🟢';
        label = `${days} ${days === 1 ? 'día' : 'días'}`;
    } else if (days >= 15 && days <= 30) {
        variant = 'warning';
        icon = '🟡';
        label = `${days} días`;
    } else if (days > 30) {
        variant = 'danger';
        icon = '🔴';
        label = `${days} días`;
    }

    return (
        <span className={`days-badge days-badge-${variant}`}>
            <span className="days-icon">{icon}</span>
            <span className="days-label">{label}</span>
        </span>
    );
}

export default DaysOverdueBadge;

