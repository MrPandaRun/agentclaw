use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::SystemTime;
use tauri::Manager;

const SOPHON_BINARY_ENV: &str = "AGENTDOCK_SOPHON_BIN";

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallSophonCliResponse {
    pub installed: bool,
    pub binary_path: String,
    pub message: Option<String>,
}

pub fn ensure_managed_sophon_binary(app_data_dir: &Path) -> Result<Option<PathBuf>, String> {
    let binary_path = managed_sophon_binary_path(app_data_dir);
    if binary_path.exists() && !managed_sophon_binary_needs_rebuild(&binary_path)? {
        ensure_managed_sophon_runtime_assets(app_data_dir)?;
        std::env::set_var(SOPHON_BINARY_ENV, &binary_path);
        return Ok(Some(binary_path));
    }

    let source_path = sophon_cli_source_path();
    if !source_path.exists() {
        if binary_path.exists() {
            ensure_managed_sophon_runtime_assets(app_data_dir)?;
            std::env::set_var(SOPHON_BINARY_ENV, &binary_path);
            return Ok(Some(binary_path));
        }
        return Ok(None);
    }

    if !command_available("bun") {
        if binary_path.exists() {
            ensure_managed_sophon_runtime_assets(app_data_dir)?;
            std::env::set_var(SOPHON_BINARY_ENV, &binary_path);
            return Ok(Some(binary_path));
        }
        return Ok(None);
    }

    build_managed_sophon_binary(&source_path, &binary_path)?;
    ensure_managed_sophon_runtime_assets(app_data_dir)?;
    std::env::set_var(SOPHON_BINARY_ENV, &binary_path);
    Ok(Some(binary_path))
}

pub fn install_sophon_cli_cmd(app: &tauri::AppHandle) -> Result<InstallSophonCliResponse, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?;
    let binary_path = managed_sophon_binary_path(&app_data_dir);
    let source_path = sophon_cli_source_path();

    if !source_path.exists() {
        return Err(format!(
            "Sophon CLI source entry not found: {}",
            source_path.display()
        ));
    }
    if !command_available("bun") {
        return Err(
            "Bun is not available in PATH. Install Bun and retry Sophon installation.".to_string(),
        );
    }

    build_managed_sophon_binary(&source_path, &binary_path)?;
    ensure_managed_sophon_runtime_assets(&app_data_dir)?;
    std::env::set_var(SOPHON_BINARY_ENV, &binary_path);

    Ok(InstallSophonCliResponse {
        installed: true,
        binary_path: binary_path.display().to_string(),
        message: Some("Managed Sophon CLI installed successfully.".to_string()),
    })
}

fn managed_sophon_binary_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir
        .join("tools")
        .join("sophon")
        .join(binary_file_name())
}

fn sophon_cli_source_path() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../packages/sophon-cli/src/index.ts")
}

fn sophon_cli_package_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../packages/sophon-cli")
}

fn pi_package_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../../node_modules/@mariozechner/pi-coding-agent")
}

fn photon_wasm_source_path() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../../node_modules/@silvia-odwyer/photon-node/photon_rs_bg.wasm")
}

fn build_managed_sophon_binary(source_path: &Path, binary_path: &Path) -> Result<(), String> {
    if let Some(parent) = binary_path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| {
            format!(
                "Failed to create Sophon binary directory {}: {error}",
                parent.display()
            )
        })?;
    }

    let output = Command::new("bun")
        .arg("build")
        .arg("--compile")
        .arg(source_path)
        .arg("--outfile")
        .arg(binary_path)
        .output()
        .map_err(|error| format!("Failed to execute Bun compiler for Sophon: {error}"))?;

    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let detail = if !stderr.is_empty() { stderr } else { stdout };
    Err(format!("Failed to compile Sophon CLI binary: {detail}"))
}

fn ensure_managed_sophon_runtime_assets(app_data_dir: &Path) -> Result<(), String> {
    let runtime_dir = managed_sophon_runtime_dir(app_data_dir);
    std::fs::create_dir_all(&runtime_dir).map_err(|error| {
        format!(
            "Failed to create Sophon runtime directory {}: {error}",
            runtime_dir.display()
        )
    })?;

    let pi_root = pi_package_root();
    if !pi_root.exists() {
        return Err(format!(
            "pi-coding-agent package assets not found at {}",
            pi_root.display()
        ));
    }

    let sophon_package_json = sophon_cli_package_root().join("package.json");
    if sophon_package_json.exists() {
        copy_file_if_exists(&sophon_package_json, &runtime_dir.join("package.json"))?;
    } else {
        copy_file_if_exists(
            &pi_root.join("package.json"),
            &runtime_dir.join("package.json"),
        )?;
    }
    copy_file_if_exists(&pi_root.join("README.md"), &runtime_dir.join("README.md"))?;
    copy_file_if_exists(
        &pi_root.join("CHANGELOG.md"),
        &runtime_dir.join("CHANGELOG.md"),
    )?;
    copy_dir_contents(
        &pi_root.join("dist/modes/interactive/theme"),
        &runtime_dir.join("theme"),
    )?;
    copy_dir_contents(
        &pi_root.join("dist/core/export-html"),
        &runtime_dir.join("export-html"),
    )?;
    copy_file_if_exists(
        &photon_wasm_source_path(),
        &runtime_dir.join("photon_rs_bg.wasm"),
    )?;

    Ok(())
}

