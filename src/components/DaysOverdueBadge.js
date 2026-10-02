// src/components/DaysOverdueBadge.js
// Badge visual para mostrar días de mora con código de colores
import React from 'react';
import './DaysOverdueBadge.css';

export function DaysOverdueBadge({ days }) {
    if (days === null || days === undefined) {
        return <span className="days-badge days-badge-unknown ui-badge ui-badge--neutral">N/A</span>;
    }

    // Icono Material (antes emoji) y tono semántico del badge
    let variant = 'success';
    let icon = 'check_circle';
    let label = 'Al día';

    if (days === 0) {
        variant = 'success';
        icon = 'check_circle';
        label = 'Al día';
    } else if (days > 0 && days <= 14) {
        // Con mora siempre ámbar (antes verde): mismo criterio que Saldos (1 a 30 ámbar, +30 rojo)
        variant = 'warning';
        icon = 'schedule';
        label = `${days} ${days === 1 ? 'día' : 'días'}`;
    } else if (days >= 15 && days <= 30) {
        variant = 'warning';
        icon = 'schedule';
        label = `${days} días`;
    } else if (days > 30) {
        variant = 'danger';
        icon = 'error';
        label = `${days} días`;
    }

    return (
        <span className={`days-badge days-badge-${variant} ui-badge ui-badge--${variant}`}>
            <span className="material-icons-round days-icon" aria-hidden="true">{icon}</span>
            <span className="days-label">{label}</span>
        </span>
    );
}

export default DaysOverdueBadge;
