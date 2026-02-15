/**
 * AI Field Classifier
 * 
 * Handles "surprise" fields that our static pattern dictionary doesn't recognize.
 * Batches unknown fields, sends them to the backend classify-fields endpoint,
 * and returns MappedField entries ready for the filler pipeline.
 */

import type { DetectedField, MappedField, ProfileData } from '@/shared/types';
import { classifyFields } from '@/shared/api';
import { extractJobContext } from './ai';

export interface ClassifiedResult {
    index: number;
    identifier: string;
    profileKey: string | null;
    value: string;
    confidence: number;
    isQuestion: boolean;
}

/**
 * Takes fields that the detector tagged as "unknown" or low-confidence,
 * sends them to the AI classifier, and returns filled MappedField entries.
 */
export async function classifyUnknownFields(
    unknownFields: DetectedField[],
    profile: ProfileData
): Promise<MappedField[]> {
    if (unknownFields.length === 0) return [];

    console.log(`[PMHNP-AI] Classifying ${unknownFields.length} unknown field(s)...`);

    const jobContext = extractJobContext();

    // Prepare fields for the API
    const fieldsToClassify = unknownFields.map((field) => ({
        label: field.label || '',
        placeholder: field.placeholder || '',
        attributes: {
            name: field.element.getAttribute('name') || '',
            id: field.element.id || '',
            'aria-label': field.element.getAttribute('aria-label') || '',
            'data-automation-id': field.element.getAttribute('data-automation-id') || '',
        },
        fieldType: field.fieldType,
        options: field.options || [],
    }));

    try {
        const result = await classifyFields({
            fields: fieldsToClassify,
            jobTitle: jobContext.jobTitle,
            jobDescription: jobContext.jobDescription,
            employerName: jobContext.employerName,
        });

        console.log(`[PMHNP-AI] Classification complete: ${result.classified.length} fields classified${result.resumeUsed ? ' (resume used)' : ''}`);

        // Convert classified results back to MappedField entries
        const mappedFields: MappedField[] = [];

        for (const classified of result.classified) {
            const field = unknownFields[classified.index];
            if (!field || classified.confidence < 0.2) continue;

            // Determine fill method
            let fillMethod: MappedField['fillMethod'] = 'text';
            if (field.fieldType === 'select') fillMethod = 'select';
            else if (field.fieldType === 'radio') fillMethod = 'radio';
            else if (field.fieldType === 'checkbox') fillMethod = 'checkbox';

            const mapped: MappedField = {
                field,
                profileKey: classified.profileKey || classified.identifier,
                value: classified.value || '',
                fillMethod,
                requiresAI: classified.isQuestion,
                requiresFile: false,
                documentType: null,
                confidence: classified.confidence,
                status: classified.value ? 'ready' : 'no_data',
            };

            mappedFields.push(mapped);
        }

        return mappedFields;
    } catch (err) {
        console.error('[PMHNP-AI] Classification failed:', err);
        return [];
    }
}
