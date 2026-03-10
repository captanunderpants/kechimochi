use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Deserializer, Serialize};
use std::fs::File;
use std::path::Path;
use tauri::Manager;

use crate::db;
use crate::models::{ActivityLog, Media};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};

fn deserialize_i64_strip_commas<'de, D>(deserializer: D) -> Result<i64, D::Error>
where
    D: Deserializer<'de>,
{
    let s = String::deserialize(deserializer)?;
    let cleaned = s.replace(',', "");
    if cleaned.is_empty() {
        return Ok(0);
    }
    cleaned.parse::<i64>().map_err(serde::de::Error::custom)
}

fn deserialize_duration<'de, D>(deserializer: D) -> Result<f64, D::Error>
where
    D: Deserializer<'de>,
{
    let s = String::deserialize(deserializer)?;
    let trimmed = s.trim();
    if trimmed.is_empty() {
        return Ok(0.0);
    }
    // Try HH:MM:SS or H:MM:SS format
    if trimmed.contains(':') {
        let parts: Vec<&str> = trimmed.split(':').collect();
        match parts.len() {
            3 => {
                let hours: f64 = parts[0].parse().map_err(serde::de::Error::custom)?;
                let mins: f64 = parts[1].parse().map_err(serde::de::Error::custom)?;
                let secs: f64 = parts[2].parse().map_err(serde::de::Error::custom)?;
                Ok(hours * 60.0 + mins + secs / 60.0)
            }
            2 => {
                let mins: f64 = parts[0].parse().map_err(serde::de::Error::custom)?;
                let secs: f64 = parts[1].parse().map_err(serde::de::Error::custom)?;
                Ok(mins + secs / 60.0)
            }
            _ => Err(serde::de::Error::custom(format!("invalid duration format: {}", trimmed))),
        }
    } else {
        // Plain number (minutes, possibly fractional)
        trimmed.replace(',', "").parse::<f64>().map_err(serde::de::Error::custom)
    }
}

