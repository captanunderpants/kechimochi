import { Component } from '../../core/component';
import { html } from '../../core/html';
import { Media, updateMedia } from '../../api';
import { MediaItem } from './MediaItem';
import { isReadingContentType } from '../../modals/activity';

interface MediaGridState {
    mediaList: Media[];
    searchQuery: string;
    typeFilter: string;
    statusFilter: string;
    immersionFilter: string;
    sortBy: string;
    sortAscending: boolean;
}

export class MediaGrid extends Component<MediaGridState> {
    private onMediaClick: (mediaId: number) => void;
    private onDataChange: (jumpToId?: number) => Promise<void>;
    private onFilterChange?: (filters: any) => void;
    private isDestroyed: boolean = false;
    private currentRenderId: number = 0;
    private headerRendered: boolean = false;
    private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(container: HTMLElement, initialState: MediaGridState, onMediaClick: (mediaId: number) => void, onDataChange: (jumpToId?: number) => Promise<void>, onFilterChange?: (filters: any) => void) {
        super(container, initialState);
        this.onMediaClick = onMediaClick;
        this.onDataChange = onDataChange;
        this.onFilterChange = onFilterChange;
    }

    public destroy() {
        this.isDestroyed = true;
    }

    render() {
        if (!this.headerRendered) {
            this.clear();
            const headerContainer = document.createElement('div');
            headerContainer.id = 'media-grid-header';
            this.container.appendChild(headerContainer);

            const gridContainer = document.createElement('div');
            gridContainer.id = 'media-grid-container';
            gridContainer.className = 'media-grid-scroll-container';
            gridContainer.style.cssText = `display: flex; flex-direction: column; overflow-y: auto; flex: 1; padding: 0.5rem 1rem 2rem 1rem;`;
            this.container.appendChild(gridContainer);

            this.renderHeader(headerContainer);
            this.headerRendered = true;
        }

        this.refreshGrid();
    }

    private refreshGrid() {
        const container = this.container.querySelector('#media-grid-container') as HTMLElement;
        if (container) {
            this.renderItems(container);
        }
    }

