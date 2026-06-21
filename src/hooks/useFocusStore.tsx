import { create } from "zustand";
import { FocusPhase, FocusConfig, FocusStats } from "../types/IOffice";
import { getAppSettings, setConfig } from "../utils/settings";
import { emitUpdatePetsEvent } from "../utils/event";
import { DispatchType } from "../types/IEvents";
import { focusNotify } from "../utils/focusNotify";
import { localDateStr } from "../utils/date";
import i18next from "i18next";

const DEFAULT_CONFIG: FocusConfig = {
    workDuration: 1500,
    shortBreakDuration: 300,
    longBreakDuration: 900,
    longBreakInterval: 4,
    enablePetBinding: true,
    enableNotification: true,
};

interface FocusState {
    config: FocusConfig;
    phase: FocusPhase;
    remaining: number;
    completedPomodoros: number;
    isPaused: boolean;
    endTime: number | null;
    intervalId: number | null;
    stats: FocusStats;

    loadConfig: () => Promise<void>;
    saveState: () => void;
    saveRunState: () => void;
    start: () => void;
    pause: () => void;
    resume: () => void;
    reset: () => void;
    skip: () => void;
    tick: () => void;
    updateConfig: (partial: Partial<FocusConfig>) => void;
    recordPomodoro: () => void;
}

