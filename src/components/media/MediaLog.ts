import { Component } from '../../core/component';
import { html } from '../../core/html';
import { ActivitySummary, formatDuration } from '../../api';

interface MediaLogState {
    logs: ActivitySummary[];
}

export class MediaLog extends Component<MediaLogState> {
    private onDeleteLog?: (id: number) => Promise<void>;

    constructor(container: HTMLElement, logs: ActivitySummary[], onDeleteLog?: (id: number) => Promise<void>) {
        super(container, { logs });
        this.onDeleteLog = onDeleteLog;
    }

    render() {
        this.clear();

        if (this.state.logs.length === 0) {
            this.container.innerHTML = '<div style="color: var(--text-secondary);">No activity logs found for this media.</div>';
            return;
        }

        const list = html`<div style="display: flex; flex-direction: column; gap: 0.5rem; flex: 1; overflow-y: auto;"></div>`;

        this.state.logs.forEach(log => {
            const charsHtml = log.characters_read > 0 ? ` <span style="color: var(--accent-yellow); font-size: 0.8rem; margin-left: 0.5rem;">(${log.characters_read.toLocaleString()} chars)</span>` : '';
            const entry = html`
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem; border-bottom: 1px solid var(--border-color); font-size: 0.9rem;">
                    <span><span style="color: var(--text-secondary);">Activity:</span> ${formatDuration(log.duration_minutes)}${charsHtml}</span>
                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                        <span style="color: var(--text-secondary);">${log.date}</span>
                        ${this.onDeleteLog ? `<button class="log-delete-btn" data-id="${log.id}" style="background: transparent; border: 1px solid #ff4757; color: #ff4757; border-radius: var(--radius-sm); padding: 0.15rem 0.4rem; font-size: 0.75rem; cursor: pointer; line-height: 1.4;">Del</button>` : ''}
                    </div>
                </div>
            `;
            if (this.onDeleteLog) {
                const btn = entry.querySelector('.log-delete-btn') as HTMLButtonElement | null;
                btn?.addEventListener('click', async () => {
                    await this.onDeleteLog!(log.id!);
                });
            }
            list.appendChild(entry);
        });

        this.container.appendChild(list);
    }
}
