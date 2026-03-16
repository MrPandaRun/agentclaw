use serde_json::{json, Map, Value};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

use crate::payloads::{SyncSophonAccountSettingsPayload, SyncSophonAccountSettingsRequest};

const SOPHON_DIR_NAME: &str = ".sophon";
const THINKING_LEVELS: [&str; 6] = ["off", "minimal", "low", "medium", "high", "xhigh"];

#[derive(Debug, Clone)]
pub struct SophonAccountInput {
    pub config_json: Option<String>,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
}

#[derive(Debug, Clone)]
pub struct SophonAccountSyncResult {
    pub settings_path: String,
    pub auth_path: String,
    pub models_path: String,
    pub provider: Option<String>,
    pub model: Option<String>,
    pub thinking_level: Option<String>,
    pub settings_updated: bool,
    pub auth_updated: bool,
    pub models_updated: bool,
}

#[derive(Debug, Clone)]
struct SophonAccountConfig {
    provider: Option<String>,
    model: Option<String>,
    thinking_level: Option<String>,
    auth_patch: Map<String, Value>,
    models_patch: Map<String, Value>,
}

pub fn sync_sophon_account(input: SophonAccountInput) -> Result<SophonAccountSyncResult, String> {
    let home_dir = resolve_home_dir()?;
    let agent_dir = home_dir.join(SOPHON_DIR_NAME).join("agent");
    fs::create_dir_all(&agent_dir).map_err(|error| {
        format!(
            "Failed to create Sophon agent directory {}: {error}",
            agent_dir.display()
        )
    })?;

    let settings_path = agent_dir.join("settings.json");
    let auth_path = agent_dir.join("auth.json");
    let models_path = agent_dir.join("models.json");
    let parsed = parse_sophon_account_config(input.config_json.as_deref())?;

    let settings_updated = upsert_sophon_settings(&settings_path, &parsed)?;
    let auth_updated = upsert_sophon_auth(
        &auth_path,
        parsed.provider.as_deref(),
        input.api_key,
        &parsed.auth_patch,
    )?;
    let models_updated = upsert_sophon_models(
        &models_path,
        parsed.provider.as_deref(),
        input.base_url,
        &parsed.models_patch,
    )?;

    Ok(SophonAccountSyncResult {
        settings_path: settings_path.to_string_lossy().into_owned(),
        auth_path: auth_path.to_string_lossy().into_owned(),
        models_path: models_path.to_string_lossy().into_owned(),
        provider: parsed.provider,
        model: parsed.model,
        thinking_level: parsed.thinking_level,
        settings_updated,
        auth_updated,
        models_updated,
    })
}

pub fn sync_sophon_account_settings(
    request: SyncSophonAccountSettingsRequest,
) -> Result<SyncSophonAccountSettingsPayload, String> {
    sync_sophon_account(SophonAccountInput {
        config_json: request.config_json,
        api_key: request.api_key,
        base_url: request.base_url,
    })
    .map(|result| SyncSophonAccountSettingsPayload {
        settings_path: result.settings_path,
        auth_path: result.auth_path,
        models_path: result.models_path,
        provider: result.provider,
        model: result.model,
        thinking_level: result.thinking_level,
        settings_updated: result.settings_updated,
        auth_updated: result.auth_updated,
        models_updated: result.models_updated,
    })
}

fn parse_sophon_account_config(raw: Option<&str>) -> Result<SophonAccountConfig, String> {
    let source = raw.unwrap_or("").trim();
    if source.is_empty() {
        return Ok(SophonAccountConfig {
            provider: None,
            model: None,
            thinking_level: None,
            auth_patch: Map::new(),
            models_patch: Map::new(),
        });
    }

    let parsed = serde_json::from_str::<Value>(source)
        .map_err(|error| format!("Invalid Sophon config JSON: {error}"))?;
    let record = parsed
        .as_object()
        .ok_or_else(|| "Sophon config JSON must be an object.".to_string())?;
    let settings_record = match record.get("settings") {
        Some(Value::Object(object)) => object,
        Some(_) => return Err("Sophon config JSON field `settings` must be an object.".to_string()),
        None => record,
    };
    let auth_patch = match record.get("auth") {
        Some(Value::Object(object)) => object.clone(),
        Some(_) => return Err("Sophon config JSON field `auth` must be an object.".to_string()),
        None => Map::new(),
    };
    let models_patch = match record.get("models") {
        Some(Value::Object(object)) => object.clone(),
        Some(_) => return Err("Sophon config JSON field `models` must be an object.".to_string()),
        None => Map::new(),
    };

    let provider = normalize_optional_string(
        settings_record
            .get("defaultProvider")
            .or_else(|| settings_record.get("provider"))
            .and_then(Value::as_str),
    );
    let model = normalize_optional_string(
        settings_record
            .get("defaultModel")
            .or_else(|| settings_record.get("model"))
            .and_then(Value::as_str),
    );
    let thinking_level = normalize_optional_string(
        settings_record
            .get("defaultThinkingLevel")
            .or_else(|| settings_record.get("thinkingLevel"))
            .and_then(Value::as_str),
    );

    if let Some(level) = thinking_level.as_deref() {
        if !THINKING_LEVELS.contains(&level) {
            return Err(format!(
                "Unsupported Sophon thinking level: {level}. Expected one of {}.",
                THINKING_LEVELS.join(", ")
            ));
        }
    }

    Ok(SophonAccountConfig {
        provider,
        model,
        thinking_level,
        auth_patch,
        models_patch,
    })
}

