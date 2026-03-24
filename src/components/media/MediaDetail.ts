import { Component } from '../../core/component';
import { html, escapeHTML } from '../../core/html';
import { Media, ActivitySummary, updateMedia, uploadCoverImage, downloadAndSaveImage, readFileBytes, deleteMedia, formatDuration, getLogsForMedia, deleteLog, getSetting } from '../../api';
import { customConfirm, customPrompt, showJitenSearchModal, showImportMergeModal, showLogActivityModal } from '../../modals';
import { CONTENT_TYPES, getMediaTypeForContentType, isReadingContentType } from '../../modals/activity';
import { isValidImporterUrl, getAvailableSourcesForContentType, fetchMetadataForUrl } from '../../importers';
import { open } from '@tauri-apps/plugin-dialog';
import { MediaLog } from './MediaLog';

interface MediaDetailState {
    media: Media;
    logs: ActivitySummary[];
    imgSrc: string | null;
}

export class MediaDetail extends Component<MediaDetailState> {
    private onBack: () => void;
    private onNext: () => void;
    private onPrev: () => void;
    private onNavigate: (index: number) => void;
    private onDelete: () => void;
    private mediaList: Media[];
    private currentIndex: number;
    private isCoverRevealed: boolean;
    private isLightboxOpen: boolean = false;
    private lightboxOverlay: HTMLElement | null = null;
    private coverClickTimeout: ReturnType<typeof setTimeout> | null = null;

    constructor(container: HTMLElement, media: Media, logs: ActivitySummary[], mediaList: Media[], currentIndex: number, callbacks: { onBack: () => void, onNext: () => void, onPrev: () => void, onNavigate: (index: number) => void, onDelete: () => void }) {
        super(container, { media, logs, imgSrc: null });
        this.mediaList = mediaList;
        this.currentIndex = currentIndex;
        this.onBack = callbacks.onBack;
        this.onNext = callbacks.onNext;
        this.onPrev = callbacks.onPrev;
        this.onNavigate = callbacks.onNavigate;
        this.onDelete = callbacks.onDelete;
        this.isCoverRevealed = !media.nsfw;
        window.addEventListener('keydown', this.handleGlobalKeydown, true);
        this.loadImage();
    }

    private async loadImage() {
        const { cover_image } = this.state.media;
        if (!cover_image || cover_image.trim() === '') return;

        try {
            const bytes = await readFileBytes(cover_image);
            const blob = new Blob([new Uint8Array(bytes)]);
            const src = URL.createObjectURL(blob);
            this.setState({ imgSrc: src });
        } catch (e) {
            console.error("Failed to load image", e);
        }
    }

    private getTrackingStatusClass(status: string): string {
        switch (status) {
            case 'Ongoing': return 'status-ongoing';
            case 'Complete': return 'status-complete';
            case 'Paused': return 'status-paused';
            case 'Dropped': return 'status-dropped';
            case 'Not Started': return 'status-not-started';
            case 'Untracked': return 'status-untracked';
            default: return '';
        }
    }

    private shouldBlurCover(): boolean {
        return this.state.media.nsfw && !this.isCoverRevealed;
    }

    private getCoverTitle(imgSrc: string | null): string {
        if (!imgSrc) return 'Double click to add image';
        if (!this.state.media.nsfw) return 'Left click to expand image. Double click to change image';
        if (this.isCoverRevealed) return 'Left click to expand image. Right click to hide cover. Double click to change image';
        return 'Right click to reveal cover. Double click to change image';
    }

    private clearCoverClickTimeout(): void {
        if (this.coverClickTimeout !== null) {
            clearTimeout(this.coverClickTimeout);
            this.coverClickTimeout = null;
        }
    }

    private handleGlobalKeydown = (event: KeyboardEvent): void => {
        if (event.key === 'Escape' && this.isLightboxOpen) {
            event.preventDefault();
            event.stopPropagation();
            this.closeLightbox();
        }
    };

