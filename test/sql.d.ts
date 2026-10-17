// Lets the tests read the migration file itself instead of duplicating the schema.
declare module "*.sql?raw" {
  const sql: string;
  export default sql;
}
