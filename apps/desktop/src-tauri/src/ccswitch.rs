use std::env;
use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::{Connection, OpenFlags};
use serde_json::Value;

use crate::payloads::{CcSwitchImportPayload, CcSwitchImportedSupplierPayload};

const CC_SWITCH_DIR_NAME: &str = ".cc-switch";
const APP_PATHS_FILE_NAME: &str = "app_paths.json";
const APP_CONFIG_DIR_OVERRIDE_KEY: &str = "app_config_dir_override";
const CC_SWITCH_DB_FILE_NAME: &str = "cc-switch.db";

#[derive(Debug)]
struct CcSwitchProviderRow {
    id: String,
    app_type: String,
    name: String,
    settings_config: String,
    notes: Option<String>,
    is_current: bool,
}

pub fn import_suppliers_from_ccswitch() -> Result<CcSwitchImportPayload, String> {
    let db_path = resolve_ccswitch_db_path()?;
    if !db_path.exists() {
        return Err(format!(
            "CC Switch database not found at {}",
            db_path.display()
        ));
    }

    let connection = Connection::open_with_flags(&db_path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|error| {
            format!(
                "Failed to open CC Switch database at {}: {error}",
                db_path.display()
            )
        })?;

    let rows = read_provider_rows(&connection)?;
    let suppliers = rows
        .into_iter()
        .filter_map(map_row_to_supplier_payload)
        .collect();

    Ok(CcSwitchImportPayload {
        db_path: db_path.display().to_string(),
        suppliers,
    })
}

fn resolve_ccswitch_db_path() -> Result<PathBuf, String> {
    let default_config_dir = default_ccswitch_config_dir()?;
    let config_dir = read_ccswitch_override_dir(&default_config_dir).unwrap_or(default_config_dir);
    Ok(config_dir.join(CC_SWITCH_DB_FILE_NAME))
}

fn default_ccswitch_config_dir() -> Result<PathBuf, String> {
    resolve_home_dir().map(|home_dir| home_dir.join(CC_SWITCH_DIR_NAME))
}

fn resolve_home_dir() -> Result<PathBuf, String> {
    if let Some(home) = env::var_os("HOME") {
        return Ok(PathBuf::from(home));
    }
    if let Some(home) = env::var_os("USERPROFILE") {
        return Ok(PathBuf::from(home));
    }

    let drive = env::var_os("HOMEDRIVE");
    let path = env::var_os("HOMEPATH");
    match (drive, path) {
        (Some(drive), Some(path)) => {
            let mut buffer = PathBuf::from(drive);
            buffer.push(path);
            Ok(buffer)
        }
        _ => Err("Unable to resolve home directory.".to_string()),
    }
}

fn read_ccswitch_override_dir(default_config_dir: &Path) -> Option<PathBuf> {
    let app_paths_path = default_config_dir.join(APP_PATHS_FILE_NAME);
    let raw = fs::read_to_string(&app_paths_path).ok()?;
    let parsed = serde_json::from_str::<Value>(&raw).ok()?;
    let configured = parsed.get(APP_CONFIG_DIR_OVERRIDE_KEY)?.as_str()?.trim();
    if configured.is_empty() {
        return None;
    }

    let home_dir = resolve_home_dir().ok();
    let resolved = expand_home_prefix(configured, home_dir.as_deref());
    Some(resolved)
}

fn expand_home_prefix(raw: &str, home_dir: Option<&Path>) -> PathBuf {
    if raw == "~" {
        if let Some(home_dir) = home_dir {
            return home_dir.to_path_buf();
        }
    }
    if let Some(suffix) = raw.strip_prefix("~/") {
        if let Some(home_dir) = home_dir {
            return home_dir.join(suffix);
        }
    }
    if let Some(suffix) = raw.strip_prefix("~\\") {
        if let Some(home_dir) = home_dir {
            return home_dir.join(suffix);
        }
    }
    PathBuf::from(raw)
}

fn read_provider_rows(connection: &Connection) -> Result<Vec<CcSwitchProviderRow>, String> {
    let with_current_query =
        "SELECT id, app_type, name, settings_config, notes, COALESCE(is_current, 0) AS is_current
        FROM providers
        ORDER BY app_type ASC, COALESCE(sort_index, 999999) ASC, created_at ASC, id ASC";
    match read_provider_rows_with_query(connection, with_current_query, true) {
        Ok(rows) => Ok(rows),
        Err(_) => {
            let fallback_query = "SELECT id, app_type, name, settings_config, notes
                FROM providers
                ORDER BY app_type ASC, COALESCE(sort_index, 999999) ASC, created_at ASC, id ASC";
            read_provider_rows_with_query(connection, fallback_query, false)
        }
    }
}