    private syncLightbox(): void {
        if (!this.isLightboxOpen || !this.state.imgSrc) {
            if (this.lightboxOverlay) {
                this.lightboxOverlay.remove();
                this.lightboxOverlay = null;
            }
            return;
        }

        if (!this.lightboxOverlay) {
            const overlay = document.createElement('div');
            overlay.className = 'media-lightbox-overlay';

            const content = document.createElement('div');
            content.className = 'media-lightbox-content';
            content.addEventListener('click', (event) => event.stopPropagation());

            const image = document.createElement('img');
            image.className = 'media-lightbox-image';

            content.appendChild(image);
            overlay.appendChild(content);
            overlay.addEventListener('click', () => this.closeLightbox());

            document.body.appendChild(overlay);
            this.lightboxOverlay = overlay;
        }

        const lightboxImage = this.lightboxOverlay.querySelector('img') as HTMLImageElement | null;
        if (lightboxImage) {
            lightboxImage.src = this.state.imgSrc;
            lightboxImage.alt = `${this.state.media.title} cover`;
        }
    }

    private openLightbox(): void {
        if (!this.state.imgSrc) return;
        if (this.state.media.nsfw && !this.isCoverRevealed) return;
        this.isLightboxOpen = true;
        this.syncLightbox();
    }

    private closeLightbox(): void {
        if (!this.isLightboxOpen && !this.lightboxOverlay) return;
        this.isLightboxOpen = false;
        this.syncLightbox();
    }

