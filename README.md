# GraphLite Node.js Bindings

Node.js bindings for [GraphLite](https://github.com/GraphLite-AI/GraphLite), an embedded graph database with ISO GQL support.

## Prerequisites

- [Rust toolchain](https://rustup.rs/) (for building from source)
- Node.js >= 18 or Bun

## Development

```bash
# Install JS dependencies
bun install

# Build the native addon (requires Rust)
bun run build

# Run tests
bun test
```

## Usage

```ts
import { GraphLiteDB } from '@jakeboone02/graphlite-node';

const db = GraphLiteDB.open('./mydb');
const session = db.createSession('admin');

session.execute("CREATE SCHEMA /myschema");
session.execute("CREATE GRAPH /myschema/social");
session.execute("SESSION SET GRAPH /myschema/social");
session.execute("INSERT (:Person {name: 'Alice', age: 30})");

const result = session.query("MATCH (p:Person) RETURN p.name, p.age");
console.log(result.rows);
// [{ "p.name": "Alice", "p.age": 30 }]

session.close();
db.close();
```

## API

### `GraphLiteDB`

- `static open(path: string): GraphLiteDB` — Open or create a database
- `createSession(username: string): GraphLiteSession` — Create a session
- `close(): void` — Close the database

### `GraphLiteSession`

- `query(gql: string): QueryResult` — Execute a GQL query and return results
- `execute(gql: string): void` — Execute a GQL statement (no results)
- `close(): void` — Close the session

### `QueryResult`

```ts
interface QueryResult {
  variables: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
}
```

## License

MIT
