import Chart from 'chart.js/auto';
import { Component } from '../core/component';
import { escapeHTML, html } from '../core/html';
import { ActivitySummary, Media, formatDuration, getAllMedia, getLogs } from '../api';
import { isReadingContentType } from '../modals/activity';

type StatsRange = 'week' | 'month' | 'year' | 'all_time';

interface StatisticsState {
    logs: ActivitySummary[];
    mediaList: Media[];
    range: StatsRange;
    loaded: boolean;
}

interface MediaAggregate {
    mediaId: number;
    title: string;
    mediaType: string;
    contentType: string;
    minutes: number;
    characters: number;
    sessions: number;
    activeDays: Set<string>;
    firstDate: string;
    lastDate: string;
}

export class StatisticsView extends Component<StatisticsState> {
    private charts: Chart[] = [];

    constructor(container: HTMLElement) {
        super(container, {
            logs: [],
            mediaList: [],
            range: 'month',
            loaded: false
        });
    }

    public resetLoaded(): void {
        this.state = { ...this.state, loaded: false };
    }

    async loadData(): Promise<void> {
        try {
            const [logs, mediaList] = await Promise.all([getLogs(), getAllMedia()]);
            this.state = { ...this.state, logs, mediaList, loaded: true };
        } catch (error) {
            console.error('Statistics failed to load data', error);
            this.state = { ...this.state, loaded: true };
        }
    }

    async render(): Promise<void> {
        if (!this.state.loaded) {
            await this.loadData();
        }

        this.destroyCharts();
        this.clear();

        const filteredLogs = this.getLogsInSelectedRange();
        const allLogs = [...this.state.logs].sort((a, b) => a.date.localeCompare(b.date));
        const aggregates = this.getMediaAggregates(filteredLogs);
        const allAggregates = this.getMediaAggregates(allLogs);
        const overview = this.getOverviewStats(filteredLogs, aggregates);
        const records = this.getRecords(filteredLogs, allAggregates);

        const root = html`
            <div class="statistics-page animate-fade-in">
                <div class="statistics-header">
                    <div>
                        <h2>Statistics</h2>
                    </div>
                    <select id="statistics-range-select" title="Statistics range">
                        <option value="week" ${this.state.range === 'week' ? 'selected' : ''}>Past Week</option>
                        <option value="month" ${this.state.range === 'month' ? 'selected' : ''}>Past Month</option>
                        <option value="year" ${this.state.range === 'year' ? 'selected' : ''}>Past Year</option>
                        <option value="all_time" ${this.state.range === 'all_time' ? 'selected' : ''}>All Time</option>
                    </select>
                </div>

                <div class="statistics-grid">
                    ${this.renderOverviewWindow(overview)}
                    ${this.renderChartWindow('Reading Speed by Media', 'stats-reading-speed-chart', 'wide')}
                    ${this.renderChartWindow('Rolling Momentum', 'stats-rolling-momentum-chart', 'wide')}
                    ${this.renderChartWindow('Media Rotation', 'stats-media-rotation-chart')}
                    ${this.renderChartWindow('Session Length Distribution', 'stats-session-distribution-chart')}
                    ${this.renderTableWindow('Top Media by Time', ['Title', 'Time'], this.getTopMediaByTime(aggregates))}
                    ${this.renderTableWindow('Top Reading by 文字', ['Title', '文字'], this.getTopReadingByChars(aggregates))}
                    ${this.renderTableWindow('Fastest Reading Media', ['Title', 'Speed'], this.getFastestReadingMedia(aggregates))}
                    ${this.renderChartWindow('Weekday Pattern', 'stats-weekday-chart')}
                    ${this.renderChartWindow('Monthly Pace', 'stats-monthly-pace-chart')}
                    ${this.renderChartWindow('Consistency by Week', 'stats-consistency-chart')}
                    ${this.renderChartWindow('Focus vs Sampling', 'stats-focus-chart')}
                    ${this.renderChartWindow('Library Status', 'stats-status-chart')}
                    ${this.renderTableWindow('Reading Speed Volatility', ['Title', 'Spread'], this.getReadingSpeedVolatility(filteredLogs))}
                    ${this.renderTableWindow('Comeback Gaps', ['Title', 'Gap'], this.getComebackGaps(filteredLogs))}
                    ${this.renderTableWindow('Most Frequent Media', ['Title', 'Sessions'], this.getMostFrequentMedia(aggregates))}
                    ${this.renderTableWindow('Longest Active Spans', ['Title', 'Span'], this.getLongestSpans(allAggregates))}
                    ${this.renderTableWindow('Dormant Heavy Hitters', ['Title', 'Last Seen'], this.getDormantHeavyHitters(filteredLogs, allAggregates))}
                    ${this.renderRecordsWindow(records)}
                </div>
            </div>
        `;

        this.container.appendChild(root);
        this.setupListeners(root);
        this.renderCharts(root, filteredLogs);
    }

