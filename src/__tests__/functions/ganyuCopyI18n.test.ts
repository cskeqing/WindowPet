import { describe, it, expect } from "vitest";
import fc from "fast-check";
import i18next from "i18next";
import {
    sceneKeys,
    type CopyScene,
    type TimeSegment,
} from "../../ui/office_popover/ganyuCopy";
import type { FocusPhase } from "../../types/IOffice";

import enTranslation from "../../locale/en/translation.json";
import khTranslation from "../../locale/kh/translation.json";
import zhCNTranslation from "../../locale/zh-CN/translation.json";
import zhTWTranslation from "../../locale/zh-TW/translation.json";

/**
 * 阶段一 i18n 完整性与长度属性测试(Task 5)。
 *
 * 覆盖 design.md「Correctness Properties」中:
 * - Property 4:文案池声明的每个 key 在 en/kh/zh-CN/zh-TW 四种语言中均存在且非空。
 * - Property 3(静态部分):任意合法场景的静态文案长度 ≤30 汉字。
 * 以及 i18next 缺 key 回退 en 的示例测试(需求 6.3)。
 *
 * 框架:fast-check + Vitest,属性测试 ≥100 次迭代({ numRuns: 100 })。
 */

// 全部时段(用于 greet 场景)
const ALL_SEGMENTS: TimeSegment[] = ["dawn", "morning", "noon", "afternoon", "evening"];

// 全部专注阶段(用于 phaseLabel 场景)
const ALL_PHASES: FocusPhase[] = ["idle", "working", "shortBreak", "longBreak"];

// 全部 btn action / placeholder field / footer label
const ALL_BTN_ACTIONS: Array<
    Extract<CopyScene, { kind: "btn" }>["action"]
> = ["start", "pause", "reset", "setCurrent", "delete", "setDefault"];

/**
 * 枚举文案池声明的全部合法 CopyScene 变体。
 * 通过对每个 variant 调用 sceneKeys 并取并集,即可得到完整的声明 key 集合。
 */
function allScenes(): CopyScene[] {
    const scenes: CopyScene[] = [];

    ALL_SEGMENTS.forEach((segment) => scenes.push({ kind: "greet", segment }));
    ALL_PHASES.forEach((phase) => scenes.push({ kind: "phaseLabel", phase }));

    scenes.push(
        { kind: "subtitleIdlePending" },
        { kind: "subtitleDefault" },
        { kind: "todoCelebrate" },
        { kind: "todoEmpty" },
        { kind: "focusStart" },
        { kind: "focusBreak" },
        { kind: "longWorkCare" },
        { kind: "onboardGreet" },
        { kind: "onboardHint" }
    );

    ALL_BTN_ACTIONS.forEach((action) => scenes.push({ kind: "btn", action }));
    scenes.push({ kind: "placeholder", field: "addTodo" });
    scenes.push({ kind: "footer", label: "pomodoros" });
    scenes.push({ kind: "footer", label: "minutes" });

    return scenes;
}

/**
 * 文案池声明使用的全部 i18n key(去重、有序)。
 * 对每个 CopyScene variant 调用 sceneKeys 并取并集。
 */
const ALL_DECLARED_KEYS: string[] = Array.from(
    new Set(allScenes().flatMap((scene) => sceneKeys(scene)))
);

// 四种语言资源(直接读取 translation.json)
const RESOURCES: Record<string, Record<string, unknown>> = {
    en: enTranslation as Record<string, unknown>,
    kh: khTranslation as Record<string, unknown>,
    "zh-CN": zhCNTranslation as Record<string, unknown>,
    "zh-TW": zhTWTranslation as Record<string, unknown>,
};

const ALL_LANGUAGES = Object.keys(RESOURCES);

/**
 * 按 i18next keySeparator "." 解析嵌套对象,返回叶子值。
 * 找不到或不是字符串时返回 undefined。
 */
