import { Component } from '../../core/component';
import { html } from '../../core/html';
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
}

export class ActivityCharts extends Component<ActivityChartsState> {
    private pieChartInstance: Chart | null = null;
    private charsChartInstance: Chart | null = null;
    private barChartInstance: Chart | null = null;
    private cumulativeChartInstance: Chart | null = null;
    private radarChartInstance: Chart | null = null;
    private speedChartInstance: Chart | null = null;
    private onChartParamChange: (params: Partial<ActivityChartsState>) => void;

    constructor(container: HTMLElement, initialState: ActivityChartsState, onChartParamChange: (params: Partial<ActivityChartsState>) => void) {
        super(container, initialState);
        this.onChartParamChange = onChartParamChange;
    }

    render() {
        this.clear();
        
        const chartsLayout = html`
            <div style="display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 2fr); gap: 2rem;">
                <div class="card" style="display: flex; flex-direction: column; min-width: 0;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                        <h3 style="margin: 0;">Activity Breakdown</h3>
                        <button class="btn btn-ghost btn-cycle" id="btn-pie-toggle" style="font-size: 0.75rem; padding: 0.2rem 0.5rem;">${this.state.pieGroupByMode === 'media_type' ? 'By Type' : 'By Media'}</button>
                    </div>
                    <div class="chart-container-wrapper" style="flex: 1; min-height: 0;">
                        <canvas id="pieChart"></canvas>
                    </div>
                    <div id="pie-total" style="text-align: center; margin-top: 0.5rem; font-size: 0.85rem; font-weight: 600; color: var(--text-secondary);"></div>
                </div>
                <div class="card" style="display: flex; flex-direction: column; min-width: 0;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                        <h3 style="margin: 0; font-size: 0.95rem;">Characters Read</h3>
                        <button class="btn btn-ghost btn-cycle" id="btn-chars-toggle" style="font-size: 0.75rem; padding: 0.2rem 0.5rem;">${this.state.charsGroupByMode === 'media_type' ? 'By Type' : 'By Media'}</button>
                    </div>
                    <div class="chart-container-wrapper" style="flex: 1; min-height: 0;">
                        <canvas id="charsChart"></canvas>
                    </div>
                    <div id="chars-total" style="text-align: center; margin-top: 0.5rem; font-size: 0.85rem; font-weight: 600; color: var(--text-secondary);"></div>
                </div>
                <div class="card" style="display: flex; flex-direction: column; min-width: 0;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <button class="btn btn-ghost" style="padding: 0.1rem 0.4rem;" id="btn-chart-prev">&lt;</button>
                            <h3 style="margin: 0;">Activity visualization</h3>
                            <button class="btn btn-ghost" style="padding: 0.1rem 0.4rem; ${this.state.timeRangeOffset === 0 ? 'opacity: 0.3; cursor: default;' : ''}" id="btn-chart-next">&gt;</button>
                        </div>
                        <div style="display: flex; gap: 0.5rem;">
                            <button class="btn btn-ghost btn-cycle" id="btn-bar-metric" style="font-size: 0.8rem; padding: 0.3rem 0.6rem;">${this.state.barMetric === 'time' ? 'Time' : '文字'}</button>
                            <button class="btn btn-ghost btn-cycle" id="btn-chart-type" style="font-size: 0.8rem; padding: 0.3rem 0.6rem;">${this.state.chartType === 'bar' ? 'Bar' : 'Line'}</button>
                            <button class="btn btn-ghost btn-cycle" id="btn-time-range" style="font-size: 0.8rem; padding: 0.3rem 0.6rem;">${this.state.timeRangeDays === 7 ? 'Weekly' : this.state.timeRangeDays === 30 ? 'Monthly' : 'Yearly'}</button>
                            <button class="btn btn-ghost btn-cycle" id="btn-group-by" style="font-size: 0.8rem; padding: 0.3rem 0.6rem;">${this.state.groupByMode === 'media_type' ? 'By Type' : 'By Media'}</button>
                        </div>
                    </div>
                    <div class="chart-container-wrapper" style="flex: 1; min-height: 0;">
                        <canvas id="barChart"></canvas>
                    </div>
                </div>
            </div>
        `;

        this.container.appendChild(chartsLayout);

        const bottomRow = html`
            <div style="display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr); gap: 2rem; margin-top: 2rem;">
                <div class="card" style="display: flex; flex-direction: column; min-width: 0;">
                    <h3 style="text-align: center; margin-bottom: 1rem; font-size: 0.95rem;">Cumulative Hours</h3>
                    <div class="chart-container-wrapper" style="flex: 1; min-height: 0;">
                        <canvas id="cumulativeChart"></canvas>
                    </div>
                </div>
                <div class="card" style="display: flex; flex-direction: column; min-width: 0;">
                    <h3 style="text-align: center; margin-bottom: 1rem; font-size: 0.95rem;">Activity by Day of Week</h3>
                    <div class="chart-container-wrapper" style="flex: 1; min-height: 0;">
                        <canvas id="radarChart"></canvas>
                    </div>
                </div>
                <div class="card" style="display: flex; flex-direction: column; min-width: 0;">
                    <h3 style="text-align: center; margin-bottom: 1rem; font-size: 0.95rem;">Reading Speed Over Time</h3>
                    <div class="chart-container-wrapper" style="flex: 1; min-height: 0;">
                        <canvas id="speedChart"></canvas>
                    </div>
                </div>
            </div>
        `;
        this.container.appendChild(bottomRow);

        this.setupListeners(chartsLayout);
        this.renderCharts(chartsLayout);
        this.renderBottomCharts(bottomRow);
    }

