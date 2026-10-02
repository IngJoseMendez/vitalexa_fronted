import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import ProductsPanel from './ProductsPanel';
import SpecialProductsPanel from './SpecialProductsPanel';
import client from '../api/client';
import { tagService } from '../api/tagService';
import specialProductService from '../api/specialProductService';
import { prefKey } from '../hooks/usePersistentState';
import { clearStorageKeepingSidebarPrefs } from '../hooks/useSidebarCollapsed';

// Preferencias de vista de Productos y Productos especiales (admin): el orden y las columnas se
// recuerdan por usuario aunque se recargue la página (aquí: desmontar y volver a montar). El
// primer render ya usa lo guardado y las peticiones son las mismas de siempre (ninguna de estas
// preferencias cambia qué se pide). El filtro Todos/Activos/Inactivos y la búsqueda NO se
// recuerdan.

jest.mock('../api/client', () => ({
    __esModule: true,
    default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
jest.mock('../api/tagService', () => ({ __esModule: true, tagService: { getAll: jest.fn() } }));
jest.mock('../api/specialProductService', () => ({
    __esModule: true,
    default: { getAll: jest.fn(), search: jest.fn(), toggleStatus: jest.fn(), remove: jest.fn() },
}));
const mockToast = { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn() };
jest.mock('./ToastContainer', () => ({ useToast: () => mockToast }));
jest.mock('./ConfirmDialog', () => ({ useConfirm: () => jest.fn(() => Promise.resolve(true)) }));
jest.mock('./modals/ProductFormModal', () => () => null);
jest.mock('./modals/StockArrivalModal', () => () => null);
jest.mock('./modals/PhysicalCountModal', () => () => null);
jest.mock('./modals/SpecialProductFormModal', () => () => null);

const stored = (key) => {
    const raw = localStorage.getItem(prefKey(key));
    return raw === null ? null : JSON.parse(raw);
};
const save = (key, value) => localStorage.setItem(prefKey(key), JSON.stringify(value));

beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('username', 'admin1');
});
afterAll(() => localStorage.clear());

describe('ProductsPanel', () => {
    const product = (id, nombre, createdAt) => ({
        id, nombre, descripcion: '', precio: 1000, stock: 50, active: true, reorderPoint: 1, createdAt,
    });
    const PRODUCTS = [product('p1', 'Aceite Viejo', '2026-01-10T10:00:00'), product('p2', 'Zinc Nuevo', '2026-09-20T10:00:00')];

    beforeEach(() => {
        tagService.getAll.mockResolvedValue({ data: [] });
        client.get.mockResolvedValue({ data: PRODUCTS });
    });

    const productsCalls = () => client.get.mock.calls.filter(([url]) => url === '/admin/products');
    const sortSelect = () => screen.getByRole('combobox', { name: 'Ordenar productos' });
    const columnsBtn = (n) => screen.getByTitle(`${n} Columna(s)`);
    const statusBtn = (name) => within(screen.getByRole('group', { name: 'Estado de los productos' }))
        .getByRole('button', { name });
    const shownNames = () => screen.getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent)
        .filter((name) => PRODUCTS.some((p) => p.nombre === name));
    const settle = async () => {
        await screen.findByText('Aceite Viejo');
        await waitFor(() => expect(productsCalls()).toHaveLength(2)); // los dos efectos del montaje
        await act(async () => {});
    };

    test('orden y columnas se recuerdan al volver a montar y el primer render ya los usa', async () => {
        const first = render(<ProductsPanel />);
        await settle();
        expect(sortSelect()).toHaveValue('name_asc');
        expect(columnsBtn(3)).toHaveAttribute('aria-pressed', 'true');
        expect(shownNames()).toEqual(['Aceite Viejo', 'Zinc Nuevo']);
        expect(localStorage.getItem(prefKey('admin.products.sort'))).toBeNull(); // montar no escribe

        fireEvent.change(sortSelect(), { target: { value: 'date_desc' } });
        fireEvent.click(columnsBtn(2));
        expect(shownNames()).toEqual(['Zinc Nuevo', 'Aceite Viejo']);
        expect(stored('admin.products.sort')).toBe('date_desc');
        expect(stored('admin.products.columns')).toBe(2);
        first.unmount();

        // "Recargar": la petición queda pendiente para ver el primer render (esqueleto)
        client.get.mockClear();
        client.get.mockReturnValue(new Promise(() => {}));
        const { container } = render(<ProductsPanel />);
        expect(sortSelect()).toHaveValue('date_desc');
        expect(columnsBtn(2)).toHaveAttribute('aria-pressed', 'true');
        expect(columnsBtn(3)).toHaveAttribute('aria-pressed', 'false');
        expect(container.querySelector('.inv-grid')).toHaveClass('inv-grid--cols-2');
        // Las mismas peticiones de siempre: el orden y las columnas son locales
        await waitFor(() => expect(productsCalls()).toHaveLength(2));
        productsCalls().forEach((call) => expect(call).toEqual(['/admin/products', { params: { size: 2000 } }]));
    });

    test('al volver, la grilla llega ya ordenada con lo guardado; el filtro de estado no se recuerda', async () => {
        save('admin.products.sort', 'date_desc');
        const first = render(<ProductsPanel />);
        await settle();
        expect(shownNames()).toEqual(['Zinc Nuevo', 'Aceite Viejo']);

        fireEvent.click(statusBtn('Inactivos'));
        expect(statusBtn('Inactivos')).toHaveAttribute('aria-pressed', 'true');
        first.unmount();
        client.get.mockClear();

        render(<ProductsPanel />);
        await settle();
        expect(statusBtn('Todos')).toHaveAttribute('aria-pressed', 'true');
        expect(shownNames()).toEqual(['Zinc Nuevo', 'Aceite Viejo']);
    });

    test('lo guardado que no es una opción del control vuelve al valor por defecto', async () => {
        save('admin.products.sort', 'precio_desc');
        save('admin.products.columns', 6);
        render(<ProductsPanel />);
        await settle();
        expect(sortSelect()).toHaveValue('name_asc');
        expect(columnsBtn(3)).toHaveAttribute('aria-pressed', 'true');
        expect(shownNames()).toEqual(['Aceite Viejo', 'Zinc Nuevo']);
    });

    test('es por usuario: lo que eligió otra persona en el mismo equipo no aplica', async () => {
        save('admin.products.columns', 1);
        localStorage.setItem('username', 'admin2');
        render(<ProductsPanel />);
        await settle();
        expect(columnsBtn(3)).toHaveAttribute('aria-pressed', 'true');
    });

    test('las columnas guardadas con la clave anterior (adminGridCols) se respetan y luego se guardan en la nueva', async () => {
        localStorage.setItem('adminGridCols', '4');
        const first = render(<ProductsPanel />);
        await settle();
        expect(columnsBtn(4)).toHaveAttribute('aria-pressed', 'true');

        fireEvent.click(columnsBtn(1));
        expect(stored('admin.products.columns')).toBe(1);
        first.unmount();
        client.get.mockClear();

        render(<ProductsPanel />);
        await settle();
        expect(columnsBtn(1)).toHaveAttribute('aria-pressed', 'true');
    });

    test('la clave anterior (adminGridCols) se pasa a la nueva al montar y sobrevive a cerrar sesión', async () => {
        localStorage.setItem('adminGridCols', '4');
        const view = render(<ProductsPanel />);
        // Primer render: ya con lo migrado, sin escribir el defecto antes
        expect(columnsBtn(4)).toHaveAttribute('aria-pressed', 'true');
        expect(stored('admin.products.columns')).toBe(4); // como número, igual que el estado
        expect(localStorage.getItem('adminGridCols')).toBeNull();
        await settle();
        view.unmount();

        // Cerrar sesión (borra lo que no es vx:pref:) y volver a entrar con el mismo usuario
        clearStorageKeepingSidebarPrefs();
        localStorage.setItem('username', 'admin1');
        client.get.mockClear();
        render(<ProductsPanel />);
        expect(columnsBtn(4)).toHaveAttribute('aria-pressed', 'true');
        await settle();
    });

    test('la clave anterior no pisa una preferencia ya guardada y un valor viejo inválido se descarta', async () => {
        save('admin.products.columns', 2);
        localStorage.setItem('adminGridCols', '4');
        const view = render(<ProductsPanel />);
        expect(columnsBtn(2)).toHaveAttribute('aria-pressed', 'true');
        expect(localStorage.getItem('adminGridCols')).toBeNull();
        await settle();
        view.unmount();

        localStorage.removeItem(prefKey('admin.products.columns'));
        localStorage.setItem('adminGridCols', '7');
        client.get.mockClear();
        render(<ProductsPanel />);
        expect(columnsBtn(3)).toHaveAttribute('aria-pressed', 'true');
        expect(stored('admin.products.columns')).toBeNull();
        expect(localStorage.getItem('adminGridCols')).toBeNull();
        await settle();
    });
});

