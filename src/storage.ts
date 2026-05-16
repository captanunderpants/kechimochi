const STORAGE_PREFIX = 'kechimochi_fork';
const LEGACY_PROFILE_KEY = 'kechimochi_profile';
const LEGACY_THEME_PREFIX = 'kechimochi_theme_';

export const CURRENT_PROFILE_KEY = `${STORAGE_PREFIX}_profile`;
export const THEME_CACHE_PREFIX = `${STORAGE_PREFIX}_theme_`;

export function migrateBrowserStorage(): void {
    const legacyProfile = localStorage.getItem(LEGACY_PROFILE_KEY);
    if (legacyProfile && !localStorage.getItem(CURRENT_PROFILE_KEY)) {
        localStorage.setItem(CURRENT_PROFILE_KEY, legacyProfile);
    }

    if (!legacyProfile) return;

    const legacyTheme = localStorage.getItem(`${LEGACY_THEME_PREFIX}${legacyProfile}`);
    const nextThemeKey = getThemeCacheKey(legacyProfile);
    if (legacyTheme && !localStorage.getItem(nextThemeKey)) {
        localStorage.setItem(nextThemeKey, legacyTheme);
    }
}

export function getCurrentProfile(): string {
    return localStorage.getItem(CURRENT_PROFILE_KEY) || '';
}

export function setCurrentProfile(profileName: string): void {
    localStorage.setItem(CURRENT_PROFILE_KEY, profileName);
}

export function clearCurrentProfile(): void {
    localStorage.removeItem(CURRENT_PROFILE_KEY);
}

export function getThemeCacheKey(profileName: string): string {
    return `${THEME_CACHE_PREFIX}${profileName}`;
}