fn read_provider_rows_with_query(
    connection: &Connection,
    query: &str,
    include_is_current: bool,
) -> Result<Vec<CcSwitchProviderRow>, String> {
    let mut statement = connection
        .prepare(query)
        .map_err(|error| format!("Failed to prepare provider query: {error}"))?;

    let iter = statement
        .query_map([], |row| {
            let is_current = if include_is_current {
                let value: i64 = row.get(5)?;
                value != 0
            } else {
                false
            };

            Ok(CcSwitchProviderRow {
                id: row.get(0)?,
                app_type: row.get(1)?,
                name: row.get(2)?,
                settings_config: row.get(3)?,
                notes: row.get(4)?,
                is_current,
            })
        })
        .map_err(|error| format!("Failed to query CC Switch providers: {error}"))?;

    let mut rows = Vec::new();
    for item in iter {
        rows.push(item.map_err(|error| format!("Failed to parse provider row: {error}"))?);
    }
    Ok(rows)
}

fn map_row_to_supplier_payload(
    row: CcSwitchProviderRow,
) -> Option<CcSwitchImportedSupplierPayload> {
    let provider_id = map_ccswitch_app_type(&row.app_type)?;
    let settings_config = serde_json::from_str::<Value>(&row.settings_config).ok()?;
    let base_url = extract_base_url(provider_id, &settings_config);
    let api_key = extract_api_key(provider_id, &settings_config);
    let config_json = match settings_config {
        Value::Object(_) => serde_json::to_string_pretty(&settings_config).ok(),
        _ => None,
    };

    let name = normalize_optional_text(Some(&row.name)).unwrap_or_else(|| {
        if provider_id == "claude_code" {
            "Imported Claude Supplier".to_string()
        } else {
            "Imported Codex Supplier".to_string()
        }
    });
    let profile_name = derive_profile_name(&row.name, &row.id);
    let note = append_imported_note(normalize_optional_text(row.notes.as_deref()));

    Some(CcSwitchImportedSupplierPayload {
        provider_id: provider_id.to_string(),
        source_id: row.id,
        name,
        note,
        profile_name,
        base_url,
        api_key,
        config_json,
        is_current: row.is_current,
    })
}

fn map_ccswitch_app_type(raw: &str) -> Option<&'static str> {
    match raw {
        "claude" => Some("claude_code"),
        "codex" => Some("codex"),
        _ => None,
    }
}

