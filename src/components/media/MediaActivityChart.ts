import Chart from 'chart.js/auto';
import { Component } from '../../core/component';
import { html } from '../../core/html';
import { ActivitySummary, formatDuration } from '../../api';

type MediaChartType = 'line' | 'bar';
type MediaChartMetric = 'activity' | 'speed';
type BucketMode = 'daily' | 'weekly' | 'monthly';

interface MediaActivityChartState {
    logs: ActivitySummary[];
    isReading: boolean;
    chartType: MediaChartType;
    metric: MediaChartMetric;
}

interface ChartBucket {
    key: string;
    displayLabel: string;
    minutes: number;
    chars: number;
}

function pad(value: number): string {
    return value.toString().padStart(2, '0');
}

export class MediaActivityChart extends Component<MediaActivityChartState> {
    private chartInstance: Chart | null = null;

    constructor(container: HTMLElement, logs: ActivitySummary[], isReading: boolean) {
        super(container, {
            logs,
            isReading,
            chartType: 'line',
            metric: 'activity'
        });
    }

    render() {
        if (this.chartInstance) {
            this.chartInstance.destroy();
            this.chartInstance = null;
        }

        this.clear();

        const bucketData = this.getBucketData();
        const metricLabel = this.state.metric === 'activity' ? 'Activity' : 'Speed';
        const chartTypeLabel = this.state.chartType === 'line' ? 'Line' : 'Bar';
        const granularityLabel = bucketData ? this.getBucketModeLabel(bucketData.mode) : 'Auto';

        const card = html`
            <div class="card" style="display: flex; flex-direction: column; gap: 1rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap;">
                    <div style="display: flex; flex-direction: column; gap: 0.25rem;">
                        <h4 style="margin: 0; color: var(--text-secondary);">Activity Visualization</h4>
                        <span style="font-size: 0.78rem; color: var(--text-secondary);">Auto buckets: ${granularityLabel}</span>
                    </div>
                    <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                        ${this.state.isReading ? `<button class="btn btn-ghost btn-cycle" id="btn-media-chart-metric" style="font-size: 0.8rem; padding: 0.3rem 0.7rem;">${metricLabel}</button>` : ''}
                        <button class="btn btn-ghost btn-cycle" id="btn-media-chart-type" style="font-size: 0.8rem; padding: 0.3rem 0.7rem;">${chartTypeLabel}</button>
                    </div>
                </div>
                <div id="media-chart-body">
                    ${bucketData ? `<div class="chart-container-wrapper" style="height: 320px;"><canvas id="media-activity-chart"></canvas></div>` : `<div style="min-height: 220px; display: flex; align-items: center; justify-content: center; color: var(--text-secondary);">No activity yet for this media.</div>`}
                </div>
            </div>
        `;

        this.container.appendChild(card);
        this.setupListeners(card);

        if (bucketData) {
            this.renderChart(card, bucketData);
        }
    }

    private setupListeners(root: HTMLElement) {
        root.querySelector('#btn-media-chart-type')?.addEventListener('click', () => {
            this.setState({ chartType: this.state.chartType === 'line' ? 'bar' : 'line' });
        });

        root.querySelector('#btn-media-chart-metric')?.addEventListener('click', () => {
            if (!this.state.isReading) return;
            this.setState({ metric: this.state.metric === 'activity' ? 'speed' : 'activity' });
        });
    }

