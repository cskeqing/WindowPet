import { describe, it, expect, beforeEach, vi } from "vitest";
import { act } from "@testing-library/react";

// Mock tauri settings helpers so the store doesn't touch disk
vi.mock("../utils/settings", () => ({
    getAppSettings: vi.fn().mockResolvedValue({ todos: [] }),
    setConfig: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../utils/event", () => ({
    emitUpdatePetsEvent: vi.fn(),
}));

import { useTodoStore } from "../hooks/useTodoStore";

function resetStore() {
    useTodoStore.setState({ todos: [], lastDeleted: null });
}

describe("useTodoStore undo delete", () => {
    beforeEach(() => resetStore());

    it("removeTodo stores lastDeleted with correct index", () => {
        act(() => {
            useTodoStore.getState().addTodo("A");
            useTodoStore.getState().addTodo("B");
            useTodoStore.getState().addTodo("C");
        });
        const todos = useTodoStore.getState().todos;
        const bId = todos[1].id;

        act(() => useTodoStore.getState().removeTodo(bId));

        const { lastDeleted, todos: after } = useTodoStore.getState();
        expect(after).toHaveLength(2);
        expect(lastDeleted).not.toBeNull();
        expect(lastDeleted!.item.text).toBe("B");
        expect(lastDeleted!.index).toBe(1);
    });

    it("undoDelete restores item at original index", () => {
        act(() => {
            useTodoStore.getState().addTodo("A");
            useTodoStore.getState().addTodo("B");
            useTodoStore.getState().addTodo("C");
        });
        const bId = useTodoStore.getState().todos[1].id;

        act(() => useTodoStore.getState().removeTodo(bId));
        act(() => useTodoStore.getState().undoDelete());

        const { todos, lastDeleted } = useTodoStore.getState();
        expect(todos).toHaveLength(3);
        expect(todos[1].text).toBe("B");
        expect(lastDeleted).toBeNull();
    });

    it("undoDelete clamps index when list shrank further", () => {
        act(() => {
            useTodoStore.getState().addTodo("A");
            useTodoStore.getState().addTodo("B");
            useTodoStore.getState().addTodo("C");
        });
        const cId = useTodoStore.getState().todos[2].id;

        act(() => useTodoStore.getState().removeTodo(cId));
        // Save lastDeleted (C at index 2), then manually shrink the list
        const saved = useTodoStore.getState().lastDeleted;
        const aId = useTodoStore.getState().todos[0].id;
        act(() => useTodoStore.getState().removeTodo(aId));
        // Restore C's lastDeleted so undo targets C, not A
        useTodoStore.setState({ lastDeleted: saved });

        // Now list has 1 item ["B"], lastDeleted.index=2 → should clamp to end
        act(() => useTodoStore.getState().undoDelete());

        const { todos } = useTodoStore.getState();
        expect(todos[todos.length - 1].text).toBe("C");
    });

    it("undoDelete is no-op when lastDeleted is null", () => {
        act(() => useTodoStore.getState().addTodo("A"));
        act(() => useTodoStore.getState().undoDelete());
        expect(useTodoStore.getState().todos).toHaveLength(1);
    });

    it("dismissUndo clears lastDeleted without modifying todos", () => {
        act(() => {
            useTodoStore.getState().addTodo("A");
            useTodoStore.getState().addTodo("B");
        });
        const aId = useTodoStore.getState().todos[0].id;
        act(() => useTodoStore.getState().removeTodo(aId));
        expect(useTodoStore.getState().lastDeleted).not.toBeNull();

        act(() => useTodoStore.getState().dismissUndo());
        expect(useTodoStore.getState().lastDeleted).toBeNull();
        expect(useTodoStore.getState().todos).toHaveLength(1);
    });
});
