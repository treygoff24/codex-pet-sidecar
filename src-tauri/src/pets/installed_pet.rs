use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InstalledPet {
    pub id: String,
    pub display_name: String,
    pub description: Option<String>,
    pub spritesheet_path: PathBuf,
    pub metadata_path: PathBuf,
    pub diagnostics: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PetManifest {
    pub id: Option<String>,
    pub display_name: Option<String>,
    pub description: Option<String>,
    pub spritesheet_path: Option<String>,
}