    private setupListeners(root: HTMLElement): void {
        root.querySelector('#statistics-range-select')?.addEventListener('change', (event) => {
            this.setState({ range: (event.target as HTMLSelectElement).value as StatsRange });
        });
    }

    private renderOverviewWindow(overview: { label: string; value: string; sublabel: string }[]): string {
        return `
            <section class="card statistics-window statistics-window-full">
                <div class="statistics-window-header">
                    <h3>Overview</h3>
                </div>
                <div class="statistics-kpi-grid">
                    ${overview.map((item) => `
                        <div class="statistics-kpi">
                            <span>${item.label}</span>
                            <strong>${item.value}</strong>
                            <small>${item.sublabel}</small>
                        </div>
                    `).join('')}
                </div>
            </section>
        `;
    }

    private renderChartWindow(title: string, canvasId: string, size: 'normal' | 'wide' = 'normal'): string {
        return `
            <section class="card statistics-window ${size === 'wide' ? 'statistics-window-wide' : ''}">
                <div class="statistics-window-header">
                    <h3>${title}</h3>
                </div>
                <div class="statistics-chart-wrap">
                    <canvas id="${canvasId}"></canvas>
                </div>
            </section>
        `;
    }

    private renderTableWindow(title: string, headers: string[], rows: string[][]): string {
        return `
            <section class="card statistics-window">
                <div class="statistics-window-header">
                    <h3>${title}</h3>
                </div>
                <div class="statistics-table-scroll">
                    <table class="dashboard-data-table statistics-table">
                        <thead>
                            <tr>${headers.map((header) => `<th>${header}</th>`).join('')}</tr>
                        </thead>
                        <tbody>
                            ${rows.length > 0 ? rows.map((row) => `
                                <tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>
                            `).join('') : '<tr><td colspan="2" class="statistics-empty">No data</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </section>
        `;
    }

    private renderRecordsWindow(records: { label: string; value: string }[]): string {
        return `
            <section class="card statistics-window">
                <div class="statistics-window-header">
                    <h3>Records</h3>
                </div>
                <div class="statistics-record-list">
                    ${records.map((record) => `
                        <div class="statistics-record">
                            <span>${record.label}</span>
                            <strong>${record.value}</strong>
                        </div>
                    `).join('')}
                </div>
            </section>
        `;
    }

    private renderCharts(root: HTMLElement, logs: ActivitySummary[]): void {
        this.renderReadingSpeedChart(root, logs);
        this.renderRollingMomentumChart(root, logs);
        this.renderMediaRotationChart(root, logs);
        this.renderSessionDistributionChart(root, logs);
        this.renderWeekdayChart(root, logs);
        this.renderMonthlyPaceChart(root, logs);
        this.renderConsistencyChart(root, logs);
        this.renderFocusChart(root, logs);
        this.renderStatusChart(root);
    }

    private renderReadingSpeedChart(root: HTMLElement, logs: ActivitySummary[]): void {
        const { labels, displayLabels, getBucketKey } = this.getReadingSpeedBuckets(logs);
        const mediaMap = new Map<string, Map<string, { chars: number; minutes: number }>>();

        for (const log of logs) {
            if (!isReadingContentType(log.content_type) || log.characters_read <= 0 || log.duration_minutes <= 0) continue;
            const bucketKey = getBucketKey(log.date);
            if (!bucketKey) continue;
            if (!mediaMap.has(log.title)) mediaMap.set(log.title, new Map());
            const mediaBuckets = mediaMap.get(log.title)!;
            const bucket = mediaBuckets.get(bucketKey) || { chars: 0, minutes: 0 };
            bucket.chars += log.characters_read;
            bucket.minutes += log.duration_minutes;
            mediaBuckets.set(bucketKey, bucket);
        }

        const palette = this.getPalette();
        const sortedMedia = Array.from(mediaMap.entries())
            .map(([title, buckets]) => ({
                title,
                totalChars: Array.from(buckets.values()).reduce((sum, bucket) => sum + bucket.chars, 0),
                buckets
            }))
            .sort((a, b) => b.totalChars - a.totalChars)
            .slice(0, 18);

        this.createChart(root, 'stats-reading-speed-chart', {
            type: 'line',
            data: {
                labels: displayLabels,
                datasets: sortedMedia.map((media, index) => ({
                    label: media.title,
                    data: labels.map((label) => {
                        const bucket = media.buckets.get(label);
                        return bucket && bucket.minutes > 0 ? Math.round(bucket.chars / (bucket.minutes / 60)) : null;
                    }),
                    borderColor: palette[index % palette.length],
                    backgroundColor: palette[index % palette.length],
                    tension: 0.25,
                    spanGaps: true,
                    pointRadius: 2
                }))
            },
            options: this.getChartOptions((value) => Number(value).toLocaleString())
        });
    }