export const useFocusStore = create<FocusState>()((set, get) => ({
    config: DEFAULT_CONFIG,
    phase: 'idle',
    remaining: DEFAULT_CONFIG.workDuration,
    completedPomodoros: 0,
    isPaused: false,
    endTime: null,
    intervalId: null,
    stats: { date: localDateStr(), todayPomodoros: 0, todayFocusSeconds: 0 },

    loadConfig: async () => {
        try {
            const data = await getAppSettings({ configName: "office.json" });
            if (data) {
                const config = { ...DEFAULT_CONFIG, ...data.focus };
                let stats: FocusStats = data.stats || { date: localDateStr(), todayPomodoros: 0, todayFocusSeconds: 0 };
                if (stats.date !== localDateStr()) {
                    stats = { date: localDateStr(), todayPomodoros: 0, todayFocusSeconds: 0 };
                }
                set({ config, stats, remaining: config.workDuration });

                // Restore running state if exists
                const run = data.runState;
                if (run && run.phase !== 'idle' && run.endTime) {
                    const now = Date.now();
                    if (run.isPaused && run.pausedRemaining) {
                        // Was paused, restore paused state
                        set({ phase: run.phase, remaining: run.pausedRemaining, completedPomodoros: run.completedPomodoros || 0, isPaused: true, endTime: null });
                        if (config.enablePetBinding) {
                            emitUpdatePetsEvent({ dispatchType: DispatchType.FocusPhaseChange, newValue: run.phase });
                        }
                    } else if (run.endTime > now) {
                        // Still running, resume
                        const remaining = Math.round((run.endTime - now) / 1000);
                        const id = window.setInterval(() => get().tick(), 1000);
                        set({ phase: run.phase, endTime: run.endTime, remaining, completedPomodoros: run.completedPomodoros || 0, intervalId: id, isPaused: false });
                        if (config.enablePetBinding) {
                            emitUpdatePetsEvent({ dispatchType: DispatchType.FocusPhaseChange, newValue: run.phase });
                        }
                    } else {
                        // Expired while away, trigger next phase
                        set({ phase: run.phase, endTime: run.endTime, remaining: 0, completedPomodoros: run.completedPomodoros || 0 });
                        get().tick();
                    }
                }
            }
        } catch { /* use defaults */ }
    },

    saveState: () => {
        const { config, stats } = get();
        getAppSettings({ configName: "office.json" }).then(data => {
            setConfig({ configName: "office.json", newConfig: { ...data, focus: config, stats } });
        }).catch(() => {
            setConfig({ configName: "office.json", newConfig: { focus: config, stats, todos: [] } });
        });
    },

    saveRunState: () => {
        const { phase, endTime, completedPomodoros, isPaused, remaining } = get();
        const runState = phase === 'idle' ? null : { phase, endTime, completedPomodoros, isPaused, pausedRemaining: isPaused ? remaining : null };
        getAppSettings({ configName: "office.json" }).then(data => {
            setConfig({ configName: "office.json", newConfig: { ...data, runState } });
        }).catch(() => {});
    },

    start: () => {
        const { config, intervalId } = get();
        if (intervalId) clearInterval(intervalId);
        const endTime = Date.now() + config.workDuration * 1000;
        const id = window.setInterval(() => get().tick(), 1000);
        set({ phase: 'working', remaining: config.workDuration, endTime, intervalId: id, isPaused: false, completedPomodoros: 0 });
        if (config.enablePetBinding) {
            emitUpdatePetsEvent({ dispatchType: DispatchType.FocusPhaseChange, newValue: 'working' });
        }
        get().saveRunState();
    },

    pause: () => {
        const { intervalId, endTime } = get();
        if (intervalId) clearInterval(intervalId);
        const remaining = endTime ? Math.max(0, Math.round((endTime - Date.now()) / 1000)) : 0;
        set({ isPaused: true, intervalId: null, remaining });
        get().saveRunState();
    },

    resume: () => {
        const { remaining } = get();
        const endTime = Date.now() + remaining * 1000;
        const id = window.setInterval(() => get().tick(), 1000);
        set({ isPaused: false, endTime, intervalId: id });
        get().saveRunState();
    },

    reset: () => {
        const { intervalId, config } = get();
        if (intervalId) clearInterval(intervalId);
        set({ phase: 'idle', remaining: config.workDuration, endTime: null, intervalId: null, isPaused: false, completedPomodoros: 0 });
        if (config.enablePetBinding) {
            emitUpdatePetsEvent({ dispatchType: DispatchType.FocusPhaseChange, newValue: 'idle' });
        }
        get().saveRunState();
    },

    // Jump to the next phase immediately (top-tier pomodoro UX: "skip").
    // Skipping a work session does NOT count it as a completed pomodoro.
    skip: () => {
        const { intervalId, phase, config, completedPomodoros } = get();
        if (phase === 'idle') return;
        if (intervalId) clearInterval(intervalId);

        if (phase === 'working') {
            // move to a break without recording the (incomplete) pomodoro
            const newCompleted = completedPomodoros + 1;
            const isLongBreak = newCompleted % config.longBreakInterval === 0;
            const nextPhase: FocusPhase = isLongBreak ? 'longBreak' : 'shortBreak';
            const breakDuration = isLongBreak ? config.longBreakDuration : config.shortBreakDuration;
            const endTime = Date.now() + breakDuration * 1000;
            const id = window.setInterval(() => get().tick(), 1000);
            set({ phase: nextPhase, remaining: breakDuration, endTime, intervalId: id, isPaused: false, completedPomodoros: newCompleted });
            if (config.enablePetBinding) {
                emitUpdatePetsEvent({ dispatchType: DispatchType.FocusPhaseChange, newValue: nextPhase });
            }
        } else {
            // break → next work session
            const endTime = Date.now() + config.workDuration * 1000;
            const id = window.setInterval(() => get().tick(), 1000);
            set({ phase: 'working', remaining: config.workDuration, endTime, intervalId: id, isPaused: false });
            if (config.enablePetBinding) {
                emitUpdatePetsEvent({ dispatchType: DispatchType.FocusPhaseChange, newValue: 'working' });
            }
        }
        get().saveRunState();
    },

    tick: () => {
        const { endTime, phase, config, completedPomodoros } = get();
        if (!endTime) return;
        const remaining = Math.max(0, Math.round((endTime - Date.now()) / 1000));
        if (remaining > 0) {
            set({ remaining });
            return;
        }

        // Phase complete
        const { intervalId } = get();
        if (intervalId) clearInterval(intervalId);

        if (phase === 'working') {
            get().recordPomodoro();
            const newCompleted = completedPomodoros + 1;
            const isLongBreak = newCompleted % config.longBreakInterval === 0;
            const nextPhase: FocusPhase = isLongBreak ? 'longBreak' : 'shortBreak';
            const breakDuration = isLongBreak ? config.longBreakDuration : config.shortBreakDuration;
            const newEndTime = Date.now() + breakDuration * 1000;
            const id = window.setInterval(() => get().tick(), 1000);

            set({ phase: nextPhase, remaining: breakDuration, endTime: newEndTime, intervalId: id, completedPomodoros: newCompleted });

            if (config.enableNotification) {
                focusNotify(i18next.t("Focus Complete"), i18next.t("Time to take a break!"));
            }
            if (config.enablePetBinding) {
                emitUpdatePetsEvent({ dispatchType: DispatchType.FocusPhaseChange, newValue: nextPhase });
            }
            get().saveRunState();
        } else {
            // Break complete → next work session
            const newEndTime = Date.now() + config.workDuration * 1000;
            const id = window.setInterval(() => get().tick(), 1000);

            set({ phase: 'working', remaining: config.workDuration, endTime: newEndTime, intervalId: id });

            if (config.enableNotification) {
                focusNotify(i18next.t("Break Over"), i18next.t("Let's get back to focus!"));
            }
            if (config.enablePetBinding) {
                emitUpdatePetsEvent({ dispatchType: DispatchType.FocusPhaseChange, newValue: 'working' });
            }
            get().saveRunState();
        }
    },

    updateConfig: (partial) => {
        const { config } = get();
        const newConfig = { ...config, ...partial };
        set({ config: newConfig });
        if (get().phase === 'idle') {
            set({ remaining: newConfig.workDuration });
        }
        getAppSettings({ configName: "office.json" }).then(data => {
            setConfig({ configName: "office.json", newConfig: { ...data, focus: newConfig, stats: get().stats } });
        }).catch(() => {});
    },

    recordPomodoro: () => {
        const { stats, config } = get();
        let current = { ...stats };
        if (current.date !== localDateStr()) {
            current = { date: localDateStr(), todayPomodoros: 0, todayFocusSeconds: 0 };
        }
        current.todayPomodoros += 1;
        current.todayFocusSeconds += config.workDuration;
        set({ stats: current });
        getAppSettings({ configName: "office.json" }).then(data => {
            setConfig({ configName: "office.json", newConfig: { ...data, focus: config, stats: current } });
        }).catch(() => {});
    },
}));
