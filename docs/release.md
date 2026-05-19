# Release guide

Codex Pet Sidecar has two channels:

- Official channel: signed and notarized DMG from GitHub Releases, with in-app
  updater checks against the latest release manifest.
- Dev channel: source checkout from `main`, updated with `git pull && npm ci`.

## Required secrets

Add these repository secrets before running `.github/workflows/release.yml`:

- `APPLE_CERTIFICATE`
- `APPLE_CERTIFICATE_PASSWORD`
- `KEYCHAIN_PASSWORD`
- `APPLE_SIGNING_IDENTITY`
- `APPLE_API_ISSUER`
- `APPLE_API_KEY`
- `APPLE_API_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

The updater public key is committed in `src-tauri/tauri.conf.json`. Keep the
matching private key only in GitHub secrets. The local key generated during setup
lives outside the repository at `~/.tauri/codex-pet-sidecar-updater.key`; copy its
contents into `TAURI_SIGNING_PRIVATE_KEY`. The generated key has no password, so
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` may be empty unless you rotate to a protected
key.

## Cut a release

1. Bump the version in all three files:
   - `package.json`
   - `src-tauri/tauri.conf.json`
   - `src-tauri/Cargo.toml`
2. Run the local gate (must pass before proceeding):

   ```bash
   node scripts/assert-release-version.mjs vX.Y.Z
   npm run check:ci
   ```

3. After the local gate passes, push the release commit to `main`.
4. Create and push a `vX.Y.Z` tag, or run the release workflow manually with that
   tag.
5. Review the draft GitHub Release before publishing it.

The workflow builds a universal macOS app, notarizes it, signs the Tauri updater
archive, writes `latest.json`, produces `SHA256SUMS.txt`, and uploads everything
to a draft release. It also runs `npm run audit:artifacts` against the build
output to verify signing, notarization, and file presence — this check requires
the built bundle and runs only in CI after the build step.

## Acceptance checks

Before publishing the draft release, verify:

- the DMG passes Gatekeeper without an unidentified-developer warning;
- `latest.json` contains both `darwin-aarch64` and `darwin-x86_64`;
- `.app.tar.gz` and `.app.tar.gz.sig` are attached;
- an older official install sees the update, installs it from Settings, and
  relaunches into the new version;
- a source checkout still updates with `git pull && npm ci` and runs with
  `npm run tauri:dev`.

Do not add updater support to the dev channel. Dev builds are intentionally kept on
source control updates so contributors can move faster than signed releases.
