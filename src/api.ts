import { invoke } from '@tauri-apps/api/core';

/** Format total minutes as HH:MM:SS (or MM:SS if under 1h) */
export function formatDuration(totalMinutes: number): string {
    const totalSeconds = Math.round(totalMinutes * 60);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
    return `00:${pad(m)}:${pad(s)}`;
}

/** Parse HH:MM:SS, MM:SS, or plain minutes into total minutes (fractional). Returns NaN on invalid input. */
export function parseDuration(input: string): number {
    const trimmed = input.trim();
    if (!trimmed) return NaN;
    // Plain number = minutes
    if (/^\d+(\.\d+)?$/.test(trimmed)) return parseFloat(trimmed);
    const parts = trimmed.split(':').map(Number);
    if (parts.some(isNaN)) return NaN;
    if (parts.length === 2) {
        const [mm, ss] = parts;
        if (ss < 0 || ss >= 60 || mm < 0) return NaN;
        return mm + ss / 60;
    }
    if (parts.length === 3) {
        const [hh, mm, ss] = parts;
        if (ss < 0 || ss >= 60 || mm < 0 || mm >= 60 || hh < 0) return NaN;
        return hh * 60 + mm + ss / 60;
    }
    return NaN;
}

export interface MediaCsvRow {
    "Title": string;
    "Media Type": string;
    "Status": string;
    "Language": string;
    "Description": string;
    "Content Type": string;
    "Extra Data": string;
    "Cover Image (Base64)": string;
}

export interface MediaConflict {
    incoming: MediaCsvRow;
    existing?: Media;
}

export interface Media {
  id?: number;
  title: string;
  media_type: string;
  status: string;
  language: string;
  description: string;
  cover_image: string;
  extra_data: string;
  content_type: string;
  tracking_status: string;
  nsfw: boolean;
  hidden: boolean;
  total_time_logged: number;
  total_characters_read: number;
  last_activity_date: string;
}

export interface ActivityLog {
  id?: number;
  media_id: number;
  duration_minutes: number;
  characters_read: number;
  date: string;
}

export interface ActivitySummary {
  id: number;
  media_id: number;
  title: string;
  media_type: string;
  content_type: string;
  duration_minutes: number;
  characters_read: number;
  date: string;
  language: string;
}

export interface DailyHeatmap {
  date: string;
  total_minutes: number;
}

export async function getAllMedia(): Promise<Media[]> {
  return await invoke('get_all_media');
}

export async function addMedia(media: Media): Promise<number> {
  return await invoke('add_media', { media });
}

export async function updateMedia(media: Media): Promise<void> {
  return await invoke('update_media', { media });
}

export async function deleteMedia(id: number): Promise<void> {
  return await invoke('delete_media', { id });
}

export async function addLog(log: ActivityLog): Promise<number> {
  return await invoke('add_log', { log });
}

export async function deleteLog(id: number): Promise<void> {
  return await invoke('delete_log', { id });
}

export async function updateLog(id: number, durationMinutes: number, charactersRead: number): Promise<void> {
  return await invoke('update_log', { id, durationMinutes, charactersRead });
}

export async function getLogs(): Promise<ActivitySummary[]> {
  return await invoke('get_logs');
}

export async function getRecentLogs(limit: number): Promise<ActivitySummary[]> {
  return await invoke('get_recent_logs', { limit });
}

export async function getHeatmap(): Promise<DailyHeatmap[]> {
  return await invoke('get_heatmap');
}

export async function importCsv(filePath: string): Promise<number> {
  return await invoke('import_csv', { filePath });
}

export async function switchProfile(profileName: string): Promise<void> {
  return await invoke('switch_profile', { profileName });
}

export async function clearActivities(): Promise<void> {
  return await invoke('clear_activities');
}

export async function wipeEverything(): Promise<void> {
  return await invoke('wipe_everything');
}

export async function deleteProfile(profileName: string): Promise<void> {
  return await invoke('delete_profile', { profileName });
}

export async function listProfiles(): Promise<string[]> {
  return await invoke('list_profiles');
}

export async function exportCsv(filePath: string, startDate?: string, endDate?: string): Promise<number> {
  return await invoke('export_csv', { filePath, startDate, endDate });
}

export async function exportMediaCsv(filePath: string): Promise<number> {
  return await invoke('export_media_csv', { filePath });
}

export async function analyzeMediaCsv(filePath: string): Promise<MediaConflict[]> {
  return await invoke('analyze_media_csv', { filePath });
}

export async function applyMediaImport(records: MediaCsvRow[]): Promise<number> {
  return await invoke('apply_media_import', { records });
}

export async function getLogsForMedia(mediaId: number): Promise<ActivitySummary[]> {
  return await invoke('get_logs_for_media', { mediaId });
}

export async function uploadCoverImage(mediaId: number, path: string): Promise<string> {
  return await invoke('upload_cover_image', { mediaId, path });
}

export async function readFileBytes(path: string): Promise<number[]> {
  return await invoke('read_file_bytes', { path });
}

export async function downloadAndSaveImage(mediaId: number, url: string): Promise<string> {
  return await invoke('download_and_save_image', { mediaId, url });
}

export async function getUsername(): Promise<string> {
  return await invoke('get_username');
}

export async function getSetting(key: string): Promise<string | null> {
  return await invoke('get_setting', { key });
}

export async function setSetting(key: string, value: string): Promise<void> {
  return await invoke('set_setting', { key, value });
}
