import { describe, it, expect } from "vitest";
import { TableAccessDeniedError } from "./database.errors.js";

describe("Database Repository Errors", () => {
  describe("TableAccessDeniedError", () => {
    it("should create error with table name and allowed tables", () => {
      const error = new TableAccessDeniedError("products", ["users", "orders"]);

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe("TableAccessDeniedError");
      expect(error.message).toContain("products");
      expect(error.message).toContain("users");
      expect(error.message).toContain("orders");
    });

    it("should format error message correctly", () => {
      const error = new TableAccessDeniedError("unauthorized_table", ["table1", "table2"]);

      expect(error.message).toBe(
        "Access denied to table 'unauthorized_table'. Allowed tables: table1, table2"
      );
    });
  });
});
