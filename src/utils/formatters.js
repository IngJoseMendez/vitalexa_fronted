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
