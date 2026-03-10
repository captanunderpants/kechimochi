import { Component } from '../../core/component';
import { html } from '../../core/html';
import { ActivitySummary, DailyHeatmap, formatDuration } from '../../api';

interface HeatmapViewState {
    heatmapData: DailyHeatmap[];
    year: number;
    logs: ActivitySummary[];
}

export class HeatmapView extends Component<HeatmapViewState> {
    private onYearChange: (direction: number) => void;

    constructor(container: HTMLElement, initialState: HeatmapViewState, onYearChange: (direction: number) => void) {
        super(container, initialState);
        this.onYearChange = onYearChange;
    }

    render() {
        this.clear();
        
        const card = html`
            <div class="card" style="display: flex; flex-direction: column; min-width: 0; height: 100%;">
                <div style="display: flex; justify-content: center; align-items: center; margin-bottom: 2rem; gap: 1rem;">
                    <button class="btn btn-ghost" style="padding: 0.2rem 0.5rem;" id="btn-heatmap-prev">&lt;</button>
                    <h3 style="margin: 0; font-size: 1.1rem; color: var(--text-secondary);">Tracking Heatmap (<span id="heatmap-year-label">${this.state.year}</span>)</h3>
                    <button class="btn btn-ghost" style="padding: 0.2rem 0.5rem;" id="btn-heatmap-next">&gt;</button>
                </div>
                <div style="flex: 1; display: flex; align-items: center; justify-content: center; width: 100%;">
                    <div id="heatmap-inner-container" style="width: 100%; display: flex; justify-content: center;">
                        <!-- Heatmap cells will be injected here -->
                    </div>
                </div>
            </div>
        `;

        this.container.appendChild(card);
        this.renderHeatmap(card.querySelector('#heatmap-inner-container') as HTMLElement);
        
        card.querySelector('#btn-heatmap-prev')?.addEventListener('click', () => this.onYearChange(-1));
        card.querySelector('#btn-heatmap-next')?.addEventListener('click', () => this.onYearChange(1));
    }

    private renderHeatmap(container: HTMLElement) {
        const { heatmapData, year } = this.state;
        let htmlContent = '<div class="heatmap">';
        
        const dateMap = new Map<string, number>();
        for (const cur of heatmapData) {
            dateMap.set(cur.date, cur.total_minutes);
        }

        const startDate = new Date(year, 0, 1);
        const endDate = new Date(year, 11, 31);
        
        const getLocalISODate = (d: Date) => {
            const pad = (n: number) => n.toString().padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        };

        const cells = [];
        const firstDayOfYear = new Date(year, 0, 1);
        const dayOfWeek = firstDayOfYear.getDay(); // 0=Sun
        const offset = (dayOfWeek === 0 ? 6 : dayOfWeek - 1);
        
        for (let i = 0; i < offset; i++) {
            cells.push(`<div class="heatmap-cell" style="opacity: 0; pointer-events: none;"></div>`);
        }

        const style = getComputedStyle(document.body);
        const getThemeNum = (v: string, def: number) => {
            const s = style.getPropertyValue(v).trim();
            return s === "" ? def : parseFloat(s);
        };

        const heatmapHue = style.getPropertyValue('--heatmap-hue').trim() || '353';
        const satBase = getThemeNum('--heatmap-sat-base', 30);
        const satRange = getThemeNum('--heatmap-sat-range', 70);
        const lightBase = getThemeNum('--heatmap-light-base', 45);
        const lightRange = getThemeNum('--heatmap-light-range', 41);

        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            const dateStr = getLocalISODate(d);
            const minutes = dateMap.get(dateStr) || 0;
            let cellStyle = "";
            if (minutes > 0) {
                const ratio = Math.min(1, (minutes - 1) / 359);
                const saturation = satBase + (ratio * satRange);
                const lightness = lightBase + (ratio * lightRange);
                cellStyle = `style="background-color: hsl(${heatmapHue}, ${saturation}%, ${lightness}%);"`;
            }
            cells.push(`<div class="heatmap-cell" data-date="${dateStr}" ${cellStyle}></div>`);
        }

        for (let i = 0; i < cells.length; i += 7) {
            htmlContent += '<div class="heatmap-col">';
            for(let j=0; j<7 && i+j<cells.length; j++) {
                htmlContent += cells[i+j];
            }
            htmlContent += '</div>';
        }
        
        htmlContent += '</div>';
        container.innerHTML = htmlContent;

        // Build date-to-logs map for tooltip
        const dateLogsMap = new Map<string, Map<string, number>>();
        for (const log of this.state.logs) {
            if (!dateLogsMap.has(log.date)) dateLogsMap.set(log.date, new Map());
            const dayMap = dateLogsMap.get(log.date)!;
            dayMap.set(log.title, (dayMap.get(log.title) || 0) + log.duration_minutes);
        }

        const tooltip = HeatmapView.ensureTooltip();
        let currentCell: HTMLElement | null = null;

        container.addEventListener('mousemove', (e) => {
            const cell = (e.target as HTMLElement).closest('.heatmap-cell[data-date]') as HTMLElement | null;
            if (cell === currentCell) return;
            currentCell = cell;
            if (!cell) { tooltip.style.display = 'none'; return; }

            const date = cell.getAttribute('data-date')!;
            const totalMins = dateMap.get(date) || 0;
            const entries = dateLogsMap.get(date);
            const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

            let content = `<div class="heatmap-tooltip-date">${esc(date)} \u2014 ${formatDuration(totalMins)}</div>`;
            if (entries && entries.size > 0) {
                entries.forEach((mins, title) => {
                    content += `<div class="heatmap-tooltip-entry"><span class="heatmap-tooltip-title">${esc(title)}</span><span>${formatDuration(mins)}</span></div>`;
                });
            } else {
                content += `<div class="heatmap-tooltip-empty">No activity</div>`;
            }

            tooltip.innerHTML = content;
            tooltip.style.display = 'block';
            const rect = cell.getBoundingClientRect();
            tooltip.style.left = `${rect.left + rect.width / 2}px`;
            tooltip.style.top = `${rect.bottom + 8}px`;
        });

        container.addEventListener('mouseleave', () => {
            currentCell = null;
            tooltip.style.display = 'none';
        });
    }

    private static heatmapTooltip: HTMLElement | null = null;

    private static ensureTooltip(): HTMLElement {
        if (!HeatmapView.heatmapTooltip || !document.body.contains(HeatmapView.heatmapTooltip)) {
            HeatmapView.heatmapTooltip = document.createElement('div');
            HeatmapView.heatmapTooltip.className = 'heatmap-tooltip';
            HeatmapView.heatmapTooltip.style.display = 'none';
            document.body.appendChild(HeatmapView.heatmapTooltip);
        }
        return HeatmapView.heatmapTooltip;
    }
}
