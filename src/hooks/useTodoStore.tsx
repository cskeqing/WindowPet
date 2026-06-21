import { create } from "zustand";
import { TodoItem } from "../types/IOffice";
import { getAppSettings, setConfig } from "../utils/settings";
import { emitUpdatePetsEvent } from "../utils/event";
import { DispatchType } from "../types/IEvents";

let saveTimer: ReturnType<typeof setTimeout> | null = null;

interface TodoState {
    todos: TodoItem[];
    lastDeleted: { item: TodoItem; index: number } | null;
    loadTodos: () => Promise<void>;
    saveTodos: () => void;
    addTodo: (text: string) => void;
    toggleTodo: (id: string) => void;
    editTodo: (id: string, text: string) => void;
    removeTodo: (id: string) => void;
    undoDelete: () => void;
    dismissUndo: () => void;
    setCurrent: (id: string) => void;
    clearCompleted: () => void;
    reorderTodos: (fromId: string, toId: string) => void;
    setDueDate: (id: string, dueDate: string | undefined) => void;
}

export const useTodoStore = create<TodoState>()((set, get) => ({
    todos: [],
    lastDeleted: null,

    loadTodos: async () => {
        try {
            const data = await getAppSettings({ configName: "office.json" });
            if (data?.todos) set({ todos: data.todos });
        } catch { /* use empty */ }
    },

    saveTodos: () => {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            const { todos } = get();
            getAppSettings({ configName: "office.json" }).then(data => {
                setConfig({ configName: "office.json", newConfig: { ...data, todos } });
            }).catch(() => {
                setConfig({ configName: "office.json", newConfig: { todos } });
            });
        }, 300);
    },

    addTodo: (text) => {
        const item: TodoItem = { id: crypto.randomUUID(), text, completed: false, createdAt: Date.now(), isCurrent: false };
        set(s => ({ todos: [...s.todos, item] }));
        setTimeout(() => get().saveTodos(), 0);
    },

    toggleTodo: (id) => {
        set(s => ({
            todos: s.todos.map(t => t.id === id ? { ...t, completed: !t.completed } : t)
        }));
        const todo = get().todos.find(t => t.id === id);
        if (todo?.completed) {
            emitUpdatePetsEvent({ dispatchType: DispatchType.FocusTodoCelebrate, newValue: true });
        }
        setTimeout(() => get().saveTodos(), 0);
    },

    editTodo: (id, text) => {
        set(s => ({ todos: s.todos.map(t => t.id === id ? { ...t, text } : t) }));
        setTimeout(() => get().saveTodos(), 0);
    },

    removeTodo: (id) => {
        const { todos } = get();
        const index = todos.findIndex(t => t.id === id);
        if (index === -1) return;
        const item = todos[index];
        set({ todos: todos.filter(t => t.id !== id), lastDeleted: { item, index } });
        setTimeout(() => get().saveTodos(), 0);
    },

    undoDelete: () => {
        const { lastDeleted, todos } = get();
        if (!lastDeleted) return;
        const pos = Math.min(lastDeleted.index, todos.length);
        const next = [...todos];
        next.splice(pos, 0, lastDeleted.item);
        set({ todos: next, lastDeleted: null });
        setTimeout(() => get().saveTodos(), 0);
    },

    dismissUndo: () => { set({ lastDeleted: null }); },

    setCurrent: (id) => {
        set(s => ({
            todos: s.todos.map(t => ({ ...t, isCurrent: t.id === id }))
        }));
        setTimeout(() => get().saveTodos(), 0);
    },

    clearCompleted: () => {
        set(s => ({ todos: s.todos.filter(t => !t.completed) }));
        setTimeout(() => get().saveTodos(), 0);
    },

    // Move the dragged item (fromId) to the position of the target item (toId),
    // preserving the order of everything else. Persists the new order.
    reorderTodos: (fromId, toId) => {
        if (fromId === toId) return;
        set(s => {
            const list = [...s.todos];
            const fromIdx = list.findIndex(t => t.id === fromId);
            const toIdx = list.findIndex(t => t.id === toId);
            if (fromIdx === -1 || toIdx === -1) return s;
            const [moved] = list.splice(fromIdx, 1);
            list.splice(toIdx, 0, moved);
            return { todos: list };
        });
        setTimeout(() => get().saveTodos(), 0);
    },

    // Set or clear a todo's due date (YYYY-MM-DD, or undefined to clear).
    setDueDate: (id, dueDate) => {
        set(s => ({ todos: s.todos.map(t => t.id === id ? { ...t, dueDate } : t) }));
        setTimeout(() => get().saveTodos(), 0);
    },
}));