fn managed_sophon_runtime_dir(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("tools").join("sophon")
}

fn managed_sophon_binary_needs_rebuild(binary_path: &Path) -> Result<bool, String> {
    binary_needs_refresh(binary_path, &managed_sophon_build_inputs())
}

fn managed_sophon_build_inputs() -> Vec<PathBuf> {
    let package_root = sophon_cli_package_root();
    vec![
        sophon_cli_source_path(),
        package_root.join("src").join("sophonHeaderExtension.ts"),
        package_root.join("package.json"),
        workspace_root().join("bun.lockb"),
    ]
}

fn workspace_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../..")
}

fn binary_needs_refresh(binary_path: &Path, inputs: &[PathBuf]) -> Result<bool, String> {
    if !binary_path.exists() {
        return Ok(true);
    }

    let binary_modified = read_modified_time(binary_path)?;
    for input in inputs {
        if !input.exists() {
            continue;
        }

        if read_modified_time(input)? > binary_modified {
            return Ok(true);
        }
    }

    Ok(false)
}

fn read_modified_time(path: &Path) -> Result<SystemTime, String> {
    std::fs::metadata(path)
        .map_err(|error| format!("Failed to read metadata for {}: {error}", path.display()))?
        .modified()
        .map_err(|error| {
            format!(
                "Failed to read modified time for {}: {error}",
                path.display()
            )
        })
}

fn copy_dir_contents(source_dir: &Path, target_dir: &Path) -> Result<(), String> {
    if !source_dir.exists() {
        return Ok(());
    }

    std::fs::create_dir_all(target_dir).map_err(|error| {
        format!(
            "Failed to create Sophon asset directory {}: {error}",
            target_dir.display()
        )
    })?;

    let entries = std::fs::read_dir(source_dir).map_err(|error| {
        format!(
            "Failed to read Sophon asset directory {}: {error}",
            source_dir.display()
        )
    })?;

    for entry in entries {
        let entry = entry.map_err(|error| {
            format!(
                "Failed to enumerate Sophon asset entry in {}: {error}",
                source_dir.display()
            )
        })?;
        let source_path = entry.path();
        let target_path = target_dir.join(entry.file_name());

        if source_path.is_dir() {
            copy_dir_contents(&source_path, &target_path)?;
        } else {
            copy_file_if_exists(&source_path, &target_path)?;
        }
    }

    Ok(())
}

fn copy_file_if_exists(source: &Path, target: &Path) -> Result<(), String> {
    if !source.exists() {
        return Ok(());
    }

    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(|error| {
            format!(
                "Failed to create Sophon asset parent directory {}: {error}",
                parent.display()
            )
        })?;
    }

    std::fs::copy(source, target).map_err(|error| {
        format!(
            "Failed to copy Sophon asset {} -> {}: {error}",
            source.display(),
            target.display()
        )
    })?;
    Ok(())
}

fn command_available(command: &str) -> bool {
    Command::new(command)
        .arg("--version")
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

#[cfg(target_os = "windows")]
fn binary_file_name() -> &'static str {
    "sophon.exe"
}

#[cfg(not(target_os = "windows"))]
fn binary_file_name() -> &'static str {
    "sophon"
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::thread::sleep;
    use std::time::Duration;

    use tempfile::tempdir;

    use super::binary_needs_refresh;

    #[test]
    fn binary_refresh_needed_when_binary_is_missing() {
        let temp_dir = tempdir().expect("temp dir should be created");
        let input_path = temp_dir.path().join("input.ts");
        fs::write(&input_path, "source").expect("input file should be written");

        let needs_refresh =
            binary_needs_refresh(&temp_dir.path().join("missing-binary"), &[input_path])
                .expect("refresh check should succeed");

        assert!(needs_refresh);
    }

    #[test]
    fn binary_refresh_not_needed_when_binary_is_newer_than_inputs() {
        let temp_dir = tempdir().expect("temp dir should be created");
        let input_path = temp_dir.path().join("input.ts");
        let binary_path = temp_dir.path().join("sophon");

        fs::write(&input_path, "source").expect("input file should be written");
        sleep(Duration::from_millis(1100));
        fs::write(&binary_path, "binary").expect("binary file should be written");

        let needs_refresh = binary_needs_refresh(&binary_path, &[input_path])
            .expect("refresh check should succeed");

        assert!(!needs_refresh);
    }

    #[test]
    fn binary_refresh_needed_when_input_is_newer_than_binary() {
        let temp_dir = tempdir().expect("temp dir should be created");
        let input_path = temp_dir.path().join("input.ts");
        let binary_path = temp_dir.path().join("sophon");

        fs::write(&binary_path, "binary").expect("binary file should be written");
        sleep(Duration::from_millis(1100));
        fs::write(&input_path, "source").expect("input file should be written");

        let needs_refresh = binary_needs_refresh(&binary_path, &[input_path])
            .expect("refresh check should succeed");

        assert!(needs_refresh);
    }
}