    private renderHeader(container: HTMLElement) {
        container.innerHTML = '';
        const uniqueTypes = Array.from(new Set(this.state.mediaList.map(m => m.content_type || 'Unknown'))).sort();
        
        const header = html`
            <div style="padding: 0 1rem; display: flex; gap: 1rem; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 1rem;">
                    <h2 style="margin: 0.5rem 0; color: var(--text-primary); white-space: nowrap;">Library</h2>
                    <select id="grid-sort-select" style="padding: 0.4rem 0.8rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-dark); color: var(--text-primary); outline: none; cursor: pointer; font-size: 0.8rem;">
                        <option value="default" ${this.state.sortBy === 'default' ? 'selected' : ''}>Sort: Recent</option>
                        <option value="title" ${this.state.sortBy === 'title' ? 'selected' : ''}>Sort: Title</option>
                        <option value="time" ${this.state.sortBy === 'time' ? 'selected' : ''}>Sort: Time</option>
                        <option value="chars" ${this.state.sortBy === 'chars' ? 'selected' : ''}>Sort: Chars Read</option>
                        <option value="speed" ${this.state.sortBy === 'speed' ? 'selected' : ''}>Sort: Speed</option>
                        <option value="finished" ${this.state.sortBy === 'finished' ? 'selected' : ''}>Sort: Finished</option>
                    </select>
                    <button class="btn btn-ghost" id="btn-sort-direction" title="Toggle sort direction" style="padding: 0.4rem; display: flex; align-items: center; justify-content: center; font-size: 1rem; min-width: 28px;">
                        ${this.state.sortAscending ? '↑' : '↓'}
                    </button>
                    <button class="btn btn-ghost" id="btn-refresh-grid" title="Refresh Library" style="padding: 0.4rem; display: flex; align-items: center; justify-content: center;">
                        <svg id="refresh-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                        </svg>
                    </button>
                </div>
                <input type="text" id="grid-search-filter" placeholder="Search title..." style="flex: 1; min-width: 0; padding: 0.4rem 0.8rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-dark); color: var(--text-primary); outline: none;" value="${this.state.searchQuery}" autocomplete="off" />
                <select id="grid-immersion-select" style="padding: 0.4rem 0.8rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-dark); color: var(--text-primary); outline: none; cursor: pointer;">
                    <option value="All" ${this.state.immersionFilter === 'All' ? 'selected' : ''}>All Immersion</option>
                    <option value="Reading" ${this.state.immersionFilter === 'Reading' ? 'selected' : ''}>Reading</option>
                    <option value="Listening" ${this.state.immersionFilter === 'Listening' ? 'selected' : ''}>Listening</option>
                    <option value="Playing" ${this.state.immersionFilter === 'Playing' ? 'selected' : ''}>Playing</option>
                </select>
                <select id="grid-status-select" style="padding: 0.4rem 0.8rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-dark); color: var(--text-primary); outline: none; cursor: pointer;">
                    <option value="All" ${this.state.statusFilter === 'All' ? 'selected' : ''}>All Statuses</option>
                    ${["Ongoing", "Complete", "Paused", "Dropped", "Not Started", "Untracked"].map(s => `<option value="${s}" ${this.state.statusFilter === s ? 'selected' : ''}>${s}</option>`).join('')}
                </select>
                <select id="grid-type-select" style="padding: 0.4rem 0.8rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-dark); color: var(--text-primary); outline: none; cursor: pointer;">
                    <option value="All" ${this.state.typeFilter === 'All' ? 'selected' : ''}>All Types</option>
                    ${uniqueTypes.map(t => `<option value="${t}" ${this.state.typeFilter === t ? 'selected' : ''}>${t}</option>`).join('')}
                </select>
            </div>
        `;
        container.appendChild(header);
        this.setupListeners(header);
    }

    private setupListeners(header: HTMLElement) {
        header.querySelector('#grid-sort-select')?.addEventListener('change', (e) => {
            this.state.sortBy = (e.target as HTMLSelectElement).value;
            this.refreshGrid();
            this.notifyFilterChange();
        });

        header.querySelector('#btn-sort-direction')?.addEventListener('click', () => {
            this.state.sortAscending = !this.state.sortAscending;
            const btn = header.querySelector('#btn-sort-direction') as HTMLElement;
            if (btn) btn.textContent = this.state.sortAscending ? '↑' : '↓';
            this.refreshGrid();
            this.notifyFilterChange();
        });

        header.querySelector('#btn-refresh-grid')?.addEventListener('click', async (e) => {
            const btn = e.currentTarget as HTMLElement;
            const icon = btn.querySelector('#refresh-icon') as HTMLElement;
            if (icon) icon.style.animation = 'spin 0.8s linear infinite';
            
            await this.onDataChange();
            
            // Note: MediaGrid might be re-initialized if MediaView recreates it, 
            // but the animation helps feedback until the update.
            if (icon) icon.style.animation = '';
        });

        header.querySelector('#grid-search-filter')?.addEventListener('input', (e) => {
            this.state.searchQuery = (e.target as HTMLInputElement).value;
            if (this.searchDebounceTimer !== null) clearTimeout(this.searchDebounceTimer);
            this.searchDebounceTimer = setTimeout(() => {
                this.refreshGrid();
                this.notifyFilterChange();
            }, 150);
        });

        header.querySelector('#grid-immersion-select')?.addEventListener('change', (e) => {
            this.state.immersionFilter = (e.target as HTMLSelectElement).value;
            this.refreshGrid();
            this.notifyFilterChange();
        });

        header.querySelector('#grid-type-select')?.addEventListener('change', (e) => {
            this.state.typeFilter = (e.target as HTMLSelectElement).value;
            this.refreshGrid();
            this.notifyFilterChange();
        });

        header.querySelector('#grid-status-select')?.addEventListener('change', (e) => {
            this.state.statusFilter = (e.target as HTMLSelectElement).value;
            this.refreshGrid();
            this.notifyFilterChange();
        });
    }

