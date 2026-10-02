import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { installStaggerSettle, STAGGER_DONE_ATTR } from './staggerSettle';

// La entrada escalonada (.ui-stagger) va por posición; las recargas silenciosas ya no remontan las
// listas. Al terminar la entrada inicial la lista se marca con data-stagger-done (el CSS deja de
// animar a sus hijos), así una recarga que mueve una tarjeta de la posición 9 a la 8 no la vuelve
// a animar. Una lista nueva (otro nodo) vuelve a entrar.

let uninstall;
beforeEach(() => { uninstall = installStaggerSettle(document); });
afterEach(() => { uninstall(); });

function Cards({ ids }) {
    return (
        <div className="ui-stagger" data-testid="list">
            {ids.map((id) => <article key={id} data-testid={`card-${id}`}>{id}</article>)}
        </div>
    );
}

const range = (n) => Array.from({ length: n }, (_, i) => `c${i + 1}`);
// jsdom no tiene AnimationEvent: un Event que burbujea con su animationName
const animationEnd = (el, animationName) => {
    const event = new Event('animationend', { bubbles: true });
    Object.defineProperty(event, 'animationName', { value: animationName });
    fireEvent(el, event);
};
const endRise = (el) => animationEnd(el, 'ui-rise-in');

test('la lista se marca cuando termina la entrada de la ÚLTIMA de las 8 primeras (no antes)', () => {
    render(<Cards ids={range(10)} />);
    const list = screen.getByTestId('list');

    endRise(screen.getByTestId('card-c1'));
    expect(list).not.toHaveAttribute(STAGGER_DONE_ATTR); // las demás siguen entrando
    endRise(screen.getByTestId('card-c7'));
    expect(list).not.toHaveAttribute(STAGGER_DONE_ATTR);
    endRise(screen.getByTestId('card-c8'));
    expect(list).toHaveAttribute(STAGGER_DONE_ATTR);
});

test('con getAnimations() se marca cuando ya ninguna de las 8 sigue entrando', () => {
    render(<Cards ids={range(3)} />);
    const list = screen.getByTestId('list');
    const [c1, c2, c3] = ['c1', 'c2', 'c3'].map((id) => screen.getByTestId(`card-${id}`));
    const running = [{ animationName: 'ui-rise-in', playState: 'running' }];
    c1.getAnimations = () => [];
    c2.getAnimations = () => running;
    c3.getAnimations = () => [];

    endRise(c3);
    expect(list).not.toHaveAttribute(STAGGER_DONE_ATTR); // c2 todavía entra
    c2.getAnimations = () => [];
    endRise(c2);
    expect(list).toHaveAttribute(STAGGER_DONE_ATTR);
});

test('una recarga que cambia las tarjetas no quita la marca; una lista nueva entra de nuevo', () => {
    function Harness() {
        const [ids, setIds] = useState(range(9));
        const [listKey, setListKey] = useState(0);
        return (
            <>
                <button type="button" onClick={() => setIds((prev) => prev.slice(1))}>Recarga sin la primera</button>
                <button type="button" onClick={() => setListKey((k) => k + 1)}>Otra pestaña</button>
                <Cards key={listKey} ids={ids} />
            </>
        );
    }
    render(<Harness />);
    const list = screen.getByTestId('list');
    endRise(screen.getByTestId('card-c8'));
    expect(list).toHaveAttribute(STAGGER_DONE_ATTR);

    // c9 pasa de la posición 9 a la 8: la lista (mismo nodo) sigue marcada → el CSS no la anima
    fireEvent.click(screen.getByRole('button', { name: 'Recarga sin la primera' }));
    expect(screen.getByTestId('list')).toBe(list);
    expect(list).toHaveAttribute(STAGGER_DONE_ATTR);
    expect(list.children[7]).toBe(screen.getByTestId('card-c9'));

    // Remontar la lista (cambio de pestaña): nodo nuevo, sin marca → vuelve a entrar escalonada
    fireEvent.click(screen.getByRole('button', { name: 'Otra pestaña' }));
    expect(screen.getByTestId('list')).not.toBe(list);
    expect(screen.getByTestId('list')).not.toHaveAttribute(STAGGER_DONE_ATTR);
});

test('ignora otras animaciones y elementos que no son hijos directos de una .ui-stagger', () => {
    render(
        <div className="ui-stagger" data-testid="list">
            <article data-testid="only"><span data-testid="inner">x</span></article>
        </div>
    );
    const list = screen.getByTestId('list');
    animationEnd(screen.getByTestId('only'), 'ui-skeleton-pulse');
    endRise(screen.getByTestId('inner'));
    expect(list).not.toHaveAttribute(STAGGER_DONE_ATTR);
    endRise(screen.getByTestId('only'));
    expect(list).toHaveAttribute(STAGGER_DONE_ATTR);
});

test('un stopPropagation de un componente no esconde el final de la animación', () => {
    render(
        <div className="ui-stagger" data-testid="list">
            <article data-testid="only" onAnimationEnd={(e) => e.stopPropagation()}>x</article>
        </div>
    );
    endRise(screen.getByTestId('only'));
    expect(screen.getByTestId('list')).toHaveAttribute(STAGGER_DONE_ATTR);
});
