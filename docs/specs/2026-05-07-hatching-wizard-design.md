# In-App Pet Hatching Wizard Design

## Overview

Replace the current text-prompt based hatching flow with a full guided wizard that enables users to hatch pets entirely within the app. The wizard will orchestrate the entire process through the existing Codex app-server connection, using Codex's `$imagegen` for image generation and Rust-native atlas composition/validation.

## Architecture

The hatching wizard will be a multi-step modal flow that lives entirely within the app. When users click "Hatch my own pet with Codex," instead of showing a text prompt, the app opens a dedicated wizard UI. The wizard orchestrates the entire process through the existing Codex app-server connection.

**Backend changes:** Add a new Tauri command `start_hatching_wizard` that initializes a hatching session with a temporary workspace directory. Port the Python hatching scripts to Rust as a new crate `src-tauri/src/hatching/` with modules for run preparation, image job tracking, atlas composition, and validation. The Rust implementation will expose functions that the Tauri commands can call directly, eliminating subprocess complexity.

**Frontend changes:** Create a new React component `HatchingWizard.tsx` that manages the wizard state across steps. Each wizard step will be a focused component (PetInfoStep, ImageGenerationStep, PreviewStep, ImportStep). The wizard communicates with the backend via new Tauri commands for each phase: `prepare_hatching_run`, `get_image_jobs`, `submit_imagegen_result`, `compose_atlas`, `validate_pet_package`, and `import_hatched_pet`.

**Key design decision:** The wizard runs in the same app-server session as the pet runtime, so image generation via `$imagegen` uses the user's existing Codex authentication. The hatching workspace lives in a temporary directory under the app's runtime workspace, cleaned up after successful import or explicit cancellation.

## Components

### Frontend Components

**HatchingWizard.tsx** - Main wizard container that manages step navigation, overall state, and error handling. Maintains a state machine with steps: `info` → `generation` → `preview` → `import` → `complete`. Handles wizard cancellation and cleanup on exit.

**PetInfoStep.tsx** - First step collects pet identity information: name (required), description (required), personality seed (optional, suggests warm/curious/etc.), and color palette preference (optional). Form validation ensures name uniqueness within the pet library.

**ImageGenerationStep.tsx** - Displays the list of required animation jobs (idle, drag-motion, wave, jump, fail, wait, work, review - 8 rows). Shows job status (pending, generating, ready, satisfied). For each unsatisfied job, provides a "Generate" button that triggers Codex `$imagegen` through the app-server. Shows a thumbnail preview of generated images with "Use this" / "Regenerate" actions.

**PreviewStep.tsx** - Shows the composed 1536x1872 atlas with a grid overlay indicating the 8x9 cell layout. Provides zoom controls and individual frame inspection. Displays validation results (geometry check, transparency check, frame completeness). Shows pet.json metadata for review.

**ImportStep.tsx** - Final confirmation before import. Shows summary: pet name, description, personality seed, atlas preview, and any validation warnings. "Import" button adds the pet to the library and makes it active. "Cancel" discards the run and cleans up temporary files.

### Backend Modules

**src-tauri/src/hatching/mod.rs** - Main module that exports the hatching API. Contains the `HatchingSession` struct that tracks run state, job statuses, and workspace paths.

**src-tauri/src/hatching/prepare.rs** - Port of `prepare_pet_run.py`. Creates the run directory, generates image job manifests for each animation row, seeds QA scaffolding, and writes initial pet.json with user-provided metadata.

**src-tauri/src/hatching/jobs.rs** - Job tracking. Manages the list of required animation jobs, their states, and the mapping from job IDs to frame positions in the atlas. Provides functions to query job status and mark jobs as satisfied.

**src-tauri/src/hatching/atlas.rs** - Port of atlas composition logic from Python. Uses the Rust `image` crate to stitch individual frame images into the 1536x1872 spritesheet with proper 192x208 cell sizing. Handles transparency and WebP encoding.

**src-tauri/src/hatching/validate.rs** - Port of `validate_atlas.py`. Checks atlas dimensions (must be exactly 1536x1872), cell geometry (192x208), transparency requirements, and frame completeness (all 72 cells present or transparent for unused slots). Returns detailed validation errors.

