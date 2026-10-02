import specialPromotionService from './specialPromotionService';
import client from './client';

jest.mock('./client', () => ({ __esModule: true, default: { get: jest.fn(), patch: jest.fn() } }));

test('cambiar estado envía ?active= (el backend lo exige; con ?activo= respondía 400)', async () => {
    client.patch.mockResolvedValue({ status: 204 });

    await specialPromotionService.toggleStatus('sp-1', false);

    expect(client.patch).toHaveBeenCalledWith('/admin/special-promotions/sp-1/status', null, { params: { active: false } });
});

test('getAll pide la página y el tamaño indicados', async () => {
    client.get.mockResolvedValue({ data: { content: [] } });

    await specialPromotionService.getAll(0, 500);

    expect(client.get).toHaveBeenCalledWith('/admin/special-promotions', { params: { page: 0, size: 500 } });
});
