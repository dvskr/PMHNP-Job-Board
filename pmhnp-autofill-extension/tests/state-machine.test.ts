import { describe, it, expect, beforeEach } from 'vitest';
import { getStateMachine, AutofillStateMachine, type AutofillState } from '@/content/state-machine';

describe('AutofillStateMachine', () => {
    let sm: AutofillStateMachine;

    beforeEach(() => {
        // Create a fresh instance each time (not the singleton)
        sm = new AutofillStateMachine();
    });

    it('should start in IDLE state', () => {
        expect(sm.getState()).toBe('IDLE');
    });

    it('should transition IDLE → DETECTED', () => {
        sm.transition('DETECTED', { pageUrl: 'https://test.com' });
        expect(sm.getState()).toBe('DETECTED');
    });

    it('should transition through full pipeline', () => {
        const states: AutofillState[] = [
            'DETECTED', 'CHECKING_USAGE', 'LOADING_PROFILE',
            'ANALYZING', 'FILLING_SIMPLE', 'COMPLETE',
        ];

        for (const state of states) {
            sm.transition(state);
            expect(sm.getState()).toBe(state);
        }
    });

    it('should silently reject invalid transitions', () => {
        // Cannot go from IDLE to FILLING_SIMPLE directly — stays in IDLE
        sm.transition('FILLING_SIMPLE');
        expect(sm.getState()).toBe('IDLE');
    });

    it('should handle error state from any state', () => {
        sm.transition('DETECTED');
        sm.error('Something went wrong');
        expect(sm.getState()).toBe('ERROR');
    });

    it('should track progress with phase property', () => {
        sm.transition('DETECTED');
        sm.transition('CHECKING_USAGE');
        sm.transition('LOADING_PROFILE');
        sm.transition('ANALYZING');
        sm.transition('FILLING_SIMPLE');
        sm.setProgress(5, 10, 'Filling fields');

        const context = sm.getContext();
        expect(context.progress).toEqual({
            current: 5,
            total: 10,
            phase: 'Filling fields',
        });
    });

    it('should reset to IDLE', () => {
        sm.transition('DETECTED');
        sm.transition('CHECKING_USAGE');
        sm.reset();
        expect(sm.getState()).toBe('IDLE');
    });

    it('should notify state change listeners', () => {
        const states: AutofillState[] = [];
        sm.onStateChange((ctx) => states.push(ctx.state));

        sm.transition('DETECTED');
        sm.transition('CHECKING_USAGE');

        expect(states).toEqual(['DETECTED', 'CHECKING_USAGE']);
    });

    it('should provide human-readable status messages', () => {
        sm.transition('DETECTED');
        expect(sm.getStatusMessage()).toBeTruthy();
        expect(typeof sm.getStatusMessage()).toBe('string');
    });

    it('should report canStart correctly', () => {
        expect(sm.canStart()).toBe(true); // IDLE

        sm.transition('DETECTED');
        sm.transition('CHECKING_USAGE');
        expect(sm.canStart()).toBe(false); // In-progress

        sm.error('failed');
        expect(sm.canStart()).toBe(true); // ERROR allows restart
    });

    it('should unsubscribe listeners', () => {
        const states: AutofillState[] = [];
        const unsubscribe = sm.onStateChange((ctx) => states.push(ctx.state));

        sm.transition('DETECTED');
        unsubscribe();
        sm.transition('CHECKING_USAGE');

        expect(states).toEqual(['DETECTED']); // Only first transition
    });

    it('should report isProcessing correctly', () => {
        expect(sm.isProcessing()).toBe(false); // IDLE

        sm.transition('DETECTED');
        expect(sm.isProcessing()).toBe(false); // DETECTED

        sm.transition('CHECKING_USAGE');
        expect(sm.isProcessing()).toBe(true); // CHECKING_USAGE

        sm.transition('LOADING_PROFILE');
        expect(sm.isProcessing()).toBe(true); // LOADING_PROFILE
    });
});
