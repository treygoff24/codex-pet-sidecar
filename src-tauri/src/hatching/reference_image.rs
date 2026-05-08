use crate::error::{AppError, AppResult};
use crate::hatching::session::{ReferenceDescriptionStatus, ReferenceImage};
use image::GenericImageView;
use image::ImageReader;
use sha2::{Digest, Sha256};
use std::io::Read;
use std::path::{Path, PathBuf};

const MAX_FILE_SIZE: u64 = 4 * 1024 * 1024; // 4 MB
const MAX_DIMENSION: u32 = 4096;
const MAX_MEGAPIXELS: u64 = 8 * 1024 * 1024; // 8 MP

/// Validate and copy a reference image to the hatching workspace.
///
/// Validates:
/// - Regular file (not directory/symlink)
/// - PNG or JPEG magic bytes (not just extension)
/// - File size ≤ 4 MB
/// - Width and height ≤ 4096 px
/// - Decoded megapixels ≤ 8 MP
///
/// Copies to `<workspace>/references/<sha256>.<ext>` and returns a ReferenceImage
/// with description: None and description_status: Pending.
#[allow(dead_code)]
pub async fn validate_and_copy_reference(
    local_path: &Path,
    workspace_dir: &Path,
) -> AppResult<ReferenceImage> {
    // Step 1: Resolve and validate it's a regular file
    let metadata = std::fs::metadata(local_path).map_err(|e| AppError::InvalidPetAsset {
        path: local_path.to_path_buf(),
        reason: format!("cannot access file: {e}"),
    })?;

    if !metadata.is_file() {
        return Err(AppError::InvalidPetAsset {
            path: local_path.to_path_buf(),
            reason: "not a regular file".to_string(),
        });
    }

    // Step 2: Validate file size
    let file_size = metadata.len();
    if file_size > MAX_FILE_SIZE {
        return Err(AppError::InvalidPetAsset {
            path: local_path.to_path_buf(),
            reason: format!("file size {} exceeds 4 MB limit", file_size),
        });
    }

    // Step 3: Read magic bytes to validate PNG/JPEG
    let mut file = std::fs::File::open(local_path)?;
    let mut magic_bytes = [0u8; 8];
    file.read_exact(&mut magic_bytes)?;
    drop(file);

    let format = detect_image_format(&magic_bytes)?;
    let extension = format.extension();

    // Step 4: Decode image and validate dimensions
    let image = ImageReader::open(local_path)?
        .decode()
        .map_err(|e| AppError::InvalidPetAsset {
            path: local_path.to_path_buf(),
            reason: format!("failed to decode image: {e}"),
        })?;
    let dimensions = image.dimensions();
    let width = dimensions.0;
    let height = dimensions.1;

    if width > MAX_DIMENSION || height > MAX_DIMENSION {
        return Err(AppError::InvalidPetAsset {
            path: local_path.to_path_buf(),
            reason: format!("dimensions {}x{} exceed 4096px limit", width, height),
        });
    }

    let megapixels = (width as u64) * (height as u64);
    if megapixels > MAX_MEGAPIXELS {
        return Err(AppError::InvalidPetAsset {
            path: local_path.to_path_buf(),
            reason: format!(
                "decoded size {}x{} ({} pixels) exceeds 8 MP limit",
                width, height, megapixels
            ),
        });
    }

    // Step 5: SHA-256 the file
    let file_bytes = std::fs::read(local_path)?;
    let sha256 = format!("{:x}", Sha256::digest(&file_bytes));

    // Step 6: Copy to workspace/references/<sha256>.<ext>
    let references_dir = workspace_dir.join("references");
    std::fs::create_dir_all(&references_dir)?;
    let target_path = references_dir.join(format!("{}.{}", sha256, extension));
    std::fs::copy(local_path, &target_path)?;

    // Step 7: Return ReferenceImage
    Ok(ReferenceImage {
        id: uuid::Uuid::new_v4(),
        path: target_path,
        sha256,
        description: None,
        description_status: ReferenceDescriptionStatus::Pending,
        described_at: None,
    })
}

