import { Component } from '../core/component';
import { html } from '../core/html';
import { 
    importCsv, exportCsv, deleteProfile, 
    clearActivities, wipeEverything, exportMediaCsv, analyzeMediaCsv, 
    applyMediaImport, switchProfile, listProfiles, getSetting, setSetting, getLogs, ActivitySummary
} from '../api';
import { 
    customPrompt, showExportCsvModal, customAlert, customConfirm, 
    showMediaCsvConflictModal, initialProfilePrompt 
} from '../modals';
import { READING_TYPES } from '../modals/activity';
import {
    clearCurrentProfile,
    getCurrentProfile,
    getThemeCacheKey,
    setCurrentProfile
} from '../storage';
import { open, save } from '@tauri-apps/plugin-dialog';

interface ReadingSpeedReportRow {
    contentType: string;
    sessions: number;
    characters: number;
    minutes: number;
    speed: number;
}

interface ProfileState {
    currentProfile: string;
    theme: string;
    dayEndTime: string;
    readingSpeedReport: ReadingSpeedReportRow[];
    loaded: boolean;
}

export class ProfileView extends Component<ProfileState> {
    constructor(container: HTMLElement) {
        super(container, {
            currentProfile: getCurrentProfile() || 'default',
            theme: 'pastel-pink',
            dayEndTime: '04:00',
            readingSpeedReport: [],
            loaded: false
        });
    }

    async loadData() {
        const [theme, dayEndTime, logs] = await Promise.all([
            getSetting('theme'),
            getSetting('day_end_time'),
            getLogs()
        ]);

        this.state = {
            ...this.state,
            loaded: true,
            theme: theme || 'pastel-pink',
            dayEndTime: dayEndTime && /^\d{2}:\d{2}$/.test(dayEndTime) ? dayEndTime : '04:00',
            readingSpeedReport: this.buildReadingSpeedReport(logs)
        };
    }

    private async loadReadingSpeed(): Promise<number> {
        const val = await getSetting('default_reading_speed');
        return val ? parseInt(val) || 15000 : 15000;
    }

    private buildReadingSpeedReport(logs: ActivitySummary[]): ReadingSpeedReportRow[] {
        const totals = new Map<string, { sessions: number; characters: number; minutes: number }>();
        for (const type of READING_TYPES) {
            totals.set(type, { sessions: 0, characters: 0, minutes: 0 });
        }

        for (const log of logs) {
            if (!READING_TYPES.includes(log.content_type as typeof READING_TYPES[number])) continue;
            const row = totals.get(log.content_type)!;
            row.sessions += 1;
            row.characters += log.characters_read || 0;
            row.minutes += log.duration_minutes || 0;
        }

        return Array.from(totals.entries()).map(([contentType, row]) => ({
            contentType,
            sessions: row.sessions,
            characters: row.characters,
            minutes: row.minutes,
            speed: row.characters > 0 && row.minutes > 0 ? Math.round(row.characters / (row.minutes / 60)) : 0
        }));
    }

    private renderReadingSpeedReport(rows: ReadingSpeedReportRow[]): string {
        return rows.map((row) => `
            <tr>
                <td>${row.contentType}</td>
                <td>${row.speed > 0 ? `${row.speed.toLocaleString()} 文字/hour` : 'No data'}</td>
                <td>${row.sessions > 0 ? row.sessions.toLocaleString() : ''}</td>
            </tr>
        `).join('');
    }

