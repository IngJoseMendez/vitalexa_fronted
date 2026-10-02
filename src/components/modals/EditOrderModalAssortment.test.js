import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import EditOrderModal from './EditOrderModal';
import client from '../../api/client';

// axios no se resuelve en el Jest de CRA: se reemplaza el cliente
jest.mock('../../api/client', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn() } }));
const mockToast = { error: jest.fn(), success: jest.fn(), warning: jest.fn(), info: jest.fn() };
jest.mock('../ToastContainer', () => ({ useToast: () => mockToast }));
const mockConfirm = jest.fn();
jest.mock('../ConfirmDialog', () => ({ useConfirm: () => mockConfirm }));

// Surtido "13 + hasta 2 gratis" por $100.000; el principal cuesta $9.000 (13 x 9.000 = 117.000)
const surtido = {
    id: 'surtido-1', nombre: 'Surtido 13+2', type: 'BUY_GET_FREE', buyQuantity: 13, freeQuantity: 2,
    packPrice: 100000, active: true, mainProduct: { id: 'm', nombre: 'Colágeno' },
};
const productos = [
    { id: 'm', nombre: 'Colágeno', active: true, stock: 30, precio: 9000 },
    { id: 'a', nombre: 'Aceite', active: true, stock: 20, precio: 5000 },
];
const itemBase = {
    isPromotionItem: true, promotionId: 'surtido-1', promotionInstanceId: 'inst-1', promotionGroupIndex: 1,
    promotionName: 'Surtido 13+2', isBonified: false, isFreightItem: false,
};
// El backend no garantiza el orden de los items: aquí el gratis viene ANTES que el principal
const orden = {
    id: 'o1', cliente: 'Sin cliente', notas: 'x [Promoción]', estado: 'CONFIRMADO', promotionIds: ['surtido-1'],
    items: [
        { ...itemBase, id: 'i2', productId: 'a', productName: 'Aceite', cantidad: 2, precioUnitario: 0, subtotal: 0,
            isFreeItem: true, promotionPackPrice: null },
        { ...itemBase, id: 'i1', productId: 'm', productName: 'Colágeno', cantidad: 13, precioUnitario: 9000,
            subtotal: 100000, isFreeItem: false, promotionPackPrice: 100000 },
    ],
};

const renderModal = () => render(<EditOrderModal order={orden} onClose={jest.fn()} onSuccess={jest.fn()} />);

beforeEach(() => {
    client.get.mockImplementation((url) => {
        if (url === '/admin/clients') return Promise.resolve({ data: [] });
        if (url === '/admin/products') return Promise.resolve({ data: productos });
        if (url === '/admin/promotions') return Promise.resolve({ data: [surtido] });
        if (url === '/admin/promotions/surtido-1') return Promise.resolve({ data: surtido });
        return Promise.reject(new Error(`GET inesperado ${url}`));
    });
    client.post.mockResolvedValue({ data: {} });
    client.put.mockResolvedValue({ data: {} });
    mockConfirm.mockResolvedValue(true);
    jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
    console.log.mockRestore();
});

test('el total del surtido es el precio del paquete aunque el gratis venga primero (no 13 x precio normal)', async () => {
    renderModal();

    const total = (await screen.findByText('Total Estimado')).closest('.summary-row');
    expect(total).toHaveTextContent('100.000,00');
    expect(total).not.toHaveTextContent('117.000');
});

test('agregar un surtido a la orden: se escogen sus gratis y van en un solo envío con el paquete', async () => {
    renderModal();
    await screen.findByText('Total Estimado');

    fireEvent.change(screen.getByPlaceholderText('Buscar promoción...'), { target: { value: 'Surtido' } });
    fireEvent.click(await screen.findByText('Surtido 13+2', { selector: '.eo-search-item .item-name' }));

    // Modal de gratis (hasta 2)
    expect(await screen.findByText('Escoger productos gratis')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Buscar Producto'), { target: { value: 'Ace' } });
    const fila = screen.getByText('Aceite', { selector: '.product-search-item div' }).closest('.product-search-item');
    fireEvent.click(within(fila).getByRole('button', { name: 'Agregar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Agregar paquete' }));

    expect(screen.queryByText('Escoger productos gratis')).not.toBeInTheDocument();
    // En la cola: el paquete con su gratis a $0
    expect(screen.getByText('$0 GRATIS')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Confirmar y Agregar/ }));

    await waitFor(() => expect(client.post).toHaveBeenCalledTimes(1));
    expect(client.post).toHaveBeenCalledWith('/admin/orders/o1/promotions/add-with-selections', {
        promotionIds: ['surtido-1'],
        bonifiedPromotionIds: [],
        assortmentSelections: [{ promotionId: 'surtido-1', bonified: false, items: [{ productId: 'a', cantidad: 1 }] }],
    });
});

test('guardar la edición no reenvía los productos del surtido como items cobrados y dice qué instancias quedan', async () => {
    renderModal();
    await screen.findByText('Total Estimado');

    // Quitar la instancia y guardar
    fireEvent.click(screen.getByRole('button', { name: /Eliminar/ }));
    await waitFor(() => expect(mockConfirm).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole('button', { name: 'Guardar Cambios' }));

    await waitFor(() => expect(client.put).toHaveBeenCalledTimes(1));
    const [url, payload] = client.put.mock.calls[0];
    expect(url).toBe('/admin/orders/o1');
    expect(payload.items).toEqual([]);
    expect(payload.promotionIds).toEqual([]);
    expect(payload.keptPromotionInstanceIds).toEqual([]);
});

test('el cliente se busca escribiendo (nombre, teléfono o NIT) y al guardar se envía su id', async () => {
    const baseGet = client.get.getMockImplementation();
    client.get.mockImplementation((url) => (url === '/admin/clients'
        ? Promise.resolve({ data: [
            { id: 'c1', nombre: 'Droguería Uno', telefono: '3001234567', nit: '900123' },
            { id: 'c2', nombre: 'Droguería Dos', telefono: '3109876543' },
        ] })
        : baseGet(url)));
    renderModal();
    await screen.findByText('Total Estimado');

    // La orden no tiene cliente: el campo muestra "Sin cliente" (la opción vacía del antiguo <select>)
    const cliente = screen.getByRole('combobox', { name: 'Cliente' });
    expect(cliente).toHaveValue('Sin cliente');

    // Por NIT (va en la descripción de la opción): solo queda ese cliente, con el mismo texto de antes
    fireEvent.change(cliente, { target: { value: '900123' } });
    const opciones = screen.getAllByRole('option');
    expect(opciones.map((o) => o.querySelector('.ui-combobox-option-label').textContent))
        .toEqual(['Droguería Uno - 3001234567']);
    fireEvent.click(opciones[0]);
    expect(cliente).toHaveValue('Droguería Uno - 3001234567');

    fireEvent.click(screen.getByRole('button', { name: 'Guardar Cambios' }));
    await waitFor(() => expect(client.put).toHaveBeenCalledTimes(1));
    expect(client.put.mock.calls[0][1].clientId).toBe('c1');
});
