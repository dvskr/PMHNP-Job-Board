import type { FillResult, DetectedField, MappedField, ProfileData, ExtensionSettings } from '@/shared/types';
import { captureError } from '@/shared/errorHandler';
import { log, warn } from '@/shared/logger';

// ─── State Definitions ───

export type AutofillState =
    | 'IDLE'
    | 'DETECTED'
    | 'CHECKING_USAGE'
    | 'LOADING_PROFILE'
    | 'ANALYZING'
    | 'FILLING_SIMPLE'
    | 'FILLING_AI'
    | 'ATTACHING_FILES'
    | 'REVIEWING'
    | 'COMPLETE'
    | 'ERROR';

export interface StateContext {
    state: AutofillState;
    profile: ProfileData | null;
    settings: ExtensionSettings | null;
    handler: { name: string } | null;
    detectedFields: DetectedField[];
    mappedFields: MappedField[];
    fillResult: FillResult | null;
    error: string | null;
    progress: {
        current: number;
        total: number;
        phase: string;
    };
    pageUrl: string;
    atsName: string | null;
    startedAt: number | null;
}

export type StateTransition = {
    from: AutofillState;
    to: AutofillState;
    condition?: () => boolean;
};

type StateListener = (context: StateContext, previousState: AutofillState) => void;

// ─── Valid Transitions ───

const VALID_TRANSITIONS: Record<AutofillState, AutofillState[]> = {
    IDLE: ['DETECTED', 'ERROR'],
    DETECTED: ['CHECKING_USAGE', 'IDLE', 'ERROR'],
    CHECKING_USAGE: ['LOADING_PROFILE', 'ERROR'],
    LOADING_PROFILE: ['ANALYZING', 'ERROR'],
    ANALYZING: ['FILLING_SIMPLE', 'ERROR'],
    FILLING_SIMPLE: ['FILLING_AI', 'ATTACHING_FILES', 'REVIEWING', 'COMPLETE', 'ERROR'],
    FILLING_AI: ['ATTACHING_FILES', 'REVIEWING', 'COMPLETE', 'ERROR'],
    ATTACHING_FILES: ['REVIEWING', 'COMPLETE', 'ERROR'],
    REVIEWING: ['COMPLETE', 'IDLE', 'ERROR'],
    COMPLETE: ['IDLE', 'DETECTED'],
    ERROR: ['IDLE', 'DETECTED', 'CHECKING_USAGE'],
};

// ─── State Machine ───

export class AutofillStateMachine {
    private context: StateContext;
    private listeners: StateListener[] = [];

    constructor() {
        this.context = this.createInitialContext();
    }

    private createInitialContext(): StateContext {
        return {
            state: 'IDLE',
            profile: null,
            settings: null,
            handler: null,
            detectedFields: [],
            mappedFields: [],
            fillResult: null,
            error: null,
            progress: { current: 0, total: 0, phase: '' },
            pageUrl: '',
            atsName: null,
            startedAt: null,
        };
    }

    getState(): AutofillState {
        return this.context.state;
    }

    getContext(): Readonly<StateContext> {
        return { ...this.context };
    }

    onStateChange(listener: StateListener): () => void {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    /**
     * Transition to a new state. Validates the transition and notifies listeners.
     */
    transition(newState: AutofillState, updates?: Partial<StateContext>): void {
        const currentState = this.context.state;

        if (!VALID_TRANSITIONS[currentState]?.includes(newState)) {
            warn(`[PMHNP-SM] Invalid transition: ${currentState} → ${newState}`);
            return;
        }

        const previousState = currentState;
        this.context = {
            ...this.context,
            ...updates,
            state: newState,
        };

        log(`[PMHNP-SM] ${previousState} → ${newState}`, updates ? Object.keys(updates) : '');

        // Fire listeners
        for (const listener of this.listeners) {
            try {
                listener(this.context, previousState);
            } catch (err) {
                captureError(err, 'state-machine-listener');
            }
        }
    }

    /**
     * Update context without changing state.
     */
    updateContext(updates: Partial<StateContext>): void {
        this.context = { ...this.context, ...updates };
    }

    /**
     * Set progress within the current phase.
     */
    setProgress(current: number, total: number, phase: string): void {
        this.context.progress = { current, total, phase };
    }

    /**
     * Transition to error state with an error message.
     */
    error(message: string): void {
        this.transition('ERROR', { error: message });
    }

    /**
     * Reset to idle state, clearing all context.
     */
    reset(): void {
        this.context = this.createInitialContext();
        // Notify listeners of reset
        for (const listener of this.listeners) {
            try {
                listener(this.context, 'IDLE');
            } catch (err) {
                captureError(err, 'state-machine-reset');
            }
        }
    }

    /**
     * Check if the machine is in a state where autofill can be started.
     */
    canStart(): boolean {
        return this.context.state === 'IDLE' || this.context.state === 'DETECTED' || this.context.state === 'ERROR';
    }

    /**
     * Check if the machine is currently processing.
     */
    isProcessing(): boolean {
        return ['CHECKING_USAGE', 'LOADING_PROFILE', 'ANALYZING', 'FILLING_SIMPLE', 'FILLING_AI', 'ATTACHING_FILES'].includes(this.context.state);
    }

    /**
     * Get a human-readable status string for display in the FAB/popup.
     */
    getStatusMessage(): string {
        switch (this.context.state) {
            case 'IDLE': return 'Ready';
            case 'DETECTED': return `${this.context.detectedFields.length} fields found`;
            case 'CHECKING_USAGE': return 'Checking limits...';
            case 'LOADING_PROFILE': return 'Loading profile...';
            case 'ANALYZING': return 'Analyzing form...';
            case 'FILLING_SIMPLE': return `Filling ${this.context.progress.current}/${this.context.progress.total}...`;
            case 'FILLING_AI': return 'Generating AI answers...';
            case 'ATTACHING_FILES': return 'Attaching documents...';
            case 'REVIEWING': return 'Review needed';
            case 'COMPLETE': return `${this.context.fillResult?.filled || 0} fields filled`;
            case 'ERROR': return this.context.error || 'Something went wrong';
            default: return '';
        }
    }
}

// ─── Singleton ───

let stateMachineInstance: AutofillStateMachine | null = null;

export function getStateMachine(): AutofillStateMachine {
    if (!stateMachineInstance) {
        stateMachineInstance = new AutofillStateMachine();
    }
    return stateMachineInstance;
}
