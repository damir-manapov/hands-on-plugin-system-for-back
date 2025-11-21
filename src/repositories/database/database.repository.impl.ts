import { Logger } from "@nestjs/common";
import type { DatabaseRepository } from "./database.repository.js";
import type { DatabaseService } from "../../services/database/database.service.js";
import type { Kysely } from "kysely";
import type { Database } from "../../services/database/database.types.js";
import { TableAccessDeniedError } from "./database.errors.js";

/**
 * Database repository implementation with table-level access restrictions
 */
export class DatabaseRepositoryImpl implements DatabaseRepository {
  private readonly logger = new Logger(DatabaseRepositoryImpl.name);
  private readonly allowedTables: Set<string>;
  private readonly pluginSlug: string;

  constructor(
    private readonly databaseService: DatabaseService,
    allowedTables: string[],
    pluginSlug: string
  ) {
    this.pluginSlug = pluginSlug;
    // Store both prefixed and unprefixed table names for validation
    this.allowedTables = new Set(allowedTables.map((t) => `${pluginSlug}_${t.toLowerCase()}`));
    this.logger.debug(
      `Created database repository for plugin '${pluginSlug}' with allowed tables: ${allowedTables.join(", ")}`
    );
  }

  /**
   * Prefix a table name with the plugin slug
   */
  private prefixTableName(tableName: string): string {
    const lowerTable = tableName.toLowerCase();
    // If already prefixed, return as is
    if (lowerTable.startsWith(`${this.pluginSlug}_`)) {
      return lowerTable;
    }
    return `${this.pluginSlug}_${lowerTable}`;
  }

  /**
   * Replace table names in SQL with prefixed versions
   */
  private prefixTablesInSql(querySql: string): string {
    const tablePatterns = [
      /from\s+([a-z_][a-z0-9_]*)/gi,
      /join\s+([a-z_][a-z0-9_]*)/gi,
      /update\s+([a-z_][a-z0-9_]*)/gi,
      /into\s+([a-z_][a-z0-9_]*)/gi,
      /table\s+([a-z_][a-z0-9_]*)/gi,
    ];

    let result = querySql;
    for (const pattern of tablePatterns) {
      result = result.replace(pattern, (match, tableName) => {
        const lowerTable = tableName.toLowerCase();
        // Skip PostgreSQL system tables and common keywords
        if (
          lowerTable.startsWith("pg_") ||
          ["select", "where", "group", "order", "having", "limit", "offset"].includes(lowerTable)
        ) {
          return match;
        }
        // Prefix the table name
        const prefixedTable = this.prefixTableName(lowerTable);
        return match.replace(tableName, prefixedTable);
      });
    }
    return result;
  }

  /**
   * Validate that a SQL query only references allowed tables
   * Tables are validated against unprefixed names, but stored as prefixed
   */
  private validateTableAccess(querySql: string): void {
    const sqlLower = querySql.toLowerCase();
    // Extract table names from common SQL patterns
    const tablePatterns = [
      /from\s+([a-z_][a-z0-9_]*)/gi,
      /join\s+([a-z_][a-z0-9_]*)/gi,
      /update\s+([a-z_][a-z0-9_]*)/gi,
      /into\s+([a-z_][a-z0-9_]*)/gi,
      /table\s+([a-z_][a-z0-9_]*)/gi,
    ];

    const referencedTables = new Set<string>();

    for (const pattern of tablePatterns) {
      let match;
      while ((match = pattern.exec(sqlLower)) !== null) {
        const tableName = match[1].toLowerCase();
        // Skip PostgreSQL system tables and common keywords
        if (
          !tableName.startsWith("pg_") &&
          !["select", "where", "group", "order", "having", "limit", "offset"].includes(tableName)
        ) {
          referencedTables.add(tableName);
        }
      }
    }

    // Check if all referenced tables are allowed (compare unprefixed names)
    // Remove plugin prefix from allowed tables for comparison
    const unprefixedAllowed = Array.from(this.allowedTables).map((t) =>
      t.replace(`${this.pluginSlug}_`, "")
    );
    for (const table of referencedTables) {
      // Check if table is already prefixed (shouldn't happen, but handle it)
      const unprefixedTable = table.startsWith(`${this.pluginSlug}_`)
        ? table.replace(`${this.pluginSlug}_`, "")
        : table;
      if (!unprefixedAllowed.includes(unprefixedTable)) {
        throw new TableAccessDeniedError(unprefixedTable, unprefixedAllowed);
      }
    }
  }

  getDb(): Kysely<Database> {
    // Return the database instance - Kysely will enforce table access through TypeScript types
    // but we can't fully restrict runtime access, so this is a best-effort approach
    return this.databaseService.getDb();
  }

  async executeQuery<T = unknown>(
    querySql: string,
    parameters: readonly unknown[] = []
  ): Promise<T[]> {
    this.validateTableAccess(querySql);
    const prefixedSql = this.prefixTablesInSql(querySql);
    return this.databaseService.executeQuery<T>(prefixedSql, parameters);
  }

  async executeCommand(querySql: string, parameters: readonly unknown[] = []): Promise<number> {
    this.validateTableAccess(querySql);
    const prefixedSql = this.prefixTablesInSql(querySql);
    return this.databaseService.executeCommand(prefixedSql, parameters);
  }

  getAllowedTables(): string[] {
    // Return unprefixed table names to plugins
    return Array.from(this.allowedTables).map((t) => t.replace(`${this.pluginSlug}_`, ""));
  }
}
