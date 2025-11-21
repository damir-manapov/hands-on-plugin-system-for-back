/**
 * Error thrown when trying to access a table that is not allowed
 */
export class TableAccessDeniedError extends Error {
  constructor(tableName: string, allowedTables: string[]) {
    super(`Access denied to table '${tableName}'. Allowed tables: ${allowedTables.join(", ")}`);
    this.name = "TableAccessDeniedError";
  }
}
