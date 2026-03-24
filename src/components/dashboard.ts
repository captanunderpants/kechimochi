import { Component } from '../core/component';
import { html, escapeHTML } from '../core/html';
import { getLogs, getHeatmap, getAllMedia, ActivitySummary, DailyHeatmap, Media, deleteLog, formatDuration, readFileBytes } from '../api';
import { customConfirm, showLogActivityModal, showLogEditorModal } from '../modals';
import { StatsCard } from './dashboard/StatsCard';
import { HeatmapView } from './dashboard/HeatmapView';
import { ActivityCharts } from './dashboard/ActivityCharts';

interface DashboardState {
    logs: ActivitySummary[];
    heatmapData: DailyHeatmap[];
    mediaList: Media[];
    currentHeatmapYear: number;
    chartParams: {
        timeRangeDays: number;
        timeRangeOffset: number;
        groupByMode: 'media_type' | 'log_name';
        pieGroupByMode: 'media_type' | 'log_name';
        charsGroupByMode: 'media_type' | 'log_name';
        chartType: 'bar' | 'line';
        barMetric: 'time' | 'chars';
    }
}

export class Dashboard extends Component<DashboardState> {
    private static quickLogImageCache: Map<string, string> = new Map();
    private activeChartsComponent: ActivityCharts | null = null;
    private loaded: boolean = false;
    private chartsContainerEl: HTMLElement | null = null;
    private heatmapContainerEl: HTMLElement | null = null;

    public resetLoaded() {
        this.loaded = false;
    }

    public setState(newState: Partial<DashboardState>): void {
        this.state = { ...this.state, ...newState };
        const keys = Object.keys(newState) as (keyof DashboardState)[];
        const onlyChartParams = keys.length > 0 && keys.every(k => k === 'chartParams');
        const onlyHeatmapYear = keys.length > 0 && keys.every(k => k === 'currentHeatmapYear');
        if (onlyChartParams && this.chartsContainerEl) {
            this.rerenderCharts();
        } else if (onlyHeatmapYear && this.heatmapContainerEl) {
            this.rerenderHeatmap();
        } else {
            this.render();
        }
    }

    private rerenderCharts(): void {
        if (!this.chartsContainerEl) return;
        if (this.activeChartsComponent) this.activeChartsComponent.destroy?.();
        this.chartsContainerEl.innerHTML = '';
        this.activeChartsComponent = new ActivityCharts(
            this.chartsContainerEl,
            { logs: this.state.logs, ...this.state.chartParams },
            (newParams) => {
                this.setState({ chartParams: { ...this.state.chartParams, ...newParams } });
            }
        );
        this.activeChartsComponent.render();
    }

    private rerenderHeatmap(): void {
        if (!this.heatmapContainerEl) return;
        this.heatmapContainerEl.innerHTML = '';
        new HeatmapView(this.heatmapContainerEl, { heatmapData: this.state.heatmapData, year: this.state.currentHeatmapYear, logs: this.state.logs }, (dir) => {
            this.setState({ currentHeatmapYear: this.state.currentHeatmapYear + dir });
        }).render();
    }

    constructor(container: HTMLElement) {
        super(container, {
            logs: [],
            heatmapData: [],
            mediaList: [],
            currentHeatmapYear: new Date().getFullYear(),
            chartParams: {
                timeRangeDays: 7,
                timeRangeOffset: 0,
                groupByMode: 'log_name',
                pieGroupByMode: 'log_name',
                charsGroupByMode: 'log_name',
                chartType: 'bar',
                barMetric: 'time'
            }
        });
    }

    async loadData() {
        try {
            const [logs, heatmapData, mediaList] = await Promise.all([
                getLogs(),
                getHeatmap(),
                getAllMedia()
            ]);
            this.state = { ...this.state, logs, heatmapData, mediaList };
            this.loaded = true;
        } catch (e) {
            console.error("Dashboard failed to load data", e);
            this.loaded = true;
        }
    }