    private notifyFilterChange() {
        if (this.onFilterChange) {
            const { searchQuery, typeFilter, statusFilter, immersionFilter, sortBy, sortAscending } = this.state;
            this.onFilterChange({ searchQuery, typeFilter, statusFilter, immersionFilter, sortBy, sortAscending });
        }
    }

    private isHidden(media: Media): boolean {
        if (media.hidden) return true;
        const noCover = !media.cover_image || media.cover_image.trim() === '';
        const notOngoing = media.tracking_status !== 'Ongoing';
        return noCover && notOngoing;
    }

    private async toggleHidden(media: Media) {
        media.hidden = !media.hidden;
        await updateMedia(media);
        this.refreshGrid();
    }

    private getReadingSpeed(media: Media): number {
        if (!isReadingContentType(media.content_type || '') || media.total_time_logged <= 0 || media.total_characters_read <= 0) return 0;
        return Math.round(media.total_characters_read / (media.total_time_logged / 60));
    }

    private sortMedia(list: Media[]): Media[] {
        const { sortBy, sortAscending } = this.state;
        const dir = sortAscending ? 1 : -1;

        if (sortBy === 'default') {
            // ascending comparator; dir=-1 (default) flips to descending = most recent first
            return [...list].sort((a, b) => dir * a.last_activity_date.localeCompare(b.last_activity_date));
        }

        return [...list].sort((a, b) => {
            switch (sortBy) {
                case 'title': return dir * a.title.localeCompare(b.title, 'ja');
                case 'time': return dir * (a.total_time_logged - b.total_time_logged);
                case 'chars': return dir * (a.total_characters_read - b.total_characters_read);
                case 'speed': return dir * (this.getReadingSpeed(a) - this.getReadingSpeed(b));
                case 'finished': return dir * a.last_activity_date.localeCompare(b.last_activity_date);
                default: return 0;
            }
        });
    }

    private renderItems(container: HTMLElement) {
        this.currentRenderId++;
        const renderId = this.currentRenderId;

        container.innerHTML = '';
        const { mediaList, searchQuery, typeFilter, statusFilter, immersionFilter } = this.state;
        
        const filteredList = mediaList.filter(media => {
            const matchesQuery = media.title.toLowerCase().includes(searchQuery.toLowerCase());
            const typeMatch = typeFilter === 'All' || (media.content_type || 'Unknown') === typeFilter;
            const statusMatch = statusFilter === 'All' || media.tracking_status === statusFilter;
            const immersionMatch = immersionFilter === 'All' || media.media_type === immersionFilter;
            return matchesQuery && typeMatch && statusMatch && immersionMatch;
        });

        if (filteredList.length === 0) {
            container.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 4rem;">No media matches your filters.</div>';
            return;
        }

        const sorted = this.sortMedia(filteredList);
        const visibleList = sorted.filter(m => !this.isHidden(m));
        const hiddenList = sorted.filter(m => this.isHidden(m));

        // Visible grid
        const visibleGrid = document.createElement('div');
        visibleGrid.style.cssText = `display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); grid-auto-rows: 320px; gap: 1.5rem; align-content: flex-start;`;
        container.appendChild(visibleGrid);

        this.renderBatchedItems(visibleGrid, visibleList, renderId, true);

        // Hidden dropdown
        if (hiddenList.length > 0) {
            const details = document.createElement('details');
            details.style.cssText = `margin-top: 2rem; border-top: 1px solid var(--border-color); padding-top: 1rem;`;
            
            const summary = document.createElement('summary');
            summary.style.cssText = `cursor: pointer; color: var(--text-secondary); font-size: 0.85rem; padding: 0.5rem 0; user-select: none;`;
            summary.textContent = `Hidden entries (${hiddenList.length})`;
            details.appendChild(summary);

            const hiddenGrid = document.createElement('div');
            hiddenGrid.style.cssText = `display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); grid-auto-rows: 320px; gap: 1.5rem; align-content: flex-start; margin-top: 1rem;`;
            details.appendChild(hiddenGrid);

            container.appendChild(details);

            // Render hidden items only when dropdown is opened
            let hiddenRendered = false;
            details.addEventListener('toggle', () => {
                if (details.open && !hiddenRendered) {
                    hiddenRendered = true;
                    this.renderBatchedItems(hiddenGrid, hiddenList, renderId, false);
                }
            });
        }
    }

