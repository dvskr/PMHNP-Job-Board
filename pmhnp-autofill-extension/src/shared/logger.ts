/**
 * Production-safe logger.
 * In development (unpublished extension), logs normally.
 * In production (Chrome Web Store), all output is silenced.
 */
import { IS_DEV } from './constants';

/* eslint-disable @typescript-eslint/no-explicit-any */
const noop = (..._args: any[]) => { };

export const log: (...args: any[]) => void = IS_DEV ? console.log.bind(console) : noop;
export const warn: (...args: any[]) => void = IS_DEV ? console.warn.bind(console) : noop;
export const error: (...args: any[]) => void = console.error.bind(console); // errors always log
