/**
 * Restricted database repository that only allows access to specific tables
 */
export interface DatabaseRepository {
  /**
   * Execute a raw SQL query (restricted to allowed tables)
   * @param querySql SQL query with parameterized placeholders ($1, $2, etc.)
   * @param parameters Query parameters
   */
  executeQuery<T = unknown>(querySql: string, parameters?: readonly unknown[]): Promise<T[]>;

  /**
   * Execute a raw SQL command (INSERT, UPDATE, DELETE) (restricted to allowed tables)
   * @param querySql SQL command with parameterized placeholders ($1, $2, etc.)
   * @param parameters Command parameters
   */
  executeCommand(querySql: string, parameters?: readonly unknown[]): Promise<number>;

  /**
   * Get the list of allowed table names
   */
  getAllowedTables(): string[];
}
