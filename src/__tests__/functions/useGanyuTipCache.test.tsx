import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor, cleanup } from "@testing-library/react";

vi.mock("../../services/tipService", () => ({
    generateTip: vi.fn(),
}));

import { useGanyuTip } from "../../hooks/useGanyuTip";
import { generateTip, TipContext } from "../../services/tipService";
import {
    useGanyuSettings,
    DEFAULT_GANYU_SETTINGS,
} from "../../hooks/useGanyuSettings";
import { CopyScene } from "../../ui/office_popover/ganyuCopy";
import { resetTipCache, TTL_MS } from "../../hooks/useGanyuTip";

const mockGenerateTip = generateTip as unknown as ReturnType<typeof vi.fn>;

const SCENE: CopyScene = { kind: "subtitleDefault" };

function makeArgs(opts: {
    enabled: boolean;
    fallback: string;
    ctx: TipContext;
    scene?: CopyScene;
}) {
    return {
        enabled: opts.enabled,
        scene: opts.scene ?? SCENE,
        buildContext: () => opts.ctx,
        fallback: opts.fallback,
    };
}

function enableStore() {
    useGanyuSettings.setState({
        ...DEFAULT_GANYU_SETTINGS,
        aiEnabled: true,
        endpoint: "https://example.com/v1/chat/completions",
        apiKey: "sk-test",
    });
}

const baseCtx: TipContext = {
    segment: "afternoon",
    nowISO: "2024-01-01T14:00:00.000Z",
    todos: [{ text: "整理卷宗", completed: false }],
    todayPomodoros: 2,
    todayFocusSeconds: 3000,
    phase: "idle",
    completedPomodoros: 2,
    continuousFocusSeconds: 0,
};

beforeEach(() => {
    mockGenerateTip.mockReset();
    enableStore();
    resetTipCache();
    vi.useFakeTimers();
});

afterEach(() => {
    cleanup();
    useGanyuSettings.setState({ ...DEFAULT_GANYU_SETTINGS });
    vi.useRealTimers();
});

describe("useGanyuTip · TTL Cache", () => {
    it("缓存命中:同一窗口内重新挂载不发起新请求", async () => {
        vi.setSystemTime(new Date("2024-01-01T14:00:30.000Z"));
        mockGenerateTip.mockResolvedValue({ ok: true, tip: "下午好。" });
        const fallback = "静态文案";

        // 第一次挂载 → 发请求
        const { result, unmount } = renderHook((props) => useGanyuTip(props), {
            initialProps: makeArgs({ enabled: true, fallback, ctx: baseCtx }),
        });
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(mockGenerateTip).toHaveBeenCalledTimes(1);
        expect(result.current.text).toBe("下午好。");
        unmount();

        // 第二次挂载(同一 TTL 窗口,相同指纹)→ 命中缓存,不发请求
        const { result: result2, unmount: unmount2 } = renderHook(
            (props) => useGanyuTip(props),
            { initialProps: makeArgs({ enabled: true, fallback, ctx: baseCtx }) }
        );
        await waitFor(() => expect(result2.current.loading).toBe(false));
        expect(mockGenerateTip).toHaveBeenCalledTimes(1); // 仍然只有 1 次
        expect(result2.current.text).toBe("下午好。");
        unmount2();
    });

    it("缓存过期:超过 TTL 后重新请求", async () => {
        vi.setSystemTime(new Date("2024-01-01T14:00:00.000Z"));
        mockGenerateTip.mockResolvedValue({ ok: true, tip: "第一次。" });
        const fallback = "静态文案";

        const { result, unmount } = renderHook((props) => useGanyuTip(props), {
            initialProps: makeArgs({ enabled: true, fallback, ctx: baseCtx }),
        });
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(mockGenerateTip).toHaveBeenCalledTimes(1);
        unmount();

        // 推进时间超过 TTL
        vi.setSystemTime(new Date("2024-01-01T14:00:00.000Z").getTime() + TTL_MS + 1);
        mockGenerateTip.mockResolvedValue({ ok: true, tip: "第二次。" });

        const { result: result2, unmount: unmount2 } = renderHook(
            (props) => useGanyuTip(props),
            { initialProps: makeArgs({ enabled: true, fallback, ctx: baseCtx }) }
        );
        await waitFor(() => expect(result2.current.loading).toBe(false));
        expect(mockGenerateTip).toHaveBeenCalledTimes(2); // 新请求
        expect(result2.current.text).toBe("第二次。");
        unmount2();
    });

    it("phase 变化导致缓存 miss,即使在同一 TTL 窗口内", async () => {
        vi.setSystemTime(new Date("2024-01-01T14:00:30.000Z"));
        mockGenerateTip.mockResolvedValue({ ok: true, tip: "idle 话术" });
        const fallback = "静态文案";

        const { result, unmount } = renderHook((props) => useGanyuTip(props), {
            initialProps: makeArgs({ enabled: true, fallback, ctx: baseCtx }),
        });
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(mockGenerateTip).toHaveBeenCalledTimes(1);
        unmount();

        // phase 变化 → 指纹变化 → 缓存 miss
        mockGenerateTip.mockResolvedValue({ ok: true, tip: "working 话术" });
        const workingCtx: TipContext = { ...baseCtx, phase: "working" };
        const { result: result2, unmount: unmount2 } = renderHook(
            (props) => useGanyuTip(props),
            { initialProps: makeArgs({ enabled: true, fallback, ctx: workingCtx }) }
        );
        await waitFor(() => expect(result2.current.loading).toBe(false));
        expect(mockGenerateTip).toHaveBeenCalledTimes(2);
        expect(result2.current.text).toBe("working 话术");
        unmount2();
    });

    it("失败结果不写入缓存,下次仍然请求", async () => {
        vi.setSystemTime(new Date("2024-01-01T14:00:30.000Z"));
        mockGenerateTip.mockResolvedValue({ ok: false, reason: "network" });
        const fallback = "静态文案";

        const { result, unmount } = renderHook((props) => useGanyuTip(props), {
            initialProps: makeArgs({ enabled: true, fallback, ctx: baseCtx }),
        });
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.text).toBe(fallback);
        expect(mockGenerateTip).toHaveBeenCalledTimes(1);
        unmount();

        // 重新挂载 → 因为失败没缓存,应再次请求
        mockGenerateTip.mockResolvedValue({ ok: true, tip: "成功了。" });
        const { result: result2, unmount: unmount2 } = renderHook(
            (props) => useGanyuTip(props),
            { initialProps: makeArgs({ enabled: true, fallback, ctx: baseCtx }) }
        );
        await waitFor(() => expect(result2.current.loading).toBe(false));
        expect(mockGenerateTip).toHaveBeenCalledTimes(2);
        expect(result2.current.text).toBe("成功了。");
        unmount2();
    });

    it("TTL_MS 为 3 分钟", () => {
        expect(TTL_MS).toBe(3 * 60 * 1000);
    });
});
