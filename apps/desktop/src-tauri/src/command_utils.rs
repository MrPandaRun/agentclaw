use std::path::Path;

pub fn command_available(command: &str) -> bool {
    let trimmed = command.trim();
    if trimmed.is_empty() {
        return false;
    }

    if contains_path_separator(trimmed) {
        return is_file_candidate(Path::new(trimmed));
    }

    let Some(raw_path) = std::env::var_os("PATH") else {
        return false;
    };

    #[cfg(target_os = "windows")]
    let windows_exts = resolve_windows_extensions();

    for dir in std::env::split_paths(&raw_path) {
        if dir.as_os_str().is_empty() {
            continue;
        }

        #[cfg(target_os = "windows")]
        {
            if Path::new(trimmed).extension().is_some() {
                if is_file_candidate(&dir.join(trimmed)) {
                    return true;
                }
            } else {
                if is_file_candidate(&dir.join(trimmed)) {
                    return true;
                }
                for ext in &windows_exts {
                    if is_file_candidate(&dir.join(format!("{trimmed}{ext}"))) {
                        return true;
                    }
                }
            }
        }

        #[cfg(not(target_os = "windows"))]
        {
            if is_file_candidate(&dir.join(trimmed)) {
                return true;
            }
        }
    }

    false
}

fn contains_path_separator(value: &str) -> bool {
    value.contains('/') || value.contains('\\')
}

fn is_file_candidate(path: &Path) -> bool {
    path.is_file()
}

#[cfg(target_os = "windows")]
fn resolve_windows_extensions() -> Vec<String> {
    let raw = std::env::var("PATHEXT").unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".to_string());
    let mut exts = Vec::new();

    for part in raw.split(';') {
        let trimmed = part.trim();
        if trimmed.is_empty() {
            continue;
        }
        let normalized = if trimmed.starts_with('.') {
            trimmed.to_ascii_lowercase()
        } else {
            format!(".{}", trimmed.to_ascii_lowercase())
        };
        if !exts.iter().any(|value| value == &normalized) {
            exts.push(normalized);
        }
    }

    if exts.is_empty() {
        exts.push(".exe".to_string());
        exts.push(".cmd".to_string());
        exts.push(".bat".to_string());
        exts.push(".com".to_string());
    }

    exts
}