fn upsert_sophon_settings(
    settings_path: &Path,
    config: &SophonAccountConfig,
) -> Result<bool, String> {
    let mut settings = read_json_object(settings_path)?;
    let mut updated = false;

    if let Some(provider) = config.provider.as_deref() {
        settings.insert(
            "defaultProvider".to_string(),
            Value::String(provider.to_string()),
        );
        updated = true;
    }

    if let Some(model) = config.model.as_deref() {
        settings.insert("defaultModel".to_string(), Value::String(model.to_string()));
        updated = true;
    }

    if let Some(thinking_level) = config.thinking_level.as_deref() {
        settings.insert(
            "defaultThinkingLevel".to_string(),
            Value::String(thinking_level.to_string()),
        );
        updated = true;
    }

    if updated {
        write_json_object(settings_path, &settings)?;
    }

    Ok(updated)
}

fn upsert_sophon_auth(
    auth_path: &Path,
    provider: Option<&str>,
    api_key: Option<String>,
    config_auth: &Map<String, Value>,
) -> Result<bool, String> {
    let mut auth = read_json_object(auth_path)?;
    let mut updated = merge_object_map(&mut auth, config_auth);

    let provider_key = normalize_optional_string(provider);
    let api_key = normalize_optional_string(api_key.as_deref());
    if let (Some(provider_key), Some(api_key)) = (provider_key, api_key) {
        auth.insert(
            provider_key,
            json!({
                "type": "api_key",
                "key": api_key,
            }),
        );
        updated = true;
    }

    if updated {
        write_json_object(auth_path, &auth)?;
    }
    Ok(updated)
}

fn upsert_sophon_models(
    models_path: &Path,
    provider: Option<&str>,
    base_url: Option<String>,
    config_models: &Map<String, Value>,
) -> Result<bool, String> {
    let mut models = read_json_object(models_path)?;
    let mut updated = merge_object_map(&mut models, config_models);

    if let (Some(provider_key), Some(base_url)) = (
        normalize_optional_string(provider),
        normalize_optional_string(base_url.as_deref()),
    ) {
        let providers_value = models
            .entry("providers".to_string())
            .or_insert_with(|| Value::Object(Map::new()));
        if !providers_value.is_object() {
            *providers_value = Value::Object(Map::new());
        }
        let providers = providers_value
            .as_object_mut()
            .expect("providers must be an object");
        let provider_value = providers
            .entry(provider_key)
            .or_insert_with(|| Value::Object(Map::new()));
        if !provider_value.is_object() {
            *provider_value = Value::Object(Map::new());
        }
        let provider_record = provider_value
            .as_object_mut()
            .expect("provider override must be an object");
        provider_record.insert("baseUrl".to_string(), Value::String(base_url));
        updated = true;
    }

    if updated {
        write_json_object(models_path, &models)?;
    }
    Ok(updated)
}

fn read_json_object(path: &Path) -> Result<Map<String, Value>, String> {
    if !path.exists() {
        return Ok(Map::new());
    }

    let raw = fs::read_to_string(path)
        .map_err(|error| format!("Failed to read {}: {error}", path.display()))?;
    if raw.trim().is_empty() {
        return Ok(Map::new());
    }

    let parsed = serde_json::from_str::<Value>(&raw)
        .map_err(|error| format!("Failed to parse {}: {error}", path.display()))?;
    parsed
        .as_object()
        .cloned()
        .ok_or_else(|| format!("{} must contain a JSON object.", path.display()))
}

fn write_json_object(path: &Path, value: &Map<String, Value>) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create {}: {error}", parent.display()))?;
    }

    let payload = serde_json::to_string_pretty(value)
        .map_err(|error| format!("Failed to serialize {}: {error}", path.display()))?;
    fs::write(path, format!("{payload}\n"))
        .map_err(|error| format!("Failed to write {}: {error}", path.display()))
}

fn merge_object_map(target: &mut Map<String, Value>, patch: &Map<String, Value>) -> bool {
    if patch.is_empty() {
        return false;
    }

    for (key, value) in patch {
        if let Some(current) = target.get_mut(key) {
            merge_json_value(current, value);
        } else {
            target.insert(key.clone(), value.clone());
        }
    }

    true
}

