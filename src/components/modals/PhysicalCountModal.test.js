import { render, screen, fireEvent } from '@testing-library/react';
import PhysicalCountModal from './PhysicalCountModal';
import productService from '../../api/productService';

jest.mock('../../api/productService', () => ({
    __esModule: true,
    default: { registerPhysicalCount: jest.fn() },
}));

const producto = { id: 'p-1', nombre: 'Crema X', stockEnBD: -3, stockComprometido: 5 };

beforeEach(() => {
    productService.registerPhysicalCount.mockResolvedValue({
        data: {
            productId: 'p-1', nombre: 'Crema X', conteo: 4, comprometido: 5,
            stockAnterior: -3, stockNuevo: -1, diferencia: 2, movementId: 'm-1',
        },
    });
});

const typeCount = (value) => fireEvent.change(screen.getByLabelText('Unidades contadas en bodega *'), { target: { value } });
const typeReason = (value) => fireEvent.change(screen.getByLabelText('Motivo *'), { target: { value } });
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Registrar conteo' }));

test('registra lo contado con el motivo y muestra el resultado con la diferencia con signo', async () => {
    const onSuccess = jest.fn();
    render(<PhysicalCountModal product={producto} onClose={jest.fn()} onSuccess={onSuccess} />);

    // Muestra cómo quedará: contado - en pedidos
    typeCount('4');
    expect(screen.getByText(/El sistema quedará en/)).toHaveTextContent('-1');
    typeReason('  Inventario mensual  ');
    submit();

    expect(await screen.findByText('Conteo registrado')).toBeInTheDocument();
    expect(productService.registerPhysicalCount).toHaveBeenCalledWith('p-1', 4, 'Inventario mensual');
    expect(screen.getByText('+2')).toBeInTheDocument();
    expect(screen.getByText('Sistema ahora').nextSibling).toHaveTextContent('-1');
    expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ stockNuevo: -1 }));
});

test('sin conteo válido o sin motivo no llama al servidor', () => {
    render(<PhysicalCountModal product={producto} onClose={jest.fn()} onSuccess={jest.fn()} />);

    submit();
    expect(screen.getByRole('alert')).toHaveTextContent('unidades contadas');

    typeCount('-2');
    submit();
    expect(screen.getByRole('alert')).toHaveTextContent('unidades contadas');

    typeCount('3');
    submit();
    expect(screen.getByRole('alert')).toHaveTextContent('motivo');

    expect(productService.registerPhysicalCount).not.toHaveBeenCalled();
});

test('muestra el mensaje del servidor si el conteo se rechaza', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    productService.registerPhysicalCount.mockRejectedValue({
        response: { data: { message: 'Producto no encontrado' } },
    });
    const onSuccess = jest.fn();
    render(<PhysicalCountModal product={producto} onClose={jest.fn()} onSuccess={onSuccess} />);

    typeCount('0');
    typeReason('Se dañó');
    submit();

    expect(await screen.findByRole('alert')).toHaveTextContent('Producto no encontrado');
    expect(onSuccess).not.toHaveBeenCalled();
    console.error.mockRestore();
});