fn normalize_optional_text(value: Option<&str>) -> Option<String> {
    let trimmed = value?.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn extract_base_url(provider_id: &str, settings_config: &Value) -> Option<String> {
    if provider_id == "claude_code" {
        return first_non_empty_string(&[
            settings_config.pointer("/env/ANTHROPIC_BASE_URL"),
            settings_config.get("base_url"),
            settings_config.get("baseURL"),
            settings_config.get("apiEndpoint"),
        ])
        .map(trim_trailing_slash);
    }

    first_non_empty_string(&[
        settings_config.pointer("/env/OPENAI_BASE_URL"),
        settings_config.get("base_url"),
        settings_config.get("baseURL"),
        settings_config.pointer("/config/base_url"),
    ])
    .map(trim_trailing_slash)
    .or_else(|| extract_toml_base_url(settings_config.get("config").and_then(Value::as_str)))
}

fn extract_api_key(provider_id: &str, settings_config: &Value) -> Option<String> {
    if provider_id == "claude_code" {
        return first_non_empty_string(&[
            settings_config.pointer("/env/ANTHROPIC_AUTH_TOKEN"),
            settings_config.pointer("/env/ANTHROPIC_API_KEY"),
            settings_config.pointer("/env/OPENROUTER_API_KEY"),
            settings_config.pointer("/env/OPENAI_API_KEY"),
            settings_config.get("apiKey"),
            settings_config.get("api_key"),
        ]);
    }

    first_non_empty_string(&[
        settings_config.pointer("/auth/OPENAI_API_KEY"),
        settings_config.pointer("/env/OPENAI_API_KEY"),
        settings_config.pointer("/env/CODEX_API_KEY"),
        settings_config.pointer("/config/api_key"),
        settings_config.pointer("/config/apiKey"),
        settings_config.get("apiKey"),
        settings_config.get("api_key"),
    ])
}

fn first_non_empty_string(candidates: &[Option<&Value>]) -> Option<String> {
    candidates.iter().copied().flatten().find_map(|value| {
        value
            .as_str()
            .and_then(|raw| normalize_optional_text(Some(raw)))
    })
}

fn extract_toml_base_url(config_text: Option<&str>) -> Option<String> {
    let raw = config_text?;
    for line in raw.lines() {
        let trimmed = line.trim();
        if !trimmed.starts_with("base_url") {
            continue;
        }

        let (_, value) = trimmed.split_once('=')?;
        let normalized = value.trim().trim_matches('"').trim_matches('\'').trim();
        if normalized.is_empty() {
            return None;
        }
        return Some(trim_trailing_slash(normalized.to_string()));
    }
    None
}

fn trim_trailing_slash(raw: String) -> String {
    if raw.len() <= 1 {
        return raw;
    }
    raw.trim_end_matches('/').to_string()
}

fn append_imported_note(note: Option<String>) -> Option<String> {
    const IMPORT_SUFFIX: &str = "Imported from CC Switch";
    match note {
        Some(existing) => Some(format!("{existing} · {IMPORT_SUFFIX}")),
        None => Some(IMPORT_SUFFIX.to_string()),
    }
}

fn derive_profile_name(name: &str, fallback: &str) -> String {
    let sanitized_name = sanitize_profile_segment(name);
    if !sanitized_name.is_empty() {
        return sanitized_name;
    }

    let sanitized_fallback = sanitize_profile_segment(fallback);
    if sanitized_fallback.is_empty() {
        "default".to_string()
    } else {
        sanitized_fallback
    }
}

fn sanitize_profile_segment(raw: &str) -> String {
    let mut normalized = String::with_capacity(raw.len());
    let mut last_was_separator = false;

    for character in raw.chars() {
        if character.is_ascii_alphanumeric() {
            normalized.push(character.to_ascii_lowercase());
            last_was_separator = false;
            continue;
        }

        if character == '-' || character == '_' || character == '.' {
            normalized.push(character);
            last_was_separator = false;
            continue;
        }

        if !last_was_separator {
            normalized.push('-');
            last_was_separator = true;
        }
    }

    normalized
        .trim_matches(|character| character == '-' || character == '_' || character == '.')
        .to_string()
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use serde_json::json;

    use super::{
        derive_profile_name, expand_home_prefix, extract_api_key, extract_base_url,
        extract_toml_base_url, sanitize_profile_segment,
    };

    #[test]
    fn extracts_claude_credentials() {
        let config = json!({
            "env": {
                "ANTHROPIC_BASE_URL": "https://open.bigmodel.cn/api/anthropic/",
                "ANTHROPIC_AUTH_TOKEN": "claude-key"
            }
        });
        assert_eq!(
            extract_base_url("claude_code", &config),
            Some("https://open.bigmodel.cn/api/anthropic".to_string())
        );
        assert_eq!(
            extract_api_key("claude_code", &config),
            Some("claude-key".to_string())
        );
    }

    #[test]
    fn extracts_codex_from_auth_and_toml() {
        let config = json!({
            "auth": {
                "OPENAI_API_KEY": "codex-key"
            },
            "config": "model = \"gpt-5\"\nbase_url = \"https://api.example.com/v1/\"\n"
        });
        assert_eq!(
            extract_base_url("codex", &config),
            Some("https://api.example.com/v1".to_string())
        );
        assert_eq!(
            extract_api_key("codex", &config),
            Some("codex-key".to_string())
        );
    }

    #[test]
    fn extract_toml_base_url_supports_single_quotes() {
        let raw = "base_url = 'https://example.com/v1/'";
        assert_eq!(
            extract_toml_base_url(Some(raw)),
            Some("https://example.com/v1".to_string())
        );
    }

    #[test]
    fn profile_name_uses_fallback_when_name_empty() {
        assert_eq!(
            derive_profile_name("   ", "Provider-Id"),
            "provider-id".to_string()
        );
    }

    #[test]
    fn sanitize_profile_segment_collapses_symbols() {
        assert_eq!(
            sanitize_profile_segment("Zhipu GLM (Team A)"),
            "zhipu-glm-team-a".to_string()
        );
    }

    #[test]
    fn expand_home_prefix_handles_tilde() {
        let home = Path::new("/tmp/home");
        assert_eq!(expand_home_prefix("~", Some(home)), home.to_path_buf());
        assert_eq!(
            expand_home_prefix("~/workspace", Some(home)),
            home.join("workspace")
        );
    }
}
