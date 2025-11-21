import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { DatabaseService } from "./database.service.js";
import { Pool } from "pg";

// Mock pg Pool - mocks defined inside factory to avoid hoisting issues

vi.mock("pg", () => {
  const mockQueryFn = vi.fn();
  const mockEndFn = vi.fn().mockResolvedValue(undefined);

  // Create a spy on the constructor
  const MockPool = vi.fn().mockImplementation(function (
    this: { query: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> },
    _config?: unknown
  ) {
    this.query = mockQueryFn;
    this.end = mockEndFn;
    return this;
  }) as unknown as typeof import("pg").Pool;

  return {
    Pool: MockPool,
    __mockQuery: mockQueryFn,
    __mockEnd: mockEndFn,
  };
});

// Mock kysely
vi.mock("kysely", async () => {
  const actual = await vi.importActual("kysely");

  // Create a proper class constructor for Kysely
  class MockKysely {
    destroy = vi.fn().mockResolvedValue(undefined);

    constructor(_config?: unknown) {
      // Constructor can accept config but we don't need to use it
    }
  }

  // Create a proper class constructor for PostgresDialect
  class MockPostgresDialect {
    constructor(_config?: unknown) {
      // Constructor can accept config but we don't need to use it
    }
  }

  // Mock sql template literal function
  // sql`SELECT 1` returns an object with execute method
  const mockSqlExecute = vi.fn().mockResolvedValue([]);
  const mockSqlResult = {
    execute: mockSqlExecute,
  };

  // sql is a template literal function (tagged template)
  // When called as sql`SELECT 1`, it returns an object with execute method
  const mockSql = vi.fn().mockReturnValue(mockSqlResult) as unknown as typeof import("kysely").sql;

  // Add raw method for sql.raw() calls
  (mockSql as unknown as { raw: ReturnType<typeof vi.fn> }).raw = vi.fn().mockReturnValue({
    execute: mockSqlExecute,
  });

  return {
    ...actual,
    Kysely: MockKysely,
    PostgresDialect: MockPostgresDialect,
    sql: mockSql,
  };
});

describe("DatabaseService", () => {
  let databaseService: DatabaseService;
  let mockPool: Pool;
  let mockQueryFn: ReturnType<typeof vi.fn>;
  let mockEndFn: ReturnType<typeof vi.fn>;
  let mockSql: ReturnType<typeof vi.fn>;
  let mockSqlExecute: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    // Reset environment variables
    delete process.env.DB_HOST;
    delete process.env.DB_PORT;
    delete process.env.DB_NAME;
    delete process.env.DB_USER;
    delete process.env.DB_PASSWORD;
    delete process.env.DB_POOL_MAX;

    // Get mocks from module
    const pgModule = await import("pg");
    mockQueryFn = (pgModule as unknown as { __mockQuery: ReturnType<typeof vi.fn> }).__mockQuery;
    mockEndFn = (pgModule as unknown as { __mockEnd: ReturnType<typeof vi.fn> }).__mockEnd;

    const kyselyModule = await import("kysely");
    mockSql = kyselyModule.sql as unknown as ReturnType<typeof vi.fn>;
    // mockSql is a template literal function, so calling it returns an object with execute
    // Use type assertion to tell TypeScript it's callable
    const mockSqlFn = mockSql as unknown as () => { execute: ReturnType<typeof vi.fn> };
    const mockSqlResult = mockSqlFn();
    mockSqlExecute = mockSqlResult.execute;

    // Clear mocks
    mockQueryFn.mockClear();
    mockEndFn.mockClear();
    mockSql.mockClear();
    mockSqlExecute.mockClear();

    databaseService = new DatabaseService();
    mockPool = (databaseService as unknown as { pool: Pool }).pool;
  });

  afterEach(async () => {
    if (databaseService) {
      await databaseService.onModuleDestroy();
    }
  });

  describe("constructor", () => {
    it("should create Pool with default config", () => {
      expect(Pool as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalled();
    });

    it("should use environment variables when provided", () => {
      process.env.DB_HOST = "custom-host";
      process.env.DB_PORT = "5433";
      process.env.DB_NAME = "custom_db";
      process.env.DB_USER = "custom_user";
      process.env.DB_PASSWORD = "custom_pass";
      process.env.DB_POOL_MAX = "20";

      const service = new DatabaseService();
      expect(Pool as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalled();
      service.onModuleDestroy();
    });
  });

  describe("onModuleInit", () => {
    it("should test database connection", async () => {
      // onModuleInit uses sql`SELECT 1`.execute(this.db), so we check if sql was called
      await databaseService.onModuleInit();

      expect(mockSql).toHaveBeenCalled();
      expect(mockSqlExecute).toHaveBeenCalled();
    });
  });

  describe("onModuleDestroy", () => {
    it("should close database connections", async () => {
      mockEndFn.mockClear();

      await databaseService.onModuleDestroy();

      expect(mockEndFn).toHaveBeenCalled();
    });
  });

  describe("getDb", () => {
    it("should return Kysely instance", () => {
      const db = databaseService.getDb();
      expect(db).toBeDefined();
    });
  });

  describe("executeQuery", () => {
    it("should execute SELECT query", async () => {
      mockQueryFn.mockResolvedValueOnce({
        rows: [{ id: 1, name: "test" }],
      });

      const result = await databaseService.executeQuery("SELECT * FROM users WHERE id = $1", [1]);

      expect(mockQueryFn).toHaveBeenCalledWith("SELECT * FROM users WHERE id = $1", [1]);
      expect(result).toEqual([{ id: 1, name: "test" }]);
    });

    it("should execute query without parameters", async () => {
      mockQueryFn.mockResolvedValueOnce({
        rows: [{ id: 1 }],
      });

      const result = await databaseService.executeQuery("SELECT * FROM users");

      expect(mockQueryFn).toHaveBeenCalledWith("SELECT * FROM users", []);
      expect(result).toEqual([{ id: 1 }]);
    });
  });

  describe("executeCommand", () => {
    it("should execute INSERT command", async () => {
      mockQueryFn.mockResolvedValueOnce({
        rowCount: 1,
      });

      const result = await databaseService.executeCommand("INSERT INTO users (name) VALUES ($1)", [
        "test",
      ]);

      expect(mockQueryFn).toHaveBeenCalledWith("INSERT INTO users (name) VALUES ($1)", ["test"]);
      expect(result).toBe(1);
    });

    it("should execute UPDATE command", async () => {
      mockQueryFn.mockResolvedValueOnce({
        rowCount: 2,
      });

      const result = await databaseService.executeCommand("UPDATE users SET name = $1", ["new"]);

      expect(mockQueryFn).toHaveBeenCalledWith("UPDATE users SET name = $1", ["new"]);
      expect(result).toBe(2);
    });

    it("should return 0 when rowCount is undefined", async () => {
      mockQueryFn.mockResolvedValueOnce({
        rowCount: undefined,
      });

      const result = await databaseService.executeCommand("DELETE FROM users");

      expect(result).toBe(0);
    });
  });

  describe("getPool", () => {
    it("should return Pool instance", () => {
      const pool = databaseService.getPool();
      expect(pool).toBe(mockPool);
    });
  });
});
