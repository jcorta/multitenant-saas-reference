import { canTransition, mergeLines, orderTotal } from './order-rules';

describe('order rules', () => {
  it('allows the forward path and cancellation before service', () => {
    expect(canTransition('pending', 'preparing')).toBe(true);
    expect(canTransition('preparing', 'served')).toBe(true);
    expect(canTransition('served', 'paid')).toBe(true);
    expect(canTransition('pending', 'cancelled')).toBe(true);
    expect(canTransition('preparing', 'cancelled')).toBe(true);
  });

  it('rejects skipping, reversing and leaving terminal states', () => {
    expect(canTransition('pending', 'served')).toBe(false);
    expect(canTransition('served', 'preparing')).toBe(false);
    expect(canTransition('served', 'cancelled')).toBe(false);
    expect(canTransition('paid', 'pending')).toBe(false);
    expect(canTransition('cancelled', 'pending')).toBe(false);
    expect(canTransition('pending', 'pending')).toBe(false);
  });

  it('computes the total from unit prices and quantities', () => {
    expect(
      orderTotal([
        { unitPriceCents: 1200, quantity: 2 },
        { unitPriceCents: 700, quantity: 1 },
      ]),
    ).toBe(3100);
    expect(orderTotal([])).toBe(0);
  });

  it('merges repeated products into one line', () => {
    expect(
      mergeLines([
        { productId: 'a', quantity: 1 },
        { productId: 'b', quantity: 2 },
        { productId: 'a', quantity: 3 },
      ]),
    ).toEqual([
      { productId: 'a', quantity: 4 },
      { productId: 'b', quantity: 2 },
    ]);
  });
});
