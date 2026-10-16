import { OrderStatus } from './order.entity';

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['preparing', 'cancelled'],
  preparing: ['served', 'cancelled'],
  served: ['paid'],
  paid: [],
  cancelled: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export interface RequestedLine {
  productId: string;
  quantity: number;
}

// Repeated products collapse into a single line so an order never lists the same product twice.
export function mergeLines(lines: RequestedLine[]): RequestedLine[] {
  const merged = new Map<string, number>();
  for (const l of lines) merged.set(l.productId, (merged.get(l.productId) ?? 0) + l.quantity);
  return [...merged].map(([productId, quantity]) => ({ productId, quantity }));
}

export function orderTotal(lines: { unitPriceCents: number; quantity: number }[]): number {
  return lines.reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0);
}
