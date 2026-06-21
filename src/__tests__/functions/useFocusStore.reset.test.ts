import { describe, it, expect, vi, beforeEach } from "vitest";
import { act } from "@testing-library/react";

const mockEmitUpdatePetsEvent = vi.fn();

vi.mock("../../utils/settings", () => ({
    getAppSettings: vi.fn().mockResolvedValue({}),
    setConfig: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../utils/event", () => ({
    emitUpdatePetsEvent: (...args: unknown[]) => mockEmitUpdatePetsEvent(...args),
}));
vi.mock("../../utils/focusNotify", () => ({
    focusNotify: vi.fn(),
}));
vi.mock("i18next", () => ({ default: { t: (k: string) => k } }));

import { useFocusStore } from "../../hooks/useFocusStore";
import { DispatchType } from "../../types/IEvents";

describe("useFocusStore reset - enablePetBinding consistency", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset store to idle with default config
        useFocusStore.setState({
            phase: "working",
            remaining: 100,
            isPaused: false,
            endTime: Date.now() + 100000,
            intervalId: null,
            completedPomodoros: 1,
            config: {
                workDuration: 1500,
                shortBreakDuration: 300,
                longBreakDuration: 900,
                longBreakInterval: 4,
                enablePetBinding: false,
                enableNotification: true,
            },
        });
    });

    it("does NOT emit FocusPhaseChange when enablePetBinding is false", () => {
        act(() => useFocusStore.getState().reset());

        expect(mockEmitUpdatePetsEvent).not.toHaveBeenCalled();
        expect(useFocusStore.getState().phase).toBe("idle");
    });

    it("emits FocusPhaseChange:idle when enablePetBinding is true", () => {
        useFocusStore.setState({
            config: { ...useFocusStore.getState().config, enablePetBinding: true },
        });

        act(() => useFocusStore.getState().reset());

        expect(mockEmitUpdatePetsEvent).toHaveBeenCalledWith({
            dispatchType: DispatchType.FocusPhaseChange,
            newValue: "idle",
        });
    });
});
