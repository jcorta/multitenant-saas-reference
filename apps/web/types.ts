export type Role = 'owner' | 'staff';
export type OrderStatus = 'pending' | 'preparing' | 'served' | 'paid' | 'cancelled';

export interface Session {
  id: string;
  email: string;
  role: Role;
  tenant: { id: string; name: string; slug: string };
}

export interface Product {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  active: boolean;
}

export interface OrderItem {
  id: string;
  productName: string;
  unitPriceCents: number;
  quantity: number;
}

export interface Order {
  id: string;
  status: OrderStatus;
  customerLabel: string | null;
  totalCents: number;
  createdAt: string;
  items: OrderItem[];
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}
