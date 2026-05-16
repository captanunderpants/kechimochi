use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use tauri::Manager;

pub const STORAGE_ROOT_DIR: &str = "kechimochi-fork";
pub const LEGACY_PROFILE_PREFIX: &str = "kechimochi_";
pub const LEGACY_SHARED_DB: &str = "kechimochi_shared_media.db";
pub const PROFILE_PREFIX: &str = "profile_";
pub const SHARED_DB: &str = "shared_media.db";
pub const COVERS_DIR: &str = "covers";
const MIGRATION_MARKER: &str = ".legacy_storage_migrated";

#[derive(Debug, Clone)]
pub struct StoragePaths {
    pub root_dir: PathBuf,
    pub covers_dir: PathBuf,
    pub legacy_roots: Vec<PathBuf>,
}

impl StoragePaths {
    pub fn shared_db_path(&self) -> PathBuf {
        self.root_dir.join(SHARED_DB)
    }

    pub fn profile_db_path(&self, profile_name: &str) -> PathBuf {
        self.root_dir
            .join(format!("{}{}.db", PROFILE_PREFIX, profile_name))
    }
}

pub fn init(app_handle: &tauri::AppHandle) -> std::result::Result<StoragePaths, String> {
    let base_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let paths = StoragePaths {
        root_dir: base_dir.join(STORAGE_ROOT_DIR),
        covers_dir: base_dir.join(STORAGE_ROOT_DIR).join(COVERS_DIR),
        legacy_roots: legacy_roots(&base_dir),
    };

    fs::create_dir_all(&paths.root_dir).map_err(|e| e.to_string())?;
    migrate_legacy_storage(&paths)?;
    Ok(paths)
}

pub fn legacy_cover_dirs(paths: &StoragePaths) -> Vec<PathBuf> {
    paths
        .legacy_roots
        .iter()
        .map(|root| root.join(COVERS_DIR))
        .filter(|path| path != &paths.covers_dir)
        .collect()
}

fn legacy_roots(base_dir: &Path) -> Vec<PathBuf> {
    let mut roots = Vec::new();
    roots.push(base_dir.to_path_buf());

    if let Some(parent) = base_dir.parent() {
        roots.push(parent.join("com.morg.kechimochi"));
        roots.push(parent.join("kechimochi"));
    }

    dedupe_paths(roots)
}

fn migrate_legacy_storage(paths: &StoragePaths) -> std::result::Result<(), String> {
    let marker = paths.root_dir.join(MIGRATION_MARKER);
    if marker.exists() {
        return Ok(());
    }

    let mut migrated_anything = false;

    for legacy_root in &paths.legacy_roots {
        if legacy_root == &paths.root_dir || !legacy_root.exists() {
            continue;
        }

        migrated_anything |= copy_legacy_shared_db(legacy_root, paths)?;
        migrated_anything |= copy_legacy_profiles(legacy_root, paths)?;
        migrated_anything |= copy_legacy_covers(legacy_root, paths)?;
    }

    if migrated_anything {
        fs::write(marker, b"1").map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn copy_legacy_shared_db(
    legacy_root: &Path,
    paths: &StoragePaths,
) -> std::result::Result<bool, String> {
    let source = legacy_root.join(LEGACY_SHARED_DB);
    let dest = paths.shared_db_path();
    copy_sqlite_database(&source, &dest)
}

fn copy_legacy_profiles(
    legacy_root: &Path,
    paths: &StoragePaths,
) -> std::result::Result<bool, String> {
    let mut copied_anything = false;
    let entries = match fs::read_dir(legacy_root) {
        Ok(entries) => entries,
        Err(_) => return Ok(false),
    };

    for entry in entries.filter_map(std::result::Result::ok) {
        let source = entry.path();
        let Some(name) = source.file_name().and_then(|n| n.to_str()) else {
            continue;
        };

        if !is_legacy_profile_db(name) {
            continue;
        }

        let profile_name = name
            .trim_start_matches(LEGACY_PROFILE_PREFIX)
            .trim_end_matches(".db");
        let dest = paths.profile_db_path(profile_name);
        copied_anything |= copy_sqlite_database(&source, &dest)?;
    }

    Ok(copied_anything)
}

fn copy_legacy_covers(
    legacy_root: &Path,
    paths: &StoragePaths,
) -> std::result::Result<bool, String> {
    let source = legacy_root.join(COVERS_DIR);
    if source == paths.covers_dir || !source.exists() {
        return Ok(false);
    }

    copy_dir_missing_only(&source, &paths.covers_dir)
}

fn copy_sqlite_database(source: &Path, dest: &Path) -> std::result::Result<bool, String> {
    if !source.exists() || dest.exists() {
        return Ok(false);
    }

    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    fs::copy(source, dest).map_err(|e| e.to_string())?;
    copy_sidecar(source, dest, "wal")?;
    copy_sidecar(source, dest, "shm")?;
    Ok(true)
}

fn copy_sidecar(source: &Path, dest: &Path, suffix: &str) -> std::result::Result<(), String> {
    let source_sidecar = PathBuf::from(format!("{}-{}", source.to_string_lossy(), suffix));
    let dest_sidecar = PathBuf::from(format!("{}-{}", dest.to_string_lossy(), suffix));

    if source_sidecar.exists() && !dest_sidecar.exists() {
        fs::copy(source_sidecar, dest_sidecar).map_err(|e| e.to_string())?;
    }

    Ok(())
}

fn copy_dir_missing_only(source: &Path, dest: &Path) -> std::result::Result<bool, String> {
    let mut copied_anything = false;
    fs::create_dir_all(dest).map_err(|e| e.to_string())?;

    let entries = match fs::read_dir(source) {
        Ok(entries) => entries,
        Err(_) => return Ok(false),
    };

    for entry in entries.filter_map(std::result::Result::ok) {
        let source_path = entry.path();
        let dest_path = dest.join(entry.file_name());

        if source_path.is_dir() {
            copied_anything |= copy_dir_missing_only(&source_path, &dest_path)?;
        } else if !dest_path.exists() {
            fs::copy(&source_path, &dest_path).map_err(|e| e.to_string())?;
            copied_anything = true;
        }
    }

    Ok(copied_anything)
}

pub fn is_profile_db(name: &str) -> bool {
    name.starts_with(PROFILE_PREFIX) && name.ends_with(".db") && name != SHARED_DB
}

pub fn profile_name_from_db(name: &str) -> Option<String> {
    if !is_profile_db(name) {
        return None;
    }

    Some(
        name.trim_start_matches(PROFILE_PREFIX)
            .trim_end_matches(".db")
            .to_string(),
    )
}

fn is_legacy_profile_db(name: &str) -> bool {
    name.starts_with(LEGACY_PROFILE_PREFIX) && name.ends_with(".db") && name != LEGACY_SHARED_DB
}

fn dedupe_paths(paths: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut seen = HashSet::new();
    let mut deduped = Vec::new();

    for path in paths {
        let key = path.to_string_lossy().to_string();
        if seen.insert(key) {
            deduped.push(path);
        }
    }

    deduped
}
