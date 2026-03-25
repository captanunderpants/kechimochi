import { Dashboard } from './components/dashboard';
import { MediaView } from './components/media_view';
import { ProfileView } from './components/profile';
import { 
    switchProfile, deleteProfile, listProfiles, 
    getUsername, getSetting 
} from './api';
import { 
    customPrompt, customConfirm, customAlert, 
    initialProfilePrompt, showLogActivityModal 
} from './modals';
import { getCurrentWindow } from '@tauri-apps/api/window';

const appWindow = getCurrentWindow();
const THEME_CACHE_PREFIX = 'kechimochi_theme_';

function getThemeCacheKey(profileName: string): string {
    return `${THEME_CACHE_PREFIX}${profileName}`;
}

function applyCachedTheme(profileName: string | null): void {
    if (!profileName) return;
    const cachedTheme = localStorage.getItem(getThemeCacheKey(profileName));
    if (cachedTheme) {
        document.body.dataset.theme = cachedTheme;
    }
}

applyCachedTheme(localStorage.getItem('kechimochi_profile'));

class App {
    private currentView: 'dashboard' | 'media' | 'profile' = 'dashboard';
    private currentProfile: string = localStorage.getItem('kechimochi_profile') || '';
    
    private dashboard: Dashboard;
    private mediaView: MediaView;
    private profileView: ProfileView;
    
    private viewContainer: HTMLElement;
    private selectProfileEl: HTMLSelectElement;
    private navLinks: NodeListOf<Element>;

    constructor() {
        this.viewContainer = document.getElementById('view-container')!;
        this.selectProfileEl = document.getElementById('select-profile') as HTMLSelectElement;
        this.navLinks = document.querySelectorAll('.nav-link');

        this.dashboard = new Dashboard(this.viewContainer);
        this.mediaView = new MediaView(this.viewContainer);
        this.profileView = new ProfileView(this.viewContainer);

        this.init();
    }

    private async init() {
        this.setupWindowControls();
        this.setupNavigation();
        this.setupProfileControls();
        this.setupGlobalActions();
        this.setupEventListeners();

        await this.ensureProfilesList();
        
        if (this.currentProfile) {
            await switchProfile(this.currentProfile);
            await this.loadTheme();
        }

        this.renderCurrentView();
    }

    private setupWindowControls() {
        document.getElementById('win-min')?.addEventListener('click', () => appWindow.minimize());
        document.getElementById('win-max')?.addEventListener('click', () => appWindow.toggleMaximize());
        document.getElementById('win-close')?.addEventListener('click', () => appWindow.close());
    }

    private setupNavigation() {
        this.navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                const target = e.target as HTMLElement;
                const view = target.getAttribute('data-view') as any;
                if (view) this.switchView(view);
            });
        });
    }

    private setupProfileControls() {
        this.selectProfileEl.addEventListener('change', async () => {
            this.currentProfile = this.selectProfileEl.value;
            localStorage.setItem('kechimochi_profile', this.currentProfile);
            applyCachedTheme(this.currentProfile);
            await switchProfile(this.currentProfile);
            await this.loadTheme();
            this.renderCurrentView();
        });

        document.getElementById('btn-add-profile')?.addEventListener('click', async () => {
            const newProfile = await customPrompt("Enter new user profile name:");
            if (newProfile && newProfile.trim() !== '') {
                this.currentProfile = newProfile.trim();
                localStorage.setItem('kechimochi_profile', this.currentProfile);
                applyCachedTheme(this.currentProfile);
                await switchProfile(this.currentProfile);
                await this.loadTheme();
                await this.ensureProfilesList();
                this.renderCurrentView();
            }
        });

        document.getElementById('btn-delete-profile')?.addEventListener('click', async () => {
            const profiles = await listProfiles();
            if (profiles.length <= 1) {
                await customAlert("Error", "Cannot delete the current profile because it is the only remaining user.");
                return;
            }
            const yes = await customConfirm("Delete User", `Are you sure you want to permanently delete the user '${this.currentProfile}'?`, "btn-danger", "Delete");
            if (yes) {
                await deleteProfile(this.currentProfile);
                const updatedProfiles = await listProfiles();
                this.currentProfile = updatedProfiles.length > 0 ? updatedProfiles[0] : 'default';
                localStorage.setItem('kechimochi_profile', this.currentProfile);
                applyCachedTheme(this.currentProfile);
                await switchProfile(this.currentProfile);
                await this.loadTheme();
                await this.ensureProfilesList();
                this.renderCurrentView();
            }
        });
    }

    private setupGlobalActions() {
        document.getElementById('btn-add-activity')?.addEventListener('click', async () => {
            const success = await showLogActivityModal();
            if (success) {
                this.renderCurrentView();
            }
        });
    }

    private setupEventListeners() {
        window.addEventListener('app-navigate', (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (detail && detail.view) {
                if (detail.view === 'media' && detail.focusMediaId !== undefined) {
                    this.switchView('media');
                    this.mediaView.jumpToMedia(detail.focusMediaId);
                }
            }
        });

        window.addEventListener('profile-updated', () => {
            this.loadTheme();
            this.ensureProfilesList();
        });
    }

    private async ensureProfilesList() {
        let profiles = await listProfiles();
        
        if (profiles.length === 0) {
            const osUsername = await getUsername();
            const initialName = await initialProfilePrompt(osUsername);
            this.currentProfile = initialName;
            localStorage.setItem('kechimochi_profile', this.currentProfile);
            await switchProfile(this.currentProfile);
            profiles = await listProfiles();
        } else if (!profiles.includes(this.currentProfile)) {
            this.currentProfile = profiles[0];
            localStorage.setItem('kechimochi_profile', this.currentProfile);
        }
        
        this.selectProfileEl.innerHTML = profiles.map(p => `<option value="${p}">${p}</option>`).join('');
        this.selectProfileEl.value = this.currentProfile;
    }

    private async loadTheme() {
        const theme = await getSetting('theme') || 'pastel-pink';
        document.body.dataset.theme = theme;
        if (this.currentProfile) {
            localStorage.setItem(getThemeCacheKey(this.currentProfile), theme);
        }
    }

    private switchView(view: 'dashboard' | 'media' | 'profile') {
        this.currentView = view;
        
        this.navLinks.forEach(n => {
            const dataView = n.getAttribute('data-view');
            n.classList.toggle('active', dataView === view);
        });

        this.renderCurrentView();
    }

    private renderCurrentView() {
        if (this.currentView === 'dashboard') {
            this.dashboard.resetLoaded();
            this.dashboard.render();
        }
        else if (this.currentView === 'media') {
            this.mediaView.resetLoaded();
            this.mediaView.render();
        }
        else if (this.currentView === 'profile') this.profileView.render();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new App();
});
