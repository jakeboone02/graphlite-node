use napi::bindgen_prelude::*;
use napi_derive::napi;
use serde_json;
use std::sync::Arc;

use graphlite::QueryCoordinator;

// ─── QueryResult ────────────────────────────────────────────────────────────

#[napi(object)]
pub struct QueryResult {
  pub variables: Vec<String>,
  pub rows: Vec<serde_json::Value>,
  pub row_count: i32,
}

/// Converts a GraphLite `Value` into a `serde_json::Value` for JS consumption.
fn value_to_json(value: &graphlite::Value) -> serde_json::Value {
  match value {
    graphlite::Value::Null => serde_json::Value::Null,
    graphlite::Value::Boolean(b) => serde_json::Value::Bool(*b),
    graphlite::Value::Number(n) => {
      // Return as integer if it's a whole number
      if n.fract() == 0.0 && *n >= i64::MIN as f64 && *n <= i64::MAX as f64 {
        serde_json::json!(*n as i64)
      } else {
        serde_json::json!(n)
      }
    }
    graphlite::Value::String(s) => serde_json::Value::String(s.clone()),
    graphlite::Value::Array(arr) | graphlite::Value::List(arr) => {
      serde_json::Value::Array(arr.iter().map(value_to_json).collect())
    }
    other => serde_json::to_value(other).unwrap_or(serde_json::Value::Null),
  }
}

fn query_result_from(result: &graphlite::QueryResult) -> QueryResult {
  let rows: Vec<serde_json::Value> = result
    .rows
    .iter()
    .map(|row| {
      let mut obj = serde_json::Map::new();
      for (key, value) in &row.values {
        obj.insert(key.clone(), value_to_json(value));
      }
      serde_json::Value::Object(obj)
    })
    .collect();

  QueryResult {
    variables: result.variables.clone(),
    row_count: result.rows.len() as i32,
    rows,
  }
}

// ─── GraphLiteSession ───────────────────────────────────────────────────────

#[napi]
pub struct GraphLiteSession {
  coordinator: Arc<QueryCoordinator>,
  session_id: String,
}

#[napi]
impl GraphLiteSession {
  /// Execute a GQL query and return results.
  ///
  /// Returns an object with `variables`, `rows`, and `rowCount`.
  #[napi]
  pub fn query(&self, gql: String) -> Result<QueryResult> {
    let result = self
      .coordinator
      .process_query(&gql, &self.session_id)
      .map_err(|e| Error::from_reason(format!("Query failed: {e}")))?;
    Ok(query_result_from(&result))
  }

  /// Execute a GQL statement without returning results.
  ///
  /// Use for DDL (CREATE SCHEMA, CREATE GRAPH) and DML (INSERT) statements.
  #[napi]
  pub fn execute(&self, gql: String) -> Result<()> {
    self
      .coordinator
      .process_query(&gql, &self.session_id)
      .map_err(|e| Error::from_reason(format!("Execute failed: {e}")))?;
    Ok(())
  }

  /// Close this session.
  #[napi]
  pub fn close(&self) -> Result<()> {
    // GraphLite doesn't expose a session close on QueryCoordinator yet,
    // so this is a no-op placeholder. The session will be cleaned up
    // when the coordinator is dropped.
    Ok(())
  }
}

// ─── GraphLiteDB ────────────────────────────────────────────────────────────

#[napi(js_name = "GraphLiteDB")]
pub struct GraphLiteDB {
  coordinator: Arc<QueryCoordinator>,
}

#[napi]
impl GraphLiteDB {
  /// Open or create a GraphLite database at the given path.
  #[napi(factory)]
  pub fn open(path: String) -> Result<Self> {
    let coordinator = QueryCoordinator::from_path(&path)
      .map_err(|e| Error::from_reason(format!("Failed to open database: {e}")))?;
    Ok(GraphLiteDB {
      coordinator,
    })
  }

  /// Create a new session for the given username.
  #[napi]
  pub fn create_session(&self, username: String) -> Result<GraphLiteSession> {
    let session_id = self
      .coordinator
      .create_simple_session(&username)
      .map_err(|e| Error::from_reason(format!("Failed to create session: {e}")))?;
    Ok(GraphLiteSession {
      coordinator: self.coordinator.clone(),
      session_id,
    })
  }

  /// Close the database.
  #[napi]
  pub fn close(&self) -> Result<()> {
    // The coordinator will be dropped when all references are released.
    // This is a no-op placeholder for explicit lifecycle management.
    Ok(())
  }
}
