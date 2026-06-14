import { FocusPhase } from "../types/IOffice";

const WORK_STATES = ['sit', 'stand', 'sleep', 'idle'];
const BREAK_STATES = ['walk', 'greet', 'jump', 'crawl'];
const CELEBRATE_STATES = ['greet', 'jump'];

export type PetPhase = FocusPhase | 'celebrate';

export function mapPhaseToState(phase: PetPhase, availableStates: string[]): string | null {
    if (phase === 'idle') return null; // restore random behavior

    const pool = phase === 'celebrate' ? CELEBRATE_STATES
        : phase === 'working' ? WORK_STATES
        : BREAK_STATES;

    return pool.find(s => availableStates.includes(s)) ?? availableStates[0] ?? null;
}
