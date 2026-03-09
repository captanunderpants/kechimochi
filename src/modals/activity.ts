import { getAllMedia, addLog, addMedia, updateMedia, parseDuration } from '../api';
import { buildCalendar } from './calendar';

export async function showExportCsvModal(): Promise<{mode: 'all' | 'range', start?: string, end?: string} | null> {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        document.body.appendChild(overlay);
        void overlay.offsetWidth;
        overlay.classList.add('active');
        
        const pad = (n: number) => n.toString().padStart(2, '0');
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
        
        overlay.innerHTML = `
            <div class="modal-content" style="max-width: 90vw; width: max-content;">
                <h3>Export CSV</h3>
                <div style="margin-top: 1rem;">
                    <label style="display: flex; gap: 0.5rem; align-items: center; cursor: pointer;"><input type="radio" name="export-mode" value="all" checked /> All History</label>
                    <label style="display: flex; gap: 0.5rem; align-items: center; cursor: pointer; margin-top: 0.5rem;"><input type="radio" name="export-mode" value="range" /> Date Range</label>
                </div>
                <div id="export-range-inputs" style="display: none; align-items: flex-start; gap: 1.5rem; margin-top: 1rem; padding: 1rem; border: 1px solid var(--border-color); border-radius: var(--radius-md); background: #1a151f;">
                    <div style="display: flex; flex-direction: column; gap: 0.5rem; align-items: center;"><label style="font-size: 0.85rem; color: var(--text-secondary);">Start Date</label><div id="cal-start-container"></div></div>
                    <div style="display: flex; flex-direction: column; gap: 0.5rem; align-items: center;"><label style="font-size: 0.85rem; color: var(--text-secondary);">End Date</label><div id="cal-end-container"></div></div>
                </div>
                <div style="display: flex; justify-content: flex-end; gap: 1rem; margin-top: 1.5rem;">
                    <button class="btn btn-ghost" id="export-cancel">Cancel</button>
                    <button class="btn btn-primary" id="export-confirm">Export</button>
                </div>
            </div>`;
        
        let selectedStart = todayStr;
        let selectedEnd = todayStr;
        buildCalendar('cal-start-container', todayStr, (d) => selectedStart = d);
        buildCalendar('cal-end-container', todayStr, (d) => selectedEnd = d);

        const modeRange = overlay.querySelector('input[value="range"]') as HTMLInputElement;
        const rangeInputs = overlay.querySelector('#export-range-inputs') as HTMLElement;
        overlay.querySelectorAll('input[name="export-mode"]').forEach(el => el.addEventListener('change', () => rangeInputs.style.display = modeRange.checked ? 'flex' : 'none'));

        const cleanup = () => {
             overlay.classList.remove('active');
             setTimeout(() => overlay.remove(), 300);
        };
        
        overlay.querySelector('#export-cancel')!.addEventListener('click', () => { cleanup(); resolve(null); });
        overlay.querySelector('#export-confirm')!.addEventListener('click', () => { 
            if (modeRange.checked) resolve({ mode: 'range', start: selectedStart <= selectedEnd ? selectedStart : selectedEnd, end: selectedStart <= selectedEnd ? selectedEnd : selectedStart });
            else resolve({ mode: 'all' });
            cleanup();
        });
    });
}

const CONTENT_TYPES = ['Anime', 'Manga', 'Light Novel', 'Visual Novel', 'Book', 'Audiobook', 'Podcast', 'JDrama', 'Youtube', 'JRPG'] as const;
const READING_TYPES = ['Manga', 'Light Novel', 'Visual Novel', 'Book'];

export function getMediaTypeForContentType(contentType: string): string {
    if (READING_TYPES.includes(contentType)) return 'Reading';
    if (['JRPG'].includes(contentType)) return 'Playing';
    return 'Listening';
}

export function isReadingContentType(contentType: string): boolean {
    return READING_TYPES.includes(contentType);
}

export { CONTENT_TYPES, READING_TYPES };