    async render() {
        this.clear();
        const { media, imgSrc, logs } = this.state;
        const shouldBlurCover = this.shouldBlurCover();
        const coverTitle = this.getCoverTitle(imgSrc);

        const detailView = html`
            <div class="animate-fade-in" style="display: flex; flex-direction: column; height: 100%; gap: 1rem;" id="media-root">
                <!-- Header Controls -->
                <div style="display: flex; gap: 1rem; align-items: center; justify-content: space-between; background: var(--bg-dark); padding: 0.5rem 1rem; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
                    <div style="flex: 1; display: flex; justify-content: flex-start;">
                        <button class="btn btn-ghost" id="btn-back-grid" style="font-size: 0.9rem; padding: 0.4rem 0.8rem; display: flex; align-items: center; gap: 0.3rem;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg> Back to Grid</button>
                    </div>
                    
                    <div style="display: flex; justify-content: center; align-items: center; gap: 1rem;">
                        <button class="btn btn-ghost" id="media-prev" style="font-size: 1.2rem; padding: 0.2rem 1rem;">&lt;&lt;</button>
                        <select id="media-select" style="max-width: 800px; text-align: center; border: none; background: transparent; font-size: 1.1rem; color: var(--text-primary); outline: none; appearance: none; cursor: pointer; text-align-last: center; text-overflow: ellipsis; white-space: nowrap; overflow: hidden;">
                            ${this.mediaList.map((m, i) => `<option value="${i}" ${i === this.currentIndex ? 'selected' : ''}>${m.title}</option>`).join('')}
                        </select>
                        <button class="btn btn-ghost" id="media-next" style="font-size: 1.2rem; padding: 0.2rem 1rem;">&gt;&gt;</button>
                    </div>
                    <div style="flex: 1;"></div>
                </div>

                <!-- Main Content -->
                <div id="media-content-area" style="display: flex; gap: 2rem; flex: 1; overflow-y: auto;">
                    <!-- Left Column: Cover -->
                    <div style="flex: 0 0 300px; display: flex; flex-direction: column;">
                        ${imgSrc 
                            ? html`<img src="${imgSrc}" style="width: 100%; aspect-ratio: 2/3; object-fit: cover; border-radius: var(--radius-md); cursor: pointer; transition: filter 0.2s;${shouldBlurCover ? ' filter: blur(20px);' : ''}" id="media-cover-img" alt="Cover" title="${coverTitle}" />`
                            : html`<div style="width: 100%; aspect-ratio: 2/3; background: var(--bg-dark); border: 2px dashed var(--border-color); border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--text-secondary);" id="media-cover-img" title="${coverTitle}">No Image</div>`
                        }
                        <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border-color); display: flex; flex-direction: column; gap: 0.5rem;">
                            <button class="btn" id="btn-delete-media-detail" style="background-color: #ff4757; color: white; border: none; font-weight: bold; width: 100%; padding: 0.6rem; font-size: 0.9rem;">Delete Media</button>
                            <div style="font-size: 0.7rem; color: var(--text-secondary); line-height: 1.2; text-align: center;">
                                <strong>DANGER:</strong> COMPLETELY REMOVES THIS MEDIA AND <strong>ALL</strong> ASSOCIATED WORK LOGS FOR ALL USERS.
                            </div>
                        </div>
                    </div>

                    <!-- Right Column: Details -->
                    <div style="flex: 1; display: flex; flex-direction: column; gap: 1rem;">
                        <div>
                            <div style="display: flex; align-items: baseline; gap: 0.5rem; flex-wrap: wrap;">
                                <h1 id="media-title" title="Double click to edit title" style="margin: 0; font-size: 2rem; cursor: pointer;">${escapeHTML(media.title)}</h1>
                                <button class="copy-btn" id="btn-copy-title" title="Copy Title" style="margin-bottom: 3px;">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                                </button>
                            </div>
                            <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem; align-items: center; flex-wrap: wrap;">
                                <select class="badge badge-select ${this.getTrackingStatusClass(media.tracking_status)}" id="media-tracking-status" title="Click to edit tracking status">
                                    ${["Ongoing", "Complete", "Paused", "Dropped", "Not Started", "Untracked"].map(opt => `<option value="${opt}" ${opt === media.tracking_status ? 'selected' : ''}>${opt}</option>`).join('')}
                                </select>
                                <select class="badge badge-select badge-content" id="media-content-type" title="Click to edit media type">
                                    ${this.getContentTypeOptions(media)}
                                </select>
                                <span class="badge" style="background: var(--bg-card-hover); color: var(--text-secondary);">${media.language}</span>
                                <button class="btn btn-ghost" id="btn-search-jiten" style="padding: 0.2rem 0.8rem; font-size: 0.75rem; border-color: var(--accent-purple); color: var(--accent-purple); border-radius: 12px; height: 1.6rem; margin-left: 0.5rem;">Search on Jiten.moe</button>
                                ${media.tracking_status !== 'Complete' ? html`<button class="btn btn-ghost" id="btn-mark-complete" style="padding: 0.2rem 0.8rem; font-size: 0.75rem; border-color: var(--accent-green); color: var(--accent-green); border-radius: 12px; height: 1.6rem; margin-left: 0.5rem;">Mark as complete</button>` : ''}
                                <button class="btn btn-ghost" id="btn-toggle-nsfw" style="padding: 0.2rem 0.8rem; font-size: 0.75rem; border-color: ${media.nsfw ? 'var(--accent-red, #ff4757)' : 'var(--border-color)'}; color: ${media.nsfw ? 'var(--accent-red, #ff4757)' : 'var(--text-secondary)'}; border-radius: 12px; height: 1.6rem; margin-left: 0.5rem;">NSFW: ${media.nsfw ? 'ON' : 'OFF'}</button>
                            </div>
                        </div>

                        <div class="card" style="display: flex; flex-direction: column; gap: 0.5rem;">
                            <h4 style="margin: 0; color: var(--text-secondary);">Description</h4>
                            <div id="media-desc" title="Double click to edit description" style="cursor: pointer; white-space: pre-wrap;">${media.description || 'No description provided. Double click here to add one.'}</div>
                        </div>

                        <!-- Stats & Extra Fields -->
                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem;">
                            <div id="media-personal-stats" style="grid-column: span 3; display: none;"></div>
                            ${await this.getExtraDataHtml(media)}
                        </div>

                        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                            <button class="btn btn-ghost" id="btn-add-extra" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;">+ Add Extra Field</button>
                            ${getAvailableSourcesForContentType(media.content_type || "Unknown").length > 0 ? html`<button class="btn btn-ghost btn-meta-fetch" id="btn-import-meta" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;">Fetch Metadata from URL</button>` : ''}
                            <button class="btn btn-ghost btn-meta-clear" id="btn-clear-meta" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;">Clear Metadata</button>
                        </div>

                        <!-- Activity Logs -->
                        <div class="card" style="margin-top: 1rem; flex: 1; display: flex; flex-direction: column; min-height: 500px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                                <h4 style="margin: 0; color: var(--text-secondary);">Recent Activity</h4>
                                <button class="btn btn-primary" id="btn-log-activity" style="font-size: 0.8rem; padding: 0.3rem 0.8rem;">Log Activity</button>
                            </div>
                            <div id="media-logs-container" style="display: flex; flex-direction: column; gap: 0.5rem; flex: 1; overflow-y: auto;"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.container.appendChild(detailView);
        this.setupListeners(detailView);
        this.renderStats(detailView);
        
        const logsContainer = detailView.querySelector('#media-logs-container') as HTMLElement;
        const isReading = isReadingContentType(media.content_type || '');

        const handleDeleteLog = async (logId: number) => {
            await deleteLog(logId);
            this.setState({ logs: this.state.logs.filter(l => l.id !== logId) });
            logsContainer.innerHTML = '';
            new MediaLog(logsContainer, this.state.logs, isReading, handleDeleteLog).render();
            const statsDiv = detailView.querySelector('#media-personal-stats') as HTMLElement;
            if (statsDiv) { statsDiv.innerHTML = ''; statsDiv.style.display = 'none'; }
            await this.renderStats(detailView);
        };

        new MediaLog(logsContainer, logs, isReading, handleDeleteLog).render();
        this.syncLightbox();
    }

