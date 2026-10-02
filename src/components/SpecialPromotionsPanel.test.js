import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import SpecialPromotionsPanel from './SpecialPromotionsPanel';
import specialPromotionService from '../api/specialPromotionService';
import promotionService from '../api/promotionService';

const mockToast = { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn() };
jest.mock('./ToastContainer', () => ({ useToast: () => mockToast }));
jest.mock('./ConfirmDialog', () => ({ useConfirm: () => jest.fn(() => Promise.resolve(true)) }));
jest.mock('../api/client', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn() } }));
jest.mock('../api/specialPromotionService', () => ({
    __esModule: true,
    default: { getAll: jest.fn(), search: jest.fn(), toggleStatus: jest.fn(), remove: jest.fn(), create: jest.fn(), update: jest.fn() },
}));
jest.mock('../api/promotionService', () => ({ __esModule: true, default: { getAll: jest.fn() } }));

const base = { type: 'PACK', buyQuantity: 40, packPrice: 90000, isLinked: true, validFrom: null, validUntil: null };
const specials = [
    {
        ...base, id: 's1', nombre: 'Especial Nina', mainProductId: 'm1', mainProductName: 'Colágeno', active: true,
        parentPromotionId: 'p1', parentPromotionName: 'Pack Vitamína C', allowedVendorIds: ['v1'], allowedVendorNames: ['NinaTorres'],
    },
    {
        ...base, id: 's2', nombre: 'Especial Padre Apagado', mainProductId: 'm4', mainProductName: 'Hierro', active: true,
        parentPromotionId: 'p4', parentPromotionName: 'Promo Vieja', allowedVendorIds: [], allowedVendorNames: [],
    },
    {
        ...base, id: 's3', nombre: 'Especial Inactiva', mainProductId: 'm1', mainProductName: 'Colágeno', active: false,
        parentPromotionId: 'p1', parentPromotionName: 'Pack Vitamína C', allowedVendorIds: ['v2'], allowedVendorNames: ['MercyMaestre'],
    },
    {
        ...base, id: 's4', nombre: 'Suelta', mainProductId: 'm2', mainProductName: 'Magnesio', active: true,
        isLinked: false, parentPromotionId: null, parentPromotionName: null, allowedVendorIds: ['v1'], allowedVendorNames: ['NinaTorres'],
    },
];
const parents = [
    { id: 'p1', nombre: 'Pack Vitamína C', type: 'PACK', buyQuantity: 40, active: true, mainProduct: { id: 'm1', nombre: 'Colágeno' },
        giftItems: [{ quantity: 2, product: { id: 'g1', nombre: 'Omega Tres' } }] },
    { id: 'p4', nombre: 'Promo Vieja', type: 'PACK', buyQuantity: 5, active: false, mainProduct: { id: 'm4', nombre: 'Hierro' }, giftItems: [] },
];

const cardOf = (name) => screen.getByText(name).closest('.sp-card');
const search = (value) => fireEvent.change(screen.getByPlaceholderText(/Buscar por nombre/), { target: { value } });

beforeEach(() => {
    specialPromotionService.getAll.mockResolvedValue({ data: { content: specials, totalPages: 1 } });
    specialPromotionService.toggleStatus.mockResolvedValue({});
    promotionService.getAll.mockResolvedValue({ data: parents });
});

test('carga todas las especiales de una vez (no solo la página 0 de 20 ni /search) y abre en Activas', async () => {
    render(<SpecialPromotionsPanel />);

    expect(await screen.findByText('Especial Nina')).toBeInTheDocument();
    expect(specialPromotionService.getAll).toHaveBeenCalledWith(0, 500);
    expect(specialPromotionService.search).not.toHaveBeenCalled();
    expect(screen.getByRole('tab', { name: 'Activas (3)' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText('Especial Inactiva')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Inactivas (1)' }));
    expect(screen.getByText('Especial Inactiva')).toBeInTheDocument();
    expect(screen.queryByText('Especial Nina')).not.toBeInTheDocument();
});

test('avisa cuando el padre está inactivo, cuando es standalone y cuando no tiene vendedoras', async () => {
    render(<SpecialPromotionsPanel />);
    await screen.findByText('Especial Nina');

    const apagado = within(cardOf('Especial Padre Apagado'));
    expect(apagado.getByText('Padre inactiva: no se puede vender')).toBeInTheDocument();
    expect(apagado.getByText('Sin vendedoras')).toBeInTheDocument();

    expect(within(cardOf('Suelta')).getByText('Standalone: no se puede vender')).toBeInTheDocument();

    const nina = within(cardOf('Especial Nina'));
    expect(nina.queryByText(/no se puede vender/)).not.toBeInTheDocument();
    expect(nina.getByText('NinaTorres')).toBeInTheDocument();
    expect(nina.getByText(/Compra 40 Colágeno/)).toBeInTheDocument();
});

test('una especial "Todas las vendedoras" lo muestra en la tarjeta en vez de "Sin vendedoras"', async () => {
    specialPromotionService.getAll.mockResolvedValue({
        data: {
            content: [{ ...specials[1], id: 's9', nombre: 'Especial Equipo', visibleToAll: true, parentPromotionId: 'p1' }],
            totalPages: 1,
        },
    });
    render(<SpecialPromotionsPanel />);

    await screen.findByText('Especial Equipo');
    const card = within(cardOf('Especial Equipo'));
    expect(card.getByText('Todas las vendedoras')).toBeInTheDocument();
    expect(card.queryByText('Sin vendedoras')).not.toBeInTheDocument();
});

test('si no cargan las promociones base, muestra mainProductName de la especial y no inventa avisos', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    promotionService.getAll.mockRejectedValue(new Error('500'));
    render(<SpecialPromotionsPanel />);

    expect(await screen.findByText('Especial Padre Apagado')).toBeInTheDocument();
    expect(within(cardOf('Especial Padre Apagado')).getByText(/Compra 40 Hierro/)).toBeInTheDocument();
    expect(screen.queryByText('Padre inactiva: no se puede vender')).not.toBeInTheDocument();
    expect(mockToast.error).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
});

test('busca sin tildes por promoción base, vendedora y regalos del padre', async () => {
    render(<SpecialPromotionsPanel />);
    await screen.findByText('Especial Nina');

    search('vitamina');
    expect(screen.getByText('Especial Nina')).toBeInTheDocument();
    expect(screen.queryByText('Suelta')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Inactivas (1)' })).toBeInTheDocument(); // Especial Inactiva también coincide

    search('ninatorres');
    expect(screen.getByText('Especial Nina')).toBeInTheDocument();
    expect(screen.getByText('Suelta')).toBeInTheDocument();
    expect(screen.queryByText('Especial Padre Apagado')).not.toBeInTheDocument();

    search('omega'); // regalo de la promoción base p1
    expect(screen.getByText('Especial Nina')).toBeInTheDocument();
    expect(screen.queryByText('Suelta')).not.toBeInTheDocument();

    search('xyz');
    expect(screen.getByText('No hay promociones especiales activas que coincidan con "xyz".')).toBeInTheDocument();
});

test('el switch envía el nuevo estado y la tarjeta cambia de pestaña', async () => {
    render(<SpecialPromotionsPanel />);
    await screen.findByText('Especial Nina');

    fireEvent.click(screen.getByLabelText('Desactivar Especial Nina'));

    await waitFor(() => expect(specialPromotionService.toggleStatus).toHaveBeenCalledWith('s1', false));
    expect(await screen.findByRole('tab', { name: 'Inactivas (2)' })).toBeInTheDocument();
    expect(screen.queryByText('Especial Nina')).not.toBeInTheDocument();
});
