import Chart from 'chart.js/auto';
import { Component } from '../../core/component';
import { escapeHTML, html } from '../../core/html';
import { ActivitySummary, formatDuration } from '../../api';
import { isReadingContentType } from '../../modals/activity';

type TimeBucketMode = 'day' | 'week' | 'month' | 'year';
type TimeRangeMode = 'week' | 'month' | 'year' | 'all_time';
type GroupByMode = 'media_type' | 'log_name';
type ChartType = 'bar' | 'line';
type BarMetric = 'time' | 'chars';
type CategoryTableRangeMode = 'daily' | 'weekly' | 'monthly' | 'all_time';

interface ActivityChartsState {
    logs: ActivitySummary[];
    timeBucketMode: TimeBucketMode;
    timeRangeMode: TimeRangeMode;
    timeRangeOffset: number;
    groupByMode: GroupByMode;
    pieGroupByMode: GroupByMode;
    charsGroupByMode: GroupByMode;
    chartType: ChartType;
    barMetric: BarMetric;
    monthlyStatsYear: number;
    categoryTableRangeMode: CategoryTableRangeMode;
    categoryTableRangeOffset: number;
}

interface TimeRangeContext {
    validStart: string;
    validEnd: string;
    labels: string[];
    displayLabels: string[];
    getBucketIndex: (dateStr: string) => number;
}

interface CategoryTableRangeContext {
    validStart: string;
    validEnd: string;
    rangeLabel: string;
}

export class ActivityCharts extends Component<ActivityChartsState> {
    private pieChartInstance: Chart | null = null;
    private charsChartInstance: Chart | null = null;
    private barChartInstance: Chart | null = null;
    private onChartParamChange: (params: Partial<ActivityChartsState>) => void;

    constructor(container: HTMLElement, initialState: ActivityChartsState, onChartParamChange: (params: Partial<ActivityChartsState>) => void) {
        super(container, initialState);
        this.onChartParamChange = onChartParamChange;
    }

