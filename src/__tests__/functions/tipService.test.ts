import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fc from "fast-check";

import {
    generateTip,
    buildPrompt,
    TipContext,
} from "../../services/tipService";
import {
    GanyuSettings,
    DEFAULT_GANYU_SETTINGS,
} from "../../hooks/useGanyuSettings";

/**
 * Tip_Service 属性测试(Task 10)。
 *
 * 框架:fast-check + Vitest,属性测试 ≥100 次迭代({ numRuns: 100 })。
 * 网络层通过 vi.fn() mock 全局 fetch,统计调用次数与目标 URL,零成本运行 100+ 次。
 *
 * 覆盖 design.md「Correctness Properties」:
 * - Property 5:停用 AI 时零网络请求且返回 disabled(需求 8.2)。
 * - Property 6:启用时请求 URL 恒等于 settings.endpoint(需求 8.8)。
 * - Property 8:buildPrompt(ctx).user 含且仅含约定上下文字段(无设备标识/路径)(需求 7.1/7.2)。
 * - Property 3(AI 部分):任意模型返回字符串经裁剪后 ≤30 汉字(需求 7.5/1.5)。
 * - Property 11:任意 timeoutMs>0 仍发起请求,超时返回 timeout(需求 10.2)。
 *
 * 关于 Property 13(同一上下文去重,需求 10.4):
 *   去重("单次面板打开内相同上下文指纹连续 N 次仅 1 次网络调用")的行为
 *   并不在 tipService/generateTip 中实现 —— tipService 不持有任何 memo/缓存,
 *   每次 generateTip 调用都会独立发起一次 fetch。该去重逻辑由 useGanyuTip 钩子
 *   (design.md §3「AI 提示钩子」,以「场景+关键数据指纹」去重)承担。
 *   因此 Property 13 在 useGanyuTip 的测试(Task 12)中覆盖,这里不强行实现。
 */

const MAX_TIP_CHARS = 30;

// ---- 生成器 ----------------------------------------------------------------

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

const todoArb = fc.record({
    text: fc.string({ maxLength: 40 }),
    completed: fc.boolean(),
});

// 安全的 ISO 时间字符串(限制在合法 Date 范围内,避免 toISOString 抛错)。
const nowISOArb = fc
    .integer({ min: 0, max: 4102444800000 }) // 1970 ~ 2100
    .map((ms) => new Date(ms).toISOString());

const ctxArb: fc.Arbitrary<TipContext> = fc.record({
    segment: segmentArb,
    nowISO: nowISOArb,
    todos: fc.array(todoArb, { maxLength: 6 }),
    todayPomodoros: fc.nat({ max: 999 }),
    todayFocusSeconds: fc.nat({ max: 100000 }),
    phase: phaseArb,
    completedPomodoros: fc.nat({ max: 999 }),
    continuousFocusSeconds: fc.nat({ max: 100000 }),
});

// ---- 辅助 ------------------------------------------------------------------

function enabledSettings(overrides: Partial<GanyuSettings> = {}): GanyuSettings {
    return {
        ...DEFAULT_GANYU_SETTINGS,
        aiEnabled: true,
        endpoint: "https://example.com/v1/chat/completions",
        apiKey: "sk-test-key",
        timeoutMs: 8000,
        ...overrides,
    };
}

/** 构造一个 OpenAI 兼容的成功响应(fetch 解析为 Response-like 对象)。 */
function okResponse(content: string) {
    return {
        ok: true,
        json: async () => ({ choices: [{ message: { content } }] }),
    };
}

function freshSignal(): AbortSignal {
    return new AbortController().signal;
}