    private renderRollingMomentumChart(root: HTMLElement, logs: ActivitySummary[]): void {
        const daily = new Map<string, { minutes: number; chars: number }>();
        for (const log of logs) {
            const row = daily.get(log.date) || { minutes: 0, chars: 0 };
            row.minutes += log.duration_minutes;
            row.chars += log.characters_read;
            daily.set(log.date, row);
        }
        const labels = Array.from(daily.keys()).sort();
        const palette = this.getPalette();
        const rollingMinutes = labels.map((_, index) => {
            const start = Math.max(0, index - 6);
            const range = labels.slice(start, index + 1);
            return Math.round(range.reduce((sum, date) => sum + daily.get(date)!.minutes, 0) / range.length);
        });
        const rollingChars = labels.map((_, index) => {
            const start = Math.max(0, index - 6);
            const range = labels.slice(start, index + 1);
            return Math.round(range.reduce((sum, date) => sum + daily.get(date)!.chars, 0) / Math.max(1, range.length * 100));
        });

        this.createChart(root, 'stats-rolling-momentum-chart', {
            type: 'line',
            data: {
                labels,
                datasets: [
                    { label: '7-log-day avg minutes', data: rollingMinutes, borderColor: palette[1], backgroundColor: palette[1], tension: 0.25 },
                    { label: '7-log-day avg 文字 x100', data: rollingChars, borderColor: palette[2], backgroundColor: palette[2], tension: 0.25 }
                ]
            },
            options: this.getChartOptions()
        });
    }

    private renderMediaRotationChart(root: HTMLElement, logs: ActivitySummary[]): void {
        const dailyMedia = new Map<string, Set<number>>();
        for (const log of logs) {
            if (!dailyMedia.has(log.date)) dailyMedia.set(log.date, new Set());
            dailyMedia.get(log.date)!.add(log.media_id);
        }
        const labels = Array.from(dailyMedia.keys()).sort();
        this.createChart(root, 'stats-media-rotation-chart', {
            type: 'line',
            data: {
                labels,
                datasets: [{ label: 'Unique media/day', data: labels.map((date) => dailyMedia.get(date)!.size), borderColor: this.getPalette()[5], backgroundColor: this.getPalette()[5], tension: 0.25 }]
            },
            options: this.getChartOptions()
        });
    }

    private renderSessionDistributionChart(root: HTMLElement, logs: ActivitySummary[]): void {
        const labels = ['<15m', '15-30m', '30-60m', '1-2h', '2h+'];
        const values = Array(labels.length).fill(0);
        for (const log of logs) {
            const minutes = log.duration_minutes;
            if (minutes < 15) values[0] += 1;
            else if (minutes < 30) values[1] += 1;
            else if (minutes < 60) values[2] += 1;
            else if (minutes < 120) values[3] += 1;
            else values[4] += 1;
        }
        this.createChart(root, 'stats-session-distribution-chart', {
            type: 'bar',
            data: { labels, datasets: [{ label: 'Sessions', data: values, backgroundColor: this.getPalette()[6] }] },
            options: this.getChartOptions()
        });
    }

    private renderWeekdayChart(root: HTMLElement, logs: ActivitySummary[]): void {
        const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const values = Array(7).fill(0);
        for (const log of logs) {
            const day = this.parseDate(log.date).getDay();
            const index = day === 0 ? 6 : day - 1;
            values[index] += log.duration_minutes;
        }

        this.createChart(root, 'stats-weekday-chart', {
            type: 'bar',
            data: { labels, datasets: [{ label: 'Time', data: values, backgroundColor: this.getPalette()[3] }] },
            options: this.getChartOptions((value) => formatDuration(Number(value)))
        });
    }

