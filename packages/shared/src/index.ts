export interface OrderItem {
  productId: string;
  quantity: number;
  price: number;
}

export interface OrderCreatedEvent {
  orderId: string;
  userId: string;
  items: OrderItem[];
  totalAmount: number;
  createdAt: string;
}

export interface PaymentProcessedEvent {
  paymentId: string;
  orderId: string;
  status: 'SUCCESS' | 'FAILED';
  processedAt: string;
  failureReason: string | null;
}

export interface OrderStatusUpdatedEvent {
  orderId: string;
  status: 'PREPARING' | 'SHIPPED' | 'DELIVERED';
  courier: string;
  updatedAt: string;
}

export interface OrderStatsEvent {
  windowStart: string;
  ordersCount: number;
  totalRevenue: number;
  successRate: number;
  avgProcessingMs: number;
}

export const TOPICS = {
  ORDERS: 'orders',
  PAYMENTS: 'payments',
  ORDER_STATUS_UPDATED: 'order.status.updated',
  ORDERS_DLQ: 'orders.DLQ',
  ORDER_STATS: 'order-stats',
} as const;
