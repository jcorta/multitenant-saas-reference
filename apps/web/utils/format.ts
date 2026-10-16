import type { OrderStatus } from '~/types';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export const formatMoney = (cents: number) => money.format(cents / 100);

// Mirrors the API's status machine; the server remains the authority and rejects invalid moves.
export const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  pending: ['preparing', 'cancelled'],
  preparing: ['served', 'cancelled'],
  served: ['paid'],
  paid: [],
  cancelled: [],
};