function resolveNested(obj: Record<string, unknown>, key: string): string | undefined {
    const parts = key.split(".");
    let cur: unknown = obj;
    for (const part of parts) {
        if (cur === null || typeof cur !== "object") return undefined;
        cur = (cur as Record<string, unknown>)[part];
    }
    return typeof cur === "string" ? cur : undefined;
}

/**
 * 统计字符串中的汉字数量(CJK 统一表意文字)。
 * 长度约束仅针对汉字(标点等不计入),与 design.md「≤30 汉字」一致。
 */
function countChineseChars(s: string): number {
    const matches = s.match(/[\u4e00-\u9fff]/g);
    return matches ? matches.length : 0;
}

describe("ganyu i18n 完整性与长度属性测试", () => {
    // 健全性:确保声明的 key 集合非空,避免空集导致属性「真空成立」
    it("声明的 key 集合应非空", () => {
        expect(ALL_DECLARED_KEYS.length).toBeGreaterThan(0);
    });

    // Feature: ganyu-companion-messages, Property 4: 任意文案池声明使用的 i18n key,en、kh、zh-CN、zh-TW 四种语言资源中均存在该 key 且对应文案非空。
    it("Property 4: 每个声明 key 在四种语言中均存在且非空", () => {
        fc.assert(
            fc.property(
                fc.constantFrom(...ALL_DECLARED_KEYS),
                fc.constantFrom(...ALL_LANGUAGES),
                (key, lang) => {
                    const value = resolveNested(RESOURCES[lang], key);
                    expect(value, `${lang} 缺失或非字符串: ${key}`).toBeTypeOf("string");
                    expect(
                        (value as string).trim().length,
                        `${lang} 文案为空: ${key}`
                    ).toBeGreaterThan(0);
                }
            ),
            { numRuns: 100 }
        );
    });

    // Feature: ganyu-companion-messages, Property 3: 任意合法场景的静态文案(此处取 zh-CN),其长度均不超过 30 个汉字。
    it("Property 3(静态部分): zh-CN 每条静态文案 ≤30 汉字", () => {
        fc.assert(
            fc.property(fc.constantFrom(...ALL_DECLARED_KEYS), (key) => {
                const value = resolveNested(RESOURCES["zh-CN"], key);
                expect(value, `zh-CN 缺失: ${key}`).toBeTypeOf("string");
                expect(
                    countChineseChars(value as string),
                    `zh-CN 文案超长: ${key} = ${value}`
                ).toBeLessThanOrEqual(30);
            }),
            { numRuns: 100 }
        );
    });
});

describe("i18next 缺 key 回退 en 示例测试(需求 6.3)", () => {
    it("当前语言缺失某 key 时,t() 回退到 en 并返回非空文案", async () => {
        const i18n = i18next.createInstance();
        await i18n.init({
            lng: "kh",
            fallbackLng: "en",
            keySeparator: ".",
            resources: {
                en: { translation: enTranslation },
                // 故意提供一个缺少该 key 的语言资源,触发回退
                kh: { translation: { ganyu: {} } },
            },
            interpolation: { escapeValue: false },
        });

        const key = "ganyu.greet.morning.1";
        const enValue = resolveNested(enTranslation as Record<string, unknown>, key);

        // 当前 lng=kh 缺失该 key,应回退到 en 的文案
        const resolved = i18n.t(key);
        expect(resolved).toBe(enValue);
        expect(resolved.trim().length).toBeGreaterThan(0);
        expect(resolved).not.toBe(key); // 不是原样返回 key,即确实命中了回退文案
    });

    it("en 资源覆盖全部声明 key(回退兜底保证)", () => {
        const missing = ALL_DECLARED_KEYS.filter((key) => {
            const value = resolveNested(enTranslation as Record<string, unknown>, key);
            return value === undefined || value.trim().length === 0;
        });
        expect(missing, `en 缺失的 key: ${missing.join(", ")}`).toEqual([]);
    });
});