describe('SpecialProductsPanel', () => {
    const special = (id, nombre) => ({
        id, nombre, precio: 1000, stock: 50, reorderPoint: 1, active: true, parentProductId: null, allowedVendorNames: [],
    });
    const pageOf = (content) => ({ data: { content, totalPages: 1 } });

    beforeEach(() => {
        tagService.getAll.mockResolvedValue({ data: [] });
        specialProductService.getAll.mockResolvedValue(pageOf([special('e1', 'Crema Especial')]));
    });

    const columnsBtn = (n) => screen.getByTitle(`${n} columnas`);
    const gridCols = () => screen.getByText('Crema Especial').closest('.sp-products-grid').style.getPropertyValue('--sp-cols');

    test('las columnas se recuerdan al volver a montar y el primer render ya las usa', async () => {
        const first = render(<SpecialProductsPanel />);
        await screen.findByText('Crema Especial');
        expect(columnsBtn(3)).toHaveAttribute('aria-pressed', 'true');
        expect(gridCols()).toBe('3');
        expect(localStorage.getItem(prefKey('admin.specialProducts.columns'))).toBeNull(); // montar no escribe

        fireEvent.click(columnsBtn(4));
        expect(gridCols()).toBe('4');
        expect(stored('admin.specialProducts.columns')).toBe(4);

        // Filtro de estado: no se recuerda
        fireEvent.click(screen.getByRole('tab', { name: 'Activos' }));
        first.unmount();

        specialProductService.getAll.mockClear();
        render(<SpecialProductsPanel />);
        // Primer render (todavía "Cargando..."): el selector ya marca lo guardado
        expect(columnsBtn(4)).toHaveAttribute('aria-pressed', 'true');
        expect(columnsBtn(3)).toHaveAttribute('aria-pressed', 'false');
        expect(screen.getByRole('tab', { name: 'Todos' })).toHaveAttribute('aria-selected', 'true');
        await screen.findByText('Crema Especial');
        expect(gridCols()).toBe('4');
        // La misma petición de siempre (una sola, página 0 de 20)
        expect(specialProductService.getAll).toHaveBeenCalledTimes(1);
        expect(specialProductService.getAll).toHaveBeenCalledWith(0, 20);
    });

    test('un valor guardado fuera de 2/3/4 vuelve a 3; la clave anterior (spGridCols) se respeta', async () => {
        save('admin.specialProducts.columns', 1);
        const first = render(<SpecialProductsPanel />);
        await screen.findByText('Crema Especial');
        expect(columnsBtn(3)).toHaveAttribute('aria-pressed', 'true');
        first.unmount();

        localStorage.removeItem(prefKey('admin.specialProducts.columns'));
        localStorage.setItem('spGridCols', '2');
        render(<SpecialProductsPanel />);
        await screen.findByText('Crema Especial');
        expect(columnsBtn(2)).toHaveAttribute('aria-pressed', 'true');
        expect(gridCols()).toBe('2');
    });

    test('la clave anterior (spGridCols) se pasa a la nueva al montar y sobrevive a cerrar sesión', async () => {
        localStorage.setItem('spGridCols', '4');
        const view = render(<SpecialProductsPanel />);
        expect(columnsBtn(4)).toHaveAttribute('aria-pressed', 'true');
        expect(stored('admin.specialProducts.columns')).toBe(4);
        expect(localStorage.getItem('spGridCols')).toBeNull();
        await screen.findByText('Crema Especial');
        view.unmount();

        clearStorageKeepingSidebarPrefs();
        localStorage.setItem('username', 'admin1');
        render(<SpecialProductsPanel />);
        expect(columnsBtn(4)).toHaveAttribute('aria-pressed', 'true');
        await screen.findByText('Crema Especial');
        expect(gridCols()).toBe('4');
    });
});