    private renderChart(root: HTMLElement, bucketData: { mode: BucketMode; buckets: ChartBucket[] }) {
        const body = root.querySelector('#media-chart-body') as HTMLElement | null;
        const canvas = root.querySelector('#media-activity-chart') as HTMLCanvasElement | null;
        if (!body || !canvas) return;

        const values = bucketData.buckets.map((bucket) => {
            if (this.state.metric === 'activity') return bucket.minutes;
            if (bucket.minutes <= 0 || bucket.chars <= 0) return null;
            return bucket.chars / (bucket.minutes / 60);
        });

        if (this.state.metric === 'speed' && values.every((value) => value === null)) {
            body.innerHTML = '<div style="min-height: 220px; display: flex; align-items: center; justify-content: center; color: var(--text-secondary);">No reading speed data yet. Add logs with 文字 to plot speed.</div>';
            return;
        }

        const colors = this.getMetricColors();
        const metricName = this.state.metric === 'activity' ? 'Activity' : 'Reading Speed';

        this.chartInstance = new Chart(canvas, {
            type: this.state.chartType,
            data: {
                labels: bucketData.buckets.map((bucket) => bucket.displayLabel),
                datasets: [{
                    label: metricName,
                    data: values,
                    borderColor: colors.border,
                    backgroundColor: colors.fill,
                    borderWidth: 2,
                    pointRadius: this.state.chartType === 'line' ? 2.5 : 0,
                    pointHoverRadius: 4,
                    fill: this.state.chartType === 'line',
                    tension: 0.3,
                    spanGaps: this.state.metric === 'speed' && this.state.chartType === 'line'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        grid: { color: 'rgba(127, 127, 127, 0.14)' },
                        ticks: {
                            color: 'rgba(160, 160, 176, 1)',
                            maxRotation: 0,
                            autoSkip: true,
                            maxTicksLimit: bucketData.mode === 'daily' ? 10 : 12
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(127, 127, 127, 0.14)' },
                        ticks: {
                            color: 'rgba(160, 160, 176, 1)',
                            callback: (value: any) => this.state.metric === 'activity'
                                ? formatDuration(Number(value))
                                : `${Math.round(Number(value)).toLocaleString()}`
                        }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            title: (items: any) => {
                                const index = items[0]?.dataIndex ?? 0;
                                return bucketData.buckets[index]?.key || '';
                            },
                            label: (context: any) => {
                                const rawValue = context.parsed.y;
                                if (this.state.metric === 'activity') {
                                    return `Activity: ${formatDuration(rawValue)}`;
                                }
                                return `Reading Speed: ${Math.round(rawValue).toLocaleString()} 文字/hour`;
                            },
                            footer: (items: any) => {
                                const index = items[0]?.dataIndex ?? 0;
                                const bucket = bucketData.buckets[index];
                                if (!bucket) return '';
                                if (this.state.metric === 'activity') return '';
                                return `${bucket.chars.toLocaleString()} 文字 in ${formatDuration(bucket.minutes)}`;
                            }
                        }
                    }
                }
            }
        });
    }

    private getBucketData(): { mode: BucketMode; buckets: ChartBucket[] } | null {
        if (this.state.logs.length === 0) return null;

        const sortedLogs = [...this.state.logs].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
        const startDate = this.parseLocalDate(sortedLogs[0].date);
        const endDate = this.parseLocalDate(sortedLogs[sortedLogs.length - 1].date);
        const spanDays = Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1;

        if (spanDays <= 60) return { mode: 'daily', buckets: this.buildDailyBuckets(sortedLogs, startDate, endDate) };
        if (spanDays <= 365) return { mode: 'weekly', buckets: this.buildWeeklyBuckets(sortedLogs, startDate, endDate) };
        return { mode: 'monthly', buckets: this.buildMonthlyBuckets(sortedLogs, startDate, endDate) };
    }

    private buildDailyBuckets(logs: ActivitySummary[], startDate: Date, endDate: Date): ChartBucket[] {
        const buckets: ChartBucket[] = [];
        const indexByKey = new Map<string, number>();

        for (let cursor = new Date(startDate); cursor <= endDate; cursor.setDate(cursor.getDate() + 1)) {
            const key = this.getLocalISODate(cursor);
            indexByKey.set(key, buckets.length);
            buckets.push({
                key,
                displayLabel: key.slice(5),
                minutes: 0,
                chars: 0
            });
        }

        for (const log of logs) {
            const bucketIndex = indexByKey.get(log.date);
            if (bucketIndex === undefined) continue;
            buckets[bucketIndex].minutes += log.duration_minutes;
            buckets[bucketIndex].chars += log.characters_read;
        }

        return buckets;
    }

