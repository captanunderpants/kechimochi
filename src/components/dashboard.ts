import { Component } from '../core/component';
import { html } from '../core/html';
import { getLogs, getHeatmap, getAllMedia, ActivitySummary, DailyHeatmap, deleteLog, formatDuration } from '../api';
import { customConfirm, showLogEditorModal } from '../modals';
import { StatsCard } from './dashboard/StatsCard';
import { HeatmapView } from './dashboard/HeatmapView';
import { ActivityCharts } from './dashboard/ActivityCharts';

interface DashboardState {
    logs: ActivitySummary[];
    heatmapData: DailyHeatmap[];
    mediaList: any[];
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

        // 3. Recent Logs Row
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

    private renderLogs(list: HTMLElement) {
        const { logs } = this.state;
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