**src-tauri/src/hatching/package.rs** - Assembles the final pet package directory with pet.json, spritesheet.webp, optional personality.md, and QA artifacts. Validates that all paths are relative and within the package.

## Data Flow

1. User clicks "Hatch my own pet with Codex" → App calls `start_hatching_wizard()` → Backend creates temporary workspace and returns session ID
2. User fills PetInfoStep → App calls `prepare_hatching_run(session_id, pet_info)` → Backend writes job manifests and initial metadata
3. Wizard transitions to ImageGenerationStep → App calls `get_image_jobs(session_id)` → Backend returns list of 8 animation row jobs with status
4. User clicks "Generate" for a job → App sends JSON-RPC to app-server to invoke `$imagegen` with job-specific prompt → App-server returns generated image URL or base64
5. User approves image → App calls `submit_imagegen_result(session_id, job_id, image_data)` → Backend saves image to workspace, marks job satisfied
6. Repeat steps 4-5 until all jobs satisfied → User clicks "Next" → App calls `compose_atlas(session_id)` → Backend stitches images into spritesheet.webp
7. Wizard transitions to PreviewStep → App calls `validate_pet_package(session_id)` → Backend returns validation results
8. User reviews and clicks "Next" → ImportStep shows summary
9. User clicks "Import" → App calls `import_hatched_pet(session_id)` → Backend moves package to pet library, updates library state, returns new pet info
10. Wizard shows completion, app switches to new pet → Backend cleans up temporary workspace

## Error Handling

**Authentication errors:** If `$imagegen` fails due to missing Codex auth, surface the same `CodexAuthNotFound` error used elsewhere in the app with a link to setup instructions.

**Image generation failures:** If app-server returns an error for `$imagegen`, show the error in the generation step with a "Retry" button. Log the error for debugging.

**Atlas composition errors:** If image stitching fails (e.g., corrupted image data, wrong dimensions), surface a clear error with the specific job that failed. Allow user to regenerate that specific job's images.

**Validation errors:** If atlas validation fails, show specific failures (e.g., "Row 3 has incorrect dimensions") in the PreviewStep with visual indicators on the atlas grid. Prevent import until validation passes.

**Import errors:** If library is full (20 pets), if pet name already exists, or if package validation fails, show error in ImportStep with guidance (e.g., "Delete an existing pet first").

**Cleanup on error:** If the user cancels or an error occurs, backend deletes the temporary workspace to avoid accumulating partial runs. Use a cleanup function that runs on wizard exit via a Tauri command `cancel_hatching_run(session_id)`.

## Testing

**Unit tests for Rust modules:** Test each hatching module independently using the existing test infrastructure. Test job state transitions, atlas composition with sample images, validation logic with both valid and invalid atlases, and package assembly.

**Integration tests for Tauri commands:** Test the full command flow from frontend to backend. Mock the app-server JSON-RPC responses for image generation to avoid requiring actual Codex auth in tests.

**Frontend component tests:** Test each wizard step component with mocked backend responses. Test form validation, state transitions, error display, and navigation flow.

**End-to-end smoke test:** Create a test script that simulates a full hatching run using pre-generated test images, validates the package, and imports it. This can run in CI to ensure the Rust port produces equivalent output to the original Python scripts.

**Manual QA:** Test the wizard with actual Codex image generation to ensure the app-server integration works correctly. Test error scenarios (network failure, auth missing, invalid images) to verify error messages are helpful.

## Migration Plan

1. Implement Rust hatching modules alongside existing Python scripts (no breaking changes)
2. Add Tauri commands for the wizard backend
3. Build frontend wizard components
4. Wire up wizard to new backend commands
5. Add "Hatch my own pet with Codex (New)" option in onboarding to A/B test
6. Once validated, replace the old text-prompt flow entirely
7. Deprecate and eventually remove Python scripts and old skill prompt

## Success Criteria

- Users can hatch a complete pet without leaving the app
- No Python or terminal required
- Atlas validation produces identical results to Python scripts
- Wizard completes in under 5 minutes for a simple pet (8 image generations)
- Error messages are actionable and guide users to resolution
- Temporary workspaces are cleaned up reliably
