// Imagen "Sin Imagen" compartida para productos sin foto (o con la foto rota, vía onError).
// Antes había 7 copias con grises que no eran del sistema, Arial en negrita y contraste 2.3:1,
// y el área de cliente apuntaba a un /placeholder.png que no existe.
//
// Es un SVG en data URI a propósito: no hace petición de red, funciona sin conexión y nunca
// falla, así los onError que la asignan no pueden entrar en bucle de recargas.
// Una imagen SVG no puede leer variables CSS, por eso los colores repiten EXACTAMENTE los
// tokens de src/styles/design-system.css: fondo = --color-surface-hover, texto =
// --color-text-secondary (contraste 6.9:1). Letra Inter / del sistema, peso 500.
const BACKGROUND = 'rgb(241,245,249)'; // --color-surface-hover (#f1f5f9)
const TEXT = 'rgb(61,86,116)'; // --color-text-secondary (#3d5674)

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">' +
  `<rect fill="${BACKGROUND}" width="200" height="200"/>` +
  `<text fill="${TEXT}" font-family="Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif" ` +
  'font-size="16" font-weight="500" x="50%" y="50%" dy="0.35em" text-anchor="middle">Sin Imagen</text>' +
  '</svg>';

export const PLACEHOLDER_IMAGE = `data:image/svg+xml,${encodeURIComponent(SVG)}`;
