import { describe, it, expect, beforeEach, vi } from "vitest";
import { DatabaseRepositoryImpl } from "./database.repository.impl.js";
import { DatabaseService } from "../../services/database/database.service.js";
import { TableAccessDeniedError } from "./database.errors.js";
import type { Kysely } from "kysely";
import type { Database } from "../../services/database/database.types.js";

describe("DatabaseRepositoryImpl", () => {
  let mockDatabaseService: DatabaseService;
  let repository: DatabaseRepositoryImpl;
  let mockDb: Kysely<Database>;

  beforeEach(() => {
    mockDb = {} as Kysely<Database>;
    mockDatabaseService = {
      getDb: vi.fn().mockReturnValue(mockDb),
      executeQuery: vi.fn().mockResolvedValue([]),
      executeCommand: vi.fn().mockResolvedValue(1),
    } as unknown as DatabaseService;

    repository = new DatabaseRepositoryImpl(
      mockDatabaseService,
      ["plugin-slug_users", "plugin-slug_orders"],
      "plugin-slug"
    );
  });

  describe("constructor", () => {
    it("should store allowed tables as prefixed", () => {
      const repo = new DatabaseRepositoryImpl(
        mockDatabaseService,
        ["plugin-slug_users", "plugin-slug_orders"],
        "plugin-slug"
      );
      expect(repo.getAllowedTables()).toEqual(["users", "orders"]);
    });

    it("should accept name map", () => {
      const nameMap = new Map([["users", "custom_users"]]);
      const repo = new DatabaseRepositoryImpl(
        mockDatabaseService,
        ["plugin-slug_custom_users"],
        "plugin-slug",
        nameMap
      );
      expect(repo.getAllowedTables()).toEqual(["custom_users"]);
    });
  });

  describe("getDb", () => {
    it("should return database instance", () => {
      const db = repository.getDb();
      expect(db).toBe(mockDb);
      expect(mockDatabaseService.getDb).toHaveBeenCalled();
    });
  });

  describe("getAllowedTables", () => {
    it("should return unprefixed table names", () => {
      const tables = repository.getAllowedTables();
      expect(tables).toEqual(["users", "orders"]);
    });
  });

  describe("executeQuery", () => {
    it("should allow access to declared tables", async () => {
      mockDatabaseService.executeQuery = vi.fn().mockResolvedValue([{ id: 1, name: "test" }]);

      await repository.executeQuery("SELECT * FROM users");

      expect(mockDatabaseService.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("plugin-slug_users"),
        []
      );
    });

    it("should prefix table names in SQL", async () => {
      await repository.executeQuery("SELECT * FROM users WHERE id = $1", [1]);

      const call = vi.mocked(mockDatabaseService.executeQuery).mock.calls[0];
      expect(call[0]).toContain("plugin-slug_users");
      expect(call[1]).toEqual([1]);
    });

    it("should handle multiple tables in JOIN", async () => {
      await repository.executeQuery("SELECT * FROM users JOIN orders ON users.id = orders.user_id");

      const call = vi.mocked(mockDatabaseService.executeQuery).mock.calls[0];
      expect(call[0]).toContain("plugin-slug_users");
      expect(call[0]).toContain("plugin-slug_orders");
    });

    it("should throw TableAccessDeniedError for undeclared table", async () => {
      await expect(repository.executeQuery("SELECT * FROM products")).rejects.toThrow(
        TableAccessDeniedError
      );
      expect(mockDatabaseService.executeQuery).not.toHaveBeenCalled();
    });

    it("should handle name mapping", async () => {
      const nameMap = new Map([["users", "custom_users"]]);
      const repo = new DatabaseRepositoryImpl(
        mockDatabaseService,
        ["plugin-slug_custom_users"],
        "plugin-slug",
        nameMap
      );

      await repo.executeQuery("SELECT * FROM users");

      const call = vi.mocked(mockDatabaseService.executeQuery).mock.calls[0];
      expect(call[0]).toContain("plugin-slug_custom_users");
    });
  });

  describe("executeCommand", () => {
    it("should allow INSERT into declared tables", async () => {
      await repository.executeCommand("INSERT INTO users (name) VALUES ($1)", ["test"]);

      expect(mockDatabaseService.executeCommand).toHaveBeenCalledWith(
        expect.stringContaining("plugin-slug_users"),
        ["test"]
      );
    });

    it("should allow UPDATE on declared tables", async () => {
      await repository.executeCommand("UPDATE users SET name = $1 WHERE id = $2", ["new", 1]);

      const call = vi.mocked(mockDatabaseService.executeCommand).mock.calls[0];
      expect(call[0]).toContain("plugin-slug_users");
    });

    it("should throw TableAccessDeniedError for undeclared table", async () => {
      await expect(
        repository.executeCommand("INSERT INTO products (name) VALUES ($1)", ["test"])
      ).rejects.toThrow(TableAccessDeniedError);
      expect(mockDatabaseService.executeCommand).not.toHaveBeenCalled();
    });

    it("should handle CREATE TABLE", async () => {
      await repository.executeCommand(`
        CREATE TABLE users (
          id SERIAL PRIMARY KEY,
          name TEXT
        );
      `);

      const call = vi.mocked(mockDatabaseService.executeCommand).mock.calls[0];
      expect(call[0]).toContain("plugin-slug_users");
    });
  });

  describe("table name prefixing", () => {
    it("should skip PostgreSQL system tables", async () => {
      await repository.executeQuery("SELECT * FROM pg_stat_activity");

      const call = vi.mocked(mockDatabaseService.executeQuery).mock.calls[0];
      expect(call[0]).toContain("pg_stat_activity");
      expect(call[0]).not.toContain("plugin-slug_pg_stat_activity");
    });

    it("should skip SQL keywords", async () => {
      await repository.executeQuery("SELECT * FROM users WHERE id IN (SELECT id FROM orders)");

      const call = vi.mocked(mockDatabaseService.executeQuery).mock.calls[0];
      expect(call[0]).not.toContain("plugin-slug_select");
      expect(call[0]).not.toContain("plugin-slug_where");
    });
  });
});
