import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { GraphLiteDB as GraphLiteDBType, GraphLiteSession as GraphLiteSessionType, QueryResult } from '..';

// The native addon must be built before running tests.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { GraphLiteDB } = require('..') as { GraphLiteDB: typeof GraphLiteDBType };

describe('GraphLiteDB', () => {
  let db: GraphLiteDBType;
  let session: GraphLiteSessionType;
  let dbPath: string;

  beforeAll(() => {
    dbPath = mkdtempSync(join(tmpdir(), 'graphlite-test-'));

    db = GraphLiteDB.open(dbPath);
    session = db.createSession('admin');

    // Set up schema and graph
    session.execute('CREATE SCHEMA /test_schema');
    session.execute('SESSION SET SCHEMA /test_schema');
    session.execute('CREATE GRAPH /test_schema/test_graph');
    session.execute('SESSION SET GRAPH /test_schema/test_graph');

    // Seed test data
    session.execute("INSERT (:Person {name: 'Alice', age: 30, city: 'New York'})");
    session.execute("INSERT (:Person {name: 'Bob', age: 25, city: 'San Francisco'})");
    session.execute("INSERT (:Person {name: 'Carol', age: 35, city: 'New York'})");
  });

  afterAll(() => {
    session?.close();
    db?.close();
    try {
      rmSync(dbPath, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should open and close a database', () => {
    const tempPath = mkdtempSync(join(tmpdir(), 'graphlite-open-'));
    const tempDb = GraphLiteDB.open(tempPath);
    expect(tempDb).toBeDefined();
    tempDb.close();
    rmSync(tempPath, { recursive: true, force: true });
  });

  it('should create a session', () => {
    expect(session).toBeDefined();
  });

  it('should query all nodes', () => {
    const result: QueryResult = session.query(
      'MATCH (p:Person) RETURN p.name, p.age, p.city'
    );
    expect(result.rowCount).toBe(3);
    expect(result.rows).toHaveLength(3);
    expect(result.variables).toContain('p.name');

    const names = result.rows.map(r => r['p.name']);
    expect(names).toContain('Alice');
    expect(names).toContain('Bob');
    expect(names).toContain('Carol');
  });

  it('should filter with WHERE clause', () => {
    const result: QueryResult = session.query(
      "MATCH (p:Person) WHERE p.city = 'New York' RETURN p.name"
    );
    expect(result.rowCount).toBe(2);
    const names = result.rows.map(r => r['p.name']);
    expect(names).toContain('Alice');
    expect(names).toContain('Carol');
  });

  it('should handle numeric comparisons', () => {
    const result: QueryResult = session.query(
      'MATCH (p:Person) WHERE p.age > 28 RETURN p.name, p.age'
    );
    expect(result.rowCount).toBe(2);
    const names = result.rows.map(r => r['p.name']);
    expect(names).toContain('Alice');
    expect(names).toContain('Carol');
  });

  it('should handle AND conditions', () => {
    const result: QueryResult = session.query(
      "MATCH (p:Person) WHERE p.age > 28 AND p.city = 'New York' RETURN p.name"
    );
    expect(result.rowCount).toBe(2);
  });

  it('should handle OR conditions', () => {
    const result: QueryResult = session.query(
      "MATCH (p:Person) WHERE p.name = 'Alice' OR p.name = 'Bob' RETURN p.name"
    );
    expect(result.rowCount).toBe(2);
  });

  it('should return empty results for non-matching queries', () => {
    const result: QueryResult = session.query(
      "MATCH (p:Person) WHERE p.name = 'Nobody' RETURN p.name"
    );
    expect(result.rowCount).toBe(0);
    expect(result.rows).toHaveLength(0);
  });

  it('should throw on invalid GQL', () => {
    expect(() => session.query('NOT VALID GQL')).toThrow();
  });

  it('should throw on invalid database path', () => {
    // This may or may not throw depending on GraphLite behavior with
    // nonexistent paths — it might create the directory. Adjust as needed.
    // The intent is to verify error propagation works.
    expect(() => GraphLiteDB.open('/nonexistent/deeply/nested/path/db')).toThrow();
  });
});

describe('GraphLiteDB with relationships', () => {
  let db: GraphLiteDBType;
  let session: GraphLiteSessionType;
  let dbPath: string;

  beforeAll(() => {
    dbPath = mkdtempSync(join(tmpdir(), 'graphlite-rel-'));

    db = GraphLiteDB.open(dbPath);
    session = db.createSession('admin');

    session.execute('CREATE SCHEMA /rel_schema');
    session.execute('SESSION SET SCHEMA /rel_schema');
    session.execute('CREATE GRAPH /rel_schema/social');
    session.execute('SESSION SET GRAPH /rel_schema/social');

    // Create nodes
    session.execute("INSERT (:Person {name: 'Alice'})");
    session.execute("INSERT (:Person {name: 'Bob'})");

    // Create relationship
    session.execute(
      "MATCH (a:Person {name: 'Alice'}), (b:Person {name: 'Bob'}) " +
        "INSERT (a)-[:KNOWS {since: '2020'}]->(b)"
    );
  });

  afterAll(() => {
    session?.close();
    db?.close();
    try {
      rmSync(dbPath, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should query relationships', () => {
    const result: QueryResult = session.query(
      "MATCH (a:Person)-[:KNOWS]->(b:Person) RETURN a.name, b.name"
    );
    expect(result.rowCount).toBe(1);
    expect(result.rows[0]['a.name']).toBe('Alice');
    expect(result.rows[0]['b.name']).toBe('Bob');
  });
});
