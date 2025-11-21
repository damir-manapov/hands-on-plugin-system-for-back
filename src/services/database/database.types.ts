// Base database schema - plugins can extend this
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Database {
  // Add your tables here
  // Example:
  // users: UserTable;
  // posts: PostTable;
}

// Example table interface (commented out)
// export interface UserTable {
//   id: Generated<number>;
//   name: string;
//   email: string;
//   createdAt: Date;
// }