    private getContentTypeOptions(media: Media): string {
        return CONTENT_TYPES.map(opt => `<option value="${opt}" ${opt === media.content_type ? 'selected' : ''}>${opt}</option>`).join('');
    }

    private async getExtraDataHtml(media: Media) {
        let extraData: Record<string, string> = {};
        try {
            extraData = JSON.parse(media.extra_data || "{}");
        } catch (e) {
            console.warn("Could not parse extra data", e);
        }

        const sortedEntries = Object.entries(extraData).sort((a, b) => {
            const aIsSource = a[0].toLowerCase().includes("source");
            const bIsSource = b[0].toLowerCase().includes("source");
            if (aIsSource && !bIsSource) return -1;
            if (!aIsSource && bIsSource) return 1;
            return 0;
        });

        return sortedEntries.map(([k, v]) => {
            const isSourceUrl = k.toLowerCase().includes('source') && typeof v === 'string' && v.startsWith('http') && isValidImporterUrl(v, media.content_type || "Unknown");
            let refreshBtn = '';
            if (isSourceUrl) {
                refreshBtn = `<div class="refresh-extra-btn" data-url="${v}" data-key="${k}" title="Refresh Metadata" style="position: absolute; bottom: 0.5rem; right: 0.5rem; cursor: pointer; color: var(--accent-purple); display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 50%; background: var(--bg-dark);">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21v-5h5"/></svg>
                </div>`;
            }

            return `
                <div class="card" style="padding: 0.5rem 1rem; position: relative;" data-ekey="${k}">
                    <div style="font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase;">${k}</div>
                    <div class="editable-extra" data-key="${k}" title="Double click to edit" style="cursor: pointer; font-weight: 500;">${v || '-'}</div>
                    <div class="delete-extra-btn" data-key="${k}" title="Delete field" style="position: absolute; top: 0.5rem; right: 0.5rem; cursor: pointer; color: var(--accent-red); font-size: 0.8rem; font-weight: bold; opacity: 0.6;">&times;</div>
                    ${refreshBtn}
                </div>
            `;
        }).join('');
    }

