import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import SpecialPromotionFormModal from './SpecialPromotionFormModal';
import client from '../../api/client';
import specialPromotionService from '../../api/specialPromotionService';

const mockToast = { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn() };
jest.mock('../ToastContainer', () => ({ useToast: () => mockToast }));
jest.mock('../../api/client', () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock('../../api/specialPromotionService', () => ({ __esModule: true, default: { create: jest.fn(), update: jest.fn() } }));

const products = [{ id: 'm1', nombre: 'Colágeno', precio: 1000, stock: 5, active: true }];
const vendedores = [{ id: 'v1', username: 'NinaTorres' }];
const parent = {
    id: 'p1', nombre: 'Pack 40+2', type: 'PACK', buyQuantity: 40, packPrice: 100000, active: false,
    mainProduct: { id: 'm1', nombre: 'Colágeno' }, giftItems: [{ product: { id: 'g1', nombre: 'Omega' }, quantity: 2 }],
};

// Respuesta real de SpecialPromotionResponse: trae mainProductId/mainProductName, no mainProduct
const linked = {
    id: 's1', nombre: 'Especial Nina', descripcion: null, type: 'PACK', buyQuantity: 30, packPrice: 90000,
    mainProductId: 'm1', mainProductName: 'Colágeno', active: true, validFrom: null, validUntil: null,
    parentPromotionId: 'p1', parentPromotionName: 'Pack 40+2', isLinked: true,
    allowedVendorIds: ['v1'], allowedVendorNames: ['NinaTorres'],
};
const standalone = {
    ...linked, id: 's4', nombre: 'Suelta', packPrice: null, buyQuantity: 10,
    parentPromotionId: null, parentPromotionName: null, isLinked: false, allowedVendorIds: [], allowedVendorNames: [],
};

beforeEach(() => {
    client.get.mockImplementation((url) => {
        if (url === '/admin/clients/vendedores') return Promise.resolve({ data: vendedores });
        if (url === '/admin/promotions/p1') return Promise.resolve({ data: parent });
        if (url === '/admin/promotions') return Promise.resolve({ data: [parent] });
        return Promise.resolve({ data: products });
    });
    specialPromotionService.update.mockResolvedValue({ data: {} });
    specialPromotionService.create.mockResolvedValue({ data: { id: 'nueva', visibleToAll: true } });
});

const payloadOf = () => specialPromotionService.update.mock.calls[0][1];

test('vinculada: muestra lo que vende el padre en solo lectura y no reenvía tipo, cantidad ni producto', async () => {
    const onSuccess = jest.fn();
    render(<SpecialPromotionFormModal promotion={linked} onClose={jest.fn()} onSuccess={onSuccess} />);

    // Resumen de la base: cantidad 40 del padre (no la 30 guardada en la especial)
    expect(await screen.findByText('2x Omega')).toBeInTheDocument();
    expect(screen.getByText('40')).toBeInTheDocument();
    expect(screen.getByText('Padre inactiva: no se puede vender')).toBeInTheDocument();
    // Tipo / producto / cantidad no son editables
    expect(screen.queryByText('Fija (Pack)')).not.toBeInTheDocument();
    expect(screen.queryByText('Cant. Compra')).not.toBeInTheDocument();
    expect(screen.queryByText(/Standalone no se pueden vender/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue('90000'), { target: { value: '85000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));

    await waitFor(() => expect(specialPromotionService.update).toHaveBeenCalledTimes(1));
    expect(specialPromotionService.update.mock.calls[0][0]).toBe('s1');
    expect(payloadOf()).toEqual(expect.objectContaining({
        nombre: 'Especial Nina',
        packPrice: 85000,
        type: null,
        buyQuantity: null,
        mainProductId: null,
        allowedVendorIds: ['v1'],
        active: true,
    }));
    expect(payloadOf().giftItems).toBeUndefined();
    expect(mockToast.warning).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalled();
});

test('standalone: toma mainProductId de la respuesta (antes quedaba vacío y bloqueaba guardar) y advierte que no se vende', async () => {
    render(<SpecialPromotionFormModal promotion={standalone} onClose={jest.fn()} onSuccess={jest.fn()} />);

    expect(screen.getByText(/Standalone no se pueden vender/)).toBeInTheDocument();
    expect(screen.getByText('Ninguna vendedora la verá; solo admin')).toBeInTheDocument();
    await screen.findByText('Fija (Pack)');

    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));

    await waitFor(() => expect(specialPromotionService.update).toHaveBeenCalledTimes(1));
    expect(mockToast.warning).not.toHaveBeenCalledWith('Seleccione un producto principal');
    expect(payloadOf()).toEqual(expect.objectContaining({
        mainProductId: 'm1',
        type: 'PACK',
        buyQuantity: 10,
        packPrice: null,
        allowedVendorIds: [],
    }));
});

// ── ¿Quién la ve? "Todas las vendedoras" / "Solo las seleccionadas" (V46) ──────────────

const createPayload = () => specialPromotionService.create.mock.calls[0][0];

const selectParent = async () => {
    fireEvent.change(screen.getByPlaceholderText('Buscar promoción base...'), { target: { value: 'Pack' } });
    fireEvent.click(await screen.findByText('Pack 40+2'));
};

test('crear: "Todas las vendedoras" viene marcada y se envía visibleToAll=true sin lista de vendedoras', async () => {
    const onSuccess = jest.fn();
    render(<SpecialPromotionFormModal promotion={null} onClose={jest.fn()} onSuccess={onSuccess} />);

    expect(screen.getByLabelText(/Todas las vendedoras/)).toBeChecked();
    expect(screen.getByLabelText(/Solo las seleccionadas/)).not.toBeChecked();
    // Con "Todas" no se muestra el selector de vendedoras
    expect(screen.queryByRole('button', { name: 'Vendedoras asignadas' })).not.toBeInTheDocument();

    await selectParent();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(specialPromotionService.create).toHaveBeenCalledTimes(1));
    expect(createPayload()).toEqual(expect.objectContaining({
        parentPromotionId: 'p1',
        visibleToAll: true,
        allowedVendorIds: [],
    }));
    expect(onSuccess).toHaveBeenCalled();
    expect(mockToast.warning).not.toHaveBeenCalled();
});

test('crear "Solo las seleccionadas": envía visibleToAll=false con las vendedoras elegidas', async () => {
    render(<SpecialPromotionFormModal promotion={null} onClose={jest.fn()} onSuccess={jest.fn()} />);
    await selectParent();

    fireEvent.click(screen.getByLabelText(/Solo las seleccionadas/));
    expect(screen.getByText('Ninguna vendedora la verá; solo admin')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Vendedoras asignadas' }));
    fireEvent.click(await screen.findByRole('option', { name: /NinaTorres/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(specialPromotionService.create).toHaveBeenCalledTimes(1));
    expect(createPayload()).toEqual(expect.objectContaining({
        visibleToAll: false,
        allowedVendorIds: ['v1'],
    }));
});

test('editar una especial anterior a V46 (sin el campo): queda "Solo las seleccionadas" y conserva sus vendedoras', async () => {
    render(<SpecialPromotionFormModal promotion={linked} onClose={jest.fn()} onSuccess={jest.fn()} />);

    expect(screen.getByLabelText(/Solo las seleccionadas/)).toBeChecked();
    expect(screen.getByLabelText(/Todas las vendedoras/)).not.toBeChecked();
    await screen.findByText('2x Omega');

    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));

    await waitFor(() => expect(specialPromotionService.update).toHaveBeenCalledTimes(1));
    expect(payloadOf()).toEqual(expect.objectContaining({ visibleToAll: false, allowedVendorIds: ['v1'] }));
});

test('editar: pasar a "Todas las vendedoras" envía la lista vacía', async () => {
    render(<SpecialPromotionFormModal promotion={linked} onClose={jest.fn()} onSuccess={jest.fn()} />);
    await screen.findByText('2x Omega');

    fireEvent.click(screen.getByLabelText(/Todas las vendedoras/));
    expect(screen.queryByRole('button', { name: 'Vendedoras asignadas' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));

    await waitFor(() => expect(specialPromotionService.update).toHaveBeenCalledTimes(1));
    expect(payloadOf()).toEqual(expect.objectContaining({ visibleToAll: true, allowedVendorIds: [] }));
});

test('editar una especial "Todas": la carga marcada así', async () => {
    render(<SpecialPromotionFormModal
        promotion={{ ...linked, visibleToAll: true, allowedVendorIds: [], allowedVendorNames: [] }}
        onClose={jest.fn()} onSuccess={jest.fn()} />);

    expect(screen.getByLabelText(/Todas las vendedoras/)).toBeChecked();
    await screen.findByText('2x Omega');
});

test('backend anterior (respuesta sin visibleToAll): avisa que "Todas" todavía no aplica', async () => {
    specialPromotionService.create.mockResolvedValue({ data: { id: 'nueva' } });
    render(<SpecialPromotionFormModal promotion={null} onClose={jest.fn()} onSuccess={jest.fn()} />);
    await selectParent();

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(mockToast.warning).toHaveBeenCalledWith(
        expect.stringContaining('todavía no aplica "Todas las vendedoras"')));
});

test('standalone: producto principal y regalos se eligen escribiendo en el selector con buscador', async () => {
    client.get.mockImplementation((url) => {
        if (url === '/admin/clients/vendedores') return Promise.resolve({ data: vendedores });
        return Promise.resolve({ data: [
            ...products,
            { id: 'g1', nombre: 'Omega', precio: 500, stock: 3, active: true },
            { id: 'x1', nombre: 'Omega Viejo', precio: 400, stock: 0, active: false },
        ] });
    });
    render(<SpecialPromotionFormModal promotion={standalone} onClose={jest.fn()} onSuccess={jest.fn()} />);

    const mainProduct = await screen.findByRole('combobox', { name: /Producto Principal/ });
    await waitFor(() => expect(mainProduct).toHaveValue('Colágeno'));

    // Cambiar el principal: los inactivos no se ofrecen
    fireEvent.change(mainProduct, { target: { value: 'omega' } });
    expect(screen.queryByRole('option', { name: /Omega Viejo/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: /Omega/ }));
    expect(mainProduct).toHaveValue('Omega');

    // Regalo: se escribe, se elige y se agrega
    const gift = screen.getByRole('combobox', { name: /Regalos \(Fijo\)/ });
    fireEvent.change(gift, { target: { value: 'colageno' } });
    expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(1);
    fireEvent.click(screen.getByRole('option', { name: /Colágeno/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    expect(gift).toHaveValue('');

    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    await waitFor(() => expect(specialPromotionService.update).toHaveBeenCalledTimes(1));
    expect(payloadOf()).toEqual(expect.objectContaining({
        mainProductId: 'g1',
        type: 'PACK',
        giftItems: [{ productId: 'm1', quantity: 1 }],
    }));
});