    private renderMonthlyPaceChart(root: HTMLElement, logs: ActivitySummary[]): void {
        const monthly = new Map<string, number>();
        for (const log of logs) {
            const key = log.date.slice(0, 7);
            monthly.set(key, (monthly.get(key) || 0) + log.duration_minutes);
        }
        const labels = Array.from(monthly.keys()).sort();

        this.createChart(root, 'stats-monthly-pace-chart', {
            type: 'bar',
            data: { labels, datasets: [{ label: 'Time', data: labels.map((label) => monthly.get(label) || 0), backgroundColor: this.getPalette()[4] }] },
            options: this.getChartOptions((value) => formatDuration(Number(value)))
        });
    }

    private renderConsistencyChart(root: HTMLElement, logs: ActivitySummary[]): void {
        const weekly = new Map<string, Set<string>>();
        for (const log of logs) {
            const weekKey = this.getWeekKey(log.date);
            if (!weekly.has(weekKey)) weekly.set(weekKey, new Set());
            weekly.get(weekKey)!.add(log.date);
        }
        const labels = Array.from(weekly.keys()).sort();
        this.createChart(root, 'stats-consistency-chart', {
            type: 'bar',
            data: { labels, datasets: [{ label: 'Active days/week', data: labels.map((label) => weekly.get(label)!.size), backgroundColor: this.getPalette()[1] }] },
            options: this.getChartOptions()
        });
    }

    private renderFocusChart(root: HTMLElement, logs: ActivitySummary[]): void {
        const dailyMedia = new Map<string, Set<number>>();
        for (const log of logs) {
            if (!dailyMedia.has(log.date)) dailyMedia.set(log.date, new Set());
            dailyMedia.get(log.date)!.add(log.media_id);
        }
        const rows = [
            { label: 'Focused days', value: Array.from(dailyMedia.values()).filter((media) => media.size === 1).length },
            { label: 'Sampling days', value: Array.from(dailyMedia.values()).filter((media) => media.size > 1).length }
        ];
        this.createDoughnut(root, 'stats-focus-chart', rows, (value) => `${value} days`);
    }

    private renderStatusChart(root: HTMLElement): void {
        const statusRows = this.sumMediaBy((media) => media.tracking_status || 'Unknown');
        this.createDoughnut(root, 'stats-status-chart', statusRows, (value) => `${value} entries`);
    }

