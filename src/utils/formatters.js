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
 * Formats a date string or Date object to a readable date format
 * @param {string|Date} date - The date to format (ISO string or Date object)
 * @returns {string} - The formatted date string (e.g., "17/02/2026")
 */
export const formatDate = (date) => {
    if (!date) return '';

    try {
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


