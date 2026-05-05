use crate::error::{AppError, AppResult};
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tokio::sync::{mpsc, oneshot, Mutex};
use tokio::time::{timeout, Duration};
use tokio_tungstenite::{connect_async, tungstenite::Message};

type PendingMap = Arc<Mutex<HashMap<u64, oneshot::Sender<Value>>>>;

#[derive(Clone)]
pub struct JsonRpcClient {
    writer: Arc<
        Mutex<
            futures_util::stream::SplitSink<
                tokio_tungstenite::WebSocketStream<
                    tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
                >,
                Message,
            >,
        >,
    >,
    pending: PendingMap,
    next_id: Arc<AtomicU64>,
}

#[derive(Debug)]
pub enum WireEvent {
    Notification {
        method: String,
        params: Value,
    },
    ServerRequest {
        id: u64,
        method: String,
        params: Value,
    },
    Error(String),
}

impl JsonRpcClient {
    pub async fn connect(url: &str, events: mpsc::UnboundedSender<WireEvent>) -> AppResult<Self> {
        let (stream, _) = connect_async(url)
            .await
            .map_err(|error| AppError::WebSocket(error.to_string()))?;
        let (writer, mut reader) = stream.split();
        let pending: PendingMap = Arc::new(Mutex::new(HashMap::new()));
        let pending_for_reader = Arc::clone(&pending);
        tokio::spawn(async move {
            while let Some(message) = reader.next().await {
                match message {
                    Ok(Message::Text(text)) => {
                        route_message(&text, &pending_for_reader, &events).await
                    }
                    Ok(Message::Binary(bytes)) => {
                        if let Ok(text) = String::from_utf8(bytes.to_vec()) {
                            route_message(&text, &pending_for_reader, &events).await;
                        }
                    }
                    Ok(Message::Close(_)) => break,
                    Err(error) => {
                        let _ = events.send(WireEvent::Error(error.to_string()));
                        break;
                    }
                    _ => {}
                }
            }
        });
        Ok(Self {
            writer: Arc::new(Mutex::new(writer)),
            pending,
            next_id: Arc::new(AtomicU64::new(1)),
        })
    }

    pub async fn call(&self, method: &str, params: Value) -> AppResult<Value> {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let (tx, rx) = oneshot::channel();
        self.pending.lock().await.insert(id, tx);
        let payload = json!({"jsonrpc":"2.0","id":id,"method":method,"params":params});
        self.writer
            .lock()
            .await
            .send(Message::Text(payload.to_string().into()))
            .await
            .map_err(|error| AppError::WebSocket(error.to_string()))?;
        let response = match timeout(Duration::from_secs(30), rx).await {
            Ok(Ok(response)) => response,
            Ok(Err(_)) => {
                return Err(AppError::WebSocket(format!(
                    "response channel closed for {method}"
                )))
            }
            Err(_) => {
                self.pending.lock().await.remove(&id);
                return Err(AppError::WebSocket(format!(
                    "timed out waiting for {method}"
                )));
            }
        };
        if let Some(error) = response.get("error") {
            return Err(AppError::JsonRpc {
                method: method.to_string(),
                message: error
                    .get("message")
                    .and_then(Value::as_str)
                    .unwrap_or("unknown JSON-RPC error")
                    .to_string(),
            });
        }
        Ok(response.get("result").cloned().unwrap_or(Value::Null))
    }

    pub async fn respond(&self, id: u64, result: Value) -> AppResult<()> {
        let payload = json!({"jsonrpc":"2.0","id":id,"result":result});
        self.writer
            .lock()
            .await
            .send(Message::Text(payload.to_string().into()))
            .await
            .map_err(|error| AppError::WebSocket(error.to_string()))?;
        Ok(())
    }
}

async fn route_message(
    text: &str,
    pending: &PendingMap,
    events: &mpsc::UnboundedSender<WireEvent>,
) {
    match serde_json::from_str::<Value>(text) {
        Ok(value) => {
            if let Some(id) = value.get("id").and_then(Value::as_u64) {
                if value.get("method").is_some() {
                    let method = value
                        .get("method")
                        .and_then(Value::as_str)
                        .unwrap_or("unknown")
                        .to_string();
                    let params = value.get("params").cloned().unwrap_or(Value::Null);
                    let _ = events.send(WireEvent::ServerRequest { id, method, params });
                    return;
                }
                if let Some(sender) = pending.lock().await.remove(&id) {
                    let _ = sender.send(value);
                }
                return;
            }
            if let Some(method) = value.get("method").and_then(Value::as_str) {
                let params = value.get("params").cloned().unwrap_or(Value::Null);
                let _ = events.send(WireEvent::Notification {
                    method: method.to_string(),
                    params,
                });
            }
        }
        Err(error) => {
            let _ = events.send(WireEvent::Error(error.to_string()));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn routes_response_and_notification() {
        let pending: PendingMap = Arc::new(Mutex::new(HashMap::new()));
        let (tx, rx) = oneshot::channel();
        pending.lock().await.insert(1, tx);
        let (events_tx, mut events_rx) = mpsc::unbounded_channel();
        route_message(r#"{"id":1,"result":{"ok":true}}"#, &pending, &events_tx).await;
        assert_eq!(rx.await.expect("response")["result"]["ok"], true);
        route_message(
            r#"{"method":"item/agentMessage/delta","params":{"delta":"hi"}}"#,
            &pending,
            &events_tx,
        )
        .await;
        assert!(
            matches!(events_rx.recv().await, Some(WireEvent::Notification { method, .. }) if method == "item/agentMessage/delta")
        );
    }
}