#[derive(Debug, Deserialize)]
struct CsvRow {
    #[serde(rename = "Date")]
    date: String,
    #[serde(rename = "Log Name")]
    log_name: String,
    #[serde(rename = "Media Type")]
    media_type: String,
    #[serde(rename = "Characters Read", default, deserialize_with = "deserialize_i64_strip_commas")]
    characters_read: i64,
    #[serde(rename = "Duration", deserialize_with = "deserialize_duration")]
    duration: f64,
    #[serde(rename = "Language", default)]
    language: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MediaCsvRow {
    #[serde(rename = "Title")]
    pub title: String,
    #[serde(rename = "Media Type")]
    pub media_type: String,
    #[serde(rename = "Status")]
    pub status: String,
    #[serde(rename = "Language")]
    pub language: String,
    #[serde(rename = "Description")]
    pub description: String,
    #[serde(rename = "Content Type")]
    pub content_type: String,
    #[serde(rename = "Extra Data")]
    pub extra_data: String,
    #[serde(rename = "Cover Image (Base64)")]
    pub cover_image_b64: String,
}

#[derive(Debug, Serialize)]
pub struct MediaConflict {
    pub incoming: MediaCsvRow,
    pub existing: Option<Media>,
}

pub fn import_csv(conn: &mut Connection, file_path: &str) -> Result<usize, String> {
    let path = Path::new(file_path);
    if !path.exists() {
        return Err("File not found".into());
    }

    let file = File::open(path).map_err(|e| e.to_string())?;
    let mut rdr = csv::ReaderBuilder::new().has_headers(true).from_reader(file);

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let mut imported_count = 0;

    for result in rdr.deserialize() {
        let record: CsvRow = match result {
            Ok(r) => r,
            Err(e) => {
                println!("Error parsing row: {:?}", e);
                continue;
            }
        };

        // Derive broad media_type from content_type
        let content_type = record.media_type.clone();
        let media_type = match content_type.as_str() {
            "Manga" | "Light Novel" | "Visual Novel" | "Book" => "Reading",
            "JRPG" => "Playing",
            "Anime" | "Audiobook" | "Podcast" | "JDrama" | "Youtube" => "Listening",
            other => other, // fallback: use as-is
        }.to_string();

        // Validate: Reading type requires Characters Read
        if media_type == "Reading" && record.characters_read <= 0 {
            tx.rollback().map_err(|e| e.to_string())?;
            return Err(format!("Row for '{}' on {} has media type Reading but no Characters Read value. All Reading entries must have Characters Read.", record.log_name, record.date));
        }

        // Format Date from YYYY/MM/DD to YYYY-MM-DD
        let formatted_date = record.date.replace("/", "-");

        // Check if media exists
        let media_id: i64 = match tx.query_row(
            "SELECT id FROM shared.media WHERE title = ?1",
            [&record.log_name],
            |row| row.get(0),
        ) {
            Ok(id) => id,
            Err(rusqlite::Error::QueryReturnedNoRows) => {
                // Create new media
                let new_media = Media {
                    id: None,
                    title: record.log_name.clone(),
                    media_type: media_type.clone(),
                    status: "Completed".into(),
                    language: if record.language.is_empty() { "日本語".to_string() } else { record.language.clone() },
                    description: "".to_string(),
                    cover_image: "".to_string(),
                    extra_data: "{}".to_string(),
                    content_type: content_type.clone(),
                    tracking_status: "Ongoing".to_string(),
                    nsfw: false,
                    hidden: false,
                    total_time_logged: 0.0,
                    total_characters_read: 0,
                    last_activity_date: String::new(),
                };
                
                match db::add_media_with_id(&tx, &new_media) {
                    Ok(id) => id,
                    Err(e) => {
                        println!("Error creating media {}: {}", record.log_name, e);
                        continue;
                    }
                }
            }
            Err(e) => {
                println!("Database error finding media: {}", e);
                continue;
            }
        };

        let new_log = ActivityLog {
            id: None,
            media_id,
            duration_minutes: record.duration,
            characters_read: record.characters_read,
            date: formatted_date,
        };

        match db::add_log(&tx, &new_log) {
            Ok(_) => imported_count += 1,
            Err(e) => println!("Error adding log: {}", e),
        }
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(imported_count)
}

pub fn export_media_csv(conn: &Connection, file_path: &str) -> Result<usize, String> {
    let mut wtr = csv::Writer::from_path(file_path).map_err(|e| e.to_string())?;
    let media_list = db::get_all_media(conn).map_err(|e| e.to_string())?;
    let mut count = 0;

    for m in media_list {
        let mut b64 = String::new();
        if !m.cover_image.is_empty() {
            let path = Path::new(&m.cover_image);
            if path.exists() {
                if let Ok(bytes) = std::fs::read(path) {
                    b64 = BASE64.encode(&bytes);
                }
            }
        }

        let row = MediaCsvRow {
            title: m.title,
            media_type: m.media_type,
            status: m.status,
            language: m.language,
            description: m.description,
            content_type: m.content_type,
            extra_data: m.extra_data,
            cover_image_b64: b64,
        };

        wtr.serialize(row).map_err(|e| e.to_string())?;
        count += 1;
    }

    wtr.flush().map_err(|e| e.to_string())?;
    Ok(count)
}

// Parses the CSV and identifies which incoming media exist vs which are new.
// The frontend will then prompt the user and send back a filtered list to actually apply.
pub fn analyze_media_csv(conn: &Connection, file_path: &str) -> Result<Vec<MediaConflict>, String> {
    let path = Path::new(file_path);
    if !path.exists() {
        return Err("File not found".into());
    }

    let file = File::open(path).map_err(|e| e.to_string())?;
    let mut rdr = csv::ReaderBuilder::new().has_headers(true).from_reader(file);
    let mut conflicts = Vec::new();

    for result in rdr.deserialize() {
        let record: MediaCsvRow = match result {
            Ok(r) => r,
            Err(e) => {
                println!("Error parsing media row: {:?}", e);
                continue;
            }
        };

        let existing: Option<Media> = conn.query_row(
            "SELECT id, title, media_type, status, language, description, cover_image, extra_data, content_type, tracking_status, nsfw, hidden FROM shared.media WHERE title = ?1",
            [&record.title],
            |row| Ok(Media {
                id: row.get(0)?,
                title: row.get(1)?,
                media_type: row.get(2)?,
                status: row.get(3)?,
                language: row.get(4)?,
                description: row.get(5).unwrap_or_default(),
                cover_image: row.get(6).unwrap_or_default(),
                extra_data: row.get(7).unwrap_or_else(|_| "{}".to_string()),
                content_type: row.get(8).unwrap_or_else(|_| "Unknown".to_string()),
                tracking_status: row.get(9).unwrap_or_else(|_| "Untracked".to_string()),
                nsfw: row.get::<_, i64>(10).unwrap_or(0) != 0,
                hidden: row.get::<_, i64>(11).unwrap_or(0) != 0,
                total_time_logged: 0.0,
                total_characters_read: 0,
                last_activity_date: String::new(),
            })
        ).optional().map_err(|e| e.to_string())?;

        conflicts.push(MediaConflict {
            incoming: record,
            existing,
        });
    }

    Ok(conflicts)
}

pub fn apply_media_import(app_handle: &tauri::AppHandle, conn: &mut Connection, records: Vec<MediaCsvRow>) -> Result<usize, String> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let mut imported = 0;

    let app_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    let covers_dir = app_dir.join("covers");
    std::fs::create_dir_all(&covers_dir).map_err(|e| e.to_string())?;

    for req in records {
        // Find existing to possibly delete old cover
        let existing_id: Option<i64> = tx.query_row(
            "SELECT id FROM shared.media WHERE title = ?1",
            [&req.title],
            |row| row.get(0)
        ).ok();

        let mut final_cover_path = String::new();

        if !req.cover_image_b64.is_empty() {
            if let Ok(bytes) = BASE64.decode(&req.cover_image_b64) {
                // Generate a generic name using the title hash or timestamp to avoid collisions
                let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis();
                let dest_file = format!("import_{}.png", stamp);
                let dest = covers_dir.join(&dest_file);
                if std::fs::write(&dest, bytes).is_ok() {
                    final_cover_path = dest.to_string_lossy().to_string();
                }
            }
        }

        if let Some(id) = existing_id {
            // Delete old cover
            let old_cover: String = tx.query_row(
                "SELECT cover_image FROM shared.media WHERE id = ?1",
                [&id],
                |row| row.get(0)
            ).unwrap_or_default();
            
            if !old_cover.is_empty() {
                let _ = std::fs::remove_file(&old_cover);
            }

            let m = Media {
                id: Some(id),
                title: req.title,
                media_type: req.media_type,
                status: req.status,
                language: req.language,
                description: req.description,
                cover_image: final_cover_path,
                extra_data: req.extra_data,
                content_type: req.content_type,
                tracking_status: "Untracked".to_string(),
                nsfw: false,
                hidden: false,
                total_time_logged: 0.0,
                total_characters_read: 0,
                last_activity_date: String::new(),
            };
            db::update_media(&tx, &m).map_err(|e| e.to_string())?;
        } else {
            let m = Media {
                id: None,
                title: req.title,
                media_type: req.media_type,
                status: req.status,
                language: req.language,
                description: req.description,
                cover_image: final_cover_path,
                extra_data: req.extra_data,
                content_type: req.content_type,
                tracking_status: "Untracked".to_string(),
                nsfw: false,
                hidden: false,
                total_time_logged: 0.0,
                total_characters_read: 0,
                last_activity_date: String::new(),
            };
            db::add_media_with_id(&tx, &m).map_err(|e| e.to_string())?;
        }
        imported += 1;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(imported)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use rusqlite::Connection;
    use std::io::Write;
    use std::sync::atomic::{AtomicUsize, Ordering};

    static COUNTER: AtomicUsize = AtomicUsize::new(0);

    /// Create an in-memory SQLite connection with both main and shared schemas populated.
    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute("ATTACH DATABASE ':memory:' AS shared", []).unwrap();
        db::create_tables(&conn).unwrap();
        conn
    }

    fn write_csv(content: &str) -> String {
        let dir = std::env::temp_dir();
        let id = COUNTER.fetch_add(1, Ordering::SeqCst);
        let path = dir.join(format!("kechimochi_test_{}_{}.csv", std::process::id(), id));
        let mut f = File::create(&path).unwrap();
        f.write_all(content.as_bytes()).unwrap();
        path.to_str().unwrap().to_string()
    }

    // ── deserialize_duration unit tests ──────────────────────────────────────

    /// Helper: deserialise a duration string using serde's CSV path.
    fn parse_duration_str(s: &str) -> f64 {
        #[derive(serde::Deserialize)]
        struct W {
            #[serde(rename = "Duration", deserialize_with = "deserialize_duration")]
            d: f64,
        }
        let csv = format!("Duration\n{}\n", s);
        let mut rdr = csv::ReaderBuilder::new().has_headers(true).from_reader(csv.as_bytes());
        rdr.deserialize::<W>().next().unwrap().unwrap().d
    }

    #[test]
    fn test_deserialize_duration_hh_mm_ss() {
        // 1:30:45 → 1*60 + 30 + 45/60 = 90.75 minutes
        let v = parse_duration_str("1:30:45");
        assert!((v - 90.75).abs() < 1e-9, "got {}", v);
    }

    #[test]
    fn test_deserialize_duration_mm_ss_colon() {
        // 45:30 → 45.5 minutes
        let v = parse_duration_str("45:30");
        assert!((v - 45.5).abs() < 1e-9, "got {}", v);
    }

    #[test]
    fn test_deserialize_duration_fractional() {
        let v = parse_duration_str("60");
        assert!((v - 60.0).abs() < 1e-9);
    }

    #[test]
    fn test_deserialize_duration_mm_ss() {
        let v = parse_duration_str("30.5");
        assert!((v - 30.5).abs() < 1e-9);
    }

    #[test]
    fn test_deserialize_duration_plain_minutes() {
        let v = parse_duration_str("1:00:00");
        assert!((v - 60.0).abs() < 1e-9);
    }

    #[test]
    fn test_deserialize_duration_zero_seconds() {
        // 2:05:00 → 2*60 + 5 + 0/60 = 125.0 minutes (zero seconds component)
        let v = parse_duration_str("2:05:00");
        assert!((v - 125.0).abs() < 1e-9, "got {}", v);
    }

    /// Test empty duration string → returns 0.0
    #[test]
    fn test_deserialize_duration_empty() {
        // Use a two-field CSV so the row is valid
        #[derive(serde::Deserialize)]
        struct W {
            #[serde(rename = "Title")]
            _title: String,
            #[serde(rename = "Duration", deserialize_with = "deserialize_duration")]
            d: f64,
        }
        let csv = "Title,Duration\ntest,\n";
        let mut rdr = csv::ReaderBuilder::new().has_headers(true).from_reader(csv.as_bytes());
        let w: W = rdr.deserialize::<W>().next().unwrap().unwrap();
        assert_eq!(w.d, 0.0);
    }

    // ── deserialize_i64_strip_commas unit tests ───────────────────────────────

    fn parse_chars_str(s: &str) -> i64 {
        #[derive(serde::Deserialize)]
        struct W {
            #[serde(rename = "Title")]
            _t: String,
            #[serde(rename = "Characters Read", default, deserialize_with = "deserialize_i64_strip_commas")]
            c: i64,
        }
        // Use quoted value to safely pass commas through CSV
        let csv = format!("Title,Characters Read\ntest,\"{}\"\n", s);
        let mut rdr = csv::ReaderBuilder::new().has_headers(true).from_reader(csv.as_bytes());
        rdr.deserialize::<W>().next().unwrap().unwrap().c
    }

    #[test]
    fn test_chars_with_commas() {
        assert_eq!(parse_chars_str("1,234,567"), 1_234_567);
    }

    #[test]
    fn test_chars_plain() {
        assert_eq!(parse_chars_str("42"), 42);
    }

    #[test]
    fn test_chars_empty() {
        assert_eq!(parse_chars_str(""), 0);
    }

    // ── import_csv integration tests ─────────────────────────────────────────

    #[test]
    fn test_import_csv_basic() {
        let mut conn = setup_test_db();
        let csv_path = write_csv(
            "Date,Log Name,Media Type,Duration,Language\n\
             2024-01-15,ある魔女が死ぬまで,Anime,45,Japanese\n\
             2024-01-16,呪術廻戦,Anime,25,Japanese\n"
        );

        let count = import_csv(&mut conn, &csv_path).unwrap();
        assert_eq!(count, 2);

        let media = db::get_all_media(&conn).unwrap();
        assert_eq!(media.len(), 2);

        let logs = db::get_logs(&conn).unwrap();
        assert_eq!(logs.len(), 2);

        std::fs::remove_file(csv_path).ok();
    }

    #[test]
    fn test_import_csv_deduplicates_media() {
        let mut conn = setup_test_db();
        let csv_path = write_csv(
            "Date,Log Name,Media Type,Duration,Language\n\
             2024-01-15,FF7,JRPG,60,Japanese\n\
             2024-01-16,FF7,JRPG,120,Japanese\n"
        );

        let count = import_csv(&mut conn, &csv_path).unwrap();
        assert_eq!(count, 2);

        let media = db::get_all_media(&conn).unwrap();
        assert_eq!(media.len(), 1, "Expected 1 media, got {}", media.len());
        assert_eq!(media[0].title, "FF7");

        let logs = db::get_logs(&conn).unwrap();
        assert_eq!(logs.len(), 2);

        std::fs::remove_file(csv_path).ok();
    }

    #[test]
    fn test_import_csv_date_formatting() {
        let mut conn = setup_test_db();
        let csv_path = write_csv(
            "Date,Log Name,Media Type,Duration,Language\n\
             2024/03/01,本好きの下剋上,Anime,30,Japanese\n"
        );

        let count = import_csv(&mut conn, &csv_path).unwrap();
        assert_eq!(count, 1);

        let logs = db::get_logs(&conn).unwrap();
        assert_eq!(logs[0].date, "2024-03-01");

        std::fs::remove_file(csv_path).ok();
    }

    #[test]
    fn test_import_csv_duration_hhmmss() {
        let mut conn = setup_test_db();
        // 1:30:45 should be stored as 90.75 minutes (1*60 + 30 + 45/60)
        let csv_path = write_csv(
            "Date,Log Name,Media Type,Duration,Language\n\
             2024-04-01,アニメ,Anime,1:30:45,Japanese\n"
        );

        import_csv(&mut conn, &csv_path).unwrap();
        let logs = db::get_logs(&conn).unwrap();
        assert!((logs[0].duration_minutes - 90.75).abs() < 1e-6,
            "Expected 90.75, got {}", logs[0].duration_minutes);

        std::fs::remove_file(csv_path).ok();
    }

    #[test]
    fn test_import_csv_missing_file() {
        let mut conn = setup_test_db();
        let result = import_csv(&mut conn, "/nonexistent/path/test.csv");
        assert!(result.is_err());
    }

    #[test]
    fn test_import_csv_reading_requires_chars_read() {
        let mut conn = setup_test_db();
        // Manga (Reading type) without Characters Read should fail
        let csv_path = write_csv(
            "Date,Log Name,Media Type,Duration,Characters Read,Language\n\
             2024-04-01,テストマンガ,Manga,60,0,Japanese\n"
        );

        let result = import_csv(&mut conn, &csv_path);
        assert!(result.is_err(), "Expected error for Reading type without characters");

        std::fs::remove_file(csv_path).ok();
    }

    #[test]
    fn test_import_csv_reading_with_chars_succeeds() {
        let mut conn = setup_test_db();
        let csv_path = write_csv(
            "Date,Log Name,Media Type,Duration,Characters Read,Language\n\
             2024-04-01,テストマンガ,Manga,60,5000,Japanese\n"
        );

        let count = import_csv(&mut conn, &csv_path).unwrap();
        assert_eq!(count, 1);
        let logs = db::get_logs(&conn).unwrap();
        assert_eq!(logs[0].characters_read, 5000);

        std::fs::remove_file(csv_path).ok();
    }

    #[test]
    fn test_import_csv_characters_read_with_commas() {
        let mut conn = setup_test_db();
        let csv_path = write_csv(
            "Date,Log Name,Media Type,Duration,Characters Read,Language\n\
             2024-04-01,テスト,Manga,60,\"1,234\",Japanese\n"
        );

        let count = import_csv(&mut conn, &csv_path).unwrap();
        assert_eq!(count, 1);
        let logs = db::get_logs(&conn).unwrap();
        assert_eq!(logs[0].characters_read, 1234);

        std::fs::remove_file(csv_path).ok();
    }

    #[test]
    fn test_import_csv_language_defaults_to_japanese() {
        let mut conn = setup_test_db();
        let csv_path = write_csv(
            "Date,Log Name,Media Type,Duration,Language\n\
             2024-04-01,テスト,Anime,30,\n"
        );

        import_csv(&mut conn, &csv_path).unwrap();
        let media = db::get_all_media(&conn).unwrap();
        assert_eq!(media[0].language, "日本語");

        std::fs::remove_file(csv_path).ok();
    }

    #[test]
    fn test_import_csv_media_type_mapping() {
        let mut conn = setup_test_db();
        let csv_path = write_csv(
            "Date,Log Name,Media Type,Duration,Characters Read,Language\n\
             2024-04-01,アニメ,Anime,30,0,Japanese\n\
             2024-04-02,マンガ,Manga,30,500,Japanese\n\
             2024-04-03,ゲーム,JRPG,60,0,Japanese\n"
        );

        import_csv(&mut conn, &csv_path).unwrap();
        let media = db::get_all_media(&conn).unwrap();

        // Sort for deterministic order
        let by_title: std::collections::HashMap<String, String> = media.iter()
            .map(|m| (m.title.clone(), m.media_type.clone()))
            .collect();

        assert_eq!(by_title["アニメ"], "Listening");
        assert_eq!(by_title["マンガ"], "Reading");
        assert_eq!(by_title["ゲーム"], "Playing");

        std::fs::remove_file(csv_path).ok();
    }
}
