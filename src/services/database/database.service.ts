import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from "@nestjs/common";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import type { Database } from "./database.types.js";

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private db: Kysely<Database>;
  private pool: Pool;

  constructor() {
    const config = {
      host: process.env.DB_HOST || "localhost",
      port: parseInt(process.env.DB_PORT || "5432", 10),
      database: process.env.DB_NAME || "plugin_system",
      user: process.env.DB_USER || "postgres",
      password: process.env.DB_PASSWORD || "postgres",
      max: parseInt(process.env.DB_POOL_MAX || "10", 10),
    };

    this.pool = new Pool(config);

    this.db = new Kysely<Database>({
      dialect: new PostgresDialect({
        pool: this.pool,
      }),
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      // Test connection with a simple query
      await sql`SELECT 1`.execute(this.db);
      this.logger.log(`Database connected: ${process.env.DB_NAME || "plugin_system"}`);
    } catch (error) {
      this.logger.warn(
        `Database connection test failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.db.destroy();
    await this.pool.end();
    this.logger.log("Database connection closed");
  }

  /**
   * Get the Kysely database instance
   */
  getDb(): Kysely<Database> {
    return this.db;
  }

  /**
   * Execute a raw SQL query
   */
  async executeQuery<T = unknown>(
    querySql: string,
    parameters: readonly unknown[] = []
  ): Promise<T[]> {
    const result = await this.pool.query(querySql, parameters as unknown[]);
    return result.rows as T[];
  }

  /**
   * Execute a raw SQL command (INSERT, UPDATE, DELETE)
   */
  async executeCommand(querySql: string, parameters: readonly unknown[] = []): Promise<number> {
    const result = await this.pool.query(querySql, parameters as unknown[]);
    return result.rowCount || 0;
  }

  /**
   * Get the underlying connection pool
   */
  getPool(): Pool {
    return this.pool;
  }
}
