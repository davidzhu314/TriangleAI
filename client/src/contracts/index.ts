/**
 * Every contract, re-exported. Import contract types from here.
 *
 * CONTRACTS_VERSION was 'unset' before D0b; D0b set it to 1. Each merged contract change bumps it. Every session compares it with its
 * status file and reads the contract diff when it changes. Only David edits this folder.
 */
export const CONTRACTS_VERSION: number | 'unset' = 3;

export * from './physics-protocol';
export * from './events';
export * from './wire';
export * from './case';
export * from './validation';
export * from './recorded-runs';
export * from './optimizer';
export * from './score';