    async render() {
        if (!this.loaded) {
            await this.loadData();
        }

        const quickLogItems = this.getQuickLogItems();
        const quickLogImages = await this.getQuickLogImages(quickLogItems);

        this.clear();
        const root = html`<div class="animate-fade-in" style="display: flex; flex-direction: column; gap: 2rem;"></div>`;
        this.container.appendChild(root);

        // 1. Stats and Heatmap Row
        const topRow = html`<div style="display: grid; grid-template-columns: 250px minmax(0, 1fr); gap: 2rem;"></div>`;
        root.appendChild(topRow);

        const statsContainer = html`<div class="card" id="stats-box-container" style="display: flex; flex-direction: column;"></div>`;
        topRow.appendChild(statsContainer);
        new StatsCard(statsContainer, { logs: this.state.logs, mediaList: this.state.mediaList }).render();

        const heatmapContainer = html`<div id="heatmap-container" style="min-width: 0;"></div>`;
        topRow.appendChild(heatmapContainer);
        this.heatmapContainerEl = heatmapContainer;
        this.rerenderHeatmap();

        // 2. Charts Row
        const chartsContainer = html`<div id="charts-container"></div>`;
        root.appendChild(chartsContainer);
        this.chartsContainerEl = chartsContainer;
        this.rerenderCharts();

        // 3. Quick Log Row
        const quickLogCard = html`
            <div class="card">
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-bottom: 1rem;">
                    <div>
                        <h3 style="margin: 0;">Quick Log</h3>
                        <p style="margin: 0.35rem 0 0; color: var(--text-secondary); font-size: 0.85rem;">Jump back into recently logged media.</p>
                    </div>
                </div>
                <div class="dashboard-quick-log-strip" id="dashboard-quick-log-strip">
                    ${quickLogItems.length > 0 ? quickLogItems.map(media => {
                        const imageSrc = media.id ? quickLogImages.get(media.id) : null;
                        const contentType = escapeHTML(media.content_type || media.media_type || 'Unknown');
                        const title = escapeHTML(media.title);
                        return `
                            <button type="button" class="dashboard-quick-log-item" data-media-id="${media.id}">
                                <div class="dashboard-quick-log-thumb${media.nsfw && imageSrc ? ' is-nsfw' : ''}">
                                    ${imageSrc
                                        ? `<img src="${imageSrc}" alt="${title}" />`
                                        : `<div class="dashboard-quick-log-fallback"><span>${title}</span></div>`
                                    }
                                </div>
                                <div class="dashboard-quick-log-meta">
                                    <span class="dashboard-quick-log-title">${title}</span>
                                    <span class="dashboard-quick-log-type">${contentType}</span>
                                </div>
                            </button>
                        `;
                    }).join('') : `
                        <div class="dashboard-quick-log-empty">No recently logged media yet.</div>
                    `}
                </div>
            </div>
        `;
        root.appendChild(quickLogCard);
        this.setupQuickLogListeners(quickLogCard, quickLogItems);

        // 4. Recent Logs Row
        const logsCard = html`
            <div class="card">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                    <h3 style="margin: 0;">Recent Activity</h3>
                    <button class="btn btn-ghost" id="btn-edit-logs" style="font-size: 0.8rem; padding: 0.3rem 0.6rem;">Edit Logs</button>
                </div>
                <div id="recent-logs-list" style="display: flex; flex-direction: column; gap: 0.5rem;"></div>
            </div>
        `;
        root.appendChild(logsCard);

        logsCard.querySelector('#btn-edit-logs')?.addEventListener('click', async () => {
            const changed = await showLogEditorModal();
            if (changed) {
                await this.loadData();
            }
        });

        this.renderLogs(logsCard.querySelector('#recent-logs-list') as HTMLElement);
    }

    private getSortedLogs(): ActivitySummary[] {
        return [...this.state.logs].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
    }

    private getQuickLogItems(): Media[] {
        const items: Media[] = [];
        const seenMediaIds = new Set<number>();
        const mediaById = new Map(this.state.mediaList.filter(media => media.id !== undefined).map(media => [media.id!, media]));

        for (const log of this.getSortedLogs()) {
            if (seenMediaIds.has(log.media_id)) continue;
            const media = mediaById.get(log.media_id);
            if (!media) continue;
            seenMediaIds.add(log.media_id);
            items.push(media);
            if (items.length >= 12) break;
        }

        return items;
    }

