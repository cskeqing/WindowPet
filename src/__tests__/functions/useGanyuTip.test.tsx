import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import fc from "fast-check";

// Mock the Tip_Service module so the hook never performs a real network call.
// generateTip becomes a controllable vi.fn whose resolved TipResult and call
// count we drive from each test (design.md «Testing Strategy · Mock 与隔离»).
vi.mock("../../services/tipService", () => ({
    generateTip: vi.fn(),
}));

import { useGanyuTip } from "../../hooks/useGanyuTip";
import { generateTip, TipContext, TipResult } from "../../services/tipService";
import {
    useGanyuSettings,
    DEFAULT_GANYU_SETTINGS,
} from "../../hooks/useGanyuSettings";
import { CopyScene } from "../../ui/office_popover/ganyuCopy";
import { resetTipCache } from "../../hooks/useGanyuTip";

/**
 * useGanyuTip 降级 / 时序属性测试(Task 12)。
 *
 * 框架:fast-check + Vitest + @testing-library/react(renderHook),属性测试 ≥100 次迭代。
 * tipService 通过 vi.mock 替换 generateTip,统计调用次数并控制返回的 TipResult。
 * useGanyuSettings(zustand store)通过 setState 注入 aiEnabled 等配置。
 *
 * 覆盖 design.md「Correctness Properties」:
 * - Property 9 :任意失败/未启用情形,最终展示文本恒等于非空 fallback(需求 9.3/9.4)。
 * - Property 10:初始展示等于 fallback,AI 成功返回非空后更新为 AI_Tip(需求 9.5)。
 * - Property 12:pending 期间 abort 则忽略迟到结果、保持 fallback(需求 10.3)。
 * - Property 13:单次打开内相同上下文指纹连续 N 次仅 1 次网络调用(需求 10.4)。
 * - 示例测试:打开面板 / 阶段切换各触发一次请求(需求 9.1/9.2)。
 */

const mockGenerateTip = generateTip as unknown as ReturnType<typeof vi.fn>;

// ---- 生成器与辅助 ----------------------------------------------------------

/** 非空字符串(length ≥ 1)。 */
const nonEmptyStringArb = fc.string({ minLength: 1, maxLength: 40 });

/** 非空且去空白后仍非空的字符串(可作为合规 AI tip)。 */
const nonBlankStringArb = fc
    .string({ minLength: 1, maxLength: 40 })
    .filter((s) => s.trim().length > 0);

/** 全部失败原因(Property 9 覆盖)。 */
const failureReasonArb = fc.constantFrom(
    "disabled",
    "timeout",
    "network",
    "bad_response",
    "aborted",
    "no_config"
) as fc.Arbitrary<NonNullable<TipResult["reason"]>>;

const segmentArb = fc.constantFrom(
    "dawn",
    "morning",
    "noon",
    "afternoon",
    "evening"
) as fc.Arbitrary<TipContext["segment"]>;

const phaseArb = fc.constantFrom(
    "idle",
    "working",
    "shortBreak",
    "longBreak"
) as fc.Arbitrary<TipContext["phase"]>;

const ctxArb: fc.Arbitrary<TipContext> = fc.record({
    segment: segmentArb,
    nowISO: fc
        .integer({ min: 0, max: 4102444800000 })
        .map((ms) => new Date(ms).toISOString()),
    todos: fc.array(
        fc.record({ text: fc.string({ maxLength: 20 }), completed: fc.boolean() }),
        { maxLength: 4 }
    ),
    todayPomodoros: fc.nat({ max: 99 }),
    todayFocusSeconds: fc.nat({ max: 10000 }),
    phase: phaseArb,
    completedPomodoros: fc.nat({ max: 99 }),
    continuousFocusSeconds: fc.nat({ max: 10000 }),
});

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

/** 在 store 中开启 AI(并提供端点/key),使 effectiveEnabled 可为真。 */
function enableStore() {
    useGanyuSettings.setState({
        ...DEFAULT_GANYU_SETTINGS,
        aiEnabled: true,
        endpoint: "https://example.com/v1/chat/completions",
        apiKey: "sk-test",
    });
}

function deferred<T>() {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>((r) => {
        resolve = r;
    });
    return { promise, resolve };
}

beforeEach(() => {
    mockGenerateTip.mockReset();
    enableStore();
    resetTipCache();
});

afterEach(() => {
    cleanup();
    useGanyuSettings.setState({ ...DEFAULT_GANYU_SETTINGS });
});

// ---------------------------------------------------------------------------

