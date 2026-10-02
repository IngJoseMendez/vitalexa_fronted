import React from 'react';

// Botón de exportación con identidad de formato (premium-polish-SPEC §1 y §3):
// Excel = verde (table_view), PDF = rojo (picture_as_pdf), CSV = azul (description).
// Usa las clases .ui-btn--excel/--pdf/--csv de design-system.css y, mientras exporta,
// .is-loading + aria-busy: spinner del tamaño del icono, texto de carga y barra fina inferior.
//
// Pasa onClick, disabled, title, aria-label y className TAL CUAL (mismo handler y mismas
// guardas que el botón al que reemplaza). Solo el botón pulsado debe recibir loading: ver el
// patrón exportingKey en design-system-CONVENTIONS.md ("Pulido premium").
export const EXPORT_FORMATS = {
    excel: { icon: 'table_view', label: 'Excel' },
    pdf: { icon: 'picture_as_pdf', label: 'PDF' },
    csv: { icon: 'description', label: 'CSV' },
};

const SIZE_CLASS = { sm: 'ui-btn--sm', md: '', lg: 'ui-btn--lg' };

export default function ExportButton({
    kind = 'excel',
    loading = false,
    disabled = false,
    onClick,
    label,
    loadingLabel = 'Exportando...',
    size = 'md',
    block = false,
    title,
    'aria-label': ariaLabel,
    className,
    children,
    ...rest
}) {
    const format = EXPORT_FORMATS[kind];
    const icon = format ? format.icon : 'download';
    const text = label ?? children ?? (format ? format.label : '');
    const hasText = text !== '' && text !== null && text !== false;

    const classes = [
        'ui-btn',
        format ? `ui-btn--${kind}` : 'ui-btn--secondary',
        SIZE_CLASS[size] || '',
        block ? 'ui-btn--block' : '',
        loading ? 'is-loading' : '',
        className || '',
    ].filter(Boolean).join(' ');

    return (
        <button
            {...rest}
            type="button"
            className={classes}
            onClick={onClick}
            disabled={disabled}
            title={title}
            aria-label={ariaLabel}
            aria-busy={loading ? true : undefined}
        >
            {loading
                ? <span className="ui-spinner" aria-hidden="true" />
                : <span className="material-icons-round" aria-hidden="true">{icon}</span>}
            {/* Mientras carga, la etiqueta normal queda invisible en la misma celda: reserva su
                ancho para que el botón no se encoja; encima se lee el texto de carga */}
            {(hasText || loading) && (
                <span className="ui-btn-label">
                    {loading && hasText && <span className="ui-btn-label-sizer" aria-hidden="true">{text}</span>}
                    <span>{loading ? loadingLabel : text}</span>
                </span>
            )}
        </button>
    );
}