    private async getQuickLogImages(items: Media[]): Promise<Map<number, string>> {
        const imageMap = new Map<number, string>();

        await Promise.all(items.map(async (media) => {
            if (!media.id) return;
            const coverPath = media.cover_image?.trim();
            if (!coverPath) return;

            const cached = Dashboard.quickLogImageCache.get(coverPath);
            if (cached) {
                imageMap.set(media.id, cached);
                return;
            }

            try {
                const bytes = await readFileBytes(coverPath);
                const blob = new Blob([new Uint8Array(bytes)]);
                const src = URL.createObjectURL(blob);
                Dashboard.quickLogImageCache.set(coverPath, src);
                imageMap.set(media.id, src);
            } catch (error) {
                console.error('Dashboard quick-log image failed to load', error);
            }
        }));

        return imageMap;
    }

    private setupQuickLogListeners(card: HTMLElement, quickLogItems: Media[]): void {
        const mediaById = new Map(quickLogItems.filter(media => media.id !== undefined).map(media => [media.id!, media]));

        card.querySelectorAll('.dashboard-quick-log-item').forEach(button => {
            button.addEventListener('click', async (event) => {
                const mediaId = parseInt((event.currentTarget as HTMLElement).getAttribute('data-media-id') || '', 10);
                if (Number.isNaN(mediaId)) return;

                const media = mediaById.get(mediaId);
                if (!media) return;

                const logged = await showLogActivityModal({
                    title: media.title,
                    contentType: media.content_type || undefined
                });

                if (logged) {
                    await this.loadData();
                    await this.render();
                }
            });
        });
    }

    private renderLogs(list: HTMLElement) {
        const logs = this.getSortedLogs();
        const currentProfile = localStorage.getItem('kechimochi_profile') || 'default';

        if (logs.length === 0) {
            list.innerHTML = '<p style="color: var(--text-secondary);">No activity logged yet.</p>';
            return;
        }

        list.innerHTML = logs.slice(0, 20).map(log => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem; background: var(--bg-dark); border-radius: var(--radius-md); border: 1px solid var(--border-color);">
                <div>
                    <span style="color: var(--accent-green); font-weight: 500;">${currentProfile}</span> 
                    <span style="color: var(--text-secondary);">logged</span> 
                    <span>${formatDuration(log.duration_minutes)}</span> 
                    <span style="color: var(--text-secondary);">of ${log.media_type}</span> 
                    <a class="dashboard-media-link" data-media-id="${log.media_id}" style="color: var(--text-primary); font-weight: 600; cursor: pointer; text-decoration: underline; text-decoration-color: var(--accent-blue);">${log.title}</a>
                </div>
                <div style="display: flex; align-items: center; gap: 1rem;">
                    <div style="color: var(--text-secondary);">${log.date}</div>
                    <button class="btn btn-danger btn-sm delete-log-btn" data-id="${log.id}" style="padding: 0.3rem 0.6rem; font-size: 0.75rem; background-color: #ff4757 !important; color: #ffffff !important; border: none; cursor: pointer;">Delete</button>
                </div>
            </div>
        `).join('');

        list.querySelectorAll('.delete-log-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = parseInt((e.target as HTMLElement).getAttribute('data-id')!);
                const confirm = await customConfirm("Delete Log", "Are you sure you want to permanently delete this log entry?");
                if (confirm) {
                    await deleteLog(id);
                    await this.loadData();
                    this.render();
                }
            });
        });

        list.querySelectorAll('.dashboard-media-link').forEach(link => {
            link.addEventListener('click', (e) => {
                const mediaId = parseInt((e.target as HTMLElement).getAttribute('data-media-id')!);
                window.dispatchEvent(new CustomEvent('app-navigate', { detail: { view: 'media', focusMediaId: mediaId } }));
            });
        });
    }
}
