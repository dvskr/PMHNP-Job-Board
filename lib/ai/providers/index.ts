/**
 * Provider registry. The gateway looks up providers here by name.
 */

import { openaiProvider } from './openai';
import { anthropicProvider } from './anthropic';
import type { AiProvider, ProviderClient } from '../types';

const REGISTRY: Record<AiProvider, ProviderClient> = {
    openai: openaiProvider,
    anthropic: anthropicProvider,
};

export function getProvider(name: AiProvider): ProviderClient {
    return REGISTRY[name];
}

export function listProviders(): readonly ProviderClient[] {
    return Object.values(REGISTRY);
}
