import { ConflictException, NotFoundException } from '@nestjs/common';
import { ProductsRepository } from '../products/products.service';
import { OrderItemsRepository, OrdersRepository, OrdersService } from './orders.service';

function setup(status = 'pending') {
  const orders = {
    findOne: jest.fn().mockResolvedValue({ id: 'o1', status }),
    update: jest.fn().mockResolvedValue(1),
  };
  const items = { find: jest.fn().mockResolvedValue([]) };
  const service = new OrdersService(
    orders as unknown as OrdersRepository,
    items as unknown as OrderItemsRepository,
    {} as ProductsRepository,
  );
  return { service, orders };
}

describe('OrdersService.update', () => {
  it('writes conditionally on the status it validated', async () => {
    const { service, orders } = setup('pending');
    await service.update('o1', { status: 'preparing' });
    expect(orders.update).toHaveBeenCalledWith({ id: 'o1', status: 'pending' }, { status: 'preparing' });
  });

  it('reports a concurrent change when the conditional write matches no row', async () => {
    // Another request moved the order after it was read: the compare-and-set affects nothing.
    const { service, orders } = setup('pending');
    orders.update.mockResolvedValue(0);
    await expect(service.update('o1', { status: 'preparing' })).rejects.toThrow(
      /modified concurrently/,
    );
  });

  it('rejects invalid transitions before writing', async () => {
    const { service, orders } = setup('served');
    await expect(service.update('o1', { status: 'pending' })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(orders.update).not.toHaveBeenCalled();
  });

  it('returns 404 for an order outside the tenant', async () => {
    const { service, orders } = setup();
    orders.findOne.mockResolvedValue(null);
    await expect(service.update('o1', { status: 'preparing' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