    private renderBatchedItems(container: HTMLElement, items: Media[], renderId: number, animateFirst: boolean) {
        const batchSize = 10;
        const initialBatch = 15;
        let currentIndex = 0;

        const renderBatch = (isFirst = false) => {
            if (this.isDestroyed || renderId !== this.currentRenderId) return;
            const currentLimit = isFirst ? initialBatch : batchSize;
            const end = Math.min(currentIndex + currentLimit, items.length);
            
            const fragment = document.createDocumentFragment();
            for (let i = currentIndex; i < end; i++) {
                const media = items[i];
                const itemWrapper = document.createElement('div');
                itemWrapper.className = 'media-item-wrapper animate-page-fade-in';
                itemWrapper.style.opacity = '0';
                itemWrapper.style.animation = `fadeIn 0.25s ease-out ${(animateFirst && isFirst) ? (i * 0.02) : 0}s forwards`;
                
                // PERFORMANCE: Help browser skip rendering off-screen items
                itemWrapper.style.contentVisibility = 'auto';
                itemWrapper.style.containIntrinsicSize = '180px 320px';
                
                const item = new MediaItem(itemWrapper, media, () => this.onMediaClick(media.id!));
                item.render();

                // Right-click context menu
                itemWrapper.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    this.showContextMenu(e, media);
                });
                
                fragment.appendChild(itemWrapper);
            }
            container.appendChild(fragment);
            
            currentIndex = end;
            if (currentIndex < items.length && !this.isDestroyed && renderId === this.currentRenderId) {
                setTimeout(() => {
                   if (!this.isDestroyed && renderId === this.currentRenderId) requestAnimationFrame(() => renderBatch());
                }, isFirst ? 50 : 20);
            }
        };

        renderBatch(true);
    }

    private showContextMenu(e: MouseEvent, media: Media) {
        // Remove any existing context menu
        document.querySelector('.media-context-menu')?.remove();

        const isCurrentlyHidden = this.isHidden(media);
        const menu = document.createElement('div');
        menu.className = 'media-context-menu';
        menu.style.cssText = `position: fixed; left: ${e.clientX}px; top: ${e.clientY}px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 0.25rem 0; z-index: 9999; box-shadow: 0 4px 12px rgba(0,0,0,0.3); min-width: 150px;`;

        const option = document.createElement('div');
        option.style.cssText = `padding: 0.5rem 1rem; cursor: pointer; font-size: 0.85rem; color: var(--text-primary);`;
        option.textContent = isCurrentlyHidden ? 'Unhide entry' : 'Hide entry';
        option.addEventListener('mouseenter', () => option.style.background = 'var(--bg-card-hover)');
        option.addEventListener('mouseleave', () => option.style.background = 'transparent');
        option.addEventListener('click', () => {
            menu.remove();
            this.toggleHidden(media);
        });
        menu.appendChild(option);

        document.body.appendChild(menu);

        // Close on click outside
        const close = (ev: MouseEvent) => {
            if (!menu.contains(ev.target as Node)) {
                menu.remove();
                document.removeEventListener('click', close);
            }
        };
        setTimeout(() => document.addEventListener('click', close), 0);
    }
}
