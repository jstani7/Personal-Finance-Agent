mod agent;
mod categories;
mod db;
mod ingest;
mod models;

use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use axum::{
    extract::{Multipart, State},
    http::{header, StatusCode, Uri},
    response::{Html, IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use rust_embed::RustEmbed;
use tower_http::cors::{Any, CorsLayer};

use crate::agent::ask_finance_agent;
use crate::db::{clear_db, get_import_summary, load_transactions, open_db, DB_FILE};
use crate::ingest::{ingest_csv_data, ingest_csv_file, parse_pdf_data};
use crate::models::{ChatRequest, ChatResponse, ImportSummary, Transaction};

#[derive(RustEmbed)]
#[folder = "frontend/dist/"]
struct Assets;

#[derive(Clone)]
struct AppState {
    db_path: PathBuf,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();

    let db_path = PathBuf::from(DB_FILE);
    // Initialize DB tables
    {
        let _conn = open_db(&db_path)?;
    }

    let state = Arc::new(AppState {
        db_path,
    });

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/api/health", get(health_handler))
        .route("/api/transactions", get(transactions_handler))
        .route("/api/summary", get(summary_handler))
        .route("/api/sample", post(sample_handler))
        .route("/api/upload", post(upload_handler))
        .route("/api/clear", post(clear_handler))
        .route("/api/chat", post(chat_handler))
        .fallback(static_handler)
        .layer(cors)
        .with_state(state);

    let port = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse::<u16>().ok())
        .unwrap_or(8501);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    println!("Personal Finance Agent server running at http://localhost:{}", port);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

async fn health_handler() -> &'static str {
    "OK"
}

async fn transactions_handler(State(state): State<Arc<AppState>>) -> Result<Json<Vec<Transaction>>, (StatusCode, String)> {
    let conn = open_db(&state.db_path)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let txs = load_transactions(&conn)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(txs))
}

async fn summary_handler(State(state): State<Arc<AppState>>) -> Result<Json<ImportSummary>, (StatusCode, String)> {
    let conn = open_db(&state.db_path)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let summary = get_import_summary(&conn)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(summary))
}

async fn sample_handler(State(state): State<Arc<AppState>>) -> Result<Json<ImportSummary>, (StatusCode, String)> {
    let mut conn = open_db(&state.db_path)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let sample_csv = PathBuf::from("transactions.csv");
    let summary = ingest_csv_file(&sample_csv, &mut conn, true)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(summary))
}

async fn upload_handler(
    State(state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> Result<Json<ImportSummary>, (StatusCode, String)> {
    let mut conn = open_db(&state.db_path)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let mut summary = None;

    while let Some(field) = multipart.next_field().await.map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))? {
        let filename = field.file_name().unwrap_or("upload").to_string();
        let data = field.bytes().await.map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;

        if filename.to_lowercase().ends_with(".pdf") {
            let res = parse_pdf_data(&data, &mut conn, true).await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
            summary = Some(res);
            break;
        } else {
            let res = ingest_csv_data(&data, &mut conn, true)
                .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
            summary = Some(res);
            break;
        }
    }

    match summary {
        Some(s) => Ok(Json(s)),
        None => Err((StatusCode::BAD_REQUEST, "No file uploaded".to_string())),
    }
}

async fn clear_handler(State(state): State<Arc<AppState>>) -> Result<Json<ImportSummary>, (StatusCode, String)> {
    let conn = open_db(&state.db_path)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    clear_db(&conn)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let summary = get_import_summary(&conn)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(summary))
}

async fn chat_handler(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<ChatRequest>,
) -> Result<Json<ChatResponse>, (StatusCode, String)> {
    let history = payload.chat_history.unwrap_or_default();
    match ask_finance_agent(&state.db_path, &payload.question, &history).await {
        Ok(answer) => Ok(Json(ChatResponse { answer })),
        Err(e) => Ok(Json(ChatResponse {
            answer: format!("Error running agent: {}\n\nCheck that ORQ_API_KEY (or OPENAI_API_KEY) is configured.", e),
        })),
    }
}

async fn static_handler(uri: Uri) -> Response {
    let path = uri.path().trim_start_matches('/');
    let target = if path.is_empty() { "index.html" } else { path };

    match Assets::get(target) {
        Some(content) => {
            let mime = mime_guess::from_path(target).first_or_octet_stream();
            ([(header::CONTENT_TYPE, mime.as_ref())], content.data).into_response()
        }
        None => {
            // SPA fallback to index.html
            match Assets::get("index.html") {
                Some(content) => {
                    Html(content.data).into_response()
                }
                None => (StatusCode::NOT_FOUND, "Not found").into_response(),
            }
        }
    }
}
