/**
 * Field handlers barrel export.
 * Centralized access to all specialized field filling strategies.
 */

export { fillTypeahead } from './typeahead';
export { fillMultiSelect } from './multiselect';
export { fillRichText } from './rich-text';
export { fillDateSmart } from './date-smart';
export { fillSlider } from './slider';
export { handleConditionalField, getConditionalPattern, CONDITIONAL_PATTERNS } from './conditional';
export { fillRepeatableGroups } from './repeatable';