    private createDoughnut(root: HTMLElement, canvasId: string, rows: { label: string; value: number }[], formatValue: (value: number) => string): void {
        this.createChart(root, canvasId, {
            type: 'doughnut',
            data: {
                labels: rows.map((row) => row.label),
                datasets: [{ data: rows.map((row) => row.value), backgroundColor: this.getPalette() }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { color: '#a0a0b0' } },
                    tooltip: { callbacks: { label: (context: any) => `${context.label}: ${formatValue(context.parsed)}` } }
                }
            }
        });
    }

    private createChart(root: HTMLElement, canvasId: string, config: any): void {
        const canvas = root.querySelector(`#${canvasId}`) as HTMLCanvasElement | null;
        if (!canvas) return;
        this.charts.push(new Chart(canvas, config));
    }

    private getOverviewStats(logs: ActivitySummary[], aggregates: MediaAggregate[]): { label: string; value: string; sublabel: string }[] {
        const totalMinutes = logs.reduce((sum, log) => sum + log.duration_minutes, 0);
        const totalChars = logs.reduce((sum, log) => sum + log.characters_read, 0);
        const activeDays = new Set(logs.map((log) => log.date)).size;
        const readingMinutes = logs
            .filter((log) => isReadingContentType(log.content_type))
            .reduce((sum, log) => sum + log.duration_minutes, 0);
        const readingSpeed = readingMinutes > 0 && totalChars > 0 ? Math.round(totalChars / (readingMinutes / 60)) : 0;
        const dailyMedia = new Map<string, Set<number>>();
        for (const log of logs) {
            if (!dailyMedia.has(log.date)) dailyMedia.set(log.date, new Set());
            dailyMedia.get(log.date)!.add(log.media_id);
        }
        const focusedDays = Array.from(dailyMedia.values()).filter((media) => media.size === 1).length;
        const repeatMedia = aggregates.filter((row) => row.sessions > 1).length;
        const busiestWeekday = this.getBusiestWeekday(logs);
        const readingShare = totalMinutes > 0 ? Math.round((readingMinutes / totalMinutes) * 100) : 0;

        return [
            { label: 'Total Time', value: formatDuration(totalMinutes), sublabel: `${logs.length.toLocaleString()} sessions` },
            { label: '文字 Read', value: totalChars.toLocaleString(), sublabel: readingSpeed > 0 ? `${readingSpeed.toLocaleString()} 文字/hour` : 'No speed yet' },
            { label: 'Active Days', value: activeDays.toLocaleString(), sublabel: `${this.getCurrentStreak(logs)} day current streak` },
            { label: 'Media Touched', value: aggregates.length.toLocaleString(), sublabel: `${this.state.mediaList.length.toLocaleString()} library entries` },
            { label: 'Average Session', value: logs.length > 0 ? formatDuration(totalMinutes / logs.length) : '00:00', sublabel: 'per log' },
            { label: 'Completion Rate', value: this.getCompletionRate(), sublabel: 'library complete' },
            { label: 'Reading Share', value: `${readingShare}%`, sublabel: 'of logged time' },
            { label: 'Time / Active Day', value: activeDays > 0 ? formatDuration(totalMinutes / activeDays) : '00:00', sublabel: 'logged-day average' },
            { label: '文字 / Active Day', value: activeDays > 0 ? Math.round(totalChars / activeDays).toLocaleString() : '0', sublabel: 'logged-day average' },
            { label: 'Logs / Active Day', value: activeDays > 0 ? (logs.length / activeDays).toFixed(1) : '0.0', sublabel: 'session density' },
            { label: 'Repeat Rate', value: aggregates.length > 0 ? `${Math.round((repeatMedia / aggregates.length) * 100)}%` : '0%', sublabel: 'media with 2+ logs' },
            { label: 'Focus Ratio', value: activeDays > 0 ? `${Math.round((focusedDays / activeDays) * 100)}%` : '0%', sublabel: 'single-media days' },
            { label: 'Busiest Weekday', value: busiestWeekday.label, sublabel: formatDuration(busiestWeekday.minutes) },
            { label: 'Media / Active Day', value: activeDays > 0 ? (Array.from(dailyMedia.values()).reduce((sum, media) => sum + media.size, 0) / activeDays).toFixed(1) : '0.0', sublabel: 'rotation breadth' }
        ];
    }

    private getRecords(logs: ActivitySummary[], allAggregates: MediaAggregate[]): { label: string; value: string }[] {
        const dailyMinutes = new Map<string, number>();
        const dailyChars = new Map<string, number>();
        const dailyMedia = new Map<string, Set<number>>();
        const weeklyMinutes = new Map<string, number>();
        const monthlyMinutes = new Map<string, number>();
        for (const log of logs) {
            dailyMinutes.set(log.date, (dailyMinutes.get(log.date) || 0) + log.duration_minutes);
            dailyChars.set(log.date, (dailyChars.get(log.date) || 0) + log.characters_read);
            if (!dailyMedia.has(log.date)) dailyMedia.set(log.date, new Set());
            dailyMedia.get(log.date)!.add(log.media_id);
            const weekKey = this.getWeekKey(log.date);
            weeklyMinutes.set(weekKey, (weeklyMinutes.get(weekKey) || 0) + log.duration_minutes);
            const monthKey = log.date.slice(0, 7);
            monthlyMinutes.set(monthKey, (monthlyMinutes.get(monthKey) || 0) + log.duration_minutes);
        }
        const bestDay = this.maxEntry(dailyMinutes);
        const bestCharsDay = this.maxEntry(dailyChars);
        const longestSession = logs.reduce((best, log) => log.duration_minutes > best.duration_minutes ? log : best, logs[0]);
        const mostRead = allAggregates.filter((row) => row.characters > 0).sort((a, b) => b.characters - a.characters)[0];
        const bestWeek = this.maxEntry(weeklyMinutes);
        const bestMonth = this.maxEntry(monthlyMinutes);
        const mostDiverseDay = this.maxSetEntry(dailyMedia);
        const fastestSession = logs
            .filter((log) => isReadingContentType(log.content_type) && log.characters_read > 0 && log.duration_minutes > 0)
            .map((log) => ({ log, speed: Math.round(log.characters_read / (log.duration_minutes / 60)) }))
            .sort((a, b) => b.speed - a.speed)[0];
        const largestComeback = this.getComebackGaps(this.state.logs)[0];
        const longestQuietStretch = this.getLongestQuietStretch(this.state.logs);
        const mostLoggedMedia = [...allAggregates].sort((a, b) => b.sessions - a.sessions)[0];
        const widestSpan = [...allAggregates]
            .filter((row) => row.firstDate && row.lastDate)
            .map((row) => ({ title: row.title, days: this.daysBetween(row.firstDate, row.lastDate) + 1 }))
            .sort((a, b) => b.days - a.days)[0];

        return [
            { label: 'Best Time Day', value: bestDay ? `${bestDay[0]} / ${formatDuration(bestDay[1])}` : 'No data' },
            { label: 'Best 文字 Day', value: bestCharsDay ? `${bestCharsDay[0]} / ${bestCharsDay[1].toLocaleString()} 文字` : 'No data' },
            { label: 'Best Week', value: bestWeek ? `${bestWeek[0]} / ${formatDuration(bestWeek[1])}` : 'No data' },
            { label: 'Best Month', value: bestMonth ? `${bestMonth[0]} / ${formatDuration(bestMonth[1])}` : 'No data' },
            { label: 'Longest Session', value: longestSession ? `${escapeHTML(longestSession.title)} / ${formatDuration(longestSession.duration_minutes)}` : 'No data' },
            { label: 'Fastest Reading Session', value: fastestSession ? `${escapeHTML(fastestSession.log.title)} / ${fastestSession.speed.toLocaleString()} 文字/hour` : 'No data' },
            { label: 'Most Read Entry', value: mostRead ? `${escapeHTML(mostRead.title)} / ${mostRead.characters.toLocaleString()} 文字` : 'No data' },
            { label: 'Most Logged Entry', value: mostLoggedMedia ? `${escapeHTML(mostLoggedMedia.title)} / ${mostLoggedMedia.sessions.toLocaleString()} sessions` : 'No data' },
            { label: 'Most Diverse Day', value: mostDiverseDay ? `${mostDiverseDay[0]} / ${mostDiverseDay[1].size} media` : 'No data' },
            { label: 'Largest Comeback', value: largestComeback ? `${largestComeback[0]} / ${largestComeback[1]}` : 'No data' },
            { label: 'Longest Quiet Stretch', value: `${longestQuietStretch} days` },
            { label: 'Longest Streak', value: `${this.getLongestStreak(this.state.logs)} days` },
            { label: 'Widest Active Span', value: widestSpan ? `${escapeHTML(widestSpan.title)} / ${widestSpan.days.toLocaleString()} days` : 'No data' }
        ];
    }

    private getTopMediaByTime(aggregates: MediaAggregate[]): string[][] {
        return [...aggregates]
            .sort((a, b) => b.minutes - a.minutes)
            .slice(0, 8)
            .map((row) => [escapeHTML(row.title), formatDuration(row.minutes)]);
    }

    private getTopReadingByChars(aggregates: MediaAggregate[]): string[][] {
        return [...aggregates]
            .filter((row) => row.characters > 0)
            .sort((a, b) => b.characters - a.characters)
            .slice(0, 8)
            .map((row) => [escapeHTML(row.title), `${row.characters.toLocaleString()} 文字`]);
    }

    private getFastestReadingMedia(aggregates: MediaAggregate[]): string[][] {
        return [...aggregates]
            .filter((row) => isReadingContentType(row.contentType) && row.characters > 0 && row.minutes > 0)
            .map((row) => ({ title: row.title, speed: Math.round(row.characters / (row.minutes / 60)) }))
            .sort((a, b) => b.speed - a.speed)
            .slice(0, 8)
            .map((row) => [escapeHTML(row.title), `${row.speed.toLocaleString()} 文字/hour`]);
    }

    private getMostFrequentMedia(aggregates: MediaAggregate[]): string[][] {
        return [...aggregates]
            .sort((a, b) => b.sessions - a.sessions)
            .slice(0, 8)
            .map((row) => [escapeHTML(row.title), row.sessions.toLocaleString()]);
    }

    private getLongestSpans(aggregates: MediaAggregate[]): string[][] {
        return [...aggregates]
            .filter((row) => row.firstDate && row.lastDate)
            .map((row) => ({ title: row.title, days: this.daysBetween(row.firstDate, row.lastDate) + 1 }))
            .sort((a, b) => b.days - a.days)
            .slice(0, 8)
            .map((row) => [escapeHTML(row.title), `${row.days.toLocaleString()} days`]);
    }

    private getReadingSpeedVolatility(logs: ActivitySummary[]): string[][] {
        const speedMap = new Map<string, number[]>();
        for (const log of logs) {
            if (!isReadingContentType(log.content_type) || log.characters_read <= 0 || log.duration_minutes <= 0) continue;
            if (!speedMap.has(log.title)) speedMap.set(log.title, []);
            speedMap.get(log.title)!.push(Math.round(log.characters_read / (log.duration_minutes / 60)));
        }

        return Array.from(speedMap.entries())
            .filter(([, speeds]) => speeds.length >= 2)
            .map(([title, speeds]) => ({
                title,
                spread: Math.max(...speeds) - Math.min(...speeds),
                low: Math.min(...speeds),
                high: Math.max(...speeds)
            }))
            .sort((a, b) => b.spread - a.spread)
            .slice(0, 8)
            .map((row) => [escapeHTML(row.title), `${row.low.toLocaleString()}-${row.high.toLocaleString()}`]);
    }

    private getComebackGaps(logs: ActivitySummary[]): string[][] {
        const dateMap = new Map<string, Set<string>>();
        for (const log of logs) {
            if (!dateMap.has(log.title)) dateMap.set(log.title, new Set());
            dateMap.get(log.title)!.add(log.date);
        }

        return Array.from(dateMap.entries())
            .map(([title, dateSet]) => {
                const dates = Array.from(dateSet).sort();
                let maxGap = 0;
                for (let i = 1; i < dates.length; i++) {
                    maxGap = Math.max(maxGap, this.daysBetween(dates[i - 1], dates[i]));
                }
                return { title, maxGap };
            })
            .filter((row) => row.maxGap > 0)
            .sort((a, b) => b.maxGap - a.maxGap)
            .slice(0, 8)
            .map((row) => [escapeHTML(row.title), `${row.maxGap.toLocaleString()} days`]);
    }

    private getDormantHeavyHitters(rangeLogs: ActivitySummary[], allAggregates: MediaAggregate[]): string[][] {
        const activeIds = new Set(rangeLogs.map((log) => log.media_id));
        return [...allAggregates]
            .filter((row) => row.minutes > 0 && !activeIds.has(row.mediaId))
            .sort((a, b) => b.minutes - a.minutes)
            .slice(0, 8)
            .map((row) => [escapeHTML(row.title), row.lastDate || 'No date']);
    }

    private getMediaAggregates(logs: ActivitySummary[]): MediaAggregate[] {
        const map = new Map<number, MediaAggregate>();
        for (const log of logs) {
            const existing = map.get(log.media_id) || {
                mediaId: log.media_id,
                title: log.title,
                mediaType: log.media_type,
                contentType: log.content_type,
                minutes: 0,
                characters: 0,
                sessions: 0,
                activeDays: new Set<string>(),
                firstDate: log.date,
                lastDate: log.date
            };
            existing.minutes += log.duration_minutes;
            existing.characters += log.characters_read;
            existing.sessions += 1;
            existing.activeDays.add(log.date);
            if (log.date < existing.firstDate) existing.firstDate = log.date;
            if (log.date > existing.lastDate) existing.lastDate = log.date;
            map.set(log.media_id, existing);
        }
        return Array.from(map.values());
    }

    private getLogsInSelectedRange(): ActivitySummary[] {
        const start = this.getRangeStartDate(this.state.range);
        if (!start) return [...this.state.logs].sort((a, b) => a.date.localeCompare(b.date));
        return this.state.logs.filter((log) => log.date >= start).sort((a, b) => a.date.localeCompare(b.date));
    }

    private getRangeStartDate(range: StatsRange): string {
        if (range === 'all_time') return '';
        const today = new Date();
        const start = new Date(today);
        if (range === 'week') start.setDate(today.getDate() - 6);
        if (range === 'month') start.setMonth(today.getMonth() - 1);
        if (range === 'year') start.setFullYear(today.getFullYear() - 1);
        return this.getLocalISODate(start);
    }

    private sumMediaBy(getLabel: (media: Media) => string): { label: string; value: number }[] {
        const map = new Map<string, number>();
        for (const media of this.state.mediaList) {
            const label = getLabel(media);
            map.set(label, (map.get(label) || 0) + 1);
        }
        return Array.from(map.entries())
            .map(([label, value]) => ({ label, value }))
            .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
    }

    private getCompletionRate(): string {
        if (this.state.mediaList.length === 0) return '0%';
        const complete = this.state.mediaList.filter((media) => media.tracking_status === 'Complete').length;
        return `${Math.round((complete / this.state.mediaList.length) * 100)}%`;
    }

    private getCurrentStreak(logs: ActivitySummary[]): number {
        const days = new Set(logs.map((log) => log.date));
        let cursor = new Date();
        let streak = 0;
        while (days.has(this.getLocalISODate(cursor))) {
            streak += 1;
            cursor.setDate(cursor.getDate() - 1);
        }
        return streak;
    }

    private getBusiestWeekday(logs: ActivitySummary[]): { label: string; minutes: number } {
        const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const values = Array(7).fill(0);
        for (const log of logs) {
            values[this.parseDate(log.date).getDay()] += log.duration_minutes;
        }
        const bestIndex = values.reduce((best, value, index) => value > values[best] ? index : best, 0);
        return { label: values[bestIndex] > 0 ? labels[bestIndex] : 'No data', minutes: values[bestIndex] };
    }

    private getLongestStreak(logs: ActivitySummary[]): number {
        const days = Array.from(new Set(logs.map((log) => log.date))).sort();
        let best = 0;
        let current = 0;
        let previous = '';
        for (const day of days) {
            current = previous && this.daysBetween(previous, day) === 1 ? current + 1 : 1;
            best = Math.max(best, current);
            previous = day;
        }
        return best;
    }

    private maxEntry(map: Map<string, number>): [string, number] | null {
        let best: [string, number] | null = null;
        for (const entry of map.entries()) {
            if (!best || entry[1] > best[1]) best = entry;
        }
        return best;
    }

    private maxSetEntry(map: Map<string, Set<number>>): [string, Set<number>] | null {
        let best: [string, Set<number>] | null = null;
        for (const entry of map.entries()) {
            if (!best || entry[1].size > best[1].size) best = entry;
        }
        return best;
    }

    private getLongestQuietStretch(logs: ActivitySummary[]): number {
        const days = Array.from(new Set(logs.map((log) => log.date))).sort();
        let best = 0;
        for (let i = 1; i < days.length; i++) {
            best = Math.max(best, this.daysBetween(days[i - 1], days[i]) - 1);
        }
        return best;
    }

    private getReadingSpeedBuckets(logs: ActivitySummary[]): {
        labels: string[];
        displayLabels: string[];
        getBucketKey: (date: string) => string;
    } {
        const startDate = this.getRangeStartDate(this.state.range);

        if (this.state.range === 'week' || this.state.range === 'month') {
            const start = startDate ? this.parseDate(startDate) : this.parseDate(logs[0]?.date || this.getLocalISODate(new Date()));
            const end = new Date();
            const labels: string[] = [];
            for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
                labels.push(this.getLocalISODate(cursor));
            }
            return {
                labels,
                displayLabels: labels.map((label) => label.slice(5)),
                getBucketKey: (date) => date
            };
        }

        const firstDate = startDate || logs[0]?.date || this.getLocalISODate(new Date());
        const start = this.parseDate(firstDate.slice(0, 7) + '-01');
        const end = new Date();
        const labels: string[] = [];
        for (let cursor = new Date(start); cursor <= end; cursor.setMonth(cursor.getMonth() + 1)) {
            labels.push(this.getLocalISODate(cursor).slice(0, 7));
        }
        return {
            labels,
            displayLabels: labels,
            getBucketKey: (date) => date.slice(0, 7)
        };
    }

    private getChartOptions(tickFormatter?: (value: string | number) => string): any {
        return {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { grid: { color: '#3f3f4e' }, ticks: { color: '#a0a0b0', maxTicksLimit: 10 } },
                y: {
                    beginAtZero: true,
                    grid: { color: '#3f3f4e' },
                    ticks: { color: '#a0a0b0', callback: tickFormatter }
                }
            },
            plugins: { legend: { labels: { color: '#a0a0b0' } } }
        };
    }

    private getPalette(): string[] {
        const style = getComputedStyle(document.body);
        return [
            style.getPropertyValue('--chart-1').trim() || '#f4a6b8',
            style.getPropertyValue('--chart-2').trim() || '#b8cdda',
            style.getPropertyValue('--chart-3').trim() || '#e0bbe4',
            style.getPropertyValue('--chart-4').trim() || '#957DAD',
            style.getPropertyValue('--chart-5').trim() || '#D291BC',
            style.getPropertyValue('--accent-blue').trim() || '#7eb6ff',
            style.getPropertyValue('--accent-yellow').trim() || '#ffd700'
        ];
    }

    private parseDate(dateStr: string): Date {
        return new Date(`${dateStr}T00:00:00`);
    }

    private daysBetween(start: string, end: string): number {
        const startTime = this.parseDate(start).getTime();
        const endTime = this.parseDate(end).getTime();
        return Math.round((endTime - startTime) / 86400000);
    }

    private getWeekKey(dateStr: string): string {
        const date = this.parseDate(dateStr);
        const day = date.getDay();
        const diffToMonday = day === 0 ? 6 : day - 1;
        date.setDate(date.getDate() - diffToMonday);
        return this.getLocalISODate(date);
    }

    private getLocalISODate(date: Date): string {
        const pad = (value: number) => value.toString().padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }

    private destroyCharts(): void {
        for (const chart of this.charts) chart.destroy();
        this.charts = [];
    }

    public destroy(): void {
        this.destroyCharts();
    }
}
