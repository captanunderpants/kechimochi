import { Component } from '../core/component';
import { escapeHTML, html } from '../core/html';
import { Dashboard } from './dashboard';

interface TimeTravelState {
    inputDate: string;
    selectedDate: string | null;
    error: string | null;
}

export class TimeTravelView extends Component<TimeTravelState> {
    private dashboard: Dashboard | null = null;

    constructor(container: HTMLElement) {
        super(container, {
            inputDate: TimeTravelView.getLocalISODate(new Date()),
            selectedDate: null,
            error: null
        });
    }

    public resetLoaded(): void {
        this.dashboard?.destroy();
        this.dashboard = null;
    }

    render(): void {
        this.dashboard?.destroy();
        this.dashboard = null;
        this.clear();

        const maxDate = TimeTravelView.getLocalISODate(new Date());
        const root = html`
            <div class="animate-fade-in time-travel-view">
                <div class="card time-travel-card">
                    <div>
                        <h2 class="time-travel-title">Time Travel</h2>
                        <p class="time-travel-subtitle">Choose a date to view the dashboard using activity logged on or before that day.</p>
                    </div>
                    <form id="time-travel-form" class="time-travel-form">
                        <input id="time-travel-date" type="date" value="${escapeHTML(this.state.inputDate)}" max="${maxDate}" />
                        <button class="btn btn-primary" type="submit">View Day</button>
                    </form>
                    ${this.state.error ? `<div class="time-travel-error">${escapeHTML(this.state.error)}</div>` : ''}
                </div>
                <div id="time-travel-dashboard"></div>
            </div>
        `;

        this.container.appendChild(root);

        const form = root.querySelector('#time-travel-form') as HTMLFormElement | null;
        const input = root.querySelector('#time-travel-date') as HTMLInputElement | null;
        form?.addEventListener('submit', (event) => {
            event.preventDefault();
            const date = input?.value || '';
            const error = this.validateDate(date, maxDate);
            this.state = {
                inputDate: date,
                selectedDate: error ? this.state.selectedDate : date,
                error
            };
            this.render();
        });

        if (!this.state.selectedDate) return;

        const dashboardHeader = html`
            <div class="time-travel-snapshot-header">
                <span>Dashboard as of ${escapeHTML(this.state.selectedDate)}</span>
            </div>
        `;
        const dashboardContainer = root.querySelector('#time-travel-dashboard') as HTMLElement;
        dashboardContainer.appendChild(dashboardHeader);

        const dashboardBody = html`<div></div>`;
        dashboardContainer.appendChild(dashboardBody);
        this.dashboard = new Dashboard(dashboardBody, {
            asOfDate: this.state.selectedDate,
            readOnly: true
        });
        this.dashboard.render();
    }

    public destroy(): void {
        this.dashboard?.destroy();
        this.dashboard = null;
    }

    private validateDate(date: string, maxDate: string): string | null {
        if (!date) return 'Select a date.';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Use a valid date.';

        const parsed = TimeTravelView.parseLocalDate(date);
        if (Number.isNaN(parsed.getTime()) || TimeTravelView.getLocalISODate(parsed) !== date) {
            return 'Use a valid date.';
        }

        if (date > maxDate) return 'Choose today or an earlier date.';
        return null;
    }

    private static parseLocalDate(dateStr: string): Date {
        const [year, month, day] = dateStr.split('-').map(Number);
        return new Date(year, month - 1, day);
    }

    private static getLocalISODate(date: Date): string {
        const pad = (value: number) => value.toString().padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }
}
