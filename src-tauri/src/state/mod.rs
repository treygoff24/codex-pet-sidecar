pub mod config;
pub mod paths;

pub use config::{load_config, save_config, AmbientConfig, PetConfig};
pub use paths::AppPaths;
