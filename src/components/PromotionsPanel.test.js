import { render, screen, fireEvent, within } from '@testing-library/react';
import PromotionsPanel from './PromotionsPanel';
import promotionService from '../api/promotionService';

const mockToast = { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn() };
jest.mock('./ToastContainer', () => ({ useToast: () => mockToast }));
jest.mock('./ConfirmDialog', () => ({ useConfirm: () => jest.fn(() => Promise.resolve(true)) }));
jest.mock('../api/client', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn() } }));
jest.mock('../api/promotionService', () => ({
    __esModule: true,
    default: { getAll: jest.fn(), toggleStatus: jest.fn(), delete: jest.fn(), create: jest.fn(), update: jest.fn() },
}));

const promotions = [
    {
        id: 'p1', nombre: 'Pack Vitamína C', descripcion: 'Promo de temporada', type: 'PACK', buyQuantity: 40,
        packPrice: 100000, mainProduct: { id: 'm1', nombre: 'Colágeno' },
        giftItems: [{ quantity: 2, product: { id: 'g1', nombre: 'Omega Tres' } }],
        active: true, validFrom: null, validUntil: null, visibleToAll: true, allowedVendorIds: [], allowedVendorNames: [],
    },
    {
        id: 'p2', nombre: 'Surtido Navidad', type: 'BUY_GET_FREE', buyQuantity: 13, packPrice: 50000,
        mainProduct: { id: 'm2', nombre: 'Magnesio' }, giftItems: [], active: true,
        validUntil: '2020-01-01T00:00:00', visibleToAll: false, allowedVendorIds: ['v1'], allowedVendorNames: ['NinaTorres'],
    },
    {
        id: 'p3', nombre: 'Pack Programado', type: 'PACK', buyQuantity: 10, mainProduct: { id: 'm3', nombre: 'Zinc' },
        giftItems: [], active: true, validFrom: '2099-01-01T00:00:00',
        // backend anterior: sin campos de visibilidad
    },
    {
        id: 'p4', nombre: 'Promo Vieja', type: 'PACK', buyQuantity: 5, mainProduct: { id: 'm4', nombre: 'Hierro' },
        giftItems: [], active: false, visibleToAll: false, allowedVendorIds: [], allowedVendorNames: [],
    },
];

const cardOf = (name) => screen.getByText(name).closest('.promotion-card');
const search = (value) => fireEvent.change(screen.getByPlaceholderText(/Buscar por nombre/), { target: { value } });

beforeEach(() => {
    promotionService.getAll.mockResolvedValue({ data: promotions });
    promotionService.toggleStatus.mockResolvedValue({});
});

test('abre en Activas: cuenta activas e inactivas y marca Vencida / Programada', async () => {
    render(<PromotionsPanel />);

    expect(await screen.findByText('Pack Vitamína C')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Activas (3)' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Inactivas (1)' })).toBeInTheDocument();
    expect(screen.queryByText('Promo Vieja')).not.toBeInTheDocument();

    expect(within(cardOf('Surtido Navidad')).getByText('Vencida')).toBeInTheDocument();
    expect(within(cardOf('Pack Programado')).getByText('Programada')).toBeInTheDocument();
    expect(within(cardOf('Pack Vitamína C')).queryByText('Vencida')).not.toBeInTheDocument();
    expect(within(cardOf('Pack Vitamína C')).queryByText('Programada')).not.toBeInTheDocument();
    expect(screen.getByText('3 promociones')).toBeInTheDocument();
});

test('chips de visibilidad: Todas, nombres asignados o ninguna', async () => {
    render(<PromotionsPanel />);
    await screen.findByText('Pack Vitamína C');

    expect(within(cardOf('Pack Vitamína C')).getByText('Todas')).toBeInTheDocument();
    expect(within(cardOf('Surtido Navidad')).getByText('NinaTorres')).toBeInTheDocument();
    // Sin el campo (backend anterior) = la ven todas
    expect(within(cardOf('Pack Programado')).getByText('Todas')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Inactivas (1)' }));
    expect(within(cardOf('Promo Vieja')).getByText('Ninguna (solo admin)')).toBeInTheDocument();
});

test('busca sin mayúsculas ni tildes por nombre, producto, regalo y vendedora', async () => {
    render(<PromotionsPanel />);
    await screen.findByText('Pack Vitamína C');

    search('VITAMINA');
    expect(screen.getByText('Pack Vitamína C')).toBeInTheDocument();
    expect(screen.queryByText('Surtido Navidad')).not.toBeInTheDocument();
    expect(screen.getByText('1 resultado para "VITAMINA"')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Activas (1)' })).toBeInTheDocument();

    search('colageno');
    expect(screen.getByText('Pack Vitamína C')).toBeInTheDocument();

    search('omega');
    expect(screen.getByText('Pack Vitamína C')).toBeInTheDocument();

    search('nina');
    expect(screen.getByText('Surtido Navidad')).toBeInTheDocument();
    expect(screen.queryByText('Pack Vitamína C')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }));
    expect(screen.getByText('Pack Vitamína C')).toBeInTheDocument();
    expect(screen.getByText('Surtido Navidad')).toBeInTheDocument();
});

test('sin resultados en Activas muestra el mensaje y permite ver la coincidencia en Todas', async () => {
    render(<PromotionsPanel />);
    await screen.findByText('Pack Vitamína C');

    search('vieja');
    expect(screen.getByText('No hay promociones activas que coincidan con "vieja".')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Inactivas (1)' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ver en Todas (1)' }));
    expect(screen.getByText('Promo Vieja')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Todas' })).toHaveAttribute('aria-selected', 'true');

    search('no existe nada');
    expect(screen.getByText('No hay promociones que coincidan con "no existe nada".')).toBeInTheDocument();
    expect(screen.getByText('0 resultados para "no existe nada"')).toBeInTheDocument();
});

test('al desactivar, la tarjeta pasa a Inactivas', async () => {
    render(<PromotionsPanel />);
    await screen.findByText('Pack Vitamína C');

    fireEvent.click(within(cardOf('Pack Vitamína C')).getByRole('button', { name: /Desactivar/ }));

    expect(await screen.findByRole('tab', { name: 'Inactivas (2)' })).toBeInTheDocument();
    expect(promotionService.toggleStatus).toHaveBeenCalledWith('p1', false);
    expect(screen.queryByText('Pack Vitamína C')).not.toBeInTheDocument();
});
