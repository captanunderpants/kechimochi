import { Component } from '../../core/component';
import { escapeHTML, html } from '../../core/html';
import { ActivitySummary, formatDuration } from '../../api';
import { isReadingContentType } from '../../modals/activity';
import Chart from 'chart.js/auto';

interface ActivityChartsState {
    logs: ActivitySummary[];
    timeRangeDays: number;
    timeRangeOffset: number;
    groupByMode: 'media_type' | 'log_name';
    pieGroupByMode: 'media_type' | 'log_name';
    charsGroupByMode: 'media_type' | 'log_name';
    chartType: 'bar' | 'line';
    barMetric: 'time' | 'chars';
    monthlyStatsYear: number;
    categoryTableRangeMode: 'daily' | 'weekly' | 'monthly' | 'all_time';
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

        const chartsLayout = html`
            <div style="display: flex; flex-direction: column; gap: 1.25rem;">
                <div class="dashboard-top-analytics-row">
                    <div class="card dashboard-activity-hero-card">
                        <div style="display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem;">
                            <div style="display: flex; align-items: center; gap: 0.5rem;">
                                <button class="btn btn-ghost" style="padding: 0.1rem 0.4rem; ${this.state.timeRangeDays === 0 ? 'opacity: 0.3; cursor: default;' : ''}" id="btn-chart-prev">&lt;</button>
                                <h3 style="margin: 0;">Activity Visualization</h3>
                                <button class="btn btn-ghost" style="padding: 0.1rem 0.4rem; ${this.state.timeRangeOffset === 0 || this.state.timeRangeDays === 0 ? 'opacity: 0.3; cursor: default;' : ''}" id="btn-chart-next">&gt;</button>
                            </div>
                            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                                <button class="btn btn-ghost btn-cycle" id="btn-bar-metric" style="font-size: 0.8rem; padding: 0.3rem 0.6rem;">${this.state.barMetric === 'time' ? 'Time' : '文字'}</button>
                                <button class="btn btn-ghost btn-cycle" id="btn-chart-type" style="font-size: 0.8rem; padding: 0.3rem 0.6rem;">${this.state.chartType === 'bar' ? 'Bar' : 'Line'}</button>
                                <button class="btn btn-ghost btn-cycle" id="btn-time-range" style="font-size: 0.8rem; padding: 0.3rem 0.6rem;">${this.state.timeRangeDays === 7 ? 'Weekly' : this.state.timeRangeDays === 30 ? 'Monthly' : this.state.timeRangeDays === 365 ? 'Yearly' : 'All Time'}</button>
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
        const { logs, timeRangeDays, timeRangeOffset } = this.state;

        let earliestDate = '';
        for (const log of logs) {
            if (!earliestDate || log.date < earliestDate) earliestDate = log.date;
        }

        const prevBtn = layout.querySelector('#btn-chart-prev') as HTMLElement | null;

        if (prevBtn && earliestDate) {
            const today = new Date();
            let wouldBeEmpty = false;
            if (timeRangeDays === 0) {
                wouldBeEmpty = true;
            } else if (timeRangeDays === 7) {
                const endDay = new Date(today);
                endDay.setDate(today.getDate() - (7 * (timeRangeOffset + 1)));
                const startDay = new Date(endDay);
                const dow = endDay.getDay();
                const diff = dow === 0 ? 6 : dow - 1;
                startDay.setDate(endDay.getDate() - diff);
                const endStr = this.getLocalISODate(startDay);
                wouldBeEmpty = earliestDate > endStr;
            } else if (timeRangeDays === 30) {
                const targetMonth = new Date(today.getFullYear(), today.getMonth() - (timeRangeOffset + 1), 1);
                const endOfMonth = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0);
                const endStr = this.getLocalISODate(endOfMonth);
                wouldBeEmpty = earliestDate > endStr;
            } else if (timeRangeDays === 365) {
                const targetYear = today.getFullYear() - (timeRangeOffset + 1);
                wouldBeEmpty = earliestDate > `${targetYear}-12-31`;
            }
            if (wouldBeEmpty) {
                prevBtn.style.opacity = '0.3';
                prevBtn.style.cursor = 'default';
            }
        }

        layout.querySelector('#btn-chart-prev')?.addEventListener('click', () => {
            if (this.state.timeRangeDays !== 0) {
                this.onChartParamChange({ timeRangeOffset: this.state.timeRangeOffset + 1 });
            }
        });

        layout.querySelector('#btn-chart-next')?.addEventListener('click', () => {
            if (this.state.timeRangeOffset > 0 && this.state.timeRangeDays !== 0) {
                this.onChartParamChange({ timeRangeOffset: this.state.timeRangeOffset - 1 });
            }
        });

        layout.querySelector('#btn-chart-type')?.addEventListener('click', () => {
            this.onChartParamChange({ chartType: this.state.chartType === 'bar' ? 'line' : 'bar' });
        });

        layout.querySelector('#btn-time-range')?.addEventListener('click', () => {
            const cycle: Record<number, number> = { 7: 30, 30: 365, 365: 0, 0: 7 };
            this.onChartParamChange({ timeRangeDays: cycle[this.state.timeRangeDays] ?? 7, timeRangeOffset: 0 });
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
            const cycle: Record<ActivityChartsState['categoryTableRangeMode'], ActivityChartsState['categoryTableRangeMode']> = {
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

        const colors = this.getThemeColors();
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
            if (bucketIndex !== -1) {
                const barKey = groupByMode === 'media_type' ? log.media_type : log.title;
                if (!datasetsMap.has(barKey)) datasetsMap.set(barKey, Array(range.labels.length).fill(0));
                datasetsMap.get(barKey)![bucketIndex] += isCharsMetric ? log.characters_read : log.duration_minutes;
            }
        }

        this.pieChartInstance = new Chart(pieCanvas, {
            type: 'doughnut',
            data: {
                labels: Array.from(pieTypeMap.keys()),
                datasets: [{
                    data: Array.from(pieTypeMap.values()),
                    backgroundColor: colors,
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

        let pieTotalMinutes = 0;
        pieTypeMap.forEach((value) => {
            pieTotalMinutes += value;
        });
        const pieTotalEl = layout.querySelector('#pie-total');
        if (pieTotalEl) pieTotalEl.textContent = `Total: ${formatDuration(pieTotalMinutes)}`;

        this.charsChartInstance = new Chart(charsCanvas, {
            type: 'doughnut',
            data: {
                labels: Array.from(charsTypeMap.keys()),
                datasets: [{
                    data: Array.from(charsTypeMap.values()),
                    backgroundColor: colors,
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

        let charsTotalCount = 0;
        charsTypeMap.forEach((value) => {
            charsTotalCount += value;
        });
        const charsTotalEl = layout.querySelector('#chars-total');
        if (charsTotalEl) charsTotalEl.textContent = `Total: ${charsTotalCount.toLocaleString()} 文字`;

        const datasets = Array.from(datasetsMap.entries()).map(([key, data], index) => ({
            label: key,
            data,
            backgroundColor: colors[index % colors.length],
            borderColor: colors[index % colors.length],
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
                    padding: { bottom: chartType === 'bar' ? 28 : 0 }
                },
                scales: {
                    x: { stacked: chartType === 'bar', grid: { color: '#3f3f4e' }, ticks: { color: '#a0a0b0' } },
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
            plugins: chartType === 'bar' ? [{
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
                        if (labelTotals[i] > 0) {
                            const x = xAxis.getPixelForValue(i);
                            const text = isCharsMetric ? labelTotals[i].toLocaleString() : formatDuration(labelTotals[i]);
                            ctx.fillText(text, x, bottomY + 30);
                        }
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
            const startDay = new Date(targetDay);
            const dayOfWeek = targetDay.getDay();
            const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
            startDay.setDate(targetDay.getDate() - diffToMonday);
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

        let earliestDate = '';
        for (const log of this.state.logs) {
            if (!earliestDate || log.date < earliestDate) earliestDate = log.date;
        }
        if (!earliestDate) return false;

        const previousRange = this.getCategoryTableRangeContext(this.state.categoryTableRangeOffset + 1);
        return earliestDate <= previousRange.validEnd;
    }

    private getCategoryTableRangeModeLabel(mode: ActivityChartsState['categoryTableRangeMode']): string {
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

    private getTimeRangeContext(): TimeRangeContext {
        const { logs, timeRangeDays, timeRangeOffset } = this.state;
        const today = new Date();

        if (timeRangeDays === 0) {
            const years = new Set<number>();
            for (const log of logs) {
                years.add(parseInt(log.date.split('-')[0], 10));
            }
            const sortedYears = Array.from(years).sort((a, b) => a - b);
            const labels = sortedYears.map((year) => String(year));
            return {
                validStart: '',
                validEnd: '9999-12-31',
                labels,
                displayLabels: labels,
                getBucketIndex: (dateStr: string) => {
                    const year = parseInt(dateStr.split('-')[0], 10);
                    return sortedYears.indexOf(year);
                }
            };
        }

        if (timeRangeDays === 7) {
            const endDay = new Date(today);
            endDay.setDate(today.getDate() - (7 * timeRangeOffset));
            const startDay = new Date(endDay);
            const dayOfWeek = endDay.getDay();
            const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
            startDay.setDate(endDay.getDate() - diffToMonday);
            endDay.setDate(startDay.getDate() + 6);

            const labels: string[] = [];
            for (let i = 0; i < 7; i++) {
                const date = new Date(startDay);
                date.setDate(startDay.getDate() + i);
                labels.push(this.getLocalISODate(date));
            }

            return {
                validStart: this.getLocalISODate(startDay),
                validEnd: this.getLocalISODate(endDay),
                labels,
                displayLabels: labels.map((label) => label.slice(5)),
                getBucketIndex: (dateStr: string) => labels.indexOf(dateStr)
            };
        }

        if (timeRangeDays === 30) {
            const targetMonth = new Date(today.getFullYear(), today.getMonth() - timeRangeOffset, 1);
            const year = targetMonth.getFullYear();
            const month = targetMonth.getMonth();
            const startDay = new Date(year, month, 1);
            const endDay = new Date(year, month + 1, 0);
            const totalDays = endDay.getDate();
            const weeksCount = Math.ceil(totalDays / 7);
            const labels = Array.from({ length: weeksCount }, (_, index) => `Week ${index + 1}`);

            return {
                validStart: this.getLocalISODate(startDay),
                validEnd: this.getLocalISODate(endDay),
                labels,
                displayLabels: labels,
                getBucketIndex: (dateStr: string) => {
                    if (dateStr < this.getLocalISODate(startDay) || dateStr > this.getLocalISODate(endDay)) return -1;
                    const date = new Date(dateStr + 'T00:00:00');
                    const firstDayWeekday = startDay.getDay();
                    const offset = firstDayWeekday === 0 ? 6 : firstDayWeekday - 1;
                    return Math.floor((date.getDate() + offset - 1) / 7);
                }
            };
        }

        const targetYear = today.getFullYear() - timeRangeOffset;
        const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return {
            validStart: `${targetYear}-01-01`,
            validEnd: `${targetYear}-12-31`,
            labels,
            displayLabels: labels,
            getBucketIndex: (dateStr: string) => {
                if (dateStr < `${targetYear}-01-01` || dateStr > `${targetYear}-12-31`) return -1;
                return parseInt(dateStr.split('-')[1], 10) - 1;
            }
        };
    }

    private getLogsInRange(validStart: string, validEnd: string): ActivitySummary[] {
        if (!validStart) return this.state.logs;
        return this.state.logs.filter((log) => log.date >= validStart && log.date <= validEnd);
    }

    private getThemeColors(): string[] {
        const style = getComputedStyle(document.body);
        return [
            style.getPropertyValue('--chart-1').trim() || '#f4a6b8',
            style.getPropertyValue('--chart-2').trim() || '#b8cdda',
            style.getPropertyValue('--chart-3').trim() || '#e0bbe4',
            style.getPropertyValue('--chart-4').trim() || '#957DAD',
            style.getPropertyValue('--chart-5').trim() || '#D291BC'
        ];
    }

    private getLocalISODate(date: Date): string {
        const pad = (value: number) => value.toString().padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }

    public destroy() {
        if (this.pieChartInstance) this.pieChartInstance.destroy();
        if (this.charsChartInstance) this.charsChartInstance.destroy();
        if (this.barChartInstance) this.barChartInstance.destroy();
    }
}