    async render() {
        if (!this.state.loaded) {
            await this.loadData();
        }

        this.clear();
        const { currentProfile, theme, dayEndTime, readingSpeedReport } = this.state;

        const content = html`
            <div class="animate-fade-in" style="display: flex; flex-direction: column; gap: 2rem; max-width: 600px; margin: 0 auto; padding-top: 1rem; padding-bottom: 2rem;">
                
                <div style="text-align: center; margin-bottom: 2rem;">
                    <h2 style="margin: 0; font-size: 2rem; color: var(--text-primary);">${currentProfile}</h2>
                    <p style="color: var(--text-secondary); margin-top: 0.5rem;">Manage your profile and data</p>
                </div>

                <!-- Appearance -->
                <div class="card" style="display: flex; flex-direction: column; gap: 1rem;">
                    <h3>Appearance</h3>
                    <p style="color: var(--text-secondary); font-size: 0.9rem;">Choose your preferred theme for this profile.</p>
                    
                    <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                        <label for="profile-select-theme" style="font-size: 0.85rem; font-weight: 500;">Theme</label>
                        <select id="profile-select-theme" style="width: 100%;">
                            <option value="pastel-pink" ${theme === 'pastel-pink' ? 'selected' : ''}>Pastel Pink (Default)</option>
                            <option value="light" ${theme === 'light' ? 'selected' : ''}>Light Theme</option>
                            <option value="dark" ${theme === 'dark' ? 'selected' : ''}>Dark Theme</option>
                            <option value="light-greyscale" ${theme === 'light-greyscale' ? 'selected' : ''}>Light Greyscale</option>
                            <option value="dark-greyscale" ${theme === 'dark-greyscale' ? 'selected' : ''}>Dark Greyscale</option>
                            <option value="molokai" ${theme === 'molokai' ? 'selected' : ''}>Molokai</option>
                            <option value="green-olive" ${theme === 'green-olive' ? 'selected' : ''}>Green Olive</option>
                            <option value="deep-blue" ${theme === 'deep-blue' ? 'selected' : ''}>Deep Blue</option>
                            <option value="purple" ${theme === 'purple' ? 'selected' : ''}>Purple</option>
                            <option value="fire-red" ${theme === 'fire-red' ? 'selected' : ''}>Fire Red</option>
                            <option value="yellow-lime" ${theme === 'yellow-lime' ? 'selected' : ''}>Yellow Lime</option>
                            <option value="noctua-brown" ${theme === 'noctua-brown' ? 'selected' : ''}>Noctua Brown</option>
                        </select>
                    </div>
                </div>

                <!-- Reading Settings -->
                <div class="card" style="display: flex; flex-direction: column; gap: 1rem;">
                    <h3>Reading Settings</h3>
                    <p style="color: var(--text-secondary); font-size: 0.9rem;">Used to estimate time remaining for reading entries. Your actual reading speed is calculated from logged sessions automatically. This default is used when no sessions have been logged yet.</p>
                    <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                        <label for="profile-reading-speed" style="font-size: 0.85rem; font-weight: 500;">Default Reading Speed (characters / hour)</label>
                        <input type="number" id="profile-reading-speed" min="100" step="100"
                               style="width: 200px; background: var(--bg-dark); color: var(--text-primary); border: 1px solid var(--border-color); padding: 0.5rem; border-radius: var(--radius-sm); appearance: textfield; -moz-appearance: textfield;" />
                    </div>
                    <div style="border-top: 1px solid var(--border-color); padding-top: 1rem;">
                        <h4 style="margin: 0 0 0.75rem 0; color: var(--text-secondary);">Reading Speed Report Card</h4>
                        <table class="dashboard-data-table" style="width: 100%;">
                            <thead>
                                <tr>
                                    <th>Media</th>
                                    <th>Speed</th>
                                    <th>Sessions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${this.renderReadingSpeedReport(readingSpeedReport)}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div class="card" style="display: flex; flex-direction: column; gap: 1rem;">
                    <h3>Activity Settings</h3>
                    <p style="color: var(--text-secondary); font-size: 0.9rem;">Controls which date is selected by default when opening the activity log modal late at night or early in the morning.</p>
                    <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                        <label for="profile-day-end-time" style="font-size: 0.85rem; font-weight: 500;">Day Ends At</label>
                        <input type="time" id="profile-day-end-time" value="${dayEndTime}" step="60"
                               style="width: 200px; background: var(--bg-dark); color: var(--text-primary); border: 1px solid var(--border-color); padding: 0.5rem; border-radius: var(--radius-sm);" />
                    </div>
                </div>

                <!-- Activity Logs -->
                <div class="card" style="display: flex; flex-direction: column; gap: 1rem;">
                    <h3>Activity Logs</h3>
                    <p style="color: var(--text-secondary); font-size: 0.9rem;">Import or export chronological activity logs for the current user in CSV format.</p>
                    
                    <div style="display: flex; gap: 1rem; margin-top: 0.5rem;">
                        <button class="btn btn-primary" id="profile-btn-import-csv" style="flex: 1;">Import Activities (CSV)</button>
                        <button class="btn btn-primary" id="profile-btn-export-csv" style="flex: 1;">Export Activities (CSV)</button>
                    </div>
                </div>

                <!-- Media Library -->
                <div class="card" style="display: flex; flex-direction: column; gap: 1rem;">
                    <h3>Media Library</h3>
                    <p style="color: var(--text-secondary); font-size: 0.9rem;">Import or export the global media library. This dataset is shared across all profiles and includes embedded cover images.</p>
                    
                    <div style="display: flex; gap: 1rem; margin-top: 0.5rem;">
                        <button class="btn btn-primary" id="profile-btn-import-media" style="flex: 1;">Import Media Library (CSV)</button>
                        <button class="btn btn-primary" id="profile-btn-export-media" style="flex: 1;">Export Media Library (CSV)</button>
                    </div>
                </div>

                <!-- Danger Zone -->
                <div class="card" style="display: flex; flex-direction: column; gap: 1rem; border: 1px solid #ff4757;">
                    <h3 style="color: #ff4757;">Danger Zone</h3>
                    
                    <div style="display: flex; flex-direction: column; gap: 1rem; margin-top: 0.5rem;">
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border-color);">
                            <div>
                                <strong style="color: #ff4757;">Clear User Activities</strong>
                                <p style="color: var(--text-secondary); font-size: 0.8rem; margin: 0;">Removes all recorded activity logs for '${currentProfile}', but keeps the profile and media library intact.</p>
                            </div>
                            <button class="btn btn-danger" id="profile-btn-clear-activities" style="background-color: transparent !important; border: 1px solid #ff4757; color: #ff4757 !important; min-width: 140px;">Clear Activities</button>
                        </div>

                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border-color);">
                            <div>
                                <strong style="color: #ff4757;">Delete User Profile</strong>
                                <p style="color: var(--text-secondary); font-size: 0.8rem; margin: 0;">Deletes the '${currentProfile}' profile and its activity logs permanently. Cannot be undone.</p>
                            </div>
                            <button class="btn btn-danger" id="profile-btn-delete-profile" style="background-color: #ff4757 !important; color: #ffffff !important; border: none; min-width: 140px;">Delete Profile</button>
                        </div>

                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 1rem;">
                            <div>
                                <strong style="color: #ff4757;">Delete Everything</strong>
                                <p style="color: var(--text-secondary); font-size: 0.8rem; margin: 0;">Perform a total factory reset. Deletes ALL profiles, ALL activity logs, and the ENTIRE media library along with its cover images. Irreversible.</p>
                            </div>
                            <button class="btn btn-danger" id="profile-btn-wipe-everything" style="background-color: darkred !important; color: #ffffff !important; border: none; min-width: 140px; font-weight: bold;">Factory Reset</button>
                        </div>
                    </div>
                </div>

            </div>
        `;

        this.container.appendChild(content);
        this.setupListeners(content);
    }

