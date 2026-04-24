import axios from 'axios';

const ordersApi = axios.create({ baseURL: '/orders' });
const searchApi = axios.create({ baseURL: '/search' });
const analyticsApi = axios.create({ baseURL: '/analytics' });

export interface OrderItem {
  productId: string;
  quantity: number;
  price: number;
}

export interface Order {
  orderId: string;
  userId: string;
  items: OrderItem[];
  totalAmount: number;
  status: string;
  courier?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AnalyticsStats {
  windowStart: string;
  ordersCount: number;
  totalRevenue: number;
  successRate: number;
  avgProcessingMs: number;
}

export interface SearchResult {
  total: number;
  page: number;
  limit: number;
  hits: (Order & { _highlight?: Record<string, string[]> })[];
}

export const createOrder = (body: { userId: string; items: OrderItem[]; totalAmount: number }) =>
  ordersApi.post<Order>('', body).then((r) => r.data);

export const getOrders = () => ordersApi.get<Order[]>('').then((r) => r.data);

export const getOrder = (id: string) => ordersApi.get<Order>(`/${id}`).then((r) => r.data);

export const getStats = () => analyticsApi.get<AnalyticsStats>('/stats').then((r) => r.data);

export const search = (params: {
  q?: string;
  status?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}) => searchApi.get<SearchResult>('', { params }).then((r) => r.data);
