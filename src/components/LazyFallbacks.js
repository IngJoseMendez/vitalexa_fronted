// Carga bajo demanda (React.lazy) a prueba de red mala y de despliegues.
// - Pantallas de espera: solo se ven la PRIMERA vez que se abre un panel o un modal, mientras
//   llega su código (después queda en caché).
// - lazyWithRetry: si la descarga del código falla (red móvil inestable, o un despliegue nuevo
//   dejó sin efecto los archivos viejos), reintenta una vez y, si vuelve a fallar, deja que el
//   error llegue a LazyErrorBoundary.
// - LazyErrorBoundary: muestra "No se pudo cargar" + "Reintentar" SOLO en la parte que falló
//   (la pestaña, el modal o la campana); el resto del dashboard sigue vivo. Sin él, React
//   desmonta toda la app y queda la pantalla en blanco.
// No recarga la página por su cuenta: en medio de una venta o un pago eso borraría lo que la
// persona lleva escrito; la recarga solo ocurre cuando toca "Reintentar".
// Todo usa las primitivas del sistema de diseño (.ui-*): no trae CSS propio, así no cambia el
// orden de las hojas de estilo.
import { Component, lazy, useEffect, useId } from 'react';

const RETRY_DELAY_MS = 1000;

/** Ejecuta el import() y, si falla, lo reintenta una sola vez tras `retryDelayMs`. */
export function importWithRetry(factory, retryDelayMs = RETRY_DELAY_MS) {
  return factory().catch(
    () =>
      new Promise((resolve) => {
        setTimeout(resolve, retryDelayMs);
      }).then(factory)
  );
}

/**
 * Igual que React.lazy, con un reintento de la descarga. Se usa con el mismo import() (y las
 * mismas pistas webpackPrefetch): `lazyWithRetry(() => import('./Panel'))`.
 */
export function lazyWithRetry(factory, retryDelayMs) {
  return lazy(() => importWithRetry(factory, retryDelayMs));
}

/** React.lazy guarda el fallo: la única forma de volver a pedir el código es recargar. */
function reloadPage() {
  window.location.reload();
}