describe("useGanyuTip · Property 9: 未启用/失败回落到非空静态文案", () => {
    // Feature: ganyu-companion-messages, Property 9: 任意 TipContext 与任意失败/未启用情形(disabled、timeout、network、bad_response、aborted、no_config),useGanyuTip 最终展示的文本恒等于传入的静态 fallback,且该文本非空。
    it("Property 9: 任意失败/未启用,最终 text === 非空 fallback", async () => {
        await fc.assert(
            fc.asyncProperty(
                nonEmptyStringArb,
                ctxArb,
                failureReasonArb,
                fc.boolean(),
                async (fallback, ctx, reason, viaDisabled) => {
                    mockGenerateTip.mockReset();

                    if (viaDisabled) {
                        // 未启用路径:hook enabled=false → 不应发起任何请求。
                        const { result, unmount } = renderHook((props) =>
                            useGanyuTip(props), {
                            initialProps: makeArgs({ enabled: false, fallback, ctx }),
                        });
                        await waitFor(() =>
                            expect(result.current.loading).toBe(false)
                        );
                        expect(mockGenerateTip).toHaveBeenCalledTimes(0);
                        expect(result.current.text).toBe(fallback);
                        expect(result.current.text.length).toBeGreaterThan(0);
                        unmount();
                    } else {
                        // 启用但失败:generateTip 返回 ok=false。
                        mockGenerateTip.mockResolvedValue({ ok: false, reason });
                        const { result, unmount } = renderHook((props) =>
                            useGanyuTip(props), {
                            initialProps: makeArgs({ enabled: true, fallback, ctx }),
                        });
                        await waitFor(() =>
                            expect(result.current.loading).toBe(false)
                        );
                        expect(result.current.text).toBe(fallback);
                        expect(result.current.text.length).toBeGreaterThan(0);
                        unmount();
                    }
                }
            ),
            { numRuns: 100 }
        );
    }, 30000);
});

describe("useGanyuTip · Property 10: 加载先静态、成功后更新", () => {
    // Feature: ganyu-companion-messages, Property 10: 任意场景,useGanyuTip 的初始展示文本等于静态 fallback;当 AI 成功返回非空响应后,展示文本更新为裁剪后的 AI_Tip。
    it("Property 10: 初始 text === fallback,成功后 text === AI_Tip", async () => {
        await fc.assert(
            fc.asyncProperty(
                nonEmptyStringArb,
                nonBlankStringArb,
                ctxArb,
                async (fallback, aiTip, ctx) => {
                    mockGenerateTip.mockReset();
                    resetTipCache();
                    // 用 deferred 控制成功时机,确保「初始即 fallback」可被观测。
                    const d = deferred<TipResult>();
                    mockGenerateTip.mockReturnValue(d.promise);

                    const { result, unmount } = renderHook((props) =>
                        useGanyuTip(props), {
                        initialProps: makeArgs({ enabled: true, fallback, ctx }),
                    });

                    // 成功结果尚未到达:初始展示静态 fallback(需求 9.5)。
                    expect(result.current.text).toBe(fallback);

                    // AI 成功返回非空 → 覆盖展示。
                    d.resolve({ ok: true, tip: aiTip });
                    await waitFor(() =>
                        expect(result.current.text).toBe(aiTip)
                    );
                    unmount();
                }
            ),
            { numRuns: 100 }
        );
    }, 30000);
});

describe("useGanyuTip · Property 12: 关闭面板后放弃未完成请求", () => {
    // Feature: ganyu-companion-messages, Property 12: 任意 TipContext,若在请求 pending 期间触发 abort(卸载/关闭),则该次结果被忽略,最终展示保持为静态 fallback。
    it("Property 12: pending 期间 unmount,迟到的成功结果被忽略,text 保持 fallback", async () => {
        await fc.assert(
            fc.asyncProperty(
                nonEmptyStringArb,
                nonBlankStringArb,
                ctxArb,
                async (fallback, lateTip, ctx) => {
                    mockGenerateTip.mockReset();
                    resetTipCache();
                    const d = deferred<TipResult>();
                    mockGenerateTip.mockReturnValue(d.promise);

                    const { result, unmount } = renderHook((props) =>
                        useGanyuTip(props), {
                        initialProps: makeArgs({ enabled: true, fallback, ctx }),
                    });

                    expect(result.current.text).toBe(fallback);

                    // 请求仍 pending 时卸载(等价于面板关闭),hook 内部 abort。
                    unmount();

                    // 迟到结果到达:应被忽略,不更新展示。
                    d.resolve({ ok: true, tip: lateTip });
                    await new Promise((r) => setTimeout(r, 0));

                    expect(result.current.text).toBe(fallback);
                    expect(result.current.text).not.toBe(lateTip);
                }
            ),
            { numRuns: 100 }
        );
    }, 30000);
});