    private setupListeners(layout: HTMLElement) {
        const { logs, timeRangeDays, timeRangeOffset } = this.state;

        // Find earliest log date to determine left arrow bound
        let earliestDate = '';
        for (const log of logs) {
            if (!earliestDate || log.date < earliestDate) earliestDate = log.date;
        }

        const prevBtn = layout.querySelector('#btn-chart-prev') as HTMLElement | null;

        // Check if going back one more would be past the earliest data
        if (prevBtn && earliestDate) {
            const today = new Date();
            let wouldBeEmpty = false;
            if (timeRangeDays === 7) {
                const endDay = new Date(today);
                endDay.setDate(today.getDate() - (7 * (timeRangeOffset + 1)));
                const startDay = new Date(endDay);
                const dow = endDay.getDay();
                const diff = dow === 0 ? 6 : dow - 1;
                startDay.setDate(endDay.getDate() - diff);
                const pad = (n: number) => n.toString().padStart(2, '0');
                const endStr = `${startDay.getFullYear()}-${pad(startDay.getMonth() + 1)}-${pad(startDay.getDate())}`;
                wouldBeEmpty = earliestDate > endStr;
            } else if (timeRangeDays === 30) {
                const targetMonth = new Date(today.getFullYear(), today.getMonth() - (timeRangeOffset + 1), 1);
                const endOfMonth = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0);
                const pad = (n: number) => n.toString().padStart(2, '0');
                const endStr = `${endOfMonth.getFullYear()}-${pad(endOfMonth.getMonth() + 1)}-${pad(endOfMonth.getDate())}`;
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
             this.onChartParamChange({ timeRangeOffset: this.state.timeRangeOffset + 1 });
        });
        layout.querySelector('#btn-chart-next')?.addEventListener('click', () => {
            if (this.state.timeRangeOffset > 0) {
                this.onChartParamChange({ timeRangeOffset: this.state.timeRangeOffset - 1 });
            }
        });
        layout.querySelector('#btn-chart-type')?.addEventListener('click', () => {
            this.onChartParamChange({ chartType: this.state.chartType === 'bar' ? 'line' : 'bar' });
        });
        layout.querySelector('#btn-time-range')?.addEventListener('click', () => {
            const cycle: Record<number, number> = { 7: 30, 30: 365, 365: 7 };
            this.onChartParamChange({ timeRangeDays: cycle[this.state.timeRangeDays] || 7, timeRangeOffset: 0 });
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
    }

    private renderCharts(layout: HTMLElement) {
        const pieCanvas = layout.querySelector('#pieChart') as HTMLCanvasElement;
        const charsCanvas = layout.querySelector('#charsChart') as HTMLCanvasElement;
        const barCanvas = layout.querySelector('#barChart') as HTMLCanvasElement;
        if (!pieCanvas || !barCanvas || !charsCanvas) return;

        if (this.pieChartInstance) this.pieChartInstance.destroy();
        if (this.charsChartInstance) this.charsChartInstance.destroy();
        if (this.barChartInstance) this.barChartInstance.destroy();

        const style = getComputedStyle(document.body);
        const colors = [
          style.getPropertyValue('--chart-1').trim() || '#f4a6b8',
          style.getPropertyValue('--chart-2').trim() || '#b8cdda',
          style.getPropertyValue('--chart-3').trim() || '#e0bbe4',
          style.getPropertyValue('--chart-4').trim() || '#957DAD',
          style.getPropertyValue('--chart-5').trim() || '#D291BC'
        ];

        const { logs, timeRangeDays, timeRangeOffset, groupByMode, chartType } = this.state;
        const barMetric = this.state.barMetric;
        const isCharsMetric = barMetric === 'chars';
        
        let labels: string[] = [];
        let getBucketIndex: (dateStr: string) => number = () => -1;
        let validStart = '';
        let validEnd = '';
        const getLocalISODate = (d: Date) => {
            const pad = (n: number) => n.toString().padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        };

        const today = new Date();
        if (timeRangeDays === 7) {
            const endDay = new Date(today);
            endDay.setDate(today.getDate() - (7 * timeRangeOffset));
            const startDay = new Date(endDay);
            const dayOfWeek = endDay.getDay(); 
            const diffToMonday = (dayOfWeek === 0 ? 6 : dayOfWeek - 1);
            startDay.setDate(endDay.getDate() - diffToMonday);
            endDay.setDate(startDay.getDate() + 6);
            validStart = getLocalISODate(startDay);
            validEnd = getLocalISODate(endDay);
            for(let i = 0; i < 7; i++) {
                const d = new Date(startDay);
                d.setDate(startDay.getDate() + i);
                labels.push(getLocalISODate(d));
            }
            getBucketIndex = (dateStr: string) => labels.indexOf(dateStr);
        } else if (timeRangeDays === 30) {
            const targetMonth = new Date(today.getFullYear(), today.getMonth() - timeRangeOffset, 1);
            const y = targetMonth.getFullYear();
            const m = targetMonth.getMonth();
            const startDay = new Date(y, m, 1);
            const endDay = new Date(y, m + 1, 0);
            validStart = getLocalISODate(startDay);
            validEnd = getLocalISODate(endDay);
            const totalDays = endDay.getDate();
            const weeksCount = Math.ceil(totalDays / 7);
            for(let i=0; i<weeksCount; i++) labels.push(`Week ${i+1}`);
            getBucketIndex = (dateStr: string) => {
                if (dateStr >= validStart && dateStr <= validEnd) {
                    const date = new Date(dateStr + "T00:00:00");
                    const firstOfMonth = new Date(y, m, 1);
                    const firstDayWeekday = firstOfMonth.getDay();
                    const offset = (firstDayWeekday === 0 ? 6 : firstDayWeekday - 1);
                    return Math.floor((date.getDate() + offset - 1) / 7);
                }
                return -1;
            };
        } else if (timeRangeDays === 365) {
            const targetYear = today.getFullYear() - timeRangeOffset;
            validStart = `${targetYear}-01-01`;
            validEnd = `${targetYear}-12-31`;
            labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            getBucketIndex = (dateStr: string) => {
                if (dateStr >= validStart && dateStr <= validEnd) {
                    return parseInt(dateStr.split('-')[1]) - 1;
                }
                return -1;
            };
        }

        const { pieGroupByMode, charsGroupByMode } = this.state;
        const pieTypeMap = new Map<string, number>();
        for (const log of logs) {
            if (log.date >= validStart && log.date <= validEnd) {
                const key = pieGroupByMode === 'media_type' ? log.media_type : log.title;
                pieTypeMap.set(key, (pieTypeMap.get(key) || 0) + log.duration_minutes);
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
                            label: function(context: any) {
                                return `${context.label}: ${formatDuration(context.parsed)}`;
                            }
                        }
                    }
                }
            }
        });

        // Pie total label
        let pieTotalMins = 0;
        pieTypeMap.forEach(v => pieTotalMins += v);
        const pieTotalEl = layout.querySelector('#pie-total');
        if (pieTotalEl) pieTotalEl.textContent = `Total: ${formatDuration(pieTotalMins)}`;

        // Characters Read By Media Type chart
        const charsTypeMap = new Map<string, number>();
        for (const log of logs) {
            if (log.date >= validStart && log.date <= validEnd && log.characters_read > 0 && isReadingContentType(log.content_type)) {
                const charsKey = charsGroupByMode === 'media_type' ? log.content_type : log.title;
                charsTypeMap.set(charsKey, (charsTypeMap.get(charsKey) || 0) + log.characters_read);
            }
        }

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
                            label: function(context: any) {
                                const val = context.parsed;
                                return `${context.label}: ${val.toLocaleString()} chars`;
                            }
                        }
                    }
                }
            }
        });

        // Chars total label
        let charsTotalCount = 0;
        charsTypeMap.forEach(v => charsTotalCount += v);
        const charsTotalEl = layout.querySelector('#chars-total');
        if (charsTotalEl) charsTotalEl.textContent = `Total: ${charsTotalCount.toLocaleString()} 文字`;

        const datasetsMap = new Map<string, number[]>();
        const activeKeysInPeriod = new Set<string>();
        for (const log of logs) {
            if (getBucketIndex(log.date) !== -1) {
                const key = groupByMode === 'media_type' ? log.media_type : log.title;
                activeKeysInPeriod.add(key);
            }
        }
        for (const key of activeKeysInPeriod) datasetsMap.set(key, Array(labels.length).fill(0));

        for (const log of logs) {
            const index = getBucketIndex(log.date);
            if (index !== -1) {
                const key = groupByMode === 'media_type' ? log.media_type : log.title;
                if (datasetsMap.has(key)) datasetsMap.get(key)![index] += isCharsMetric ? log.characters_read : log.duration_minutes;
            }
        }

        const datasets = Array.from(datasetsMap.entries()).map(([key, data], i) => ({
            label: key,
            data: data,
            backgroundColor: colors[i % colors.length],
            borderColor: colors[i % colors.length],
            fill: chartType === 'line' ? false : undefined,
            tension: 0.3
        }));

        // Compute per-label totals for bar mode
        const labelTotals = labels.map((_, i) => {
            let sum = 0;
            for (const ds of datasets) sum += ds.data[i];
            return sum;
        });

        this.barChartInstance = new Chart(barCanvas, {
            type: chartType,
            data: {
                labels: timeRangeDays === 7 ? labels.map(l => l.slice(5)) : labels,
                datasets: datasets
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
                        grid: { color: '#3f3f4e' }, 
                        ticks: { 
                            color: '#a0a0b0',
                            callback: function(value: any) { 
                                return isCharsMetric ? value.toLocaleString() : formatDuration(value);
                            }
                        } 
                    }
                },
                plugins: {
                    legend: { display: datasets.length <= 6, position: 'top', labels: { color: '#a0a0b0'} },
                    tooltip: {
                        callbacks: {
                            label: function(context: any) {
                                const val = context.parsed.y;
                                return isCharsMetric
                                    ? `${context.label}: ${val.toLocaleString()} 文字`
                                    : `${context.label}: ${formatDuration(val)}`;
                            }
                        }
                    }
                }
            },
            plugins: chartType === 'bar' ? [{
                id: 'barTotals',
                afterDraw(chart: any) {
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

    private renderBottomCharts(layout: HTMLElement) {
        const cumulativeCanvas = layout.querySelector('#cumulativeChart') as HTMLCanvasElement;
        const radarCanvas = layout.querySelector('#radarChart') as HTMLCanvasElement;
        const speedCanvas = layout.querySelector('#speedChart') as HTMLCanvasElement;
        if (!cumulativeCanvas || !radarCanvas || !speedCanvas) return;

        if (this.cumulativeChartInstance) this.cumulativeChartInstance.destroy();
        if (this.radarChartInstance) this.radarChartInstance.destroy();
        if (this.speedChartInstance) this.speedChartInstance.destroy();

        const style = getComputedStyle(document.body);
        const colors = [
          style.getPropertyValue('--chart-1').trim() || '#f4a6b8',
          style.getPropertyValue('--chart-2').trim() || '#b8cdda',
          style.getPropertyValue('--chart-3').trim() || '#e0bbe4',
          style.getPropertyValue('--chart-4').trim() || '#957DAD',
          style.getPropertyValue('--chart-5').trim() || '#D291BC'
        ];

        const { logs } = this.state;

        // === 1. Cumulative Hours Area Chart ===
        const sortedLogs = [...logs].sort((a, b) => a.date.localeCompare(b.date));
        const dailyTotals = new Map<string, number>();
        for (const log of sortedLogs) {
            dailyTotals.set(log.date, (dailyTotals.get(log.date) || 0) + log.duration_minutes);
        }
        const sortedDates = Array.from(dailyTotals.keys()).sort();
        let cumulative = 0;
        const cumulativeData = sortedDates.map(d => {
            cumulative += dailyTotals.get(d)!;
            return cumulative / 60; // hours
        });

        this.cumulativeChartInstance = new Chart(cumulativeCanvas, {
            type: 'line',
            data: {
                labels: sortedDates.map(d => d.slice(5)),
                datasets: [{
                    label: 'Cumulative Hours',
                    data: cumulativeData,
                    borderColor: colors[0],
                    backgroundColor: colors[0] + '33',
                    fill: true,
                    tension: 0.3,
                    pointRadius: sortedDates.length > 60 ? 0 : 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { grid: { color: '#3f3f4e' }, ticks: { color: '#a0a0b0', maxTicksLimit: 12 } },
                    y: { grid: { color: '#3f3f4e' }, ticks: { color: '#a0a0b0', callback: (v: any) => `${v}h` } }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx: any) => `${ctx.parsed.y.toFixed(1)} hours`
                        }
                    }
                }
            }
        });

        // === 2. Day-of-Week Radar Chart (current week only) ===
        const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const dayTotals = Array(7).fill(0);

        const getLocalISODate2 = (d: Date) => {
            const pad = (n: number) => n.toString().padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        };
        const todayForRadar = new Date();
        const todayDow = todayForRadar.getDay();
        const diffToMon = todayDow === 0 ? 6 : todayDow - 1;
        const weekStart = new Date(todayForRadar);
        weekStart.setDate(todayForRadar.getDate() - diffToMon);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        const weekStartStr = getLocalISODate2(weekStart);
        const weekEndStr = getLocalISODate2(weekEnd);

        for (const log of logs) {
            if (log.date >= weekStartStr && log.date <= weekEndStr) {
                const d = new Date(log.date + 'T00:00:00');
                const dow = d.getDay(); // 0=Sun
                const idx = dow === 0 ? 6 : dow - 1; // Mon=0
                dayTotals[idx] += log.duration_minutes;
            }
        }

        this.radarChartInstance = new Chart(radarCanvas, {
            type: 'radar',
            data: {
                labels: dayNames,
                datasets: [{
                    label: 'Minutes',
                    data: dayTotals,
                    borderColor: colors[1],
                    backgroundColor: colors[1] + '33',
                    pointBackgroundColor: colors[1],
                    pointRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: {
                        beginAtZero: true,
                        grid: { color: '#3f3f4e' },
                        angleLines: { color: '#3f3f4e' },
                        pointLabels: { color: '#a0a0b0', font: { size: 12 } },
                        ticks: {
                            color: '#a0a0b0',
                            backdropColor: 'transparent',
                            stepSize: 30,
                            callback: (v: any) => `${v}m`
                        }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx: any) => `${ctx.label}: ${formatDuration(ctx.parsed.r)}`
                        }
                    }
                }
            }
        });

        // === 3. Reading Speed Over Time ===
        const speedEntries: { date: string; speed: number; chars: number; mins: number }[] = [];
        for (const log of sortedLogs) {
            if (log.characters_read > 0 && log.duration_minutes > 0 && isReadingContentType(log.content_type)) {
                speedEntries.push({ date: log.date, speed: (log.characters_read / log.duration_minutes) * 60, chars: log.characters_read, mins: log.duration_minutes });
            }
        }

        // Average per week
        const weekMap = new Map<string, { total: number; count: number; totalChars: number; totalMins: number; minSpeed: number; maxSpeed: number }>();
        for (const entry of speedEntries) {
            const d = new Date(entry.date + 'T00:00:00');
            const dow = d.getDay();
            const diff = dow === 0 ? 6 : dow - 1;
            const mon = new Date(d);
            mon.setDate(d.getDate() - diff);
            const weekKey = `${mon.getFullYear()}-${(mon.getMonth()+1).toString().padStart(2,'0')}-${mon.getDate().toString().padStart(2,'0')}`;
            if (!weekMap.has(weekKey)) weekMap.set(weekKey, { total: 0, count: 0, totalChars: 0, totalMins: 0, minSpeed: Infinity, maxSpeed: 0 });
            const w = weekMap.get(weekKey)!;
            w.total += entry.speed;
            w.count++;
            w.totalChars += entry.chars;
            w.totalMins += entry.mins;
            if (entry.speed < w.minSpeed) w.minSpeed = entry.speed;
            if (entry.speed > w.maxSpeed) w.maxSpeed = entry.speed;
        }
        const weekKeys = Array.from(weekMap.keys()).sort();
        const weekStats = weekKeys.map(k => weekMap.get(k)!);
        const weekAvgSpeeds = weekStats.map(w => Math.round(w.total / w.count));

        this.speedChartInstance = new Chart(speedCanvas, {
            type: 'line',
            data: {
                labels: weekKeys.map(k => k.slice(5)),
                datasets: [{
                    label: '文字/hour (weekly avg)',
                    data: weekAvgSpeeds,
                    borderColor: colors[2],
                    backgroundColor: colors[2] + '33',
                    fill: false,
                    tension: 0.3,
                    pointRadius: weekKeys.length > 30 ? 0 : 3,
                    pointHitRadius: 15,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                scales: {
                    x: { grid: { color: '#3f3f4e' }, ticks: { color: '#a0a0b0', maxTicksLimit: 12 } },
                    y: { grid: { color: '#3f3f4e' }, ticks: { color: '#a0a0b0', callback: (v: any) => `${v} 文字/h` }, beginAtZero: true }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            title: (items: any[]) => {
                                const idx = items[0].dataIndex;
                                return `Week of ${weekKeys[idx]}`;
                            },
                            label: (ctx: any) => {
                                return `Avg: ${ctx.parsed.y.toLocaleString()} 文字/hour`;
                            },
                            afterLabel: (ctx: any) => {
                                const w = weekStats[ctx.dataIndex];
                                const lines = [
                                    `Sessions: ${w.count}`,
                                    `Total chars: ${w.totalChars.toLocaleString()}`,
                                    `Total time: ${formatDuration(w.totalMins)}`,
                                    `Range: ${Math.round(w.minSpeed).toLocaleString()}–${Math.round(w.maxSpeed).toLocaleString()} 文字/h`
                                ];
                                return lines;
                            }
                        }
                    }
                }
            }
        });
    }

    public destroy() {
        if (this.pieChartInstance) this.pieChartInstance.destroy();
        if (this.charsChartInstance) this.charsChartInstance.destroy();
        if (this.barChartInstance) this.barChartInstance.destroy();
        if (this.cumulativeChartInstance) this.cumulativeChartInstance.destroy();
        if (this.radarChartInstance) this.radarChartInstance.destroy();
        if (this.speedChartInstance) this.speedChartInstance.destroy();
    }
}
