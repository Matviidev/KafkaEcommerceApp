import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { resolve } from 'node:path';

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  readonly db: DatabaseType;

  constructor() {
    const path = process.env.DB_PATH ?? resolve(__dirname, '../../../orders.db');
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS orders (
        orderId     TEXT PRIMARY KEY,
        userId      TEXT NOT NULL,
        items       TEXT NOT NULL,
        totalAmount REAL NOT NULL,
        status      TEXT NOT NULL DEFAULT 'PENDING',
        courier     TEXT,
        createdAt   TEXT NOT NULL,
        updatedAt   TEXT NOT NULL
      )
    `);
  }

  onApplicationShutdown() {
    this.db.close();
  }
}
