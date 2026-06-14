import { FocusPhase } from "../../types/IOffice";

/**
 * 甘雨静态文案池模块(纯逻辑)。
 *
 * 职责:把"场景"映射到一组稳定的 i18n key,再选出一条 key 交由调用方 `t()` 翻译。
 * 文案文本本身不在此硬编码,而是存于 i18n 资源(en/kh/zh-CN/zh-TW)。
 *
 * 本文件目前仅包含类型定义与 `getTimeSegment`(Task 1)。
 * 场景→key 解析(`sceneKeys`)、轮换选取(`pickKey`)与便捷封装(`resolveCopy`)
 * 将在 Task 2 中实现。
 */

/**
 * 时段:由当前小时数映射而来。
 * - dawn      凌晨 (0–4)
 * - morning   早上 (5–10)
 * - noon      中午 (11–13)
 * - afternoon 下午 (14–17)
 * - evening   晚上 (18–23)
 */
export type TimeSegment = "dawn" | "morning" | "noon" | "afternoon" | "evening";

/**
 * 文案场景:覆盖工作面板内全部面向用户的展示位。
 *
 * - greet               时段问候(需求 2)
 * - phaseLabel          专注阶段状态标签(需求 3)
 * - subtitleIdlePending idle 且有未完成待办时的副标题引导(需求 4.3)
 * - subtitleDefault     一般副标题
 * - todoCelebrate       完成任务赞美(需求 4.1)
 * - todoEmpty           空状态关怀(需求 4.2)
 * - focusStart          开始专注鼓励
 * - focusBreak          进入休息提示
 * - longWorkCare        长时间工作关心
 * - onboardGreet        引导页初次见面问候(需求 5.1)
 * - onboardHint         引导页提示(需求 5.3)
 * - btn                 交互控件 title 文案(需求 4.4)
 * - placeholder         输入框占位符(需求 4.4)
 * - footer              底部统计区域标签(需求 4.5)
 */
export type CopyScene =
    | { kind: "greet"; segment: TimeSegment }
    | { kind: "phaseLabel"; phase: FocusPhase }
    | { kind: "subtitleIdlePending" }
    | { kind: "subtitleDefault" }
    | { kind: "todoCelebrate" }
    | { kind: "todoEmpty" }
    | { kind: "focusStart" }
    | { kind: "focusBreak" }
    | { kind: "longWorkCare" }
    | { kind: "onboardGreet" }
    | { kind: "onboardHint" }
    | { kind: "btn"; action: "start" | "pause" | "reset" | "setCurrent" | "delete" | "setDefault" }
    | { kind: "placeholder"; field: "addTodo" }
    | { kind: "footer"; label: "pomodoros" | "minutes" };

/**
 * 由当前小时计算时段。
 *
 * 保留 `OfficePopover` 现有的 `new Date().getHours()` 边界(5/11/14/18,需求 2.6):
 * - 0–4   → dawn(凌晨)
 * - 5–10  → morning(早上)
 * - 11–13 → noon(中午)
 * - 14–17 → afternoon(下午)
 * - 18–23 → evening(晚上)
 *
 * @param hour 小时数,期望取值 [0, 23]
 */
export function getTimeSegment(hour: number): TimeSegment {
    if (hour < 5) return "dawn";
    if (hour < 11) return "morning";
    if (hour < 14) return "noon";
    if (hour < 18) return "afternoon";
    return "evening";
}

/**
 * 生成形如 `<prefix>.1`、`<prefix>.2` …… 的有序变体 key 列表。
 *
 * @param prefix key 前缀,如 `ganyu.greet.morning`
 * @param count  变体数量(≥1)
 */
function variants(prefix: string, count: number): string[] {
    const keys: string[] = [];
    for (let i = 1; i <= count; i++) {
        keys.push(`${prefix}.${i}`);
    }
    return keys;
}

/**
 * 各时段问候(greet)的变体数量。design.md 建议每段 ≥3。
 */
const GREET_VARIANTS = 3;

/**
 * 各专注阶段标签(phaseLabel)的变体数量。design.md 建议每阶段 ≥2。
 */
const PHASE_VARIANTS = 2;

/**
 * 返回某场景下的全部候选 i18n key(稳定、有序、非空)。
 *
 * 轮换类场景(greet/phaseLabel/事件/副标题/引导)返回多条 `.1/.2/.3` 变体,
 * 使文案「常看常新」;固定类场景(btn/placeholder/footer)返回单一 key。
 *
 * key 方案与 design.md「5. i18n key 方案」「Data Models · 文案池结构」一致,
 * 并与 Task 4 将写入的 i18n 资源条目一一对应。
 *
 * 关键约束:对任意合法 `CopyScene` 均返回**非空**数组。
 *
 * @param scene 合法的文案场景
 * @returns 该场景的有序候选 key 列表(长度 ≥1)
 */