export async function showLogActivityModal(): Promise<boolean> {
    return new Promise(async (resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        document.body.appendChild(overlay);
        void overlay.offsetWidth;
        overlay.classList.add('active');

        const mediaList = await getAllMedia();
        const activeMedia = mediaList.filter(m => !['Archived', 'Inactive', 'Finished', 'Completed'].includes(m.status));

        overlay.innerHTML = `
            <div class="modal-content">
                <h3>Log Activity</h3>
                <form id="add-activity-form" style="margin-top: 1rem; display: flex; flex-direction: column; gap: 1rem;">
                    <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                        <label style="font-size: 0.85rem; color: var(--text-secondary);">Media Title</label>
                        <input type="text" id="activity-media" list="media-datalist" autocomplete="off" style="background: var(--bg-dark); color: var(--text-primary); border: 1px solid var(--border-color); padding: 0.5rem; border-radius: var(--radius-sm);" required />
                        <datalist id="media-datalist">${activeMedia.map(m => `<option value="${m.title}">`).join('')}</datalist>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                        <label style="font-size: 0.85rem; color: var(--text-secondary);">Media Type</label>
                        <select id="activity-content-type" style="background: var(--bg-dark); color: var(--text-primary); border: 1px solid var(--border-color); padding: 0.5rem; border-radius: var(--radius-sm); outline: none;" required>
                            <option value="" disabled selected>\u2014 Select \u2014</option>
                            ${CONTENT_TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}
                        </select>
                    </div>
                    <div id="characters-read-container" style="display: none; flex-direction: column; gap: 0.5rem;">
                        <label style="font-size: 0.85rem; color: var(--text-secondary);">Characters Read</label>
                        <input type="number" id="activity-characters-read" min="0" step="1" style="background: var(--bg-dark); color: var(--text-primary); border: 1px solid var(--border-color); padding: 0.5rem; border-radius: var(--radius-sm);" />
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                        <label style="font-size: 0.85rem; color: var(--text-secondary);">Duration</label>
                        <input type="text" id="activity-duration" placeholder="HH:MM:SS" style="background: var(--bg-dark); color: var(--text-primary); border: 1px solid var(--border-color); padding: 0.5rem; border-radius: var(--radius-sm);" required />
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 0.5rem; align-items: center;">
                        <label style="font-size: 0.85rem; color: var(--text-secondary);">Date</label>
                        <div id="activity-cal-container"></div>
                    </div>
                    <div style="display: flex; justify-content: flex-end; gap: 1rem; margin-top: 0.5rem;">
                        <button type="button" class="btn btn-ghost" id="activity-cancel">Cancel</button>
                        <button type="submit" class="btn btn-primary">Log Activity</button>
                    </div>
                </form>
            </div>`;

        const pad = (n: number) => n.toString().padStart(2, '0');
        const today = new Date();
        let selectedDate = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
        buildCalendar('activity-cal-container', selectedDate, (d) => selectedDate = d);

        const contentTypeSelect = overlay.querySelector('#activity-content-type') as HTMLSelectElement;
        const charsContainer = overlay.querySelector('#characters-read-container') as HTMLElement;

        // Auto-populate content type when user selects an existing media
        const mediaInput = overlay.querySelector('#activity-media') as HTMLInputElement;
        mediaInput.addEventListener('input', () => {
            const match = mediaList.find(m => m.title.toLowerCase() === mediaInput.value.trim().toLowerCase());
            if (match && match.content_type && CONTENT_TYPES.includes(match.content_type as any)) {
                contentTypeSelect.value = match.content_type;
                charsContainer.style.display = isReadingContentType(match.content_type) ? 'flex' : 'none';
            }
        });

        // Show/hide characters read based on content type
        contentTypeSelect.addEventListener('change', () => {
            charsContainer.style.display = isReadingContentType(contentTypeSelect.value) ? 'flex' : 'none';
        });

        const cleanup = () => {
             overlay.classList.remove('active');
             setTimeout(() => overlay.remove(), 300);
        };

        overlay.querySelector('#activity-cancel')!.addEventListener('click', () => { cleanup(); resolve(false); });
        overlay.querySelector('#add-activity-form')!.addEventListener('submit', async (e) => {
            e.preventDefault();
            const mediaTitle = (overlay.querySelector('#activity-media') as HTMLInputElement).value.trim();
            const durationRaw = (overlay.querySelector('#activity-duration') as HTMLInputElement).value;
            const duration = parseDuration(durationRaw);
            const selectedContentType = contentTypeSelect.value;
            if (!mediaTitle || isNaN(duration) || duration <= 0 || !selectedContentType) return;
            const durationMinutes = Math.round(duration);

            const isReading = isReadingContentType(selectedContentType);
            const charactersRead = isReading ? parseInt((overlay.querySelector('#activity-characters-read') as HTMLInputElement).value) || 0 : 0;

            const existingMedia = mediaList.find(m => m.title.toLowerCase() === mediaTitle.toLowerCase());
            let mediaId: number;

            if (existingMedia?.id) {
                mediaId = existingMedia.id;
                // Update content_type and media_type if they changed
                const derivedMediaType = getMediaTypeForContentType(selectedContentType);
                if (existingMedia.content_type !== selectedContentType || existingMedia.media_type !== derivedMediaType) {
                    existingMedia.content_type = selectedContentType;
                    existingMedia.media_type = derivedMediaType;
                    await updateMedia(existingMedia);
                }
                if (['Archived', 'Inactive', 'Finished', 'Completed'].includes(existingMedia.status)) {
                    existingMedia.status = 'Active';
                    await updateMedia(existingMedia);
                }
            } else {
                const derivedMediaType = getMediaTypeForContentType(selectedContentType);
                mediaId = await addMedia({ title: mediaTitle, media_type: derivedMediaType, status: "Active", language: "日本語", description: "", cover_image: "", extra_data: "{}", content_type: selectedContentType, tracking_status: "Ongoing", nsfw: false, hidden: false, total_time_logged: 0, total_characters_read: 0, last_activity_date: "" });
            }

            await addLog({ media_id: mediaId, duration_minutes: durationMinutes, characters_read: charactersRead, date: selectedDate });
            cleanup();
            resolve(true);
        });
    });
}
