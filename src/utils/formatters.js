/**
 * Formats a number as a currency string with thousands separators.
 * Uses 'es-CO' locale to ensure dots are used for thousands and commas for decimals.
 * @param {number|string} value - The value to format.
 * @returns {string} - The formatted currency string (e.g., "1.000.000").
 */
export const formatCurrency = (value) => {
    if (value === null || value === undefined || value === '') return '';
    
    const numberValue = typeof value === 'string' ? parseFloat(value) : value;
    
    if (isNaN(numberValue)) return value;

    return new Intl.NumberFormat('es-CO', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(numberValue);
};

/**
 * Formats a number into a compact currency style using K/M/B suffixes.
 * @param {number|string} value - The value to format.
 * @returns {string} - The compact formatted string (e.g., "1.2M").
 */
export const formatCompactCurrency = (value) => {
    if (value === null || value === undefined || value === '') return '';

    const numberValue = typeof value === 'string' ? parseFloat(value) : value;

    if (isNaN(numberValue)) return value;

    const absValue = Math.abs(numberValue);
    let divisor = 1;
    let suffix = '';

    if (absValue >= 1e9) {
        divisor = 1e9;
        suffix = 'B';
    } else if (absValue >= 1e6) {
        divisor = 1e6;
        suffix = 'M';
    } else if (absValue >= 1e3) {
        divisor = 1e3;
        suffix = 'K';
    }

    if (!suffix) {
        return new Intl.NumberFormat('es-CO', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(numberValue);
    }

    const compactValue = numberValue / divisor;

    return `${new Intl.NumberFormat('es-CO', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    }).format(compactValue)}${suffix}`;
};

/**
 * Formats a date string or Date object to a readable date format
 * @param {string|Date} date - The date to format (ISO string or Date object)
 * @returns {string} - The formatted date string (e.g., "17/02/2026")
 */
export const formatDate = (date) => {
    if (!date) return '';

    try {
        // Si es un string en formato YYYY-MM-DD, parsearlo directamente para evitar
        // el bug UTC de JavaScript (new Date("2026-02-14") se interpreta como UTC
        // medianoche, lo que en UTC-5 muestra el día anterior).
        if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
            const [year, month, day] = date.split('-');
            return `${day}/${month}/${year}`;
        }
        const dateObj = typeof date === 'string' ? new Date(date) : date;
        return new Intl.DateTimeFormat('es-CO', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        }).format(dateObj);
    } catch (error) {
        console.error('Error formatting date:', error);
        return date.toString();
    }
};

/**
 * Formats a date string or Date object to include date and time
 * @param {string|Date} date - The date to format (ISO string or Date object)
 * @returns {string} - The formatted datetime string (e.g., "17/02/2026 14:30")
 */
export const formatDateTime = (date) => {
    if (!date) return '';

    try {
        const dateObj = typeof date === 'string' ? new Date(date) : date;
        return new Intl.DateTimeFormat('es-CO', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        }).format(dateObj);
    } catch (error) {
        console.error('Error formatting datetime:', error);
        return date.toString();
    }
};

/**
 * Formats a date to ISO date string (YYYY-MM-DD)
 * @param {Date} date - The date to format
 * @returns {string} - The ISO date string
 */
export const formatDateISO = (date) => {
    if (!date) return '';

    try {
        const dateObj = typeof date === 'string' ? new Date(date) : date;
        return dateObj.toISOString().split('T')[0];
    } catch (error) {
        console.error('Error formatting date to ISO:', error);
        return '';
    }
};
