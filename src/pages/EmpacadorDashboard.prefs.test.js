import { render, screen, fireEvent } from '@testing-library/react';
import EmpacadorDashboard from './EmpacadorDashboard';
import productService from '../api/productService';
import { prefKey } from '../hooks/usePersistentState';

// Preferencias de CÓMO VER del empacador que se recuerdan al recargar (usePersistentState): la
// vista (tarjetas / lista) y el orden. La búsqueda y el filtro (Todos / Alertas / En pedidos) NO.

jest.mock('../api/productService', () => ({ __esModule: true, default: { getStockReportForEmpacador: jest.fn() } }));
const mockToast = { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn() };
jest.mock('../components/ToastContainer', () => ({ useToast: () => mockToast }));
jest.mock('../services/NotificationService', () => ({
    __esModule: true,
    default: { connect: () => () => {} },
}));

const item = (productId, nombre, stockEnBD, alertaCritica = false) => ({
    productId, nombre, stockEnBD, stockComprometido: 0, stockFisicoReal: stockEnBD, faltante: 0, alertaCritica,
});

beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    localStorage.clear();
    localStorage.setItem('username', 'bodega1');
    productService.getStockReportForEmpacador.mockResolvedValue({
        data: [item('aaaaaaaa-1', 'Crema Facial', 7), item('bbbbbbbb-2', 'Gel Frío', 3, true)],
    });
});

afterEach(() => {
    jest.restoreAllMocks();
});

const savePref = (key, value) => localStorage.setItem(prefKey(key), JSON.stringify(value));
const storedPref = (key) => JSON.parse(localStorage.getItem(prefKey(key)));

const sortSelect = () => screen.getByRole('combobox', { name: 'Ordenar productos' });
const cardsButton = () => screen.getByRole('button', { name: 'Vista tarjetas' });
const listButton = () => screen.getByRole('button', { name: 'Vista lista' });
// Nombres en el orden en que se ven (tarjetas o filas)
const shownNames = () => Array.from(document.querySelectorAll('.emp-pcard, .emp-prow'))
    .map((el) => (el.textContent.includes('Crema Facial') ? 'Crema Facial' : 'Gel Frío'));

test('vista y orden se recuerdan al volver a montar; la búsqueda y el filtro no', async () => {
    const first = render(<EmpacadorDashboard />);
    await screen.findByText('Crema Facial');
    expect(cardsButton()).toHaveAttribute('aria-pressed', 'true'); // defectos de siempre
    expect(sortSelect()).toHaveValue('nombre');
    expect(shownNames()).toEqual(['Crema Facial', 'Gel Frío']);

    fireEvent.click(listButton());
    fireEvent.change(sortSelect(), { target: { value: 'stock_asc' } });
    expect(document.querySelector('.emp-list')).toBeInTheDocument();
    expect(shownNames()).toEqual(['Gel Frío', 'Crema Facial']);
    fireEvent.click(screen.getByRole('button', { name: /^Alertas/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar producto' }), { target: { value: 'gel' } });
    expect(storedPref('empacador.inventory.view')).toBe('list');
    expect(storedPref('empacador.inventory.sort')).toBe('stock_asc');
    first.unmount();

    render(<EmpacadorDashboard />);
    // Desde el primer render (aún cargando) ya están la vista y el orden guardados
    expect(listButton()).toHaveAttribute('aria-pressed', 'true');
    expect(sortSelect()).toHaveValue('stock_asc');
    await screen.findByText('Crema Facial');
    expect(document.querySelector('.emp-list')).toBeInTheDocument();
    expect(document.querySelector('.emp-cards-grid')).not.toBeInTheDocument();
    expect(shownNames()).toEqual(['Gel Frío', 'Crema Facial']);
    // Búsqueda vacía y "Todos": se ven los dos productos
    expect(screen.getByRole('textbox', { name: 'Buscar producto' })).toHaveValue('');
    expect(screen.getByRole('button', { name: /^Todos/ })).toHaveAttribute('aria-pressed', 'true');
    expect(productService.getStockReportForEmpacador).toHaveBeenCalledTimes(2); // una por montaje
});

test('lo guardado que no es una opción del control vuelve a tarjetas y A → Z', async () => {
    savePref('empacador.inventory.view', 'tabla');
    savePref('empacador.inventory.sort', 'precio');
    render(<EmpacadorDashboard />);
    await screen.findByText('Crema Facial');
    expect(cardsButton()).toHaveAttribute('aria-pressed', 'true');
    expect(sortSelect()).toHaveValue('nombre');
    expect(shownNames()).toEqual(['Crema Facial', 'Gel Frío']);
});

test('otro usuario del mismo equipo no hereda la vista ni el orden', async () => {
    savePref('empacador.inventory.view', 'list');
    savePref('empacador.inventory.sort', 'alerta');
    localStorage.setItem('username', 'bodega2');
    render(<EmpacadorDashboard />);
    await screen.findByText('Crema Facial');
    expect(cardsButton()).toHaveAttribute('aria-pressed', 'true');
    expect(sortSelect()).toHaveValue('nombre');
});