    private async renderStats(root: HTMLElement) {
        const statsDiv = root.querySelector('#media-personal-stats') as HTMLElement;
        const { logs, media } = this.state;
        if (!statsDiv || logs.length === 0) return;

        statsDiv.style.display = 'block';

        const lastLogDate = logs[0].date;
        const firstLogDate = logs[logs.length - 1].date;
        const totalMin = logs.reduce((acc, log) => acc + log.duration_minutes, 0);
        const totalCharsRead = logs.reduce((acc, log) => acc + (log.characters_read || 0), 0);
        const totalStr = formatDuration(totalMin);

        const isReading = isReadingContentType(media.content_type || "");
        const readingSpeed = (isReading && totalMin > 0 && totalCharsRead > 0)
            ? Math.round(totalCharsRead / (totalMin / 60))
            : 0;

        // Load default reading speed from settings (fallback: 15000 chars/hour)
        const defaultSpeedRaw = await getSetting('default_reading_speed');
        const defaultReadingSpeed = defaultSpeedRaw ? parseInt(defaultSpeedRaw) || 15000 : 15000;

        let verb = "Logged";
        if (media.media_type === "Playing") verb = "Played";
        else if (media.media_type === "Listening") verb = "Listened";
        else if (media.media_type === "Reading") verb = "Read";

        const statCard = (label: string, value: string, color: string) => `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 0.8rem 1rem; background: var(--bg-dark); border-radius: var(--radius-md); border: 1px solid var(--border-color); min-width: 0;">
                <span style="font-size: 0.7rem; text-transform: uppercase; color: var(--text-secondary); letter-spacing: 0.05em; margin-bottom: 0.25rem;">${label}</span>
                <span style="font-size: 1.1rem; font-weight: 700; color: ${color};">${value}</span>
            </div>
        `;

        const cards: string[] = [];
        if (media.content_type === "Anime") {
            const episodes = Math.floor(totalMin / 20);
            cards.push(statCard("Episodes Watched", episodes.toLocaleString(), "var(--accent-green)"));
        }
        if (isReading) {
            cards.push(statCard("Total Characters Read", totalCharsRead.toLocaleString(), "var(--accent-green)"));
        }
        cards.push(statCard(`Total Time ${verb}`, totalStr, "var(--accent-blue, #3b82f6)"));
        if (isReading && readingSpeed > 0) {
            cards.push(statCard("Reading Speed", `${readingSpeed.toLocaleString()} 文字/hour`, "var(--accent-yellow)"));
        }

        // Estimated time remaining — only for incomplete reading entries with a known char count
        if (isReading && !['Complete', 'Untracked'].includes(media.tracking_status)) {
            let extraData: Record<string, string> = {};
            try { extraData = JSON.parse(media.extra_data || "{}"); } catch {}
            const charCountStr = Object.entries(extraData).find(([k]) => k.toLowerCase().includes('character count'))?.[1];
            if (charCountStr) {
                const totalCharCount = parseInt(charCountStr.replace(/,/g, '')) || 0;
                if (totalCharCount > 0) {
                    const remaining = totalCharCount - totalCharsRead;
                    if (remaining > 0) {
                        const effectiveSpeed = readingSpeed > 0 ? readingSpeed : defaultReadingSpeed;
                        const remainingMinutes = (remaining / effectiveSpeed) * 60;
                        const speedNote = readingSpeed <= 0 ? ' (default)' : '';
                        cards.push(statCard("Est. Time Remaining", formatDuration(remainingMinutes) + speedNote, "var(--accent-purple)"));
                    }
                }
            }
        }

        cards.push(statCard(`First ${verb}`, firstLogDate, "var(--text-primary)"));
        cards.push(statCard(media.tracking_status === 'Complete' ? 'Finished on' : `Last ${verb}`, lastLogDate, "var(--text-primary)"));

        statsDiv.innerHTML = `
            <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
                ${cards.join('')}
            </div>
        `;
    }

