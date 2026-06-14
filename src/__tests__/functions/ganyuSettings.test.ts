import { describe, it, expect, beforeEach, vi } from "vitest";
import fc from "fast-check";

/**
 * Ganyu 设置 store 属性/单元测试(Task 8)。
 *
 * 覆盖:
 * - design.md「Correctness Properties」Property 7:API key 掩码不泄露完整明文(需求 8.6)。
 * - 默认 aiEnabled=false 及其余默认值(需求 8.1)。
 * - 首启说明状态机:disclosureShown 仅首次成功启用时置位(需求 8.3 / 8.4)。
 * - 本地存储不可用时阻止启用、保持 aiEnabled=false(需求 8.7)。
 *
 * 框架:fast-check + Vitest,属性测试 ≥100 次迭代({ numRuns: 100 })。
 *
 * useGanyuSettings 通过 tauri-plugin-store-api 的 Store、@tauri-apps/api/tauri 的
 * invoke 以及 utils/settings 的 getAppSettings 持久化。jsdom 环境下没有真实 Tauri
 * 后端,故用 vi.mock 桩替换这些依赖,使 store 逻辑可在内存中运行。
 */

// vi.mock 工厂会被提升到文件顶部,需用 vi.hoisted 让其能引用受控的 mock 函数。
const { storeSet, storeSave, invokeMock, getAppSettingsMock } = vi.hoisted(() => ({
    storeSet: vi.fn(),
    storeSave: vi.fn(),
    invokeMock: vi.fn(),
    getAppSettingsMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/tauri", () => ({
    invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock("tauri-plugin-store-api", () => ({
    Store: class {
        constructor(_path: string) {}
        set(...args: unknown[]) {
            return storeSet(...args);
        }
        save(...args: unknown[]) {
            return storeSave(...args);
        }
    },
}));

vi.mock("../../utils/settings", () => ({
    getAppSettings: (...args: unknown[]) => getAppSettingsMock(...args),
}));

import {
    useGanyuSettings,
    DEFAULT_GANYU_SETTINGS,
} from "../../hooks/useGanyuSettings";

/** 计算两个字符串的最长公共后缀长度。 */
function longestCommonSuffix(a: string, b: string): number {
    let i = 0;
    const max = Math.min(a.length, b.length);
    while (i < max && a[a.length - 1 - i] === b[b.length - 1 - i]) i++;
    return i;
}

// 至多暴露的尾部明文字符数(与实现中的 visible=4 对应)。
const MAX_EXPOSED_TRAILING = 4;

beforeEach(() => {
    vi.clearAllMocks();
    // 默认:持久化全部成功。
    invokeMock.mockResolvedValue("/fake/config/settings.json");
    getAppSettingsMock.mockResolvedValue({});
    storeSet.mockResolvedValue(undefined);
    storeSave.mockResolvedValue(undefined);
    // 每个测试前把 store 复位为默认值,隔离状态。
    useGanyuSettings.setState({ ...DEFAULT_GANYU_SETTINGS });
});

describe("Ganyu 设置 maskedApiKey 属性测试", () => {
    // 限定字符集,排除掩码字符 "•"(U+2022),避免与掩码混淆导致误判。
    const apiKeyArb = fc
        .string({ minLength: 1, maxLength: 80 })
        .filter((k) => k.length > 0 && !k.includes("•"));

    // Feature: ganyu-companion-messages, Property 7: 任意非空 API key 字符串,maskedApiKey() 的返回值不等于原始 key,且不包含原始 key 的完整连续明文(原始 key 不是掩码输出的子串),至多暴露尾部少量字符。
    it("Property 7: maskedApiKey 不等于原 key、不含完整明文、至多暴露尾部少量字符", () => {
        fc.assert(
            fc.property(apiKeyArb, (apiKey) => {
                // 直接设置 state,隔离掩码逻辑与持久化。
                useGanyuSettings.setState({ apiKey });
                const masked = useGanyuSettings.getState().maskedApiKey();

                // 1) 掩码结果不等于原始 key
                expect(masked).not.toBe(apiKey);

                // 2) 原始 key 不是掩码输出的连续子串(不泄露完整连续明文)
                expect(masked.includes(apiKey)).toBe(false);

                // 3) 至多暴露尾部少量字符:掩码与原 key 的最长公共后缀 ≤ 4
                expect(longestCommonSuffix(masked, apiKey)).toBeLessThanOrEqual(
                    MAX_EXPOSED_TRAILING
                );
            }),
            { numRuns: 100 }
        );
    });
});

describe("Ganyu 设置默认值单元测试(需求 8.1)", () => {
    it("DEFAULT_GANYU_SETTINGS.aiEnabled 默认为 false", () => {
        expect(DEFAULT_GANYU_SETTINGS.aiEnabled).toBe(false);
    });

    it("DEFAULT_GANYU_SETTINGS 其余默认值符合设计", () => {
        expect(DEFAULT_GANYU_SETTINGS).toEqual({
            aiEnabled: false,
            endpoint: "",
            apiKey: "",
            model: "",
            timeoutMs: 8000,
            longWorkThresholdSeconds: 5400,
            disclosureShown: false,
        });
    });

    it("store 初始状态的 aiEnabled 为 false 且 disclosureShown 为 false", () => {
        const state = useGanyuSettings.getState();
        expect(state.aiEnabled).toBe(false);
        expect(state.disclosureShown).toBe(false);
    });

    it("maskedApiKey 对空 key 返回空字符串(需求 8.6)", () => {
        useGanyuSettings.setState({ apiKey: "" });
        expect(useGanyuSettings.getState().maskedApiKey()).toBe("");
    });
});

describe("Ganyu 首启说明状态机单元测试(需求 8.3 / 8.4)", () => {
    it("默认状态 disclosureShown 为 false", () => {
        expect(useGanyuSettings.getState().disclosureShown).toBe(false);
    });

    it("enableAi 成功时返回 true 并置位 aiEnabled 与 disclosureShown", async () => {
        const ok = await useGanyuSettings.getState().enableAi();
        expect(ok).toBe(true);

        const state = useGanyuSettings.getState();
        expect(state.aiEnabled).toBe(true);
        expect(state.disclosureShown).toBe(true);
    });

    it("再次调用 enableAi 时 disclosureShown 仍保持 true(不重复重置)", async () => {
        const first = await useGanyuSettings.getState().enableAi();
        expect(first).toBe(true);
        expect(useGanyuSettings.getState().disclosureShown).toBe(true);

        const second = await useGanyuSettings.getState().enableAi();
        expect(second).toBe(true);
        expect(useGanyuSettings.getState().disclosureShown).toBe(true);
        expect(useGanyuSettings.getState().aiEnabled).toBe(true);
    });
});

describe("Ganyu 存储失败阻止启用单元测试(需求 8.7)", () => {
    it("持久化(store.save)失败时 enableAi 返回 false 且 aiEnabled 保持 false", async () => {
        storeSave.mockRejectedValue(new Error("storage unavailable"));

        const ok = await useGanyuSettings.getState().enableAi();
        expect(ok).toBe(false);
        expect(useGanyuSettings.getState().aiEnabled).toBe(false);
    });

    it("持久化(store.set)失败时 enableAi 返回 false 且 aiEnabled 保持 false", async () => {
        storeSet.mockRejectedValue(new Error("storage unavailable"));

        const ok = await useGanyuSettings.getState().enableAi();
        expect(ok).toBe(false);
        expect(useGanyuSettings.getState().aiEnabled).toBe(false);
    });

    it("invoke(combine_config_path)失败时 enableAi 返回 false 且 aiEnabled 保持 false", async () => {
        invokeMock.mockRejectedValue(new Error("ipc unavailable"));

        const ok = await useGanyuSettings.getState().enableAi();
        expect(ok).toBe(false);
        expect(useGanyuSettings.getState().aiEnabled).toBe(false);
    });
});