    private setupListeners(root: HTMLElement) {
        const { currentProfile } = this.state;

        const readingSpeedInput = root.querySelector('#profile-reading-speed') as HTMLInputElement;
        this.loadReadingSpeed().then(v => { readingSpeedInput.value = String(v); });
        readingSpeedInput.addEventListener('change', async () => {
            const v = parseInt(readingSpeedInput.value);
            if (!isNaN(v) && v >= 100) await setSetting('default_reading_speed', String(v));
        });

        const dayEndTimeInput = root.querySelector('#profile-day-end-time') as HTMLInputElement;
        dayEndTimeInput.addEventListener('change', async () => {
            const nextValue = /^\d{2}:\d{2}$/.test(dayEndTimeInput.value) ? dayEndTimeInput.value : '04:00';
            dayEndTimeInput.value = nextValue;
            await setSetting('day_end_time', nextValue);
            this.state.dayEndTime = nextValue;
        });

        root.querySelector('#profile-select-theme')?.addEventListener('change', async (e) => {
            const theme = (e.target as HTMLSelectElement).value;
            await setSetting('theme', theme);
            localStorage.setItem(getThemeCacheKey(currentProfile), theme);
            document.body.dataset.theme = theme;
            this.setState({ theme });
        });

        root.querySelector('#profile-btn-import-csv')?.addEventListener('click', async () => {
            const selected = await open({ multiple: false, filters: [{ name: 'CSV', extensions: ['csv'] }] });
            if (selected && typeof selected === 'string') {
                try {
                    const count = await importCsv(selected);
                    await customAlert("Success", `Successfully imported ${count} activity logs!`);
                } catch (e) {
                    await customAlert("Error", `Import failed: ${e}`);
                }
            }
        });

        root.querySelector('#profile-btn-export-csv')?.addEventListener('click', async () => {
            const modeData = await showExportCsvModal();
            if (!modeData) return;
            const savePath = await save({ filters: [{ name: 'CSV', extensions: ['csv'] }], defaultPath: `kechimochi_${currentProfile}_activities.csv` });
            if (savePath) {
                try {
                    const count = modeData.mode === 'range' ? await exportCsv(savePath, modeData.start, modeData.end) : await exportCsv(savePath);
                    await customAlert("Success", `Successfully exported ${count} activity logs!`);
                } catch (e) {
                    await customAlert("Error", `Export failed: ${e}`);
                }
            }
        });

        root.querySelector('#profile-btn-import-media')?.addEventListener('click', async () => {
            const selected = await open({ multiple: false, filters: [{ name: 'CSV', extensions: ['csv'] }] });
            if (selected && typeof selected === 'string') {
                try {
                    const conflicts = await analyzeMediaCsv(selected);
                    if (!conflicts || conflicts.length === 0) {
                        await customAlert("Info", "No valid media rows found in the CSV.");
                        return;
                    }
                    const resolvedRecords = await showMediaCsvConflictModal(conflicts);
                    if (!resolvedRecords || resolvedRecords.length === 0) return;
                    const count = await applyMediaImport(resolvedRecords);
                    await customAlert("Success", `Successfully imported ${count} media library entries!`);
                } catch (e) {
                    await customAlert("Error", `Import failed: ${e}`);
                }
            }
        });

        root.querySelector('#profile-btn-export-media')?.addEventListener('click', async () => {
            const savePath = await save({ filters: [{ name: 'CSV', extensions: ['csv'] }], defaultPath: "kechimochi_media_library.csv" });
            if (savePath) {
                try {
                    const count = await exportMediaCsv(savePath);
                    await customAlert("Success", `Successfully exported ${count} media library entries!`);
                } catch (e) {
                    await customAlert("Error", `Export failed: ${e}`);
                }
            }
        });

        root.querySelector('#profile-btn-clear-activities')?.addEventListener('click', async () => {
            if (await customConfirm("Clear Activities", `Are you sure you want to delete all activity logs for '${currentProfile}'?`, "btn-danger", "Clear")) {
                await clearActivities();
                await customAlert("Success", "All activity logs removed for the current profile.");
            }
        });

        root.querySelector('#profile-btn-delete-profile')?.addEventListener('click', async () => {
            const profiles = await listProfiles();
            if (profiles.length <= 1) {
                await customAlert("Error", "Cannot delete the current profile because it is the only remaining user.");
                return;
            }
            const name = await customPrompt(`Type '${currentProfile}' to confirm profile deletion:`);
            if (name === currentProfile) {
                await deleteProfile(currentProfile);
                const updatedProfiles = await listProfiles();
                const nextProfile = updatedProfiles.length > 0 ? updatedProfiles[0] : 'default';
                setCurrentProfile(nextProfile);
                await switchProfile(nextProfile);
                window.location.reload();
            }
        });

        root.querySelector('#profile-btn-wipe-everything')?.addEventListener('click', async () => {
            if (await customPrompt(`DANGER! Type 'WIPE_EVERYTHING' to confirm a total factory reset:`) === 'WIPE_EVERYTHING') {
                await wipeEverything();
                clearCurrentProfile();
                const initialName = await initialProfilePrompt("User");
                setCurrentProfile(initialName);
                await switchProfile(initialName);
                window.location.reload();
            }
        });
    }
}
