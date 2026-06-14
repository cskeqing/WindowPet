import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
    getTimeSegment,
    sceneKeys,
    resolveCopy,
    type CopyScene,
    type TimeSegment,
} from "../../ui/office_popover/ganyuCopy";
import type { FocusPhase } from "../../types/IOffice";

/**
 * 阶段一文案池属性测试(Task 3)。
 *
 * 覆盖 design.md「Correctness Properties」中的 Property 1 与 Property 2,
 * 以及 getTimeSegment 边界点的示例单元测试。
 *
 * 框架:fast-check + Vitest,属性测试 ≥100 次迭代({ numRuns: 100 })。
 */

// 全部时段(用于 greet 场景与 Property 2 校验)
const ALL_SEGMENTS: TimeSegment[] = ["dawn", "morning", "noon", "afternoon", "evening"];

// 全部专注阶段(用于 phaseLabel 场景)
const ALL_PHASES: FocusPhase[] = ["idle", "working", "shortBreak", "longBreak"];

/**
 * 覆盖全部 CopyScene kind 的生成器:
 * - greet × 每个 TimeSegment
 * - phaseLabel × 每个 FocusPhase
 * - 全部无参场景
 * - btn × 每个 action、placeholder × 每个 field、footer × 每个 label
 */
const sceneArb: fc.Arbitrary<CopyScene> = fc.oneof(
    fc.constantFrom(...ALL_SEGMENTS).map(
        (segment): CopyScene => ({ kind: "greet", segment })
    ),
    fc.constantFrom(...ALL_PHASES).map(
        (phase): CopyScene => ({ kind: "phaseLabel", phase })
    ),
    fc.constantFrom<CopyScene>(
        { kind: "subtitleIdlePending" },
        { kind: "subtitleDefault" },
        { kind: "todoCelebrate" },
        { kind: "todoEmpty" },
        { kind: "focusStart" },
        { kind: "focusBreak" },
        { kind: "longWorkCare" },
        { kind: "onboardGreet" },
        { kind: "onboardHint" }
    ),
    fc.constantFrom<CopyScene>(
        { kind: "btn", action: "start" },
        { kind: "btn", action: "pause" },
        { kind: "btn", action: "reset" },
        { kind: "btn", action: "setCurrent" },
        { kind: "btn", action: "delete" },
        { kind: "btn", action: "setDefault" },
        { kind: "placeholder", field: "addTodo" },
        { kind: "footer", label: "pomodoros" },
        { kind: "footer", label: "minutes" }
    )
);

// mock 翻译函数:对任意 key 返回非空字符串(模拟 i18n 已配置文案)
const mockT = (k: string): string => `译文:${k}`;

// 模拟 i18n 缺失某 key 时返回空串的情形,用于验证 resolveCopy 的兜底
const emptyT = (_k: string): string => "";

describe("ganyuCopy 文案池属性测试", () => {
    // Feature: ganyu-companion-messages, Property 1: 任意合法的 CopyScene(含时段问候、专注阶段标签、完成赞美、空状态关怀、开始专注、进入休息、长时间工作关心、副标题引导、引导页、控件/占位/统计标签),sceneKeys(scene) 返回非空 key 列表,且 resolveCopy(scene, t) 返回非空字符串。
    it("Property 1: 任意场景 sceneKeys 非空且 resolveCopy 返回非空字符串", () => {
        fc.assert(
            fc.property(sceneArb, fc.option(fc.integer(), { nil: undefined }), (scene, seed) => {
                const keys = sceneKeys(scene);
                expect(Array.isArray(keys)).toBe(true);
                expect(keys.length).toBeGreaterThan(0);
                keys.forEach((k) => expect(typeof k === "string" && k.length > 0).toBe(true));

                const text = resolveCopy(scene, mockT, seed);
                expect(typeof text).toBe("string");
                expect(text.trim().length).toBeGreaterThan(0);

                // 兜底路径:即便 t() 返回空串,resolveCopy 仍保证非空
                const fallbackText = resolveCopy(scene, emptyT, seed);
                expect(fallbackText.trim().length).toBeGreaterThan(0);
            }),
            { numRuns: 100 }
        );
    });

    // Feature: ganyu-companion-messages, Property 2: 任意小时数 hour ∈ [0,23],getTimeSegment(hour) 落入正确区间(0–4→dawn、5–10→morning、11–13→noon、14–17→afternoon、18–23→evening,边界 5/11/14/18),且对应 greet 场景能解析出非空问候文案。
    it("Property 2: getTimeSegment 区间映射正确且 greet 文案非空", () => {
        fc.assert(
            fc.property(fc.integer({ min: 0, max: 23 }), (hour) => {
                const segment = getTimeSegment(hour);

                let expected: TimeSegment;
                if (hour <= 4) expected = "dawn";
                else if (hour <= 10) expected = "morning";
                else if (hour <= 13) expected = "noon";
                else if (hour <= 17) expected = "afternoon";
                else expected = "evening";

                expect(segment).toBe(expected);

                const greet = resolveCopy({ kind: "greet", segment }, mockT);
                expect(greet.trim().length).toBeGreaterThan(0);
            }),
            { numRuns: 100 }
        );
    });
});

describe("getTimeSegment 边界点示例单元测试", () => {
    const cases: Array<[number, TimeSegment]> = [
        [0, "dawn"],
        [4, "dawn"],
        [5, "morning"],
        [10, "morning"],
        [11, "noon"],
        [13, "noon"],
        [14, "afternoon"],
        [17, "afternoon"],
        [18, "evening"],
        [23, "evening"],
    ];

    it.each(cases)("hour=%i 映射为 %s", (hour, expected) => {
        expect(getTimeSegment(hour)).toBe(expected);
    });
});