export function sceneKeys(scene: CopyScene): string[] {
    switch (scene.kind) {
        // 时段问候(需求 2):每段 ≥3 变体
        case "greet":
            return variants(`ganyu.greet.${scene.segment}`, GREET_VARIANTS);

        // 专注阶段标签(需求 3):每阶段 ≥2 变体
        case "phaseLabel":
            return variants(`ganyu.phase.${scene.phase}`, PHASE_VARIANTS);

        // 完成任务赞美(需求 4.1):≥4 变体
        case "todoCelebrate":
            return variants("ganyu.event.celebrate", 4);

        // 空状态关怀(需求 4.2):≥2 变体
        case "todoEmpty":
            return variants("ganyu.event.empty", 2);

        // 开始专注鼓励:≥2 变体
        case "focusStart":
            return variants("ganyu.event.focusStart", 2);

        // 进入休息提示:≥2 变体
        case "focusBreak":
            return variants("ganyu.event.break", 2);

        // 长时间工作关心:≥3 变体
        case "longWorkCare":
            return variants("ganyu.event.longWork", 3);

        // idle 且有未完成待办的副标题引导(需求 4.3):≥2 变体
        case "subtitleIdlePending":
            return variants("ganyu.subtitle.idlePending", 2);

        // 一般副标题:≥2 变体
        case "subtitleDefault":
            return variants("ganyu.subtitle.default", 2);

        // 引导页初次见面问候(需求 5.1)
        case "onboardGreet":
            return variants("ganyu.onboard.greet", 1);

        // 引导页提示(需求 5.3):≥2 变体
        case "onboardHint":
            return variants("ganyu.onboard.hint", 2);

        // 交互控件 title(需求 4.4):固定单一 key
        case "btn":
            return [`ganyu.btn.${scene.action}`];

        // 输入框占位符(需求 4.4):固定单一 key
        case "placeholder":
            return [`ganyu.placeholder.${scene.field}`];

        // 底部统计区域标签(需求 4.5):固定单一 key
        case "footer":
            return [`ganyu.footer.${scene.label}`];
    }
}

/**
 * 轮换游标:在未提供 seed 时,`pickKey` 按调用顺序依次推进,
 * 使同一展示位在多次渲染间「常看常新」。
 */
let rotationCursor = 0;

/**
 * 从候选 key 列表中选出一条。
 *
 * - 提供 `seed` 时为**确定性**选取(`keys[seed % keys.length]`,对负数取模做归一化),
 *   便于测试可重现。
 * - 未提供 `seed` 时按内部游标轮换,使文案随渲染轮换。
 *
 * 对非空输入永远返回数组中的某个元素,绝不返回 `undefined`。
 *
 * @param keys 候选 key 列表(应为非空)
 * @param seed 可选种子,用于确定性选取
 * @returns 选定的 key;若 `keys` 为空则返回空字符串(防御性,正常不会发生)
 */
export function pickKey(keys: string[], seed?: number): string {
    if (keys.length === 0) return "";

    let index: number;
    if (seed !== undefined) {
        // 归一化到 [0, length),兼容负数 seed
        index = ((Math.trunc(seed) % keys.length) + keys.length) % keys.length;
    } else {
        index = rotationCursor % keys.length;
        rotationCursor = (rotationCursor + 1) % Number.MAX_SAFE_INTEGER;
    }
    return keys[index];
}

/**
 * 便捷封装:场景 → 候选 key → 选定 key → `t(key)`。
 *
 * `t` 由调用方注入(react-i18next 的翻译函数)。
 *
 * 地基保证:**永远返回非空字符串**。若 `t()` 返回空/falsy 值(例如该语言缺失条目
 * 且无回退文案),则回落为选定 key 本身,确保展示位不为空。
 *
 * @param scene 合法的文案场景
 * @param t     i18n 翻译函数
 * @param seed  可选种子,用于确定性选取(测试可重现)
 * @returns 非空的展示文案
 */
export function resolveCopy(
    scene: CopyScene,
    t: (k: string) => string,
    seed?: number
): string {
    const keys = sceneKeys(scene);
    const key = pickKey(keys, seed);

    const translated = t(key);
    if (typeof translated === "string" && translated.trim().length > 0) {
        return translated;
    }

    // 回落:t() 未给出有效文案时,用 key 本身保证非空(地基兜底)
    return key || keys[0] || scene.kind;
}