/** Escape cierra (solo si quien abrió el modal entrega cómo cerrarlo). */
function useEscapeToClose(onClose) {
  useEffect(() => {
    if (!onClose) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);
}

/** Contenido de una pestaña/panel de un dashboard. */
export function PanelFallback() {
  return (
    <div className="ui-loading" role="status">
      <span className="ui-spinner" aria-hidden="true" />
      Cargando…
    </div>
  );
}

/**
 * Modal: overlay + caja del mismo tamaño que un modal pequeño (pantalla completa en móvil).
 * Con `onClose` (el mismo cierre del modal que se está cargando) muestra "Cancelar" y acepta
 * Escape, para no dejar a nadie atrapado detrás del overlay si la red está lenta. El overlay
 * no cierra al tocarlo: un doble toque en el botón que abre el modal lo cerraría sin querer.
 */
export function ModalFallback({ onClose }) {
  useEscapeToClose(onClose);
  return (
    <div className="ui-modal-overlay">
      <div className="ui-modal ui-modal--sm" aria-busy="true">
        <div className="ui-modal-body ui-modal-body--plain">
          <div className="ui-loading" role="status">
            <span className="ui-spinner" aria-hidden="true" />
            Cargando…
          </div>
        </div>
        {onClose && (
          <div className="ui-modal-footer">
            <button type="button" className="ui-btn ui-btn--secondary" onClick={onClose}>
              Cancelar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Campana del encabezado: mismo hueco y mismo icono, sin acción, hasta que carga. */
export function BellFallback() {
  return (
    <div className="notification-center" aria-hidden="true">
      <span className="notification-bell is-placeholder">
        <span className="material-icons-round">notifications</span>
      </span>
    </div>
  );
}

const LOAD_ERROR_TITLE = 'No se pudo cargar';
const LOAD_ERROR_TEXT = 'Revisa la conexión a internet y vuelve a intentarlo. Reintentar recarga la página.';

/** Error de una pestaña/panel: aviso + "Reintentar", dentro del área del panel. */
export function PanelLoadError() {
  return (
    <div className="ui-stack">
      <div className="ui-alert ui-alert--danger" role="alert">
        <span className="material-icons-round" aria-hidden="true">cloud_off</span>
        <div>
          <strong className="ui-alert-title">{LOAD_ERROR_TITLE}</strong>
          <p>{LOAD_ERROR_TEXT}</p>
        </div>
      </div>
      <div className="ui-actions">
        <button type="button" className="ui-btn ui-btn--primary" onClick={reloadPage}>
          <span className="material-icons-round" aria-hidden="true">refresh</span>
          Reintentar
        </button>
      </div>
    </div>
  );
}

/** Error de una página completa (rutas): centrado, sin borde. */
export function PageLoadError() {
  return (
    <div className="ui-empty ui-empty--plain" role="alert">
      <span className="material-icons-round ui-empty-icon" aria-hidden="true">cloud_off</span>
      <p className="ui-empty-title">{LOAD_ERROR_TITLE}</p>
      <p className="ui-empty-text">{LOAD_ERROR_TEXT}</p>
      <button type="button" className="ui-btn ui-btn--primary ui-empty-action" onClick={reloadPage}>
        <span className="material-icons-round" aria-hidden="true">refresh</span>
        Reintentar
      </button>
    </div>
  );
}

/** Error de un modal: mismo tamaño que un modal pequeño, con "Cerrar" y "Reintentar". */
export function ModalLoadError({ onClose }) {
  const titleId = useId();
  const textId = useId();
  useEscapeToClose(onClose);
  return (
    <div className="ui-modal-overlay">
      <div
        className="ui-modal ui-modal--sm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={textId}
      >
        <div className="ui-modal-header">
          <span className="ui-modal-icon ui-modal-icon--danger" aria-hidden="true">
            <span className="material-icons-round">cloud_off</span>
          </span>
          <div className="ui-modal-heading">
            <h3 id={titleId} className="ui-modal-title">{LOAD_ERROR_TITLE}</h3>
          </div>
        </div>
        <div className="ui-modal-body ui-modal-body--plain">
          <div className="ui-alert ui-alert--danger">
            <span className="material-icons-round" aria-hidden="true">wifi_off</span>
            <p id={textId}>{LOAD_ERROR_TEXT}</p>
          </div>
        </div>
        <div className="ui-modal-footer">
          {onClose && (
            <button type="button" className="ui-btn ui-btn--secondary" onClick={onClose}>
              Cerrar
            </button>
          )}
          <button type="button" className="ui-btn ui-btn--primary" onClick={reloadPage}>
            <span className="material-icons-round" aria-hidden="true">refresh</span>
            Reintentar
          </button>
        </div>
      </div>
    </div>
  );
}

/** Error de la campana: mismo hueco del encabezado, tocarla recarga. */
export function BellLoadError() {
  return (
    <div className="notification-center">
      <button
        type="button"
        className="notification-bell"
        onClick={reloadPage}
        title="No se pudieron cargar las notificaciones. Reintentar"
        aria-label="No se pudieron cargar las notificaciones. Reintentar"
      >
        <span className="material-icons-round" aria-hidden="true">notifications_off</span>
      </button>
    </div>
  );
}

/**
 * Atrapa el fallo de lo que envuelve (un <Suspense> con componentes diferidos) y muestra el
 * aviso que corresponde en su lugar, sin tumbar el resto de la pantalla.
 * - variant: 'panel' (por defecto), 'page', 'modal' o 'bell'.
 * - onClose: para 'modal', el mismo cierre del modal (muestra "Cerrar").
 * - resetKey: si cambia (p. ej. la pestaña activa), vuelve a intentar mostrar el contenido.
 */
export class LazyErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false, resetKey: props.resetKey };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  static getDerivedStateFromProps(props, state) {
    if (props.resetKey !== state.resetKey) {
      return { failed: false, resetKey: props.resetKey };
    }
    return null;
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const { variant, onClose } = this.props;
    if (variant === 'modal') return <ModalLoadError onClose={onClose} />;
    if (variant === 'bell') return <BellLoadError />;
    if (variant === 'page') return <PageLoadError />;
    return <PanelLoadError />;
  }
}