    private setupListeners(root: HTMLElement) {
        root.querySelector('#btn-back-grid')?.addEventListener('click', this.onBack);
        root.querySelector('#media-next')?.addEventListener('click', this.onNext);
        root.querySelector('#media-prev')?.addEventListener('click', this.onPrev);
        root.querySelector('#media-select')?.addEventListener('change', (e) => this.onNavigate(parseInt((e.target as HTMLSelectElement).value)));

        const coverImgEl = root.querySelector('#media-cover-img') as HTMLElement | null;

        coverImgEl?.addEventListener('click', () => {
            if (!this.state.imgSrc) return;
            if (this.state.media.nsfw && !this.isCoverRevealed) return;

            this.clearCoverClickTimeout();
            this.coverClickTimeout = setTimeout(() => {
                this.coverClickTimeout = null;
                this.openLightbox();
            }, 220);
        });

        coverImgEl?.addEventListener('dblclick', async () => {
            this.clearCoverClickTimeout();
            const selected = await open({
                multiple: false,
                filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
            });
            if (selected && typeof selected === 'string') {
                try {
                    const newPath = await uploadCoverImage(this.state.media.id!, selected);
                    this.state.media.cover_image = newPath;
                    await this.loadImage();
                } catch (e) {
                    alert("Failed to upload image: " + e);
                }
            }
        });

        root.querySelector('#btn-copy-title')?.addEventListener('click', async (e) => {
            const btn = e.currentTarget as HTMLElement;
            try {
                await navigator.clipboard.writeText(this.state.media.title);
                btn.classList.add('success');
                const originalSvg = btn.innerHTML;
                btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
                setTimeout(() => {
                    btn.classList.remove('success');
                    btn.innerHTML = originalSvg;
                }, 2000);
            } catch (err) { }
        });

        root.querySelector('#btn-search-jiten')?.addEventListener('click', async () => {
            const jitenUrl = await showJitenSearchModal(this.state.media);
            if (jitenUrl) await this.performMetadataImport(jitenUrl, "Jiten Source");
        });

        const makeEditable = (selector: string, field: keyof Media, isTextArea: boolean = false) => {
            const el = root.querySelector(selector) as HTMLElement;
            if (!el) return;
            el.addEventListener('dblclick', () => {
                const currentVal = (this.state.media[field] as string) || '';
                const input = document.createElement(isTextArea ? 'textarea' : 'input');
                input.className = 'edit-input';
                input.value = currentVal;
                input.style.width = '100%';
                if (isTextArea) {
                    input.style.height = '150px';
                    input.style.resize = 'vertical';
                }
                input.style.background = 'var(--bg-dark)';
                input.style.color = 'var(--text-primary)';
                input.style.border = '1px solid var(--accent-green)';
                input.style.padding = '0.5rem';

                const save = async () => {
                    const newVal = input.value.trim();
                    (this.state.media as any)[field] = newVal;
                    await updateMedia(this.state.media);
                    this.render();
                };

                input.addEventListener('blur', save);
                input.addEventListener('keydown', ((ev: KeyboardEvent) => { 
                    if (ev.key === 'Enter' && !isTextArea) (ev.target as HTMLInputElement).blur(); 
                }) as EventListener);

                el.replaceWith(input);
                input.focus();
            });
        };

        makeEditable('#media-title', 'title', false);
        makeEditable('#media-desc', 'description', true);

        root.querySelector('#media-tracking-status')?.addEventListener('change', async (e) => {
            this.state.media.tracking_status = (e.target as HTMLSelectElement).value;
            await updateMedia(this.state.media);
            this.render();
        });

        root.querySelector('#media-content-type')?.addEventListener('change', async (e) => {
            this.state.media.content_type = (e.target as HTMLSelectElement).value;
            this.state.media.media_type = getMediaTypeForContentType(this.state.media.content_type);
            await updateMedia(this.state.media);
            this.render();
        });

        root.querySelector('#btn-mark-complete')?.addEventListener('click', async () => {
            this.state.media.tracking_status = 'Complete';
            await updateMedia(this.state.media);
            this.render();
        });

        root.querySelector('#btn-delete-media-detail')?.addEventListener('click', async () => {
            const ok = await customConfirm("Delete Media", `Are you sure you want to permanently delete "${this.state.media.title}" and all its logs?`, "btn-danger", "Delete");
            if (ok) {
                await deleteMedia(this.state.media.id!);
                this.onDelete();
            }
        });

        root.querySelector('#btn-toggle-nsfw')?.addEventListener('click', async () => {
            const nextNsfw = !this.state.media.nsfw;
            this.state.media.nsfw = nextNsfw;
            this.isCoverRevealed = !nextNsfw;
            if (nextNsfw) this.closeLightbox();
            await updateMedia(this.state.media);
            this.render();
        });

        root.querySelector('#btn-log-activity')?.addEventListener('click', async () => {
            const logged = await showLogActivityModal({ title: this.state.media.title, contentType: this.state.media.content_type || undefined });
            if (logged) {
                const freshLogs = await getLogsForMedia(this.state.media.id!);
                this.state.logs = freshLogs;
                this.render();
            }
        });

        // Right-click to toggle reveal NSFW cover
        const coverImg = root.querySelector('#media-cover-img') as HTMLElement | null;
        if (coverImg && this.state.media.nsfw) {
            coverImg.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.clearCoverClickTimeout();
                this.isCoverRevealed = !this.isCoverRevealed;
                coverImg.style.filter = this.shouldBlurCover() ? 'blur(20px)' : 'none';
                coverImg.title = this.getCoverTitle(this.state.imgSrc);
            });
        }

        root.querySelector('#btn-add-extra')?.addEventListener('click', async () => {
             const key = await customPrompt("Enter field name (e.g. 'Author', 'Source URL'):");
             if (!key) return;
             const val = await customPrompt(`Enter value for "${key}":`);
             let extraData = JSON.parse(this.state.media.extra_data || "{}");
             extraData[key] = val || "";
             this.state.media.extra_data = JSON.stringify(extraData);
             await updateMedia(this.state.media);
             this.render();
        });

        root.querySelectorAll('.delete-extra-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const key = (e.currentTarget as HTMLElement).getAttribute('data-key');
                if (!key) return;
                let extraData = JSON.parse(this.state.media.extra_data || "{}");
                delete extraData[key];
                this.state.media.extra_data = JSON.stringify(extraData);
                await updateMedia(this.state.media);
                this.render();
            });
        });

        root.querySelector('#btn-import-meta')?.addEventListener('click', async () => {
             const url = await customPrompt("Enter URL to fetch metadata from:");
             if (url) await this.performMetadataImport(url);
        });

        root.querySelector('#btn-clear-meta')?.addEventListener('click', async () => {
            if (await customConfirm("Clear Metadata", "This will delete all extra fields for this media. Continue?")) {
                this.state.media.extra_data = "{}";
                await updateMedia(this.state.media);
                this.render();
            }
        });

        root.querySelectorAll('.refresh-extra-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const target = e.currentTarget as HTMLElement;
                const url = target.getAttribute('data-url');
                const key = target.getAttribute('data-key');
                if (url) await this.performMetadataImport(url, key || undefined);
            });
        });
    }

    private async performMetadataImport(url: string, key: string = "Source URL") {
        try {
            const meta = await fetchMetadataForUrl(url, this.state.media.content_type || "Unknown");
            if (!meta) return;

            // Prepare scraped data to include the source URL as a field
            const scrapedMeta = { ...meta };
            scrapedMeta.extraData = { ...meta.extraData, [key]: url };

            const currentExtraData = JSON.parse(this.state.media.extra_data || "{}");
            const merged = await showImportMergeModal(scrapedMeta, {
                description: this.state.media.description,
                coverImageUrl: this.state.imgSrc || "",
                extraData: currentExtraData,
                imagesIdentical: false // We show the diff so user can visually check
            });

            if (!merged) return;

            // Apply selected merges
            if (merged.description !== undefined) this.state.media.description = merged.description;
            
            // Handle extra data merges
            const finalExtraData = { ...currentExtraData, ...merged.extraData };
            this.state.media.extra_data = JSON.stringify(finalExtraData);

            // Handle cover image merge
            if (merged.coverImageUrl && this.state.media.id) {
                try {
                    const newPath = await downloadAndSaveImage(this.state.media.id, merged.coverImageUrl);
                    this.state.media.cover_image = newPath;
                    await this.loadImage(); // Reload blob URL for the new image
                } catch (err) {
                    console.error("Failed to download new cover", err);
                }
            }

            // Title is still automatic if empty
            if (meta.title && !this.state.media.title) this.state.media.title = meta.title;

            await updateMedia(this.state.media);
            this.render();
        } catch (e) {
            alert("Metadata import failed: " + e);
        }
    }

    public destroy(): void {
        this.clearCoverClickTimeout();
        this.closeLightbox();
        window.removeEventListener('keydown', this.handleGlobalKeydown, true);
    }
}