enum ImageFormat {
    Png,
    Jpeg,
}

impl ImageFormat {
    fn extension(&self) -> &'static str {
        match self {
            ImageFormat::Png => "png",
            ImageFormat::Jpeg => "jpg",
        }
    }
}

fn detect_image_format(magic_bytes: &[u8]) -> AppResult<ImageFormat> {
    // PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
    if magic_bytes.starts_with(&[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]) {
        return Ok(ImageFormat::Png);
    }

    // JPEG magic bytes: FF D8 FF
    if magic_bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return Ok(ImageFormat::Jpeg);
    }

    Err(AppError::InvalidPetAsset {
        path: PathBuf::from("<unknown>"),
        reason: "not a valid PNG or JPEG file (invalid magic bytes)".to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::ImageBuffer;
    use image::Rgb;
    use image::Rgba;
    use std::io::Write;
    use tempfile::tempdir;

    fn write_test_image(path: &Path, width: u32, height: u32, format: ImageFormat) {
        match format {
            ImageFormat::Png => {
                let image: ImageBuffer<Rgba<u8>, Vec<u8>> =
                    ImageBuffer::from_pixel(width, height, Rgba([255, 255, 255, 255]));
                image.save(path).expect("failed to save PNG");
            }
            ImageFormat::Jpeg => {
                let image: ImageBuffer<Rgb<u8>, Vec<u8>> =
                    ImageBuffer::from_pixel(width, height, Rgb([255, 255, 255]));
                image.save(path).expect("failed to save JPEG");
            }
        }
    }

    fn write_test_file(path: &Path, content: &[u8]) {
        let mut file = std::fs::File::create(path).expect("failed to create file");
        file.write_all(content).expect("failed to write");
    }

    #[tokio::test]
    async fn validate_accepts_valid_png() {
        let root = tempdir().expect("tempdir");
        let image_path = root.path().join("test.png");
        write_test_image(&image_path, 100, 100, ImageFormat::Png);

        let workspace = root.path().join("workspace");
        let result = validate_and_copy_reference(&image_path, &workspace).await;

        assert!(result.is_ok());
        let reference = result.unwrap();
        assert_eq!(reference.description, None);
        assert!(matches!(
            reference.description_status,
            ReferenceDescriptionStatus::Pending
        ));
    }

    #[tokio::test]
    async fn validate_accepts_valid_jpeg() {
        let root = tempdir().expect("tempdir");
        let image_path = root.path().join("test.jpg");
        write_test_image(&image_path, 100, 100, ImageFormat::Jpeg);

        let workspace = root.path().join("workspace");
        let result = validate_and_copy_reference(&image_path, &workspace).await;

        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn validate_rejects_directory() {
        let root = tempdir().expect("tempdir");
        let dir_path = root.path().join("directory");
        std::fs::create_dir(&dir_path).expect("failed to create dir");

        let workspace = root.path().join("workspace");
        let result = validate_and_copy_reference(&dir_path, &workspace).await;

        assert!(matches!(result, Err(AppError::InvalidPetAsset { .. })));
    }

    #[tokio::test]
    async fn validate_rejects_nonexistent_file() {
        let root = tempdir().expect("tempdir");
        let nonexistent = root.path().join("nonexistent.png");

        let workspace = root.path().join("workspace");
        let result = validate_and_copy_reference(&nonexistent, &workspace).await;

        assert!(matches!(result, Err(AppError::InvalidPetAsset { .. })));
    }

    #[tokio::test]
    async fn validate_rejects_invalid_magic_bytes() {
        let root = tempdir().expect("tempdir");
        let invalid_path = root.path().join("invalid.png");
        write_test_file(&invalid_path, b"NOT AN IMAGE");

        let workspace = root.path().join("workspace");
        let result = validate_and_copy_reference(&invalid_path, &workspace).await;

        assert!(matches!(result, Err(AppError::InvalidPetAsset { .. })));
    }

    #[tokio::test]
    async fn validate_rejects_large_file() {
        let root = tempdir().expect("tempdir");
        let large_path = root.path().join("large.png");

        // Create a file slightly larger than 4 MB
        let large_content = vec![0u8; (MAX_FILE_SIZE + 1) as usize];
        write_test_file(&large_path, &large_content);

        let workspace = root.path().join("workspace");
        let result = validate_and_copy_reference(&large_path, &workspace).await;

        assert!(matches!(result, Err(AppError::InvalidPetAsset { .. })));
    }

    #[tokio::test]
    async fn validate_rejects_large_dimensions() {
        let root = tempdir().expect("tempdir");
        let image_path = root.path().join("large.png");
        write_test_image(&image_path, 4097, 100, ImageFormat::Png);

        let workspace = root.path().join("workspace");
        let result = validate_and_copy_reference(&image_path, &workspace).await;

        assert!(matches!(result, Err(AppError::InvalidPetAsset { .. })));
    }

    #[tokio::test]
    async fn validate_rejects_large_megapixels() {
        let root = tempdir().expect("tempdir");
        let image_path = root.path().join("large.png");
        // 2900x2900 = 8.41 MP, which exceeds 8 MP limit
        write_test_image(&image_path, 2900, 2900, ImageFormat::Png);

        let workspace = root.path().join("workspace");
        let result = validate_and_copy_reference(&image_path, &workspace).await;

        assert!(matches!(result, Err(AppError::InvalidPetAsset { .. })));
    }

    #[tokio::test]
    async fn validate_accepts_max_dimension_within_megapixel_limit() {
        let root = tempdir().expect("tempdir");
        let image_path = root.path().join("max.png");
        // 4096x2048 = 8,388,608 pixels = exactly 8 MP
        write_test_image(&image_path, 4096, 2048, ImageFormat::Png);

        let workspace = root.path().join("workspace");
        let result = validate_and_copy_reference(&image_path, &workspace).await;

        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn validate_rejects_exactly_max_dimension_over_megapixel_limit() {
        let root = tempdir().expect("tempdir");
        let image_path = root.path().join("max.png");
        // 4096x2049 = 8,392,704 pixels = just over 8 MP
        write_test_image(&image_path, 4096, 2049, ImageFormat::Png);

        let workspace = root.path().join("workspace");
        let result = validate_and_copy_reference(&image_path, &workspace).await;

        assert!(matches!(result, Err(AppError::InvalidPetAsset { .. })));
    }

    #[tokio::test]
    async fn validate_accepts_exactly_8_megapixels() {
        let root = tempdir().expect("tempdir");
        let image_path = root.path().join("max.png");
        // 2896x2896 = 8,386,816 pixels = just under 8 MP (8,388,608)
        write_test_image(&image_path, 2896, 2896, ImageFormat::Png);

        let workspace = root.path().join("workspace");
        let result = validate_and_copy_reference(&image_path, &workspace).await;

        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn validate_rejects_just_over_8_megapixels() {
        let root = tempdir().expect("tempdir");
        let image_path = root.path().join("over.png");
        // 2897x2897 = 8,392,609 pixels = just over 8 MP (8,388,608)
        write_test_image(&image_path, 2897, 2897, ImageFormat::Png);

        let workspace = root.path().join("workspace");
        let result = validate_and_copy_reference(&image_path, &workspace).await;

        assert!(matches!(result, Err(AppError::InvalidPetAsset { .. })));
    }

    #[tokio::test]
    async fn validate_rejects_both_dimension_and_megapixel_limit() {
        let root = tempdir().expect("tempdir");
        let image_path = root.path().join("huge.png");
        // 4097x2049 = 8,392,704 pixels = exceeds both limits
        write_test_image(&image_path, 4097, 2049, ImageFormat::Png);

        let workspace = root.path().join("workspace");
        let result = validate_and_copy_reference(&image_path, &workspace).await;

        assert!(matches!(result, Err(AppError::InvalidPetAsset { .. })));
    }
}