fn merge_json_value(target: &mut Value, patch: &Value) {
    if let (Some(target_map), Some(patch_map)) = (target.as_object_mut(), patch.as_object()) {
        for (key, patch_value) in patch_map {
            if let Some(current) = target_map.get_mut(key) {
                merge_json_value(current, patch_value);
            } else {
                target_map.insert(key.clone(), patch_value.clone());
            }
        }
        return;
    }

    *target = patch.clone();
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

fn normalize_optional_string(value: Option<&str>) -> Option<String> {
    let trimmed = value?.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::{sync_sophon_account, SophonAccountInput};
    use std::fs;
    use std::path::PathBuf;
    use std::sync::{Mutex, OnceLock};
    use tempfile::tempdir;

    fn env_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    fn set_home(home: &PathBuf) {
        std::env::set_var("HOME", home);
        std::env::remove_var("USERPROFILE");
        std::env::remove_var("HOMEDRIVE");
        std::env::remove_var("HOMEPATH");
    }

    #[test]
    fn sync_sophon_account_updates_settings_and_auth() {
        let _guard = env_lock().lock().expect("env lock should be acquired");
        let temp_dir = tempdir().expect("temp dir should be created");
        let home_dir = temp_dir.path().to_path_buf();
        set_home(&home_dir);

        let agent_dir = home_dir.join(".sophon").join("agent");
        fs::create_dir_all(&agent_dir).expect("agent dir should be created");
        fs::write(
            agent_dir.join("settings.json"),
            "{\n  \"skills\": [\"../skills\"],\n  \"enableSkillCommands\": true\n}\n",
        )
        .expect("seed settings should be written");

        let result = sync_sophon_account(SophonAccountInput {
            config_json: Some(
                "{\n  \"defaultProvider\": \"zai\",\n  \"defaultModel\": \"glm-4.7\",\n  \"defaultThinkingLevel\": \"medium\"\n}"
                    .to_string(),
            ),
            api_key: Some("secret-zai-key".to_string()),
            base_url: None,
        })
        .expect("sync should succeed");

        assert_eq!(result.provider.as_deref(), Some("zai"));
        assert_eq!(result.model.as_deref(), Some("glm-4.7"));
        assert_eq!(result.thinking_level.as_deref(), Some("medium"));
        assert!(result.settings_updated);
        assert!(result.auth_updated);

        let saved_settings =
            fs::read_to_string(agent_dir.join("settings.json")).expect("settings should exist");
        assert!(saved_settings.contains("\"skills\": ["));
        assert!(saved_settings.contains("\"defaultProvider\": \"zai\""));
        assert!(saved_settings.contains("\"defaultModel\": \"glm-4.7\""));
        assert!(saved_settings.contains("\"defaultThinkingLevel\": \"medium\""));

        let saved_auth =
            fs::read_to_string(agent_dir.join("auth.json")).expect("auth should exist");
        assert!(saved_auth.contains("\"zai\""));
        assert!(saved_auth.contains("\"key\": \"secret-zai-key\""));
    }

    #[test]
    fn sync_sophon_account_preserves_existing_auth_when_api_key_missing() {
        let _guard = env_lock().lock().expect("env lock should be acquired");
        let temp_dir = tempdir().expect("temp dir should be created");
        let home_dir = temp_dir.path().to_path_buf();
        set_home(&home_dir);

        let agent_dir = home_dir.join(".sophon").join("agent");
        fs::create_dir_all(&agent_dir).expect("agent dir should be created");
        fs::write(
            agent_dir.join("auth.json"),
            "{\n  \"zai\": { \"type\": \"api_key\", \"key\": \"existing\" }\n}\n",
        )
        .expect("seed auth should be written");

        let result = sync_sophon_account(SophonAccountInput {
            config_json: Some("{\"defaultProvider\":\"zai\"}".to_string()),
            api_key: Some("   ".to_string()),
            base_url: None,
        })
        .expect("sync should succeed");

        assert!(result.settings_updated);
        assert!(!result.auth_updated);

        let saved_auth =
            fs::read_to_string(agent_dir.join("auth.json")).expect("auth should exist");
        assert!(saved_auth.contains("\"key\": \"existing\""));
    }

    #[test]
    fn sync_sophon_account_merges_nested_models_and_base_url() {
        let _guard = env_lock().lock().expect("env lock should be acquired");
        let temp_dir = tempdir().expect("temp dir should be created");
        let home_dir = temp_dir.path().to_path_buf();
        set_home(&home_dir);

        let agent_dir = home_dir.join(".sophon").join("agent");
        fs::create_dir_all(&agent_dir).expect("agent dir should be created");

        let result = sync_sophon_account(SophonAccountInput {
            config_json: Some(
                "{\n  \"settings\": { \"defaultProvider\": \"openai\" },\n  \"models\": {\n    \"providers\": {\n      \"openai\": {\n        \"models\": [{ \"id\": \"gpt-5\" }]\n      }\n    }\n  }\n}"
                    .to_string(),
            ),
            api_key: None,
            base_url: Some("https://proxy.example.com/v1".to_string()),
        })
        .expect("sync should succeed");

        assert!(result.models_updated);

        let saved_models =
            fs::read_to_string(agent_dir.join("models.json")).expect("models should exist");
        assert!(saved_models.contains("\"baseUrl\": \"https://proxy.example.com/v1\""));
        assert!(saved_models.contains("\"id\": \"gpt-5\""));
    }
}
