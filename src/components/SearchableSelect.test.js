import { useState } from 'react';
import { act, createEvent, render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SearchableSelect from './SearchableSelect';

const PRODUCTOS = [
    { value: 1, label: 'Crema Hidratante', description: 'SKU P-100' },
    { value: 2, label: 'Jabón Neutro', description: 'SKU P-200' },
    { value: 3, label: 'Gel Limpiador', keywords: ['facial', 'espuma'] },
    { value: 4, label: 'Champú de Árnica', description: 'SKU P-400' },
];

// Uso real: el padre guarda el valor y el handler lee e.target.value (como con el <select>)
function Controlled({ initial = '', onChangeSpy, ...props }) {
    const [value, setValue] = useState(initial);
    return (
        <>
            <label htmlFor="producto">Producto</label>
            <SearchableSelect
                id="producto"
                name="productId"
                value={value}
                onChange={(e) => {
                    if (onChangeSpy) onChangeSpy(e);
                    setValue(e.target.value);
                }}
                options={PRODUCTOS}
                placeholder="Selecciona un producto"
                {...props}
            />
            <output data-testid="valor">{value}</output>
        </>
    );
}

const combobox = () => screen.getByRole('combobox');
const optionNames = () => screen.queryAllByRole('option').map((option) => option.textContent);
const openList = () => fireEvent.focus(combobox());
const typeText = (text) => fireEvent.change(combobox(), { target: { value: text } });

test('el label apunta al campo escribible; cerrado muestra el placeholder y no hay lista', () => {
    render(<Controlled />);
    const input = screen.getByLabelText('Producto');
    expect(input).toBe(combobox());
    expect(input).toHaveAttribute('id', 'producto');
    expect(input).toHaveValue('');
    expect(input).toHaveAttribute('placeholder', 'Selecciona un producto');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).not.toHaveAttribute('aria-controls');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

test('al enfocar abre la lista con todas las opciones y el placeholder de búsqueda', () => {
    render(<Controlled />);
    openList();
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(optionNames()).toHaveLength(4);
    expect(combobox()).toHaveAttribute('placeholder', 'Escribe para buscar…');
    expect(combobox()).toHaveAttribute('aria-expanded', 'true');
});

test('filtra sin importar mayúsculas ni tildes y exige todas las palabras', () => {
    render(<Controlled />);
    openList();

    typeText('JABON');
    expect(optionNames()).toEqual(['Jabón NeutroSKU P-200']);

    typeText('arnica');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option', { name: /Champú de Árnica/ })).toBeInTheDocument();

    // Todas las palabras, en cualquier orden, en label + description + keywords
    typeText('neutro p-200');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    typeText('neutro p-100');
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    typeText('espuma');
    expect(screen.getByRole('option', { name: /Gel Limpiador/ })).toBeInTheDocument();
});

test('lo que coincide en el label va resaltado (conservando las tildes originales)', () => {
    render(<Controlled />);
    openList();
    typeText('jabon');
    const option = screen.getByRole('option', { name: /Jabón Neutro/ });
    const mark = option.querySelector('mark.ui-combobox-match');
    expect(mark).toHaveTextContent('Jabón');
});

test('primero las opciones que empiezan por lo escrito', () => {
    render(
        <SearchableSelect
            aria-label="Cliente"
            value=""
            onChange={() => {}}
            options={[
                { value: 'a', label: 'Juliana Pérez' },
                { value: 'b', label: 'María Ana Gómez' },
                { value: 'c', label: 'Ana Torres' },
            ]}
        />
    );
    openList();
    typeText('ana');
    expect(optionNames()).toEqual(['Ana Torres', 'María Ana Gómez', 'Juliana Pérez']);
});

test('clic en una opción: onChange recibe {target:{value,name,id}} como texto y la lista se cierra', () => {
    const spy = jest.fn();
    render(<Controlled onChangeSpy={spy} />);
    openList();
    typeText('gel');
    fireEvent.click(screen.getByRole('option', { name: /Gel Limpiador/ }));

    expect(spy).toHaveBeenCalledTimes(1);
    const event = spy.mock.calls[0][0];
    expect(event.target).toEqual(expect.objectContaining({ value: '3', name: 'productId', id: 'producto' }));
    expect(event.currentTarget).toBe(event.target);
    expect(typeof event.target.value).toBe('string');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(combobox()).toHaveValue('Gel Limpiador');
    expect(combobox()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('valor')).toHaveTextContent('3');
});

test('teclado: flechas mueven la opción activa (aria-activedescendant) y Enter elige', () => {
    const spy = jest.fn();
    render(<Controlled onChangeSpy={spy} />);
    const input = combobox();
    openList();
    expect(input).not.toHaveAttribute('aria-activedescendant');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    let active = document.getElementById(input.getAttribute('aria-activedescendant'));
    expect(active).toHaveTextContent('Crema Hidratante');
    expect(active).toHaveClass('is-active');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    active = document.getElementById(input.getAttribute('aria-activedescendant'));
    expect(active).toHaveTextContent('Jabón Neutro');

    const enter = fireEvent.keyDown(input, { key: 'Enter' });
    expect(enter).toBe(false); // preventDefault: Enter no envía el formulario
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].target.value).toBe('2');
    expect(input).toHaveValue('Jabón Neutro');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

test('al escribir, la primera coincidencia queda activa y Enter la elige', () => {
    const spy = jest.fn();
    render(<Controlled onChangeSpy={spy} />);
    openList();
    typeText('champu');
    fireEvent.keyDown(combobox(), { key: 'Enter' });
    expect(spy.mock.calls[0][0].target.value).toBe('4');
    expect(combobox()).toHaveValue('Champú de Árnica');
});

test('flecha abajo con la lista cerrada la abre en la opción elegida', () => {
    render(<Controlled initial="2" />);
    const input = combobox();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    const active = document.getElementById(input.getAttribute('aria-activedescendant'));
    expect(active).toHaveTextContent('Jabón Neutro');
    expect(active).toHaveAttribute('aria-selected', 'true');
});

test('Escape cierra sin cambiar, restaura el texto y no llega al modal', () => {
    const spy = jest.fn();
    const modalEscape = jest.fn();
    const onDocumentKeyDown = (event) => { if (event.key === 'Escape') modalEscape(); };
    document.addEventListener('keydown', onDocumentKeyDown);
    try {
        render(<Controlled initial="1" onChangeSpy={spy} />);
        const input = combobox();
        expect(input).toHaveValue('Crema Hidratante');
        openList();
        expect(input).toHaveValue('');
        typeText('gel');
        fireEvent.keyDown(input, { key: 'ArrowDown' });
        fireEvent.keyDown(input, { key: 'Escape' });

        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
        expect(input).toHaveValue('Crema Hidratante');
        expect(spy).not.toHaveBeenCalled();
        expect(modalEscape).not.toHaveBeenCalled();

        // Con la lista cerrada Escape sí sigue (p.ej. para cerrar el modal)
        fireEvent.keyDown(input, { key: 'Escape' });
        expect(modalEscape).toHaveBeenCalledTimes(1);
    } finally {
        document.removeEventListener('keydown', onDocumentKeyDown);
    }
});

test('clic fuera cierra sin cambiar el valor aunque haya una búsqueda', () => {
    const spy = jest.fn();
    render(<Controlled initial="1" onChangeSpy={spy} />);
    const input = combobox();

    openList();
    typeText('jab');
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(input).toHaveValue('Crema Hidratante');

    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByTestId('valor')).toHaveTextContent('1');
});

test('Tab con una búsqueda elige la opción resaltada y deja seguir al siguiente campo (como escribir en el select nativo)', () => {
    const spy = jest.fn();
    render(<Controlled initial="1" onChangeSpy={spy} />);
    const input = combobox();

    openList();
    typeText('jab');
    expect(document.getElementById(input.getAttribute('aria-activedescendant'))).toHaveTextContent('Jabón Neutro');
    const tab = fireEvent.keyDown(input, { key: 'Tab' });
    expect(tab).toBe(true); // sin preventDefault: el foco sigue avanzando
    fireEvent.blur(input);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].target).toEqual(expect.objectContaining({ value: '2', name: 'productId', id: 'producto' }));
    expect(input).toHaveValue('Jabón Neutro');
    expect(screen.getByTestId('valor')).toHaveTextContent('2');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

test('Tab tras mover la opción activa con las flechas también la elige', () => {
    const spy = jest.fn();
    render(<Controlled initial="1" onChangeSpy={spy} />);
    const input = combobox();
    openList();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(document.getElementById(input.getAttribute('aria-activedescendant'))).toHaveTextContent('Jabón Neutro');
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(spy.mock.calls[0][0].target.value).toBe('2');
    expect(input).toHaveValue('Jabón Neutro');
});

test('Tab sin búsqueda, sin coincidencias o con solo el mouse encima cierra sin cambiar el valor', () => {
    const spy = jest.fn();
    render(<Controlled initial="1" onChangeSpy={spy} />);
    const input = combobox();

    // Solo pasar por el campo con Tab no cambia nada
    openList();
    fireEvent.keyDown(input, { key: 'Tab' });
    fireEvent.blur(input);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    // El mouse encima de otra opción no es elegirla
    openList();
    fireEvent.mouseMove(screen.getByRole('option', { name: /Gel Limpiador/ }));
    fireEvent.keyDown(input, { key: 'Tab' });
    fireEvent.blur(input);

    // Búsqueda sin coincidencias
    openList();
    typeText('zzz');
    fireEvent.keyDown(input, { key: 'Tab' });
    fireEvent.blur(input);

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(input).toHaveValue('Crema Hidratante');
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByTestId('valor')).toHaveTextContent('1');
});

