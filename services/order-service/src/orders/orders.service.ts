import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { EventsService } from '../events/events.service';
import { KafkaProducerService } from '../kafka/kafka.producer.service';
import { TOPICS } from '@ecommerce/shared';
import type { CreateOrderDto } from './create-order.dto';
import type { Order, OrderStatus } from './order.entity';

interface OrderRow {
  orderId: string;
  userId: string;
  items: string;
  totalAmount: number;
  status: OrderStatus;
  courier: string | null;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class OrdersService {
  private readonly stmts;

  constructor(
    private readonly db: DatabaseService,
    private readonly events: EventsService,
    private readonly kafka: KafkaProducerService,
  ) {
    this.stmts = {
      get: this.db.db.prepare<[string], OrderRow>('SELECT * FROM orders WHERE orderId = ?'),
      list: this.db.db.prepare<[], OrderRow>('SELECT * FROM orders ORDER BY createdAt DESC'),
      insert: this.db.db.prepare<[OrderRow], void>(`
        INSERT INTO orders (orderId, userId, items, totalAmount, status, courier, createdAt, updatedAt)
        VALUES ($orderId, $userId, $items, $totalAmount, $status, $courier, $createdAt, $updatedAt)
      `),
      update: this.db.db.prepare<[Pick<OrderRow, 'status' | 'courier' | 'updatedAt' | 'orderId'>], void>(`
        UPDATE orders SET status = $status, courier = $courier, updatedAt = $updatedAt
        WHERE orderId = $orderId
      `),
    };
  }

  findAll(): Order[] {
    return this.stmts.list.all().map(this.toOrder);
  }

  findOne(orderId: string): Order {
    const row = this.stmts.get.get(orderId);
    if (!row) throw new NotFoundException(`Order ${orderId} not found`);
    return this.toOrder(row);
  }

  create(dto: CreateOrderDto): Order {
    const now = new Date().toISOString();
    const order: Order = {
      orderId: randomUUID(),
      userId: dto.userId,
      items: dto.items,
      totalAmount: dto.totalAmount,
      status: 'PENDING',
      createdAt: now,
      updatedAt: now,
    };
    this.stmts.insert.run({ ...order, items: JSON.stringify(order.items), courier: null });
    this.events.emit('order.created', order);
    this.kafka
      .publish(TOPICS.ORDERS, order.userId, {
        orderId: order.orderId,
        userId: order.userId,
        items: order.items,
        totalAmount: order.totalAmount,
        createdAt: order.createdAt,
      })
      .catch(console.error);
    return order;
  }

  updateStatus(orderId: string, status: OrderStatus, courier?: string): Order {
    const existing = this.findOne(orderId);
    const updatedAt = new Date().toISOString();
    this.stmts.update.run({ orderId, status, courier: courier ?? existing.courier ?? null, updatedAt });
    const updated: Order = { ...existing, status, courier: courier ?? existing.courier, updatedAt };
    this.events.emit('order.status.updated', updated);
    return updated;
  }

  private toOrder(row: OrderRow): Order {
    return {
      ...row,
      items: JSON.parse(row.items) as Order['items'],
      courier: row.courier ?? undefined,
    };
  }
}
