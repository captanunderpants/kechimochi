import { getLogs, updateLog, deleteLog, formatDuration, parseDuration } from '../api';

export async function showLogEditorModal(): Promise<boolean> {
    return new Promise(async (resolve) => {
        const logs = await getLogs();
        let dirty = false;

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        document.body.appendChild(overlay);
        void overlay.offsetWidth;
        overlay.classList.add('active');

        overlay.innerHTML = `
            <div class="modal-content" style="max-width: 90vw; width: 900px; max-height: 85vh; display: flex; flex-direction: column;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                    <h3 style="margin: 0;">Edit Activity Logs</h3>
                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                        <span id="log-editor-count" style="font-size: 0.8rem; color: var(--text-secondary);">${logs.length} logs</span>
                        <input type="text" id="log-editor-search" placeholder="Filter by title..." autocomplete="off"
                               style="border: 1px solid var(--border-color); background: var(--bg-dark); color: var(--text-primary); padding: 0.4rem 0.6rem; border-radius: var(--radius-sm); font-size: 0.85rem; width: 200px;" />
                    </div>
                </div>
                <div style="display: grid; grid-template-columns: minmax(0, 2fr) 120px 110px 110px 60px; gap: 0.5rem; padding: 0.5rem 0.25rem; font-size: 0.75rem; font-weight: 600; color: var(--text-secondary); border-bottom: 1px solid var(--border-color);">
                    <span>Title</span>
                    <span>Duration</span>
                    <span>Characters</span>
                    <span>Date</span>
                    <span></span>
                </div>
                <div id="log-editor-list" style="flex: 1; overflow-y: auto; min-height: 0;"></div>
                <div style="display: flex; justify-content: flex-end; gap: 1rem; margin-top: 1rem; padding-top: 0.75rem; border-top: 1px solid var(--border-color);">
                    <button class="btn btn-ghost" id="log-editor-close">Close</button>
                </div>
            </div>`;

        const listEl = overlay.querySelector('#log-editor-list') as HTMLElement;
        const searchInput = overlay.querySelector('#log-editor-search') as HTMLInputElement;
        const countEl = overlay.querySelector('#log-editor-count') as HTMLElement;

        function renderRows(filter: string) {
            const filtered = filter
                ? logs.filter(l => l.title.toLowerCase().includes(filter.toLowerCase()))
                : logs;
            countEl.textContent = `${filtered.length} logs`;
            listEl.innerHTML = '';

            for (const log of filtered) {
                const row = document.createElement('div');
                row.style.cssText = 'display: grid; grid-template-columns: minmax(0, 2fr) 120px 110px 110px 60px; gap: 0.5rem; padding: 0.4rem 0.25rem; align-items: center; border-bottom: 1px solid var(--border-color); font-size: 0.85rem;';
                row.dataset.logId = String(log.id);

                row.innerHTML = `
                    <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${log.title}">${log.title}</span>
                    <input type="text" class="log-duration-input" data-id="${log.id}"
                           value="${formatDuration(log.duration_minutes)}"
                           style="border: 1px solid var(--border-color); background: var(--bg-dark); color: var(--text-primary); padding: 0.25rem 0.4rem; border-radius: var(--radius-sm); font-size: 0.85rem; font-family: monospace; width: 100%;" />
                    <input type="text" class="log-chars-input" data-id="${log.id}"
                           value="${log.characters_read > 0 ? log.characters_read : ''}"
                           placeholder="0"
                           style="border: 1px solid var(--border-color); background: var(--bg-dark); color: var(--text-primary); padding: 0.25rem 0.4rem; border-radius: var(--radius-sm); font-size: 0.85rem; width: 100%;" />
                    <input type="text" class="log-date-input" data-id="${log.id}"
                           value="${log.date}"
                           placeholder="YYYY-MM-DD"
                           style="border: 1px solid var(--border-color); background: var(--bg-dark); color: var(--text-primary); padding: 0.25rem 0.4rem; border-radius: var(--radius-sm); font-size: 0.85rem; font-family: monospace; width: 100%;" />
                    <button class="btn btn-danger btn-sm log-delete-btn" data-id="${log.id}" style="padding: 0.2rem 0.4rem; font-size: 0.7rem; background-color: #ff4757 !important; color: #ffffff !important; border: none; cursor: pointer;">Del</button>
                `;
                listEl.appendChild(row);
            }

            // Attach save-on-blur/Enter for duration
            listEl.querySelectorAll('.log-duration-input').forEach(input => {
                const inp = input as HTMLInputElement;
                const id = parseInt(inp.dataset.id!);
                const log = logs.find(l => l.id === id)!;
                const origValue = inp.value;

                const save = async () => {
                    const newVal = inp.value.trim();
                    if (newVal === origValue) return;
                    const parsed = parseDuration(newVal);
                    if (isNaN(parsed) || parsed < 0) {
                        inp.value = origValue;
                        inp.style.borderColor = 'var(--border-color)';
                        return;
                    }
                    try {
                        await updateLog(id, parsed, log.characters_read, log.date);
                        log.duration_minutes = parsed;
                        inp.value = formatDuration(parsed);
                        inp.style.borderColor = 'var(--accent-green)';
                        setTimeout(() => inp.style.borderColor = 'var(--border-color)', 800);
                        dirty = true;
                    } catch {
                        inp.value = origValue;
                    }
                };

                inp.addEventListener('blur', save);
                inp.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        inp.blur();
                        // Focus next duration input
                        const allInputs = Array.from(listEl.querySelectorAll('.log-duration-input')) as HTMLInputElement[];
                        const idx = allInputs.indexOf(inp);
                        if (idx < allInputs.length - 1) {
                            allInputs[idx + 1].focus();
                            allInputs[idx + 1].select();
                        }
                    }
                    if (e.key === 'Escape') {
                        inp.value = origValue;
                        inp.blur();
                    }
                });
            });

            // Attach save-on-blur/Enter for characters
            listEl.querySelectorAll('.log-chars-input').forEach(input => {
                const inp = input as HTMLInputElement;
                const id = parseInt(inp.dataset.id!);
                const log = logs.find(l => l.id === id)!;
                const origValue = inp.value;

                const save = async () => {
                    const newVal = inp.value.trim();
                    if (newVal === origValue) return;
                    const parsed = parseInt(newVal) || 0;
                    if (parsed < 0) { inp.value = origValue; return; }
                    try {
                        await updateLog(id, log.duration_minutes, parsed, log.date);
                        log.characters_read = parsed;
                        inp.style.borderColor = 'var(--accent-green)';
                        setTimeout(() => inp.style.borderColor = 'var(--border-color)', 800);
                        dirty = true;
                    } catch {
                        inp.value = origValue;
                    }
                };

                inp.addEventListener('blur', save);
                inp.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        inp.blur();
                        const allInputs = Array.from(listEl.querySelectorAll('.log-chars-input')) as HTMLInputElement[];
                        const idx = allInputs.indexOf(inp);
                        if (idx < allInputs.length - 1) {
                            allInputs[idx + 1].focus();
                            allInputs[idx + 1].select();
                        }
                    }
                    if (e.key === 'Escape') { inp.value = origValue; inp.blur(); }
                });
            });

            // Attach save-on-blur/Enter for date
            listEl.querySelectorAll('.log-date-input').forEach(input => {
                const inp = input as HTMLInputElement;
                const id = parseInt(inp.dataset.id!);
                const log = logs.find(l => l.id === id)!;
                const origValue = inp.value;

                const save = async () => {
                    const newVal = inp.value.trim();
                    if (newVal === origValue) return;
                    // Validate YYYY-MM-DD format
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(newVal)) { inp.value = origValue; return; }
                    try {
                        await updateLog(id, log.duration_minutes, log.characters_read, newVal);
                        log.date = newVal;
                        inp.style.borderColor = 'var(--accent-green)';
                        setTimeout(() => inp.style.borderColor = 'var(--border-color)', 800);
                        dirty = true;
                    } catch {
                        inp.value = origValue;
                    }
                };

                inp.addEventListener('blur', save);
                inp.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') { inp.blur(); }
                    if (e.key === 'Escape') { inp.value = origValue; inp.blur(); }
                });
            });

            // Delete buttons
            listEl.querySelectorAll('.log-delete-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const id = parseInt((btn as HTMLElement).dataset.id!);
                    const idx = logs.findIndex(l => l.id === id);
                    if (idx !== -1) {
                        await deleteLog(id);
                        logs.splice(idx, 1);
                        dirty = true;
                        renderRows(searchInput.value);
                    }
                });
            });
        }

        renderRows('');

        searchInput.addEventListener('input', () => renderRows(searchInput.value));

        const cleanup = () => {
            overlay.classList.remove('active');
            setTimeout(() => overlay.remove(), 300);
        };

        overlay.querySelector('#log-editor-close')!.addEventListener('click', () => { cleanup(); resolve(dirty); });
        overlay.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !(e.target as HTMLElement).classList.contains('log-duration-input')
                && !(e.target as HTMLElement).classList.contains('log-chars-input')
                && !(e.target as HTMLElement).classList.contains('log-date-input')
                && !(e.target as HTMLElement).matches('#log-editor-search')) {
                cleanup(); resolve(dirty);
            }
        });
    });
}