describe("useGanyuTip · Property 13: 同一上下文去重", () => {
    // Feature: ganyu-companion-messages, Property 13: 任意 TipContext,在单次面板打开内对相同上下文指纹连续发起 N 次请求,实际网络调用次数为 1。
    it("Property 13: 相同指纹连续 N 次仅 1 次调用,指纹变化后再触发一次", async () => {
        await fc.assert(
            fc.asyncProperty(
                nonEmptyStringArb,
                ctxArb,
                fc.integer({ min: 2, max: 8 }),
                async (fallback, ctx, n) => {
                    mockGenerateTip.mockReset();
                    resetTipCache();
                    mockGenerateTip.mockResolvedValue({ ok: true, tip: "你辛苦了。" });

                    const { result, rerender, unmount } = renderHook(
                        (props) => useGanyuTip(props),
                        { initialProps: makeArgs({ enabled: true, fallback, ctx }) }
                    );

                    // 同一上下文指纹连续重渲染 N 次 → 不重复请求(需求 10.4)。
                    for (let i = 0; i < n; i++) {
                        rerender(makeArgs({ enabled: true, fallback, ctx }));
                    }
                    await waitFor(() =>
                        expect(result.current.loading).toBe(false)
                    );
                    expect(mockGenerateTip).toHaveBeenCalledTimes(1);

                    // 指纹变化(phase 变化模拟阶段切换)→ 触发新的请求。
                    const ctx2: TipContext = {
                        ...ctx,
                        phase: ctx.phase === "idle" ? "working" : "idle",
                    };
                    rerender(makeArgs({ enabled: true, fallback, ctx: ctx2 }));
                    await waitFor(() =>
                        expect(mockGenerateTip).toHaveBeenCalledTimes(2)
                    );

                    unmount();
                }
            ),
            { numRuns: 100 }
        );
    }, 30000);
});

describe("useGanyuTip · 示例:打开面板 / 阶段切换各触发一次请求(需求 9.1/9.2)", () => {
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

    it("打开面板(挂载)触发恰好一次请求", async () => {
        mockGenerateTip.mockResolvedValue({ ok: true, tip: "下午好。" });

        const { result, unmount } = renderHook((props) => useGanyuTip(props), {
            initialProps: makeArgs({
                enabled: true,
                fallback: "下午好,我替你沏了杯清心茶。",
                ctx: baseCtx,
            }),
        });

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(mockGenerateTip).toHaveBeenCalledTimes(1);
        unmount();
    });

    it("重新打开(跨越 TTL 窗口)触发一次新请求", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2024-01-01T14:00:00.000Z"));
        mockGenerateTip.mockResolvedValue({ ok: true, tip: "下午好。" });
        const fallback = "下午好,我替你沏了杯清心茶。";

        const { result, unmount } = renderHook((props) => useGanyuTip(props), {
            initialProps: makeArgs({ enabled: true, fallback, ctx: baseCtx }),
        });
        await waitFor(() => expect(mockGenerateTip).toHaveBeenCalledTimes(1));
        unmount();

        // 推进到下一个 TTL 窗口(>3min)→ 指纹中 nowWindow 变化 → 新请求
        vi.setSystemTime(new Date("2024-01-01T14:04:00.000Z"));

        const { unmount: unmount2 } = renderHook((props) => useGanyuTip(props), {
            initialProps: makeArgs({ enabled: true, fallback, ctx: baseCtx }),
        });
        await waitFor(() => expect(mockGenerateTip).toHaveBeenCalledTimes(2));
        unmount2();
        vi.useRealTimers();
    });

    it("阶段切换(phase 变化)触发一次新请求", async () => {
        mockGenerateTip.mockResolvedValue({ ok: true, tip: "专注中。" });
        const fallback = "准备开始";

        const { rerender, unmount } = renderHook((props) => useGanyuTip(props), {
            initialProps: makeArgs({
                enabled: true,
                fallback,
                ctx: baseCtx,
                scene: { kind: "phaseLabel", phase: "idle" },
            }),
        });
        await waitFor(() => expect(mockGenerateTip).toHaveBeenCalledTimes(1));

        const working: TipContext = { ...baseCtx, phase: "working" };
        rerender(
            makeArgs({
                enabled: true,
                fallback,
                ctx: working,
                scene: { kind: "phaseLabel", phase: "working" },
            })
        );
        await waitFor(() => expect(mockGenerateTip).toHaveBeenCalledTimes(2));
        unmount();
    });
});