test('clic dentro de la lista no la cierra ni quita el foco', () => {
    render(<Controlled />);
    openList();
    const listbox = screen.getByRole('listbox');
    const notPrevented = fireEvent.mouseDown(listbox);
    expect(notPrevented).toBe(false);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
});

test('volver a elegir la misma opción no llama onChange (como el select nativo)', () => {
    const spy = jest.fn();
    render(<Controlled initial="2" onChangeSpy={spy} />);
    openList();
    fireEvent.click(screen.getByRole('option', { name: /Jabón Neutro/ }));
    expect(spy).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

test('emptyOption: es la primera opción, se muestra con valor vacío y elegirla manda ""', () => {
    const spy = jest.fn();
    render(<Controlled initial="3" onChangeSpy={spy} emptyOption={{ label: 'Todos los productos' }} />);
    openList();
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(5);
    expect(options[0]).toHaveTextContent('Todos los productos');

    fireEvent.click(options[0]);
    expect(spy.mock.calls[0][0].target.value).toBe('');
    expect(combobox()).toHaveValue('Todos los productos');
    expect(screen.getByTestId('valor')).toHaveTextContent('');
});

test('limpiar (clearable): la x aparece solo con valor y deja el valor en ""', () => {
    const spy = jest.fn();
    render(<Controlled initial="4" onChangeSpy={spy} clearable />);
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar selección' }));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].target).toEqual(expect.objectContaining({ value: '', name: 'productId', id: 'producto' }));
    expect(combobox()).toHaveValue('');
    expect(screen.queryByRole('button', { name: 'Limpiar selección' })).not.toBeInTheDocument();
    // Limpiar no abre la lista
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

test('sin emptyOption ni clearable no hay x: no se manda "" (el select nativo sin opción vacía nunca lo hace)', () => {
    const spy = jest.fn();
    render(<Controlled initial="4" onChangeSpy={spy} />);
    expect(screen.queryByRole('button', { name: 'Limpiar selección' })).not.toBeInTheDocument();
    expect(combobox().closest('.ui-combobox')).not.toHaveClass('has-clear');
    expect(spy).not.toHaveBeenCalled();
});

test('con emptyOption la x equivale a elegir esa opción', () => {
    const spy = jest.fn();
    render(<Controlled initial="4" onChangeSpy={spy} emptyOption={{ label: 'Todos los productos' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar selección' }));
    expect(spy.mock.calls[0][0].target.value).toBe('');
    expect(combobox()).toHaveValue('Todos los productos');
    expect(screen.queryByRole('button', { name: 'Limpiar selección' })).not.toBeInTheDocument();
});

test('sin x cuando es obligatorio o está deshabilitado (aunque sea clearable o tenga emptyOption)', () => {
    const { rerender } = render(
        <SearchableSelect aria-label="Producto" value="1" onChange={() => {}} options={PRODUCTOS} clearable required />
    );
    expect(screen.queryByRole('button', { name: 'Limpiar selección' })).not.toBeInTheDocument();
    rerender(<SearchableSelect aria-label="Producto" value="1" onChange={() => {}} options={PRODUCTOS} emptyOption="Todos" required />);
    expect(screen.queryByRole('button', { name: 'Limpiar selección' })).not.toBeInTheDocument();
    rerender(<SearchableSelect aria-label="Producto" value="1" onChange={() => {}} options={PRODUCTOS} clearable disabled />);
    expect(screen.queryByRole('button', { name: 'Limpiar selección' })).not.toBeInTheDocument();
    // clearable no llega al <input>
    expect(combobox()).not.toHaveAttribute('clearable');
});

test('maxResults: pinta como máximo N y avisa cuántas hay', () => {
    const many = Array.from({ length: 250 }, (_, i) => ({ value: `c${i}`, label: `Cliente ${i}` }));
    render(<SearchableSelect aria-label="Cliente" value="" onChange={() => {}} options={many} />);
    openList();
    expect(screen.getAllByRole('option')).toHaveLength(100);
    expect(screen.getByText('Mostrando 100 de 250. Escribe para filtrar.')).toBeInTheDocument();

    typeText('cliente 24');
    // 24, 124, 224 y 240-249
    expect(screen.getAllByRole('option')).toHaveLength(13);
    expect(screen.queryByText(/Mostrando/)).not.toBeInTheDocument();
});

test('maxResults configurable', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ value: i, label: `Producto ${i}` }));
    render(<SearchableSelect aria-label="Producto" value="" onChange={() => {}} options={many} maxResults={10} />);
    openList();
    expect(screen.getAllByRole('option')).toHaveLength(10);
    expect(screen.getByText('Mostrando 10 de 30. Escribe para filtrar.')).toBeInTheDocument();
});

test('si el valor cambia desde afuera, el texto mostrado se actualiza', () => {
    const { rerender } = render(
        <SearchableSelect aria-label="Producto" value="1" onChange={() => {}} options={PRODUCTOS} />
    );
    expect(combobox()).toHaveValue('Crema Hidratante');
    rerender(<SearchableSelect aria-label="Producto" value={2} onChange={() => {}} options={PRODUCTOS} />);
    expect(combobox()).toHaveValue('Jabón Neutro');
    rerender(<SearchableSelect aria-label="Producto" value="" onChange={() => {}} options={PRODUCTOS} />);
    expect(combobox()).toHaveValue('');
});

test('opciones que llegan después (carga asíncrona) muestran el valor elegido', () => {
    const { rerender } = render(
        <SearchableSelect aria-label="Cliente" value="7" onChange={() => {}} options={[]} loading />
    );
    expect(combobox()).toHaveValue('');
    openList();
    expect(screen.getByText('Cargando…', { selector: '.ui-combobox-status' })).toBeInTheDocument();
    expect(screen.getByRole('listbox')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('Sin resultados', { selector: '.ui-combobox-status' })).not.toBeInTheDocument();
    fireEvent.mouseDown(document.body);

    rerender(
        <SearchableSelect aria-label="Cliente" value="7" onChange={() => {}} options={[{ value: 7, label: 'Droguería Central' }]} />
    );
    expect(combobox()).toHaveValue('Droguería Central');
});

test('sin coincidencias muestra noResultsText', () => {
    render(<Controlled noResultsText="No hay productos con ese nombre" />);
    openList();
    typeText('zzz');
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText('No hay productos con ese nombre', { selector: '.ui-combobox-status' })).toBeInTheDocument();
});

test('required: el formulario no valida sin valor y el aviso/foco quedan en el combobox', () => {
    const { container, rerender } = render(
        <form>
            <SearchableSelect id="cli" name="clientId" aria-label="Cliente" value="" onChange={() => {}} options={PRODUCTOS} required />
        </form>
    );
    const form = container.querySelector('form');
    const hidden = container.querySelector('input.ui-combobox-native');
    expect(hidden).toBeRequired();
    expect(hidden).toHaveAttribute('aria-hidden', 'true');
    expect(hidden).toHaveAttribute('tabindex', '-1');
    expect(hidden).toHaveAttribute('name', 'clientId');
    expect(hidden).toHaveValue('');
    expect(combobox()).toHaveAttribute('aria-required', 'true');
    expect(combobox()).not.toHaveAttribute('name');
    expect(form.checkValidity()).toBe(false);
    // checkValidity() (sin enviar) no roba el foco
    expect(combobox()).not.toHaveFocus();
    // El campo visible lleva el error: al enviar, el navegador lo enfoca y muestra el aviso ahí
    expect(combobox().validity.valid).toBe(false);
    expect(combobox().validationMessage).toBe('Selecciona una opción de la lista.');

    // Si algo enfoca el input oculto, el foco pasa al combobox
    act(() => hidden.focus());
    expect(combobox()).toHaveFocus();

    rerender(
        <form>
            <SearchableSelect id="cli" name="clientId" aria-label="Cliente" value="2" onChange={() => {}} options={PRODUCTOS} required />
        </form>
    );
    expect(container.querySelector('input.ui-combobox-native')).toHaveValue('2');
    expect(combobox().validity.valid).toBe(true);
    expect(form.checkValidity()).toBe(true);
    expect(new FormData(form).get('clientId')).toBe('2');
});

test('query controlada: escribe vía onQueryChange, filtra con query y se limpia al elegir', () => {
    function WithQuery({ onQuery }) {
        const [value, setValue] = useState('');
        const [query, setQuery] = useState('');
        return (
            <>
                <SearchableSelect
                    aria-label="Producto"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    options={PRODUCTOS}
                    query={query}
                    onQueryChange={(q) => { onQuery(q); setQuery(q); }}
                />
                <span data-testid="query">{query}</span>
            </>
        );
    }
    const onQuery = jest.fn();
    render(<WithQuery onQuery={onQuery} />);
    openList();
    typeText('crema');
    expect(onQuery).toHaveBeenLastCalledWith('crema');
    expect(screen.getByTestId('query')).toHaveTextContent('crema');
    expect(combobox()).toHaveValue('crema');
    expect(screen.getAllByRole('option')).toHaveLength(1);

    fireEvent.click(screen.getByRole('option', { name: /Crema Hidratante/ }));
    expect(onQuery).toHaveBeenLastCalledWith('');
    expect(screen.getByTestId('query')).toBeEmptyDOMElement();
    expect(combobox()).toHaveValue('Crema Hidratante');
});

test('filterOption reemplaza el filtro por defecto', () => {
    const filterOption = jest.fn((option, q) => String(option.description || '').includes(q));
    render(<Controlled filterOption={filterOption} />);
    openList();
    typeText('P-4');
    expect(optionNames()).toEqual(['Champú de ÁrnicaSKU P-400']);
    expect(filterOption).toHaveBeenCalledWith(expect.objectContaining({ value: 4, label: 'Champú de Árnica' }), 'P-4');
});

test('opción deshabilitada: no se elige con clic y el teclado la salta', () => {
    const spy = jest.fn();
    const options = [
        { value: 'a', label: 'Alfa' },
        { value: 'b', label: 'Beta (agotado)', disabled: true },
        { value: 'c', label: 'Gamma' },
    ];
    render(<Controlled options={options} onChangeSpy={spy} />);
    const input = combobox();
    openList();
    const disabledOption = screen.getByRole('option', { name: 'Beta (agotado)' });
    expect(disabledOption).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(disabledOption);
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(document.getElementById(input.getAttribute('aria-activedescendant'))).toHaveTextContent('Gamma');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(spy.mock.calls[0][0].target.value).toBe('c');
});

test('deshabilitado: no abre la lista', () => {
    render(<SearchableSelect aria-label="Producto" value="1" onChange={() => {}} options={PRODUCTOS} disabled />);
    const input = combobox();
    expect(input).toBeDisabled();
    fireEvent.focus(input);
    fireEvent.click(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

test('ARIA: combobox, listbox y opciones con sus atributos; anuncio de resultados', () => {
    render(
        <>
            <span id="lbl">Vendedora</span>
            <SearchableSelect
                aria-labelledby="lbl"
                value="2"
                onChange={() => {}}
                options={PRODUCTOS}
                aria-describedby="ayuda"
                title="Vendedora asignada"
                data-testid="vend"
            />
        </>
    );
    const input = screen.getByRole('combobox', { name: 'Vendedora' });
    expect(input).toHaveAttribute('aria-autocomplete', 'list');
    expect(input).toHaveAttribute('aria-describedby', 'ayuda');
    expect(input).toHaveAttribute('title', 'Vendedora asignada');
    expect(screen.getByTestId('vend')).toBe(input);

    openList();
    const listbox = screen.getByRole('listbox', { name: 'Vendedora' });
    expect(input).toHaveAttribute('aria-controls', listbox.id);
    const options = within(listbox).getAllByRole('option');
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
    expect(options[0]).toHaveAttribute('aria-selected', 'false');
    expect(options[1].querySelector('.ui-combobox-check')).not.toBeNull();
    // Al abrir, la opción elegida es la activa
    expect(input).toHaveAttribute('aria-activedescendant', options[1].id);

    const live = document.querySelector('[aria-live="polite"]');
    expect(live).toHaveTextContent('4 resultados disponibles');
    typeText('gel');
    expect(live).toHaveTextContent('1 resultado disponible');
    typeText('zzz');
    expect(live).toHaveTextContent('Sin resultados');
});

test('aria-label pasa al input y nombra la lista; className va al contenedor sin ui-select', () => {
    const { container } = render(
        <SearchableSelect aria-label="Cliente" className="ui-select mi-filtro" value="" onChange={() => {}} options={PRODUCTOS} />
    );
    const root = container.querySelector('.ui-combobox');
    expect(root).toHaveClass('mi-filtro');
    expect(root).not.toHaveClass('ui-select');
    expect(screen.getByRole('combobox', { name: 'Cliente' })).toBeInTheDocument();
    openList();
    expect(screen.getByRole('listbox', { name: 'Cliente' })).toBeInTheDocument();
});

test('la lista se pinta en body (portal) para no quedar recortada en modales', () => {
    const { container } = render(
        <div style={{ overflow: 'hidden' }}>
            <SearchableSelect aria-label="Cliente" value="" onChange={() => {}} options={PRODUCTOS} />
        </div>
    );
    openList();
    const panel = screen.getByRole('listbox').closest('.ui-combobox-panel');
    expect(container.contains(panel)).toBe(false);
    expect(panel.parentElement).toBe(document.body);
});

test('cerrado con algo elegido, lo que se escribe al final empieza una búsqueda nueva', () => {
    render(<Controlled initial="1" />);
    const input = combobox();
    openList();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input).toHaveValue('Crema Hidratante');
    fireEvent.change(input, { target: { value: 'Crema Hidratantejab' } });
    expect(input).toHaveValue('jab');
    expect(screen.getAllByRole('option')).toHaveLength(1);
});

test('sin value funciona como no controlado (defaultValue)', () => {
    const spy = jest.fn();
    render(<SearchableSelect aria-label="Producto" defaultValue="1" onChange={spy} options={PRODUCTOS} />);
    expect(combobox()).toHaveValue('Crema Hidratante');
    openList();
    fireEvent.click(screen.getByRole('option', { name: /Gel Limpiador/ }));
    expect(combobox()).toHaveValue('Gel Limpiador');
    expect(spy.mock.calls[0][0].target.value).toBe('3');
});

// jsdom 16 no tiene PointerEvent: se agrega pointerType al evento a mano
const pointerDown = (element, pointerType) => {
    const event = createEvent.pointerDown(element);
    Object.defineProperty(event, 'pointerType', { value: pointerType });
    fireEvent(element, event);
};

test('clic real (pointerdown → mousedown → click) en una opción elige y deja el foco en el campo', () => {
    const spy = jest.fn();
    render(<Controlled onChangeSpy={spy} />);
    const input = combobox();
    userEvent.click(input);
    expect(input).toHaveFocus();
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    typeText('jab');
    userEvent.click(screen.getByRole('option', { name: /Neutro/ }));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].target.value).toBe('2');
    expect(screen.getByTestId('valor')).toHaveTextContent('2');
    expect(input).toHaveValue('Jabón Neutro');
    // El mousedown de la lista no le quita el foco al campo
    expect(input).toHaveFocus();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

test('al tocar una opción en el celular se elige y el campo suelta el foco (se cierra el teclado)', () => {
    const spy = jest.fn();
    render(<Controlled onChangeSpy={spy} />);
    const input = combobox();
    act(() => input.focus());
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    const option = screen.getByRole('option', { name: /Gel Limpiador/ });
    pointerDown(option, 'touch');
    fireEvent.mouseDown(option);
    fireEvent.click(option);
    expect(spy.mock.calls[0][0].target.value).toBe('3');
    expect(input).toHaveValue('Gel Limpiador');
    expect(input).not.toHaveFocus();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

test('tocar la x en el celular limpia sin enfocar el campo (sin teclado); con mouse lo deja enfocado y cerrado', () => {
    const spy = jest.fn();
    const { unmount } = render(<Controlled initial="4" onChangeSpy={spy} clearable />);
    let clear = screen.getByRole('button', { name: 'Limpiar selección' });
    pointerDown(clear, 'touch');
    fireEvent.mouseDown(clear);
    fireEvent.click(clear);
    expect(spy.mock.calls[0][0].target.value).toBe('');
    expect(combobox()).not.toHaveFocus();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    unmount();

    render(<Controlled initial="4" clearable />);
    clear = screen.getByRole('button', { name: 'Limpiar selección' });
    pointerDown(clear, 'mouse');
    fireEvent.mouseDown(clear);
    fireEvent.click(clear);
    expect(screen.getByTestId('valor')).toBeEmptyDOMElement();
    expect(combobox()).toHaveFocus();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

test('volver a la ventana (blur + focus del navegador sin cambiar de campo) no abre la lista sola', () => {
    render(<Controlled />);
    const input = combobox();
    userEvent.click(input);
    userEvent.click(screen.getByRole('option', { name: /Gel Limpiador/ }));
    expect(input).toHaveFocus();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    // Cambiar de pestaña o de app: blur sin relatedTarget y el campo sigue siendo el activo
    fireEvent.blur(input);
    fireEvent.focus(input);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(input).toHaveValue('Gel Limpiador');

    // Salir del campo de verdad y volver a entrar sí abre la lista
    act(() => input.blur());
    act(() => input.focus());
    expect(screen.getByRole('listbox')).toBeInTheDocument();
});

describe('posición de la lista (fixed junto al campo)', () => {
    let rect;
    let frames;
    let originalRaf;
    let originalCancelRaf;

    const flushFrames = () => act(() => { frames.splice(0).forEach((callback) => callback()); });
    const panelOf = () => screen.getByRole('listbox').closest('.ui-combobox-panel');

    beforeEach(() => {
        frames = [];
        originalRaf = window.requestAnimationFrame;
        originalCancelRaf = window.cancelAnimationFrame;
        window.requestAnimationFrame = (callback) => frames.push(callback);
        window.cancelAnimationFrame = () => {};
        rect = { top: 100, bottom: 140, left: 20, right: 320, width: 300, height: 40, x: 20, y: 100 };
    });

    afterEach(() => {
        window.requestAnimationFrame = originalRaf;
        window.cancelAnimationFrame = originalCancelRaf;
        delete document.documentElement.clientHeight;
        jest.restoreAllMocks();
    });

    const renderAt = () => {
        const utils = render(<Controlled />);
        jest.spyOn(combobox(), 'getBoundingClientRect').mockImplementation(() => rect);
        return utils;
    };

    test('abre debajo, del ancho del campo (mínimo 240px), y sigue al campo al hacer scroll', () => {
        renderAt();
        openList();
        let panel = panelOf();
        expect(panel).not.toHaveClass('is-top');
        expect(panel.style.top).toBe('144px');
        expect(panel.style.left).toBe('20px');
        expect(panel.style.width).toBe('300px');
        expect(panel.style.maxHeight).toBe('300px');

        // Scroll de un contenedor (p.ej. el cuerpo de un modal): se recalcula en el siguiente frame
        rect = { ...rect, top: 60, bottom: 100, width: 120, right: 140 };
        fireEvent.scroll(document.body);
        flushFrames();
        panel = panelOf();
        expect(panel.style.top).toBe('104px');
        expect(panel.style.width).toBe('240px');

        // El scroll dentro de la propia lista no recalcula nada
        fireEvent.scroll(screen.getByRole('listbox'));
        expect(frames).toHaveLength(0);
    });

    test('cerca del borde inferior abre hacia arriba, pegada al campo aunque haya barra horizontal', () => {
        // Barra de scroll horizontal: el viewport de layout (clientHeight) mide 750 y innerHeight 768
        Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, get: () => 750 });
        rect = { top: 700, bottom: 740, left: 900, right: 1000, width: 100, height: 40, x: 900, y: 700 };
        renderAt();
        openList();
        const panel = panelOf();
        expect(panel).toHaveClass('is-top');
        expect(panel.style.top).toBe('');
        // bottom se mide desde el borde inferior del viewport sin barras: 750 - 700 + 4
        expect(panel.style.bottom).toBe('54px');
        expect(panel.style.maxHeight).toBe('300px');
        // Ancho mínimo 240 y sin salirse por la derecha (1024 - 8 - 240)
        expect(panel.style.width).toBe('240px');
        expect(panel.style.left).toBe('776px');
    });
});

test('al desmontar con la lista abierta se quitan todos los oyentes (scroll, resize y clic fuera)', () => {
    const windowAdd = jest.spyOn(window, 'addEventListener');
    const windowRemove = jest.spyOn(window, 'removeEventListener');
    const documentAdd = jest.spyOn(document, 'addEventListener');
    const documentRemove = jest.spyOn(document, 'removeEventListener');
    try {
        const { unmount } = render(<Controlled />);
        openList();
        expect(screen.getByRole('listbox')).toBeInTheDocument();
        const added = (spy, type) => spy.mock.calls.filter((call) => call[0] === type);
        const [scrollCall] = added(windowAdd, 'scroll');
        const [resizeCall] = added(windowAdd, 'resize');
        const [mouseDownCall] = added(documentAdd, 'mousedown');
        expect(scrollCall[2]).toBe(true);
        expect(resizeCall).toBeDefined();
        expect(mouseDownCall).toBeDefined();

        unmount();
        expect(windowRemove).toHaveBeenCalledWith('scroll', scrollCall[1], true);
        expect(windowRemove).toHaveBeenCalledWith('resize', resizeCall[1]);
        expect(documentRemove).toHaveBeenCalledWith('mousedown', mouseDownCall[1]);
        expect(document.querySelector('.ui-combobox-panel')).toBeNull();
    } finally {
        jest.restoreAllMocks();
    }
});

test('la opción elegida se desplaza a la vista cuando la lista ya tiene su alto (primera apertura y flecha abajo)', () => {
    const original = Element.prototype.scrollIntoView;
    const calls = [];
    Element.prototype.scrollIntoView = function scrollIntoView() {
        const panel = this.closest('.ui-combobox-panel');
        calls.push({ text: this.textContent, maxHeight: panel.style.maxHeight, width: panel.style.width });
    };
    try {
        const { unmount } = render(<Controlled initial="4" />);
        openList();
        expect(calls).toHaveLength(1);
        expect(calls[0].text).toMatch(/Champú de Árnica/);
        expect(calls[0].maxHeight).toBe('300px');
        expect(calls[0].width).not.toBe('');
        unmount();

        // Primera apertura con la flecha abajo (lista cerrada)
        calls.length = 0;
        render(<Controlled initial="3" />);
        fireEvent.keyDown(combobox(), { key: 'ArrowDown' });
        expect(calls).toHaveLength(1);
        expect(calls[0].text).toMatch(/Gel Limpiador/);
        expect(calls[0].maxHeight).toBe('300px');
    } finally {
        Element.prototype.scrollIntoView = original;
    }
});

test('dentro de un diálogo modal (aria-modal) la lista se pinta dentro del diálogo para el lector de pantalla', () => {
    render(
        <div role="dialog" aria-modal="true" aria-label="Nueva promoción" data-testid="dialogo" style={{ overflow: 'hidden' }}>
            <SearchableSelect aria-label="Producto" value="" onChange={() => {}} options={PRODUCTOS} />
        </div>
    );
    openList();
    const dialog = screen.getByTestId('dialogo');
    const listbox = within(dialog).getByRole('listbox', { name: 'Producto' });
    expect(listbox.closest('.ui-combobox-panel').parentElement).toBe(dialog);
    expect(combobox()).toHaveAttribute('aria-controls', listbox.id);
    // Un clic dentro de la lista no la cierra
    fireEvent.mouseDown(within(listbox).getAllByRole('option')[0]);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
});

test('si el diálogo aún se está animando (transform), la lista va a body para no quedar desplazada', () => {
    render(
        <div role="dialog" aria-modal="true" aria-label="Nueva promoción" data-testid="dialogo" style={{ transform: 'translateY(8px) scale(0.98)' }}>
            <SearchableSelect aria-label="Producto" value="" onChange={() => {}} options={PRODUCTOS} />
        </div>
    );
    openList();
    expect(screen.getByRole('listbox').closest('.ui-combobox-panel').parentElement).toBe(document.body);
});

test('con varias palabras, primero la que coincide con palabras completas ("sint 10" -> "Sintetico 10")', () => {
    render(
        <SearchableSelect
            aria-label="Producto"
            value=""
            onChange={() => {}}
            options={[
                { value: '6', label: 'Producto Sintetico 6 - $59104.00 (Stock: 193)' },
                { value: '18', label: 'Producto Sintetico 18 - $31036.00 (Stock: 24)' },
                { value: '10', label: 'Producto Sintetico 10 - $12795.00 (Stock: 162)' },
            ]}
        />
    );
    openList();
    typeText('sint 10');
    expect(optionNames()[0]).toBe('Producto Sintetico 10 - $12795.00 (Stock: 162)');
    expect(optionNames()).toHaveLength(3);
});
