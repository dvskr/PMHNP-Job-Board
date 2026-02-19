import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    saveMultiPageState,
    loadMultiPageState,
    clearMultiPageState,
    wasFieldFilled,
} from '@/content/multipage';

describe('MultiPage Form Support', () => {
    beforeEach(async () => {
        // In jsdom, window.location.hostname is 'localhost'
        // saveMultiPageState keys by URL hostname, loadMultiPageState keys by window.location.hostname
        // So we need to use localhost-based URLs in tests
        await clearMultiPageState();
    });

    it('should return null when no state is saved', async () => {
        const state = await loadMultiPageState();
        expect(state).toBeNull();
    });

    it('should save and load multi-page state', async () => {
        // Use localhost URL to match jsdom's window.location.hostname
        const testState = {
            url: 'http://localhost/apply/step1',
            atsName: 'Greenhouse',
            filledFields: ['first_name', 'last_name', 'email'],
            startedAt: new Date().toISOString(),
            currentPage: 1,
        };

        await saveMultiPageState(testState);
        const loaded = await loadMultiPageState();

        expect(loaded).toBeTruthy();
        expect(loaded!.atsName).toBe('Greenhouse');
        expect(loaded!.filledFields).toEqual(['first_name', 'last_name', 'email']);
        expect(loaded!.currentPage).toBe(1);
    });

    it('should check if a field was already filled', () => {
        const state = {
            url: 'http://localhost/apply/step1',
            atsName: 'Greenhouse',
            filledFields: ['first_name', 'last_name'],
            startedAt: new Date().toISOString(),
            currentPage: 1,
        };

        expect(wasFieldFilled(state, 'first_name')).toBe(true);
        expect(wasFieldFilled(state, 'phone')).toBe(false);
    });

    it('should clear multi-page state', async () => {
        await saveMultiPageState({
            url: 'http://localhost/apply',
            atsName: null,
            filledFields: [],
            startedAt: new Date().toISOString(),
            currentPage: 0,
        });

        await clearMultiPageState();
        const state = await loadMultiPageState();
        expect(state).toBeNull();
    });

    it('should expire state after 30 minutes', async () => {
        const oldDate = new Date(Date.now() - 31 * 60 * 1000);
        await saveMultiPageState({
            url: 'http://localhost/apply',
            atsName: null,
            filledFields: [],
            startedAt: oldDate.toISOString(),
            currentPage: 0,
        });

        const state = await loadMultiPageState();
        expect(state).toBeNull();
    });
});
