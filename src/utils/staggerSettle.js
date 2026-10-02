// Entrada escalonada de listas (.ui-stagger) solo al montar la lista de verdad.
//
// El CSS anima las 8 primeras tarjetas por POSICIÓN (:nth-child(-n+8)). Las recargas
// silenciosas ya no remontan las listas, así que cuando una recarga quita una de esas 8 (p.ej.
// otra persona confirma una orden y sale de "Pendientes"), la tarjeta que pasa de la posición 9
// a la 8 recibiría la animación por primera vez y "volvería a entrar" (desaparece y sube).
//
// Al terminar la entrada inicial, la lista queda marcada con data-stagger-done y el CSS deja de
// animar a sus hijos (.ui-stagger:not([data-stagger-done]) en design-system.css). React no toca
// ese atributo porque no lo pone él: dura lo que dura el nodo. Una lista que se vuelve a montar
// (primera carga, cambio de pestaña, o un filtro que cambia "Cargando" por la lista) es un nodo
// nuevo sin la marca y vuelve a entrar escalonada.
//
// Un solo oyente en document (fase de captura: un stopPropagation de un componente no lo
// esconde) sirve para todas las listas; no hay que tocar cada componente.

export const STAGGER_DONE_ATTR = 'data-stagger-done';
export const STAGGER_ANIMATION = 'ui-rise-in';
const STAGGER_LIMIT = 8; // mismas que anima el CSS

// true/false si el navegador sabe decir si el hijo sigue con su entrada (en el retraso o
// animando); null si no tiene getAnimations()
function isStillEntering(element) {
  if (typeof element.getAnimations !== 'function') return null;
  return element.getAnimations().some((animation) => (
    animation.animationName === STAGGER_ANIMATION
    && animation.playState !== 'finished'
    && animation.playState !== 'idle'
  ));
}

export function handleStaggerAnimationEnd(event) {
  if (!event || event.animationName !== STAGGER_ANIMATION) return;
  const item = event.target;
  const list = item && item.parentElement;
  if (!list || !list.classList || !list.classList.contains('ui-stagger')) return;
  if (list.hasAttribute(STAGGER_DONE_ATTR)) return;

  const animated = Array.from(list.children).slice(0, STAGGER_LIMIT);
  const itemIndex = animated.indexOf(item);
  if (itemIndex === -1) return; // no es una de las tarjetas que entran escalonadas

  // Se marca cuando termina la ÚLTIMA en entrar: marcar antes cortaría la entrada de las demás
  const someoneStillEntering = animated.some((child, index) => {
    if (child === item) return false;
    const entering = isStillEntering(child);
    // Sin getAnimations (navegadores viejos): se espera a la última tarjeta animada
    return entering === null ? index > itemIndex : entering;
  });
  if (!someoneStillEntering) list.setAttribute(STAGGER_DONE_ATTR, '');
}

export function installStaggerSettle(target = typeof document !== 'undefined' ? document : null) {
  if (!target || typeof target.addEventListener !== 'function') return () => {};
  target.addEventListener('animationend', handleStaggerAnimationEnd, true);
  // Una entrada interrumpida (p.ej. la lista se ocultó) cuenta como terminada
  target.addEventListener('animationcancel', handleStaggerAnimationEnd, true);
  return () => {
    target.removeEventListener('animationend', handleStaggerAnimationEnd, true);
    target.removeEventListener('animationcancel', handleStaggerAnimationEnd, true);
  };
}
