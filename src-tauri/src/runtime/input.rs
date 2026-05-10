use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type")]
pub enum TurnInputItem {
    #[serde(rename = "text")]
    Text {
        text: String,
        #[serde(
            rename = "text_elements",
            skip_serializing_if = "Vec::is_empty",
            default
        )]
        text_elements: Vec<serde_json::Value>,
    },
    #[serde(rename = "localImage")]
    LocalImage { path: PathBuf },
}

impl TurnInputItem {
    pub fn text(text: impl Into<String>) -> Self {
        Self::Text {
            text: text.into(),
            text_elements: Vec::new(),
        }
    }

    pub fn local_image(path: impl AsRef<Path>) -> Self {
        Self::LocalImage {
            path: path.as_ref().to_path_buf(),
        }
    }
}