    render() {
        this.clear();

        const monthlyStats = this.getMonthlyStatsRows(this.state.monthlyStatsYear);
        const currentYear = new Date().getFullYear();
        const earliestLogYear = this.getEarliestLogYear();
        const canGoToPrevMonthlyYear = this.state.monthlyStatsYear > earliestLogYear;
        const canGoToNextMonthlyYear = this.state.monthlyStatsYear < currentYear;
        const categoryTable = this.getCategoryTableData();
        const canGoPrevTimeRange = this.canMoveTimeRangeBackward();
        const canGoNextTimeRange = this.canMoveTimeRangeForward();

        const chartsLayout = html`
            <div style="display: flex; flex-direction: column; gap: 1.25rem;">
                <div class="dashboard-top-analytics-row">
                    <div class="card dashboard-activity-hero-card">
                        <div style="display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem;">
                            <div style="display: flex; align-items: center; gap: 0.5rem;">
                                <button class="btn btn-ghost" style="padding: 0.1rem 0.4rem; ${!canGoPrevTimeRange ? 'opacity: 0.3; cursor: default;' : ''}" id="btn-chart-prev">&lt;</button>
                                <h3 style="margin: 0;">Activity Visualization</h3>
                                <button class="btn btn-ghost" style="padding: 0.1rem 0.4rem; ${!canGoNextTimeRange ? 'opacity: 0.3; cursor: default;' : ''}" id="btn-chart-next">&gt;</button>
                            </div>
                            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                                <button class="btn btn-ghost btn-cycle" id="btn-bar-metric" style="font-size: 0.8rem; padding: 0.3rem 0.6rem;">${this.state.barMetric === 'time' ? 'Time' : '文字'}</button>
                                <button class="btn btn-ghost btn-cycle" id="btn-chart-type" style="font-size: 0.8rem; padding: 0.3rem 0.6rem;">${this.state.chartType === 'bar' ? 'Bar' : 'Line'}</button>
                                <select id="select-time-bucket" title="Inner time unit" style="font-size: 0.8rem; padding: 0.3rem 0.6rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-dark); color: var(--text-primary); outline: none; cursor: pointer;">
                                    ${this.getTimeBucketOptions()}
                                </select>
                                <select id="select-time-range" title="Outer time range" style="font-size: 0.8rem; padding: 0.3rem 0.6rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-dark); color: var(--text-primary); outline: none; cursor: pointer;">
                                    ${this.getTimeRangeOptions()}
                                </select>
                                <button class="btn btn-ghost btn-cycle" id="btn-group-by" style="font-size: 0.8rem; padding: 0.3rem 0.6rem;">${this.state.groupByMode === 'media_type' ? 'By Type' : 'By Media'}</button>
                            </div>
                        </div>
                        <div class="chart-container-wrapper" style="height: 380px;">
                            <canvas id="barChart"></canvas>
                        </div>
                    </div>

                    <div class="card dashboard-monthly-stats-card">
                        <div class="dashboard-monthly-stats-header">
                            <div style="display: flex; align-items: center; gap: 0.45rem;">
                                <button class="btn btn-ghost" style="padding: 0.1rem 0.4rem; ${!canGoToPrevMonthlyYear ? 'opacity: 0.3; cursor: default;' : ''}" id="btn-monthly-prev">&lt;</button>
                                <h3 style="margin: 0;">Monthly Stats</h3>
                                <button class="btn btn-ghost" style="padding: 0.1rem 0.4rem; ${!canGoToNextMonthlyYear ? 'opacity: 0.3; cursor: default;' : ''}" id="btn-monthly-next">&gt;</button>
                            </div>
                            <span class="dashboard-monthly-stats-year">${this.state.monthlyStatsYear}</span>
                        </div>
                        <div class="dashboard-table-scroll dashboard-monthly-table-wrap">
                            <table class="dashboard-data-table dashboard-monthly-table dashboard-monthly-table-compact">
                                <thead>
                                    <tr>
                                        <th>Month</th>
                                        <th>文字</th>
                                        <th>Hours</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${monthlyStats.rows.map((row) => `
                                        <tr>
                                            <td>${row.label}</td>
                                            <td>${row.chars.toLocaleString()}</td>
                                            <td>${this.formatDecimalHours(row.minutes)}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                                <tfoot>
                                    <tr>
                                        <td>Total</td>
                                        <td>${monthlyStats.totalChars.toLocaleString()}</td>
                                        <td>${this.formatDecimalHours(monthlyStats.totalMinutes)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </div>

                <div class="dashboard-small-charts-grid">
                    <div class="card" style="display: flex; flex-direction: column; min-width: 0;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                            <h3 style="margin: 0;">Activity Breakdown</h3>
                            <button class="btn btn-ghost btn-cycle" id="btn-pie-toggle" style="font-size: 0.75rem; padding: 0.2rem 0.5rem;">${this.state.pieGroupByMode === 'media_type' ? 'By Type' : 'By Media'}</button>
                        </div>
                        <div class="chart-container-wrapper" style="height: 260px;">
                            <canvas id="pieChart"></canvas>
                        </div>
                        <div id="pie-total" style="text-align: center; margin-top: 0.5rem; font-size: 0.85rem; font-weight: 600; color: var(--text-secondary);"></div>
                    </div>

                    <div class="card" style="display: flex; flex-direction: column; min-width: 0;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                            <h3 style="margin: 0; font-size: 0.95rem;">文字</h3>
                            <button class="btn btn-ghost btn-cycle" id="btn-chars-toggle" style="font-size: 0.75rem; padding: 0.2rem 0.5rem;">${this.state.charsGroupByMode === 'media_type' ? 'By Type' : 'By Media'}</button>
                        </div>
                        <div class="chart-container-wrapper" style="height: 260px;">
                            <canvas id="charsChart"></canvas>
                        </div>
                        <div id="chars-total" style="text-align: center; margin-top: 0.5rem; font-size: 0.85rem; font-weight: 600; color: var(--text-secondary);"></div>
                    </div>

                    <div class="card dashboard-category-table-card">
                        <div class="dashboard-category-table-header">
                            <div style="display: flex; align-items: center; gap: 0.45rem;">
                                <button class="btn btn-ghost" style="padding: 0.1rem 0.4rem; ${!categoryTable.canGoPrev ? 'opacity: 0.3; cursor: default;' : ''}" id="btn-category-table-prev">&lt;</button>
                                <h3 style="margin: 0; font-size: 0.95rem;">Categories</h3>
                                <button class="btn btn-ghost" style="padding: 0.1rem 0.4rem; ${!categoryTable.canGoNext ? 'opacity: 0.3; cursor: default;' : ''}" id="btn-category-table-next">&gt;</button>
                            </div>
                            <div style="display: flex; align-items: center; gap: 0.45rem; flex-wrap: wrap; justify-content: flex-end;">
                                <span class="dashboard-category-table-range-label">${categoryTable.rangeLabel}</span>
                                <button class="btn btn-ghost btn-cycle" id="btn-category-table-range" style="font-size: 0.75rem; padding: 0.2rem 0.5rem;">${this.getCategoryTableRangeModeLabel(this.state.categoryTableRangeMode)}</button>
                            </div>
                        </div>
                        <div class="dashboard-table-scroll dashboard-category-table-wrap">
                            <table class="dashboard-data-table dashboard-category-table">
                                <thead>
                                    <tr>
                                        <th>Title</th>
                                        <th>文字</th>
                                        <th>Hours</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${categoryTable.rows.length > 0 ? categoryTable.rows.map((row) => `
                                        <tr>
                                            <td>${escapeHTML(row.title)}</td>
                                            <td>${row.showChars ? row.chars.toLocaleString() : ''}</td>
                                            <td>${this.formatDecimalHours(row.minutes)}</td>
                                        </tr>
                                    `).join('') : `
                                        <tr>
                                            <td colspan="3" class="dashboard-category-table-empty">No activity in this period</td>
                                        </tr>
                                    `}
                                </tbody>
                            </table>
                        </div>
                        <div style="text-align: center; margin-top: 0.5rem; font-size: 0.85rem; font-weight: 600; color: var(--text-secondary);">
                            Total: ${categoryTable.totalChars.toLocaleString()} 文字 / ${this.formatDecimalHours(categoryTable.totalMinutes)} hr
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.container.appendChild(chartsLayout);
        this.setupListeners(chartsLayout);
        this.renderCharts(chartsLayout);
    }

    private setupListeners(layout: HTMLElement) {
        layout.querySelector('#btn-chart-prev')?.addEventListener('click', () => {
            if (!this.canMoveTimeRangeBackward()) return;
            this.onChartParamChange({ timeRangeOffset: this.state.timeRangeOffset + 1 });
        });

        layout.querySelector('#btn-chart-next')?.addEventListener('click', () => {
            if (!this.canMoveTimeRangeForward()) return;
            this.onChartParamChange({ timeRangeOffset: this.state.timeRangeOffset - 1 });
        });

        layout.querySelector('#btn-chart-type')?.addEventListener('click', () => {
            this.onChartParamChange({ chartType: this.state.chartType === 'bar' ? 'line' : 'bar' });
        });

        layout.querySelector('#select-time-bucket')?.addEventListener('change', (event) => {
            const timeBucketMode = (event.target as HTMLSelectElement).value as TimeBucketMode;
            const timeRangeMode = this.getDefaultRangeForBucket(timeBucketMode, this.state.timeRangeMode);
            this.onChartParamChange({ timeBucketMode, timeRangeMode, timeRangeOffset: 0 });
        });

        layout.querySelector('#select-time-range')?.addEventListener('change', (event) => {
            const timeRangeMode = (event.target as HTMLSelectElement).value as TimeRangeMode;
            const timeBucketMode = this.getDefaultBucketForRange(timeRangeMode, this.state.timeBucketMode);
            this.onChartParamChange({ timeBucketMode, timeRangeMode, timeRangeOffset: 0 });
        });

        layout.querySelector('#btn-group-by')?.addEventListener('click', () => {
            this.onChartParamChange({ groupByMode: this.state.groupByMode === 'media_type' ? 'log_name' : 'media_type' });
        });

        layout.querySelector('#btn-pie-toggle')?.addEventListener('click', () => {
            this.onChartParamChange({ pieGroupByMode: this.state.pieGroupByMode === 'media_type' ? 'log_name' : 'media_type' });
        });

        layout.querySelector('#btn-chars-toggle')?.addEventListener('click', () => {
            this.onChartParamChange({ charsGroupByMode: this.state.charsGroupByMode === 'media_type' ? 'log_name' : 'media_type' });
        });

        layout.querySelector('#btn-bar-metric')?.addEventListener('click', () => {
            this.onChartParamChange({ barMetric: this.state.barMetric === 'time' ? 'chars' : 'time' });
        });

        layout.querySelector('#btn-monthly-prev')?.addEventListener('click', () => {
            if (this.state.monthlyStatsYear <= this.getEarliestLogYear()) return;
            this.onChartParamChange({ monthlyStatsYear: this.state.monthlyStatsYear - 1 });
        });

        layout.querySelector('#btn-monthly-next')?.addEventListener('click', () => {
            const currentYear = new Date().getFullYear();
            if (this.state.monthlyStatsYear >= currentYear) return;
            this.onChartParamChange({ monthlyStatsYear: this.state.monthlyStatsYear + 1 });
        });

        layout.querySelector('#btn-category-table-prev')?.addEventListener('click', () => {
            if (!this.canMoveCategoryTableBackward()) return;
            this.onChartParamChange({ categoryTableRangeOffset: this.state.categoryTableRangeOffset + 1 });
        });

        layout.querySelector('#btn-category-table-next')?.addEventListener('click', () => {
            if (this.state.categoryTableRangeMode === 'all_time' || this.state.categoryTableRangeOffset === 0) return;
            this.onChartParamChange({ categoryTableRangeOffset: this.state.categoryTableRangeOffset - 1 });
        });

        layout.querySelector('#btn-category-table-range')?.addEventListener('click', () => {
            const cycle: Record<CategoryTableRangeMode, CategoryTableRangeMode> = {
                all_time: 'daily',
                daily: 'weekly',
                weekly: 'monthly',
                monthly: 'all_time'
            };
            this.onChartParamChange({
                categoryTableRangeMode: cycle[this.state.categoryTableRangeMode],
                categoryTableRangeOffset: 0
            });
        });
    }

    private renderCharts(layout: HTMLElement) {
        const barCanvas = layout.querySelector('#barChart') as HTMLCanvasElement | null;
        const pieCanvas = layout.querySelector('#pieChart') as HTMLCanvasElement | null;
        const charsCanvas = layout.querySelector('#charsChart') as HTMLCanvasElement | null;
        if (!barCanvas || !pieCanvas || !charsCanvas) return;

        if (this.pieChartInstance) this.pieChartInstance.destroy();
        if (this.charsChartInstance) this.charsChartInstance.destroy();
        if (this.barChartInstance) this.barChartInstance.destroy();

        const palette = this.getThemeColors();
        const range = this.getTimeRangeContext();
        const filteredLogs = this.getLogsInRange(range.validStart, range.validEnd);
        const { pieGroupByMode, charsGroupByMode, groupByMode, chartType, barMetric } = this.state;
        const isCharsMetric = barMetric === 'chars';

        const pieTypeMap = new Map<string, number>();
        const charsTypeMap = new Map<string, number>();
        const datasetsMap = new Map<string, number[]>();

        for (const log of filteredLogs) {
            const pieKey = pieGroupByMode === 'media_type' ? log.media_type : log.title;
            pieTypeMap.set(pieKey, (pieTypeMap.get(pieKey) || 0) + log.duration_minutes);

            if (log.characters_read > 0 && isReadingContentType(log.content_type)) {
                const charsKey = charsGroupByMode === 'media_type' ? log.content_type : log.title;
                charsTypeMap.set(charsKey, (charsTypeMap.get(charsKey) || 0) + log.characters_read);
            }

            const bucketIndex = range.getBucketIndex(log.date);
            if (bucketIndex === -1) continue;

            const barKey = groupByMode === 'media_type' ? log.media_type : log.title;
            if (!datasetsMap.has(barKey)) datasetsMap.set(barKey, Array(range.labels.length).fill(0));
            datasetsMap.get(barKey)![bucketIndex] += isCharsMetric ? log.characters_read : log.duration_minutes;
        }

        this.pieChartInstance = new Chart(pieCanvas, {
            type: 'doughnut',
            data: {
                labels: Array.from(pieTypeMap.keys()),
                datasets: [{
                    data: Array.from(pieTypeMap.values()),
                    backgroundColor: this.getColorSet(pieTypeMap.size, palette),
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: pieTypeMap.size <= 6, position: 'bottom', labels: { color: '#f0f0f5' } },
                    tooltip: {
                        callbacks: {
                            label: (context: any) => `${context.label}: ${formatDuration(context.parsed)}`
                        }
                    }
                }
            }
        });

        const pieTotalEl = layout.querySelector('#pie-total');
        if (pieTotalEl) {
            const total = Array.from(pieTypeMap.values()).reduce((sum, value) => sum + value, 0);
            pieTotalEl.textContent = `Total: ${formatDuration(total)}`;
        }

        this.charsChartInstance = new Chart(charsCanvas, {
            type: 'doughnut',
            data: {
                labels: Array.from(charsTypeMap.keys()),
                datasets: [{
                    data: Array.from(charsTypeMap.values()),
                    backgroundColor: this.getColorSet(charsTypeMap.size, palette),
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: charsTypeMap.size <= 6, position: 'bottom', labels: { color: '#f0f0f5' } },
                    tooltip: {
                        callbacks: {
                            label: (context: any) => `${context.label}: ${context.parsed.toLocaleString()} 文字`
                        }
                    }
                }
            }
        });

        const charsTotalEl = layout.querySelector('#chars-total');
        if (charsTotalEl) {
            const total = Array.from(charsTypeMap.values()).reduce((sum, value) => sum + value, 0);
            charsTotalEl.textContent = `Total: ${total.toLocaleString()} 文字`;
        }

        const datasets = Array.from(datasetsMap.entries()).map(([key, data], index) => ({
            label: key,
            data,
            backgroundColor: palette[index % palette.length],
            borderColor: palette[index % palette.length],
            fill: chartType === 'line' ? false : undefined,
            tension: 0.3
        }));

        const labelTotals = range.labels.map((_, labelIndex) => {
            let sum = 0;
            for (const dataset of datasets) {
                sum += dataset.data[labelIndex];
            }
            return sum;
        });

        const showBarTotals = chartType === 'bar' && range.labels.length <= 24;

        this.barChartInstance = new Chart(barCanvas, {
            type: chartType,
            data: {
                labels: range.displayLabels,
                datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: {
                    padding: { bottom: showBarTotals ? 28 : 0 }
                },
                scales: {
                    x: {
                        stacked: chartType === 'bar',
                        grid: { color: '#3f3f4e' },
                        ticks: {
                            color: '#a0a0b0',
                            autoSkip: true,
                            maxTicksLimit: this.getMaxTickCount(range.labels.length)
                        }
                    },
                    y: {
                        stacked: chartType === 'bar',
                        beginAtZero: true,
                        grid: { color: '#3f3f4e' },
                        ticks: {
                            color: '#a0a0b0',
                            callback: (value: any) => isCharsMetric ? Number(value).toLocaleString() : formatDuration(Number(value))
                        }
                    }
                },
                plugins: {
                    legend: { display: datasets.length <= 6, position: 'top', labels: { color: '#a0a0b0' } },
                    tooltip: {
                        callbacks: {
                            label: (context: any) => {
                                const value = context.parsed.y;
                                return isCharsMetric
                                    ? `${context.dataset.label}: ${value.toLocaleString()} 文字`
                                    : `${context.dataset.label}: ${formatDuration(value)}`;
                            }
                        }
                    }
                }
            },
            plugins: showBarTotals ? [{
                id: 'barTotals',
                afterDraw: (chart: any) => {
                    const { ctx } = chart;
                    const xAxis = chart.scales.x;
                    const bottomY = chart.chartArea.bottom;
                    ctx.save();
                    ctx.font = '11px Inter, sans-serif';
                    ctx.fillStyle = '#a0a0b0';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'top';
                    for (let i = 0; i < labelTotals.length; i++) {
                        if (labelTotals[i] <= 0) continue;
                        const x = xAxis.getPixelForValue(i);
                        const text = isCharsMetric ? labelTotals[i].toLocaleString() : formatDuration(labelTotals[i]);
                        ctx.fillText(text, x, bottomY + 30);
                    }
                    ctx.restore();
                }
            }] : []
        });
    }

    private getMonthlyStatsRows(year: number): {
        rows: { label: string; chars: number; minutes: number; }[];
        totalChars: number;
        totalMinutes: number;
    } {
        const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const rows = monthLabels.map((label) => ({ label, chars: 0, minutes: 0 }));
        const yearStart = `${year}-01-01`;
        const yearEnd = `${year}-12-31`;

        for (const log of this.state.logs) {
            if (log.date < yearStart || log.date > yearEnd) continue;
            const monthIndex = parseInt(log.date.slice(5, 7), 10) - 1;
            rows[monthIndex].chars += log.characters_read;
            rows[monthIndex].minutes += log.duration_minutes;
        }

        const totalChars = rows.reduce((sum, row) => sum + row.chars, 0);
        const totalMinutes = rows.reduce((sum, row) => sum + row.minutes, 0);
        return { rows, totalChars, totalMinutes };
    }

    private getEarliestLogYear(): number {
        let earliestYear = new Date().getFullYear();

        for (const log of this.state.logs) {
            const year = parseInt(log.date.slice(0, 4), 10);
            if (!Number.isNaN(year) && year < earliestYear) earliestYear = year;
        }

        return earliestYear;
    }

    private getCategoryTableData(): {
        rows: { title: string; chars: number; minutes: number; showChars: boolean; }[];
        totalChars: number;
        totalMinutes: number;
        rangeLabel: string;
        canGoPrev: boolean;
        canGoNext: boolean;
    } {
        const range = this.getCategoryTableRangeContext();
        const categoryMap = new Map<string, { chars: number; minutes: number; showChars: boolean; }>();

        for (const log of this.getLogsInRange(range.validStart, range.validEnd)) {
            const title = log.content_type || 'Unknown';
            if (!categoryMap.has(title)) {
                categoryMap.set(title, {
                    chars: 0,
                    minutes: 0,
                    showChars: isReadingContentType(title)
                });
            }
            const row = categoryMap.get(title)!;
            row.minutes += log.duration_minutes;
            if (row.showChars) row.chars += log.characters_read;
        }

        const rows = Array.from(categoryMap.entries())
            .map(([title, row]) => ({ title, ...row }))
            .sort((a, b) => b.minutes - a.minutes || a.title.localeCompare(b.title));
        const totalChars = rows.reduce((sum, row) => sum + row.chars, 0);
        const totalMinutes = rows.reduce((sum, row) => sum + row.minutes, 0);

        return {
            rows,
            totalChars,
            totalMinutes,
            rangeLabel: range.rangeLabel,
            canGoPrev: this.canMoveCategoryTableBackward(),
            canGoNext: this.state.categoryTableRangeMode !== 'all_time' && this.state.categoryTableRangeOffset > 0
        };
    }

    private getCategoryTableRangeContext(offset = this.state.categoryTableRangeOffset): CategoryTableRangeContext {
        const { categoryTableRangeMode } = this.state;
        const today = new Date();

        if (categoryTableRangeMode === 'all_time') {
            return {
                validStart: '',
                validEnd: '9999-12-31',
                rangeLabel: 'All Time'
            };
        }

        if (categoryTableRangeMode === 'daily') {
            const targetDate = new Date(today);
            targetDate.setDate(today.getDate() - offset);
            const dateStr = this.getLocalISODate(targetDate);
            return {
                validStart: dateStr,
                validEnd: dateStr,
                rangeLabel: dateStr
            };
        }

        if (categoryTableRangeMode === 'weekly') {
            const targetDay = new Date(today);
            targetDay.setDate(today.getDate() - (7 * offset));
            const startDay = this.getWeekStart(targetDay);
            const endDay = new Date(startDay);
            endDay.setDate(startDay.getDate() + 6);

            return {
                validStart: this.getLocalISODate(startDay),
                validEnd: this.getLocalISODate(endDay),
                rangeLabel: `${this.formatCategoryTableRangeDate(startDay)} - ${this.formatCategoryTableRangeDate(endDay)}`
            };
        }

        const targetMonth = new Date(today.getFullYear(), today.getMonth() - offset, 1);
        const startDay = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), 1);
        const endDay = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0);

        return {
            validStart: this.getLocalISODate(startDay),
            validEnd: this.getLocalISODate(endDay),
            rangeLabel: `${this.formatCategoryTableMonthLabel(targetMonth)} ${targetMonth.getFullYear()}`
        };
    }

    private canMoveCategoryTableBackward(): boolean {
        if (this.state.categoryTableRangeMode === 'all_time') return false;

        const earliestDate = this.getEarliestLogDate();
        if (!earliestDate) return false;

        const previousRange = this.getCategoryTableRangeContext(this.state.categoryTableRangeOffset + 1);
        return earliestDate <= previousRange.validEnd;
    }

    private canMoveTimeRangeBackward(): boolean {
        if (this.state.timeRangeMode === 'all_time') return false;

        const earliestDate = this.getEarliestLogDate();
        if (!earliestDate) return false;

        const previousRange = this.getTimeRangeContext(this.state.timeRangeOffset + 1);
        return earliestDate <= previousRange.validEnd;
    }

    private canMoveTimeRangeForward(): boolean {
        return this.state.timeRangeMode !== 'all_time' && this.state.timeRangeOffset > 0;
    }

    private getTimeBucketOptions(): string {
        const modes: { value: TimeBucketMode; label: string }[] = [
            { value: 'day', label: 'Days' },
            { value: 'week', label: 'Weeks' },
            { value: 'month', label: 'Months' },
            { value: 'year', label: 'Years' }
        ];
        return modes.map((mode) => {
            const selected = this.state.timeBucketMode === mode.value ? 'selected' : '';
            return `<option value="${mode.value}" ${selected}>${mode.label}</option>`;
        }).join('');
    }

    private getTimeRangeOptions(): string {
        const modes: { value: TimeRangeMode; label: string }[] = [
            { value: 'week', label: 'in Week' },
            { value: 'month', label: 'in Month' },
            { value: 'year', label: 'in Year' },
            { value: 'all_time', label: 'All Time' }
        ];
        return modes.map((mode) => {
            const selected = this.state.timeRangeMode === mode.value ? 'selected' : '';
            return `<option value="${mode.value}" ${selected}>${mode.label}</option>`;
        }).join('');
    }

    private isValidTimeRange(bucketMode: TimeBucketMode, rangeMode: TimeRangeMode): boolean {
        if (bucketMode === 'day') return rangeMode === 'week' || rangeMode === 'month' || rangeMode === 'year';
        if (bucketMode === 'week') return rangeMode === 'month' || rangeMode === 'year';
        if (bucketMode === 'month') return rangeMode === 'year';
        return rangeMode === 'all_time';
    }

    private getDefaultRangeForBucket(bucketMode: TimeBucketMode, currentRangeMode: TimeRangeMode): TimeRangeMode {
        if (this.isValidTimeRange(bucketMode, currentRangeMode)) return currentRangeMode;
        if (bucketMode === 'day') return 'week';
        if (bucketMode === 'week') return 'month';
        if (bucketMode === 'month') return 'year';
        return 'all_time';
    }

    private getDefaultBucketForRange(rangeMode: TimeRangeMode, currentBucketMode: TimeBucketMode): TimeBucketMode {
        if (this.isValidTimeRange(currentBucketMode, rangeMode)) return currentBucketMode;
        if (rangeMode === 'week') return 'day';
        if (rangeMode === 'month') return 'week';
        if (rangeMode === 'year') return 'month';
        return 'year';
    }

    private getCategoryTableRangeModeLabel(mode: CategoryTableRangeMode): string {
        if (mode === 'daily') return 'Daily';
        if (mode === 'weekly') return 'Weekly';
        if (mode === 'monthly') return 'Monthly';
        return 'All Time';
    }

    private formatCategoryTableRangeDate(date: Date): string {
        const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${monthLabels[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
    }

    private formatCategoryTableMonthLabel(date: Date): string {
        const monthLabels = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        return monthLabels[date.getMonth()];
    }

    private formatDecimalHours(totalMinutes: number): string {
        return (totalMinutes / 60).toLocaleString(undefined, {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1
        });
    }

    private getTimeRangeContext(offset = this.state.timeRangeOffset): TimeRangeContext {
        const { logs } = this.state;
        const timeRangeMode = this.getDefaultRangeForBucket(this.state.timeBucketMode, this.state.timeRangeMode);
        const timeBucketMode = this.getDefaultBucketForRange(timeRangeMode, this.state.timeBucketMode);
        const today = new Date();

        if (timeRangeMode === 'all_time') {
            const years = new Set<number>();
            for (const log of logs) {
                years.add(parseInt(log.date.slice(0, 4), 10));
            }
            const sortedYears = Array.from(years).sort((a, b) => a - b);
            const yearIndex = new Map(sortedYears.map((year, index) => [year, index]));
            const labels = sortedYears.map((year) => String(year));

            return {
                validStart: '',
                validEnd: '9999-12-31',
                labels,
                displayLabels: labels,
                getBucketIndex: (dateStr: string) => yearIndex.get(parseInt(dateStr.slice(0, 4), 10)) ?? -1
            };
        }

        if (timeRangeMode === 'week') {
            const targetDate = new Date(today);
            targetDate.setDate(today.getDate() - (7 * offset));
            const startDay = this.getWeekStart(targetDate);
            const endDay = new Date(startDay);
            endDay.setDate(startDay.getDate() + 6);

            const labels: string[] = [];
            const indexByLabel = new Map<string, number>();
            for (let i = 0; i < 7; i++) {
                const day = new Date(startDay);
                day.setDate(startDay.getDate() + i);
                const label = this.getLocalISODate(day);
                indexByLabel.set(label, labels.length);
                labels.push(label);
            }

            return {
                validStart: this.getLocalISODate(startDay),
                validEnd: this.getLocalISODate(endDay),
                labels,
                displayLabels: labels.map((label) => label.slice(5)),
                getBucketIndex: (dateStr: string) => indexByLabel.get(dateStr) ?? -1
            };
        }

        if (timeRangeMode === 'month') {
            const targetMonth = new Date(today.getFullYear(), today.getMonth() - offset, 1);
            const startDay = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), 1);
            const endDay = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0);

            if (timeBucketMode === 'day') {
                const labels: string[] = [];
                const indexByLabel = new Map<string, number>();

                for (let cursor = new Date(startDay); cursor <= endDay; cursor.setDate(cursor.getDate() + 1)) {
                    const label = this.getLocalISODate(cursor);
                    labels.push(label);
                    indexByLabel.set(label, labels.length - 1);
                }

                return {
                    validStart: this.getLocalISODate(startDay),
                    validEnd: this.getLocalISODate(endDay),
                    labels,
                    displayLabels: labels.map((label) => label.slice(5)),
                    getBucketIndex: (dateStr: string) => indexByLabel.get(dateStr) ?? -1
                };
            }

            const firstBucketStart = this.getWeekStart(startDay);
            const lastBucketStart = this.getWeekStart(endDay);
            const labels: string[] = [];
            const displayLabels: string[] = [];
            const indexByLabel = new Map<string, number>();

            for (let cursor = new Date(firstBucketStart); cursor <= lastBucketStart; cursor.setDate(cursor.getDate() + 7)) {
                const bucketStart = new Date(cursor);
                const bucketEnd = new Date(cursor);
                bucketEnd.setDate(bucketEnd.getDate() + 6);
                const key = this.getLocalISODate(bucketStart);
                labels.push(key);
                displayLabels.push(`${this.getShortMonthDay(bucketStart)}-${this.getShortMonthDay(bucketEnd)}`);
                indexByLabel.set(key, labels.length - 1);
            }

            return {
                validStart: this.getLocalISODate(startDay),
                validEnd: this.getLocalISODate(endDay),
                labels,
                displayLabels,
                getBucketIndex: (dateStr: string) => {
                    if (dateStr < this.getLocalISODate(startDay) || dateStr > this.getLocalISODate(endDay)) return -1;
                    const bucketKey = this.getLocalISODate(this.getWeekStart(this.parseLocalDate(dateStr)));
                    return indexByLabel.get(bucketKey) ?? -1;
                }
            };
        }

        const targetYear = today.getFullYear() - offset;
        const yearStart = `${targetYear}-01-01`;
        const yearEnd = `${targetYear}-12-31`;

        if (timeBucketMode === 'day') {
            const startDay = new Date(targetYear, 0, 1);
            const endDay = new Date(targetYear, 11, 31);
            const labels: string[] = [];
            const indexByLabel = new Map<string, number>();

            for (let cursor = new Date(startDay); cursor <= endDay; cursor.setDate(cursor.getDate() + 1)) {
                const label = this.getLocalISODate(cursor);
                labels.push(label);
                indexByLabel.set(label, labels.length - 1);
            }

            return {
                validStart: yearStart,
                validEnd: yearEnd,
                labels,
                displayLabels: labels.map((label) => label.slice(5)),
                getBucketIndex: (dateStr: string) => indexByLabel.get(dateStr) ?? -1
            };
        }

        if (timeBucketMode === 'week') {
            const startDay = new Date(targetYear, 0, 1);
            const endDay = new Date(targetYear, 11, 31);
            const firstBucketStart = this.getWeekStart(startDay);
            const lastBucketStart = this.getWeekStart(endDay);
            const labels: string[] = [];
            const displayLabels: string[] = [];
            const indexByLabel = new Map<string, number>();

            for (let cursor = new Date(firstBucketStart); cursor <= lastBucketStart; cursor.setDate(cursor.getDate() + 7)) {
                const bucketStart = new Date(cursor);
                const key = this.getLocalISODate(bucketStart);
                labels.push(key);
                displayLabels.push(this.getShortMonthDay(bucketStart));
                indexByLabel.set(key, labels.length - 1);
            }

            return {
                validStart: yearStart,
                validEnd: yearEnd,
                labels,
                displayLabels,
                getBucketIndex: (dateStr: string) => {
                    if (dateStr < yearStart || dateStr > yearEnd) return -1;
                    const bucketKey = this.getLocalISODate(this.getWeekStart(this.parseLocalDate(dateStr)));
                    return indexByLabel.get(bucketKey) ?? -1;
                }
            };
        }

        const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return {
            validStart: yearStart,
            validEnd: yearEnd,
            labels,
            displayLabels: labels,
            getBucketIndex: (dateStr: string) => {
                if (dateStr < yearStart || dateStr > yearEnd) return -1;
                return parseInt(dateStr.slice(5, 7), 10) - 1;
            }
        };
    }

    private getLogsInRange(validStart: string, validEnd: string): ActivitySummary[] {
        if (!validStart) return this.state.logs;
        return this.state.logs.filter((log) => log.date >= validStart && log.date <= validEnd);
    }

    private getThemeColors(): string[] {
        const style = getComputedStyle(document.body);
        const base = [
            style.getPropertyValue('--chart-1').trim() || '#f4a6b8',
            style.getPropertyValue('--chart-2').trim() || '#b8cdda',
            style.getPropertyValue('--chart-3').trim() || '#e0bbe4',
            style.getPropertyValue('--chart-4').trim() || '#957DAD',
            style.getPropertyValue('--chart-5').trim() || '#D291BC'
        ];

        const variants = [
            { hueShift: 0, lightnessShift: 0, saturationShift: 0 },
            { hueShift: 14, lightnessShift: 8, saturationShift: 6 },
            { hueShift: -14, lightnessShift: -8, saturationShift: 4 },
            { hueShift: 28, lightnessShift: 12, saturationShift: -2 },
            { hueShift: -28, lightnessShift: -12, saturationShift: 10 },
            { hueShift: 42, lightnessShift: 6, saturationShift: 12 },
            { hueShift: -42, lightnessShift: -4, saturationShift: -6 },
            { hueShift: 60, lightnessShift: 14, saturationShift: 2 },
            { hueShift: -60, lightnessShift: -14, saturationShift: 8 },
            { hueShift: 84, lightnessShift: 4, saturationShift: -10 }
        ];

        const palette: string[] = [];
        for (const variant of variants) {
            for (const color of base) {
                palette.push(this.adjustColor(color, variant.hueShift, variant.lightnessShift, variant.saturationShift));
            }
        }

        return palette;
    }

    private getColorSet(count: number, palette: string[]): string[] {
        const colors: string[] = [];
        for (let i = 0; i < count; i++) {
            colors.push(palette[i % palette.length]);
        }
        return colors;
    }

    private adjustColor(color: string, hueShift: number, lightnessShift: number, saturationShift: number): string {
        const rgb = this.resolveColor(color);
        const hsl = this.rgbToHsl(rgb.r, rgb.g, rgb.b);
        const hue = (hsl.h + hueShift + 360) % 360;
        const saturation = this.clamp(hsl.s + saturationShift, 25, 95);
        const lightness = this.clamp(hsl.l + lightnessShift, 22, 78);
        const adjusted = this.hslToRgb(hue, saturation, lightness);
        return `rgb(${adjusted.r}, ${adjusted.g}, ${adjusted.b})`;
    }

    private resolveColor(color: string): { r: number; g: number; b: number } {
        const probe = document.createElement('div');
        probe.style.color = color;
        probe.style.display = 'none';
        document.body.appendChild(probe);
        const resolved = getComputedStyle(probe).color;
        probe.remove();

        const match = resolved.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (!match) return { r: 127, g: 127, b: 127 };
        return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) };
    }

    private rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
        const red = r / 255;
        const green = g / 255;
        const blue = b / 255;
        const max = Math.max(red, green, blue);
        const min = Math.min(red, green, blue);
        const lightness = (max + min) / 2;
        const delta = max - min;

        if (delta === 0) {
            return { h: 0, s: 0, l: lightness * 100 };
        }

        const saturation = lightness > 0.5
            ? delta / (2 - max - min)
            : delta / (max + min);

        let hue = 0;
        switch (max) {
            case red:
                hue = ((green - blue) / delta + (green < blue ? 6 : 0)) * 60;
                break;
            case green:
                hue = ((blue - red) / delta + 2) * 60;
                break;
            default:
                hue = ((red - green) / delta + 4) * 60;
                break;
        }

        return { h: hue, s: saturation * 100, l: lightness * 100 };
    }

    private hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
        const saturation = s / 100;
        const lightness = l / 100;
        const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
        const huePrime = h / 60;
        const x = chroma * (1 - Math.abs((huePrime % 2) - 1));

        let red = 0;
        let green = 0;
        let blue = 0;

        if (huePrime >= 0 && huePrime < 1) {
            red = chroma; green = x;
        } else if (huePrime < 2) {
            red = x; green = chroma;
        } else if (huePrime < 3) {
            green = chroma; blue = x;
        } else if (huePrime < 4) {
            green = x; blue = chroma;
        } else if (huePrime < 5) {
            red = x; blue = chroma;
        } else {
            red = chroma; blue = x;
        }

        const match = lightness - chroma / 2;
        return {
            r: Math.round((red + match) * 255),
            g: Math.round((green + match) * 255),
            b: Math.round((blue + match) * 255)
        };
    }

    private getMaxTickCount(labelCount: number): number {
        if (labelCount > 200) return 16;
        if (labelCount > 60) return 14;
        if (labelCount > 24) return 12;
        return 10;
    }

    private getEarliestLogDate(): string {
        let earliestDate = '';
        for (const log of this.state.logs) {
            if (!earliestDate || log.date < earliestDate) earliestDate = log.date;
        }
        return earliestDate;
    }

    private getWeekStart(date: Date): Date {
        const weekStart = new Date(date);
        const day = weekStart.getDay();
        const diffToMonday = day === 0 ? 6 : day - 1;
        weekStart.setDate(weekStart.getDate() - diffToMonday);
        weekStart.setHours(0, 0, 0, 0);
        return weekStart;
    }

    private getShortMonthDay(date: Date): string {
        return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
    }

    private parseLocalDate(dateStr: string): Date {
        return new Date(`${dateStr}T00:00:00`);
    }

    private getLocalISODate(date: Date): string {
        const pad = (value: number) => value.toString().padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }

    private clamp(value: number, min: number, max: number): number {
        return Math.min(max, Math.max(min, value));
    }

    public destroy() {
        if (this.pieChartInstance) this.pieChartInstance.destroy();
        if (this.charsChartInstance) this.charsChartInstance.destroy();
        if (this.barChartInstance) this.barChartInstance.destroy();
    }
}
