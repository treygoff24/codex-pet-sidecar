use std::env;
use std::fs;
use std::path::{Path, PathBuf};

fn main() {
    ensure_hatching_sidecar();
    tauri_build::build()
}

fn ensure_hatching_sidecar() {
    println!("cargo:rerun-if-env-changed=CODEX_PET_RELEASE_SIDECAR");

    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));
    let target = env::var("TARGET").expect("TARGET");
    let sidecar_path = manifest_dir
        .join("binaries")
        .join(format!("pet-hatching-{target}"));

    if env::var_os("CODEX_PET_RELEASE_SIDECAR").is_some() {
        assert_release_sidecar(&sidecar_path);
        return;
    }

    // Real packaged binary already in place — leave it alone.
    if fs::read(&sidecar_path).is_ok_and(|bytes| !bytes.starts_with(b"#!")) {
        return;
    }

    // Dev wrapper case: only rewrite when content would actually change. An
    // unconditional rewrite bumps mtime every cargo invocation, which traps
    // `tauri dev`'s file watcher in an infinite rebuild loop.
    let desired = dev_sidecar_script(&manifest_dir);
    if fs::read_to_string(&sidecar_path).is_ok_and(|existing| existing == desired) {
        return;
    }

    write_dev_sidecar(&sidecar_path, &desired);
}

fn dev_sidecar_script(manifest_dir: &Path) -> String {
    let repo_root = manifest_dir
        .parent()
        .expect("src-tauri has repository parent");
    let dispatch_path = repo_root.join("tools/pet-hatching/build/dispatch.py");
    format!("#!/usr/bin/env sh\nset -eu\nexec python3 {dispatch_path:?} \"$@\"\n")
}

fn assert_release_sidecar(sidecar_path: &Path) {
    let bytes = fs::read(sidecar_path).unwrap_or_else(|error| {
        panic!(
            "release hatching sidecar is missing at {} ({error}); run npm run prepare:hatching-sidecar:release before tauri build",
            sidecar_path.display()
        )
    });
    if bytes.starts_with(b"#!") {
        panic!(
            "release hatching sidecar at {} is a dev wrapper, not a packaged binary; run npm run prepare:hatching-sidecar:release",
            sidecar_path.display()
        );
    }
}

fn write_dev_sidecar(sidecar_path: &Path, script: &str) {
    fs::create_dir_all(sidecar_path.parent().expect("sidecar has parent"))
        .expect("create sidecar directory");
    fs::write(sidecar_path, script).expect("write development hatching sidecar");

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut permissions = fs::metadata(sidecar_path)
            .expect("stat development hatching sidecar")
            .permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(sidecar_path, permissions).expect("chmod development hatching sidecar");
    }
}
