/**
 * Settings management module.
 * Re-exports from storage.ts for convenience and adds settings-specific helpers.
 */

import type { ExtensionSettings } from './types';
import { DEFAULT_SETTINGS } from './constants';
import { getSettings, updateSettings } from './storage';

export { getSettings, updateSettings };

/**
 * Reset all settings to defaults.
 */
export async function resetSettings(): Promise<ExtensionSettings> {
    return updateSettings(DEFAULT_SETTINGS);
}

/**
 * Check if a specific setting is enabled.
 */
export async function isSettingEnabled(key: keyof ExtensionSettings): Promise<boolean> {
    const settings = await getSettings();
    const value = settings[key];
    return typeof value === 'boolean' ? value : false;
}

/**
 * Get the fill delay in ms based on the current fillSpeed setting.
 */
export async function getFillDelay(): Promise<number> {
    const settings = await getSettings();
    const delays: Record<string, number> = {
        fast: 25,
        normal: 50,
        careful: 150,
    };
    return delays[settings.fillSpeed] || 50;
}