    private buildWeeklyBuckets(logs: ActivitySummary[], startDate: Date, endDate: Date): ChartBucket[] {
        const buckets: ChartBucket[] = [];
        const indexByKey = new Map<string, number>();
        const cursor = this.getWeekStart(startDate);
        const lastWeek = this.getWeekStart(endDate);

        while (cursor <= lastWeek) {
            const weekStart = new Date(cursor);
            const weekEnd = new Date(cursor);
            weekEnd.setDate(weekEnd.getDate() + 6);

            const key = this.getLocalISODate(weekStart);
            indexByKey.set(key, buckets.length);
            buckets.push({
                key,
                displayLabel: `${this.getShortDate(weekStart)}-${this.getShortDate(weekEnd)}`,
                minutes: 0,
                chars: 0
            });

            cursor.setDate(cursor.getDate() + 7);
        }

        for (const log of logs) {
            const bucketKey = this.getLocalISODate(this.getWeekStart(this.parseLocalDate(log.date)));
            const bucketIndex = indexByKey.get(bucketKey);
            if (bucketIndex === undefined) continue;
            buckets[bucketIndex].minutes += log.duration_minutes;
            buckets[bucketIndex].chars += log.characters_read;
        }

        return buckets;
    }

    private buildMonthlyBuckets(logs: ActivitySummary[], startDate: Date, endDate: Date): ChartBucket[] {
        const buckets: ChartBucket[] = [];
        const indexByKey = new Map<string, number>();
        const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
        const lastMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

        while (cursor <= lastMonth) {
            const key = `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}`;
            indexByKey.set(key, buckets.length);
            buckets.push({
                key,
                displayLabel: this.getMonthLabel(cursor),
                minutes: 0,
                chars: 0
            });

            cursor.setMonth(cursor.getMonth() + 1);
        }

        for (const log of logs) {
            const bucketKey = log.date.slice(0, 7);
            const bucketIndex = indexByKey.get(bucketKey);
            if (bucketIndex === undefined) continue;
            buckets[bucketIndex].minutes += log.duration_minutes;
            buckets[bucketIndex].chars += log.characters_read;
        }

        return buckets;
    }

    private getMetricColors(): { border: string; fill: string } {
        const styles = getComputedStyle(document.body);
        const border = this.state.metric === 'activity'
            ? styles.getPropertyValue('--accent-blue').trim() || '#60a5fa'
            : styles.getPropertyValue('--accent-yellow').trim() || '#facc15';

        const fill = this.toAlphaColor(border, this.state.chartType === 'line' ? 0.18 : 0.7);
        return { border, fill };
    }

    private toAlphaColor(color: string, alpha: number): string {
        const probe = document.createElement('div');
        probe.style.color = color;
        probe.style.display = 'none';
        document.body.appendChild(probe);
        const resolved = getComputedStyle(probe).color;
        probe.remove();

        const match = resolved.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (!match) return color;
        return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha})`;
    }

    private getBucketModeLabel(mode: BucketMode): string {
        if (mode === 'daily') return 'Daily';
        if (mode === 'weekly') return 'Weekly';
        return 'Monthly';
    }

    private getShortDate(date: Date): string {
        return `${pad(date.getMonth() + 1)}/${pad(date.getDate())}`;
    }

    private getMonthLabel(date: Date): string {
        const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${monthLabels[date.getMonth()]} ${date.getFullYear()}`;
    }

    private getWeekStart(date: Date): Date {
        const weekStart = new Date(date);
        const day = weekStart.getDay();
        const diffToMonday = day === 0 ? 6 : day - 1;
        weekStart.setDate(weekStart.getDate() - diffToMonday);
        weekStart.setHours(0, 0, 0, 0);
        return weekStart;
    }

    private parseLocalDate(dateStr: string): Date {
        return new Date(`${dateStr}T00:00:00`);
    }

    private getLocalISODate(date: Date): string {
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }

    public destroy(): void {
        if (this.chartInstance) {
            this.chartInstance.destroy();
            this.chartInstance = null;
        }
    }
}
