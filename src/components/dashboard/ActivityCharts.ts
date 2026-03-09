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
    chartType: 'bar' | 'line';
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
        
        const chartsLayout = html`
            <div style="display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 2fr); gap: 2rem;">
                <div class="card" style="display: flex; flex-direction: column; min-width: 0;">
                    <h3 style="text-align: center; margin-bottom: 1rem;">Activity Breakdown</h3>
                    <div class="chart-container-wrapper" style="flex: 1; min-height: 0;">
                        <canvas id="pieChart"></canvas>
                    </div>
                </div>
                <div class="card" style="display: flex; flex-direction: column; min-width: 0;">
                    <h3 style="text-align: center; margin-bottom: 1rem;">Characters Read By Media Type</h3>
                    <div class="chart-container-wrapper" style="flex: 1; min-height: 0;">
                        <canvas id="charsChart"></canvas>
                    </div>
                </div>
                <div class="card" style="display: flex; flex-direction: column; min-width: 0;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <button class="btn btn-ghost" style="padding: 0.1rem 0.4rem;" id="btn-chart-prev">&lt;</button>
                            <h3 style="margin: 0;">Activity visualization</h3>
                            <button class="btn btn-ghost" style="padding: 0.1rem 0.4rem;" id="btn-chart-next">&gt;</button>
                        </div>
                        <div style="display: flex; gap: 0.5rem;">
                            <select id="select-chart-type" style="font-size: 0.8rem; padding: 0.4rem 0.6rem;">
                                <option value="bar" ${this.state.chartType === 'bar' ? 'selected' : ''}>Bar</option>
                                <option value="line" ${this.state.chartType === 'line' ? 'selected' : ''}>Line</option>
                            </select>
                            <select id="select-time-range" style="font-size: 0.8rem; padding: 0.4rem 0.6rem;">
                                <option value="7" ${this.state.timeRangeDays === 7 ? 'selected' : ''}>Weekly</option>
                                <option value="30" ${this.state.timeRangeDays === 30 ? 'selected' : ''}>Monthly</option>
                                <option value="365" ${this.state.timeRangeDays === 365 ? 'selected' : ''}>Yearly</option>
                            </select>
                            <select id="select-group-by" style="font-size: 0.8rem; padding: 0.4rem 0.6rem;">
                                <option value="media_type" ${this.state.groupByMode === 'media_type' ? 'selected' : ''}>By Media Type</option>
                                <option value="log_name" ${this.state.groupByMode === 'log_name' ? 'selected' : ''}>By Log Name</option>
                            </select>
                        </div>
                    </div>
                    <div class="chart-container-wrapper" style="flex: 1; min-height: 0;">
                        <canvas id="barChart"></canvas>
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
             this.onChartParamChange({ timeRangeOffset: this.state.timeRangeOffset + 1 });
        });
        layout.querySelector('#btn-chart-next')?.addEventListener('click', () => {
            if (this.state.timeRangeOffset > 0) {
                this.onChartParamChange({ timeRangeOffset: this.state.timeRangeOffset - 1 });
            }
        });
        layout.querySelector('#select-chart-type')?.addEventListener('change', (e) => {
            this.onChartParamChange({ chartType: (e.target as HTMLSelectElement).value as 'bar' | 'line' });
        });
        layout.querySelector('#select-time-range')?.addEventListener('change', (e) => {
            this.onChartParamChange({ timeRangeDays: parseInt((e.target as HTMLSelectElement).value), timeRangeOffset: 0 });
        });
        layout.querySelector('#select-group-by')?.addEventListener('change', (e) => {
            this.onChartParamChange({ groupByMode: (e.target as HTMLSelectElement).value as 'media_type' | 'log_name' });
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

        const pieTypeMap = new Map<string, number>();
        for (const log of logs) {
            if (log.date >= validStart && log.date <= validEnd) {
                const key = groupByMode === 'media_type' ? log.media_type : log.title;
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

        // Characters Read By Media Type chart
        const charsTypeMap = new Map<string, number>();
        for (const log of logs) {
            if (log.date >= validStart && log.date <= validEnd && log.characters_read > 0 && isReadingContentType(log.content_type)) {
                charsTypeMap.set(log.content_type, (charsTypeMap.get(log.content_type) || 0) + log.characters_read);
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
                if (datasetsMap.has(key)) datasetsMap.get(key)![index] += log.duration_minutes;
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

        this.barChartInstance = new Chart(barCanvas, {
            type: chartType,
            data: {
                labels: timeRangeDays === 7 ? labels.map(l => l.slice(5)) : labels,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { stacked: chartType === 'bar', grid: { color: '#3f3f4e' }, ticks: { color: '#a0a0b0' } },
                    y: { 
                        stacked: chartType === 'bar', 
                        grid: { color: '#3f3f4e' }, 
                        ticks: { 
                            color: '#a0a0b0',
                            callback: function(value: any) { 
                                return formatDuration(value);
                            }
                        } 
                    }
                },
                plugins: {
                    legend: { display: datasets.length <= 6, position: 'top', labels: { color: '#a0a0b0'} },
                    tooltip: {
                        callbacks: {
                            label: function(context: any) {
                                return `${context.label}: ${formatDuration(context.parsed.y)}`;
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
    }
}
