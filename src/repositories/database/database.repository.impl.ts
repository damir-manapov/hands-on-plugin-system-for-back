import { Logger } from "@nestjs/common";
import type { DatabaseRepository } from "./database.repository.js";
import type { DatabaseService } from "../../services/database/database.service.js";
import { TableAccessDeniedError } from "./database.errors.js";

/**
 * Database repository implementation with table-level access restrictions
 */
export class DatabaseRepositoryImpl implements DatabaseRepository {
  private readonly logger = new Logger(DatabaseRepositoryImpl.name);
  private readonly allowedTables: Set<string>;
  private readonly pluginSlug: string;
  private readonly nameMap: Map<string, string>;

  constructor(
    private readonly databaseService: DatabaseService,
    allowedTables: string[],
    pluginSlug: string,
    nameMap?: Map<string, string>
  ) {
    this.pluginSlug = pluginSlug;
    // Tables are already prefixed by plugin manager, store them as-is
    this.allowedTables = new Set(allowedTables.map((t) => t.toLowerCase()));
    this.nameMap = nameMap || new Map();
    this.logger.debug(
      `Created database repository for plugin '${pluginSlug}' with allowed tables: ${allowedTables.join(", ")}`
    );
  }

  /**
   * Apply name mapping if exists, then prefix with plugin slug
   */
  private prefixTableName(tableName: string): string {
    const lowerTable = tableName.toLowerCase();
    // Apply name mapping if exists
    const mappedName = this.nameMap.get(lowerTable) || lowerTable;
    const mappedLower = mappedName.toLowerCase();
    // If already prefixed, return as is
    if (mappedLower.startsWith(`${this.pluginSlug}_`)) {
      return mappedLower;
    }
    return `${this.pluginSlug}_${mappedLower}`;
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

    // Check if all referenced tables are allowed
    // Tables in SQL are unprefixed, so we need to prefix them for comparison
    for (const table of referencedTables) {
      const prefixedTable = this.prefixTableName(table);
      if (!this.allowedTables.has(prefixedTable)) {
        // Get unprefixed allowed tables for error message
        const unprefixedAllowed = Array.from(this.allowedTables).map((t) =>
          t.replace(`${this.pluginSlug}_`, "")
        );
        throw new TableAccessDeniedError(table, unprefixedAllowed);
      }
    }
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
