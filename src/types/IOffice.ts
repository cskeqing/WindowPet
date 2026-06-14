export type FocusPhase = 'idle' | 'working' | 'shortBreak' | 'longBreak';

export interface FocusConfig {
    workDuration: number;
    shortBreakDuration: number;
    longBreakDuration: number;
    longBreakInterval: number;
    enablePetBinding: boolean;
    enableNotification: boolean;
}

export interface FocusStats {
    date: string;
    todayPomodoros: number;
    todayFocusSeconds: number;
}

export interface TodoItem {
    id: string;
    text: string;
    completed: boolean;
    createdAt: number;
    isCurrent: boolean;
    /** 截止日期(本地日期字符串 YYYY-MM-DD);未设置时为 undefined */
    dueDate?: string;
}

export interface OfficeData {
    focus: FocusConfig;
    stats: FocusStats;
    todos: TodoItem[];
}