beforeEach(() => {
    vi.unstubAllGlobals();
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

// ---------------------------------------------------------------------------

describe("Tip_Service · Property 5: 停用 AI 时零网络请求", () => {
    // Feature: ganyu-companion-messages, Property 5: 任意 TipContext,当 settings.aiEnabled === false 时,generateTip 不发起任何网络请求(网络调用次数为 0),并返回 reason="disabled"。
    it("Property 5: aiEnabled=false → 0 次 fetch 且 reason=disabled", async () => {
        await fc.assert(
            fc.asyncProperty(ctxArb, async (ctx) => {
                const fetchMock = vi.fn();
                vi.stubGlobal("fetch", fetchMock);

                const settings = enabledSettings({ aiEnabled: false });
                const result = await generateTip(ctx, settings, freshSignal());

                expect(result.ok).toBe(false);
                expect(result.reason).toBe("disabled");
                expect(fetchMock).toHaveBeenCalledTimes(0);
            }),
            { numRuns: 100 }
        );
    });
});

describe("Tip_Service · Property 6: 仅向 settings.endpoint 发送", () => {
    // Feature: ganyu-companion-messages, Property 6: 任意 TipContext 与任意端点字符串,当 AI 已启用并发起请求时,实际请求的 URL 恒等于 settings.endpoint,不会发往任何其他地址。
    it("Property 6: 启用并发起请求时,fetch 的第一个参数(URL)恒等于 settings.endpoint", async () => {
        const endpointArb = fc.string({ minLength: 1, maxLength: 120 });

        await fc.assert(
            fc.asyncProperty(ctxArb, endpointArb, async (ctx, endpoint) => {
                const fetchMock = vi.fn(async () => okResponse("你辛苦了,先歇一会儿吧。"));
                vi.stubGlobal("fetch", fetchMock);

                const settings = enabledSettings({ endpoint });
                await generateTip(ctx, settings, freshSignal());

                expect(fetchMock).toHaveBeenCalledTimes(1);
                const firstCall = fetchMock.mock.calls[0] as unknown as [string, ...unknown[]];
                expect(firstCall[0]).toBe(endpoint);
            }),
            { numRuns: 100 }
        );
    });
});

describe("Tip_Service · Property 8: 提示词含且仅含约定上下文字段", () => {
    const SENTINEL_DEVICE = "__SENTINEL_DEVICE_ID_8f3a2c__";
    const SENTINEL_PATH = "/__SENTINEL_FILE_PATH_b91d__/secret.json";

    // Feature: ganyu-companion-messages, Property 8: 任意 TipContext,buildPrompt(ctx).user 包含待办文本与完成状态、今日番茄数、今日专注秒数、当前阶段、已完成番茄数、当前时间与时段;且不包含约定字段以外的任何信息(无设备标识、文件路径等)。
    it("Property 8: user 提示包含全部约定字段,且不含注入的设备标识/文件路径", async () => {
        await fc.assert(
            fc.property(ctxArb, (ctx) => {
                // 注入约定字段之外的额外属性,模拟设备标识/文件路径泄露风险。
                const polluted = {
                    ...ctx,
                    deviceId: SENTINEL_DEVICE,
                    filePath: SENTINEL_PATH,
                    machineId: SENTINEL_DEVICE,
                } as unknown as TipContext;

                const { user } = buildPrompt(polluted);

                // 1) 包含约定字段(标签 + 值)
                expect(user).toContain(`时段:${ctx.segment}`);
                expect(user).toContain(`当前时间:${ctx.nowISO}`);
                expect(user).toContain(`当前专注阶段:${ctx.phase}`);
                expect(user).toContain(`今日番茄数:${ctx.todayPomodoros}`);
                expect(user).toContain(`今日专注秒数:${ctx.todayFocusSeconds}`);
                expect(user).toContain(`已完成番茄数:${ctx.completedPomodoros}`);
                expect(user).toContain(`连续专注秒数:${ctx.continuousFocusSeconds}`);

                // 待办文本与完成状态
                if (ctx.todos.length === 0) {
                    expect(user).toContain("(暂无待办)");
                } else {
                    ctx.todos.forEach((t) => {
                        expect(user).toContain(t.text);
                        expect(user).toContain(t.completed ? "已完成" : "未完成");
                    });
                }

                // 2) 不包含任何注入的约定外信息
                expect(user.includes(SENTINEL_DEVICE)).toBe(false);
                expect(user.includes(SENTINEL_PATH)).toBe(false);
            }),
            { numRuns: 100 }
        );
    });
});

describe("Tip_Service · Property 3(AI 部分): 裁剪后 ≤30 汉字", () => {
    // 任意模型返回字符串:含超长串、空串、引号/换行、非 ASCII。
    const modelOutputArb = fc.oneof(
        fc.string(),
        fc.string({ minLength: 100, maxLength: 500 }),
        fc.constantFrom(
            "",
            "   ",
            "\n\n",
            '"这是一句被引号包裹的提示。"',
            "「先歇一会儿吧」",
            "第一行提示\n第二行多余内容",
            "🌸🌿☃️ 你辛苦了 🍵",
            "あいうえお你好こんにちは世界안녕하세요你需要休息了好不好真的辛苦了请喝口热茶吧亲爱的主人今天也"
        ),
        // 超长汉字串(远超 30)
        fc.array(fc.constantFrom("你", "我", "歇", "茶", "好", "霜", "雪", "花"), {
            minLength: 50,
            maxLength: 120,
        }).map((arr) => arr.join(""))
    );

    // Feature: ganyu-companion-messages, Property 3: 任意场景的静态文案,以及任意模型返回的任意字符串经裁剪后的 AI_Tip,其长度均不超过 30 个汉字。
    it("Property 3: 任意模型返回经裁剪后,成功时 tip 的字符数 ≤ 30", async () => {
        await fc.assert(
            fc.asyncProperty(ctxArb, modelOutputArb, async (ctx, raw) => {
                const fetchMock = vi.fn(async () => okResponse(raw));
                vi.stubGlobal("fetch", fetchMock);

                const result = await generateTip(ctx, enabledSettings(), freshSignal());

                if (result.ok) {
                    expect(result.tip).toBeDefined();
                    // 以「字符」计数(Array.from 正确处理代理对/emoji)
                    expect(Array.from(result.tip as string).length).toBeLessThanOrEqual(
                        MAX_TIP_CHARS
                    );
                } else {
                    // 空/纯空白响应应记为 bad_response,而非返回过长 tip
                    expect(result.reason).toBe("bad_response");
                }
            }),
            { numRuns: 100 }
        );
    });
});

describe("Tip_Service · Property 11: 任意 timeoutMs>0 仍发起请求,超时返回 timeout", () => {
    // Feature: ganyu-companion-messages, Property 11: 任意 timeoutMs > 0(含极小值),启用状态下 generateTip 仍会发起一次请求;若模型未在期限内响应,则返回 reason="timeout"。
    it("Property 11: 小超时下仍发起 fetch,且模型不响应时返回 timeout", async () => {
        // 极小超时值(含 1ms),用真实定时器:fetch 永不 resolve,仅在 controller.abort 时 reject。
        const timeoutArb = fc.integer({ min: 1, max: 20 });

        await fc.assert(
            fc.asyncProperty(ctxArb, timeoutArb, async (ctx, timeoutMs) => {
                const fetchMock = vi.fn(
                    (_url: string, opts: { signal?: AbortSignal }) =>
                        new Promise((_resolve, reject) => {
                            const signal = opts?.signal;
                            const abortErr = new DOMException("Aborted", "AbortError");
                            if (signal?.aborted) {
                                reject(abortErr);
                                return;
                            }
                            signal?.addEventListener("abort", () => reject(abortErr));
                        })
                );
                vi.stubGlobal("fetch", fetchMock);

                const result = await generateTip(
                    ctx,
                    enabledSettings({ timeoutMs }),
                    freshSignal()
                );

                // 仍发起了请求
                expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(1);
                // 未在期限内响应 → 超时降级
                expect(result.ok).toBe(false);
                expect(result.reason).toBe("timeout");
            }),
            { numRuns: 100 }
        );
    });
});
