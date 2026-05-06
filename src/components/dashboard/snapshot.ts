import { ActivitySummary, DailyHeatmap, Media } from '../../api';

export interface DashboardSnapshot {
    logs: ActivitySummary[];
    heatmapData: DailyHeatmap[];
    mediaList: Media[];
}

export function buildDashboardSnapshot(
    logs: ActivitySummary[],
    mediaList: Media[],
    asOfDate?: string
): DashboardSnapshot {
    const snapshotLogs = asOfDate
        ? logs.filter((log) => log.date <= asOfDate)
        : [...logs];

    return {
        logs: snapshotLogs,
        heatmapData: buildHeatmap(snapshotLogs),
        mediaList: buildMediaSnapshot(mediaList, snapshotLogs)
    };
}

function buildHeatmap(logs: ActivitySummary[]): DailyHeatmap[] {
    const totalsByDate = new Map<string, number>();

    for (const log of logs) {
        totalsByDate.set(log.date, (totalsByDate.get(log.date) || 0) + log.duration_minutes);
    }

    return Array.from(totalsByDate.entries())
        .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
        .map(([date, total_minutes]) => ({ date, total_minutes }));
}

function buildMediaSnapshot(mediaList: Media[], logs: ActivitySummary[]): Media[] {
    const totalsByMedia = new Map<number, {
        total_time_logged: number;
        total_characters_read: number;
        last_activity_date: string;
    }>();

    for (const log of logs) {
        const current = totalsByMedia.get(log.media_id) || {
            total_time_logged: 0,
            total_characters_read: 0,
            last_activity_date: ''
        };

        current.total_time_logged += log.duration_minutes;
        current.total_characters_read += log.characters_read;
        if (log.date > current.last_activity_date) current.last_activity_date = log.date;
        totalsByMedia.set(log.media_id, current);
    }

    return mediaList.map((media) => {
        const totals = media.id !== undefined ? totalsByMedia.get(media.id) : undefined;

        return {
            ...media,
            total_time_logged: totals?.total_time_logged || 0,
            total_characters_read: totals?.total_characters_read || 0,
            last_activity_date: totals?.last_activity_date || ''
        };
    });
}
