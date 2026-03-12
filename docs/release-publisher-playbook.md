# Release Publisher Playbook

Use this playbook for versioned desktop releases in this repository.

## Workflow

1. Sync to the release base:
   - `git checkout main`
   - `git pull --ff-only origin main`
   - If the worktree has unrelated conflicting edits, stop and ask before proceeding.

2. Bump the version in all release-managed files:
   - `package.json`
   - `apps/desktop/package.json`
   - `apps/desktop/src-tauri/Cargo.toml`
   - `apps/desktop/src-tauri/tauri.conf.json`
   - Expect `Cargo.lock` to refresh during builds.

3. Build macOS installers from repo root:
   - `bun run --filter @agentdock/desktop tauri build --target aarch64-apple-darwin`
   - `bun run --filter @agentdock/desktop tauri build --target x86_64-apple-darwin`

4. Build the Windows x64 installer from macOS:
   - First-time prerequisites if missing:
     - `cargo install cargo-xwin`
     - `brew install llvm`
     - `brew install lld`
     - `brew install nsis`
     - `ln -sf /opt/homebrew/bin/makensis /opt/homebrew/bin/makensis.exe`
   - Build command:
     - `PATH="/opt/homebrew/opt/llvm/bin:$PATH" bun run --filter @agentdock/desktop tauri build --target x86_64-pc-windows-msvc --runner cargo-xwin`

5. Retry rules for common failures:
   - If macOS DMG creation fails inside `bundle_dmg.sh`, inspect `hdiutil info`.
   - Detach stale mounted volumes for old app names before retrying the affected target:
     - `hdiutil detach /dev/disk...`
   - If Windows build fails because `makensis.exe`, `clang-cl`, `lld-link`, or `llvm-lib` is missing, install the prerequisite and rerun the Windows target.

6. Discover final artifact names from build output instead of hardcoding product names.
   - Product names may change between releases.
   - Check the final files under:
     - `target/aarch64-apple-darwin/release/bundle/dmg/`
     - `target/x86_64-apple-darwin/release/bundle/dmg/`
     - `target/x86_64-pc-windows-msvc/release/bundle/nsis/`

7. Generate concise English release notes from commit history since the previous tag:
   - `git log --pretty=format:'%h %s' <previous_tag>..HEAD`
   - Summarize highlights first, then list included changes.

8. Commit, tag, and push:
   - Commit message: `chore(release): bump version to X.Y.Z`
   - Tag: `vX.Y.Z`
   - Push `main`
   - Push the tag

9. Create the GitHub release and upload all built installers:
   - Use `gh release view vX.Y.Z` first if you need to check whether the release already exists.
   - Use `gh release create` for the initial publish.
   - If the release exists and assets need replacement, use `gh release upload --clobber` or delete and re-upload assets.
   - If GitHub returns `403` on release creation, ask the user to refresh `gh` auth and retry.

10. Final response should include:
   - Release URL
   - Uploaded artifact names
   - Version tag
   - Release commit SHA
   - Note that Windows installer signing is skipped when built from macOS
