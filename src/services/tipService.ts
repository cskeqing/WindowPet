import { FocusPhase } from "../types/IOffice";
import { TimeSegment } from "../ui/office_popover/ganyuCopy";
import { GanyuSettings } from "../hooks/useGanyuSettings";

/**
 * Tip_Service —— AI 个性化话术路径(可选增强层)。
 *
 * 职责:序列化上下文(隐私边界)、构造提示词(注入甘雨人设)、调用用户配置的
 * LLM 端点、处理超时/中止/异常,并把结果或失败原因以 `TipResult` 交还调用方。
 *
 * 设计原则:
 * - 纯网络与编排逻辑,不直接操作 DOM。
 * - `generateTip` **永不抛异常**,所有错误均转为 `TipResult.ok=false` + reason,
 *   由上层无缝回落到静态甘雨话术(见 design.md「Error Handling」)。
 * - 仅向 `settings.endpoint` 发送请求,且仅在 `aiEnabled=true` 时发起任何网络请求。
 */

/**
 * 发往 LLM 的上下文。**隐私边界**:仅包含约定字段,
 * 不含任何设备标识、文件路径或其他个人信息(需求 7.1/7.2/8.3,Property 8)。
 */
export interface TipContext {
    /** 当前时段(凌晨/早上/中午/下午/晚上) */
    segment: TimeSegment;
    /** 当前时间(ISO 字符串) */
    nowISO: string;
    /** 待办:仅文本与完成态 */
    todos: { text: string; completed: boolean }[];
    /** 今日番茄数 */
    todayPomodoros: number;
    /** 今日专注秒数 */
    todayFocusSeconds: number;
    /** 当前专注阶段 */
    phase: FocusPhase;
    /** 已完成番茄数 */
    completedPomodoros: number;
    /** 连续专注时长(秒),用于长时间工作提醒阈值判断(需求 7.3) */
    continuousFocusSeconds: number;
}

/**
 * `generateTip` 的结果。成功时携带裁剪后的 AI 文案;失败时携带原因。
 */
export interface TipResult {
    ok: boolean;
    /** 成功时的 AI 文案(已裁剪到 ≤30 汉字) */
    tip?: string;
    /** 失败原因 */
    reason?: "disabled" | "timeout" | "network" | "bad_response" | "aborted" | "no_config";
}

/** AI 文案长度上限:30 个汉字(需求 1.5/7.5,Property 3)。 */
const MAX_TIP_CHARS = 30;

/**
 * 序列化/裁剪上下文为可发送内容。
 *
 * **隐私边界**:显式只挑选约定字段重建对象,丢弃传入对象上任何额外属性,
 * 确保不会把设备标识、文件路径等泄露到提示词中(Property 8)。纯函数。
 *
 * todos 也被显式投影为 `{ text, completed }`,剔除 id/createdAt/isCurrent 等字段。
 */
export function serializeContext(ctx: TipContext): TipContext {
    return {
        segment: ctx.segment,
        nowISO: ctx.nowISO,
        todos: ctx.todos.map((t) => ({ text: t.text, completed: t.completed })),
        todayPomodoros: ctx.todayPomodoros,
        todayFocusSeconds: ctx.todayFocusSeconds,
        phase: ctx.phase,
        completedPomodoros: ctx.completedPomodoros,
        continuousFocusSeconds: ctx.continuousFocusSeconds,
    };
}

/**
 * 构造发往 LLM 的 system / user 提示词。纯函数。
 *
 * - system:注入甘雨人设(月海亭秘书、半麒麟、温柔内向、勤勉而易过劳、共情式关怀)
 *   + ≤30 汉字 + 第二人称「你」/第一人称「我」 + 陈述或邀请语气 + 单一意图
 *   + 不加表情符号/引号/不命令(依据 ganyu-persona.md)。
 * - user:仅序列化约定上下文字段(Property 8),不含约定外信息。
 */
export function buildPrompt(ctx: TipContext): { system: string; user: string } {
    const safe = serializeContext(ctx);

    const system = [
        "你是桌面伴侣「甘雨」,璃月月海亭的秘书,半人半麒麟的仙兽后裔。",
        "你温柔娴静、勤勉尽责、略带内向害羞;你自己也常因投入工作而忘了休息,",
        "所以对「按时歇息」格外真诚——你的关怀发自共情,而非说教。",
        "请基于主人当前的状态,给出「一句」贴心提示。",
        "规则:",
        "1. 第二人称用「你」称呼主人,第一人称用「我」自称。",
        "2. 语气温柔,采用陈述或邀请,绝不命令、不催促、不浮夸。",
        "3. 不超过 30 个汉字,只表达一个意图。",
        "4. 可点到为止地融入她的世界观意象(契约、清心花、霜雪、热茶、小憩、璃月),不堆砌。",
        "5. 不要加表情符号、不要加引号、不要堆叹号、不用网络流行语。",
        "6. 只输出这一句提示本身,不要任何前后缀或解释。",
    ].join("\n");

    const todoLines = safe.todos.length > 0
        ? safe.todos
            .map((t, i) => `  ${i + 1}. [${t.completed ? "已完成" : "未完成"}] ${t.text}`)
            .join("\n")
        : "  (暂无待办)";

    const user = [
        "以下是主人当前的状态,请据此生成提示:",
        `当前时间:${safe.nowISO}`,
        `时段:${safe.segment}`,
        `当前专注阶段:${safe.phase}`,
        `今日番茄数:${safe.todayPomodoros}`,
        `今日专注秒数:${safe.todayFocusSeconds}`,
        `已完成番茄数:${safe.completedPomodoros}`,
        `连续专注秒数:${safe.continuousFocusSeconds}`,
        "待办事项:",
        todoLines,
    ].join("\n");

    return { system, user };
}

/**
 * 从模型返回的原始文本中提取一条合规提示:
 * 取首个非空行 → 去除首尾空白与包裹引号 → 若 >30 汉字则截断至 30。
 * 返回空串表示无可用内容(由调用方记为 `bad_response`)。
 */
function extractTip(raw: string): string {
    if (typeof raw !== "string") return "";

    // 首个非空行
    const lines = raw.split(/\r?\n/);
    let line = "";
    for (const l of lines) {
        if (l.trim().length > 0) {
            line = l.trim();
            break;
        }
    }
    if (line.length === 0) return "";

    // 去除成对包裹引号(中英文)
    line = stripWrappingQuotes(line).trim();
    if (line.length === 0) return "";

    // 按「字符」截断(Array.from 正确处理代理对),上限 30
    const chars = Array.from(line);
    if (chars.length > MAX_TIP_CHARS) {
        return chars.slice(0, MAX_TIP_CHARS).join("");
    }
    return line;
}

/** 去除字符串首尾成对的引号(支持 " ' ` 「」 “” ‘’ 《》)。 */
function stripWrappingQuotes(s: string): string {
    const pairs: Record<string, string> = {
        '"': '"',
        "'": "'",
        "`": "`",
        "「": "」",
        "“": "”",
        "‘": "’",
        "《": "》",
    };
    let str = s.trim();
    // 反复剥离,处理嵌套/重复引号
    while (str.length >= 2) {
        const first = str[0];
        const last = str[str.length - 1];
        if (pairs[first] && pairs[first] === last) {
            str = str.slice(1, -1).trim();
        } else {
            break;
        }
    }
    return str;
}

/**
 * 从 OpenAI 兼容的 chat completion 响应体中提取模型文本。
 * 兼容 `choices[0].message.content` 与 `choices[0].text`。
 */
function extractContentFromResponse(data: unknown): string {
    if (!data || typeof data !== "object") return "";
    const choices = (data as { choices?: unknown }).choices;
    if (!Array.isArray(choices) || choices.length === 0) return "";
    const first = choices[0];
    if (!first || typeof first !== "object") return "";

    const message = (first as { message?: unknown }).message;
    if (message && typeof message === "object") {
        const content = (message as { content?: unknown }).content;
        if (typeof content === "string") return content;
    }
    const text = (first as { text?: unknown }).text;
    if (typeof text === "string") return text;
    return "";
}

/**
 * 主入口:异步、可中止、含超时;**不抛异常**,失败以 `TipResult.ok=false` 返回。
 *
 * 行为约束(见 design.md「Components and Interfaces · 2」与「Error Handling」):
 * - `aiEnabled === false` → 立即返回 `disabled`,不读数据、不发任何请求(Property 5)。
 * - 缺端点/key → `no_config`(需求 8.7)。
 * - 请求仅发往 `settings.endpoint`,绝不发往其他地址(Property 6)。
 * - 同时尊重外部传入的 `signal` 与内部 `timeoutMs` 定时器(Property 11/12)。
 * - 网络错误 → `network`;外部中止 → `aborted`;超时 → `timeout`。
 * - 成功:取首非空行 → 去引号 → 截断 30 汉字;空结果 → `bad_response`。
 *
 * fetch 走全局 `fetch`,便于测试 mock。
 */
export async function generateTip(
    ctx: TipContext,
    settings: GanyuSettings,
    signal: AbortSignal
): Promise<TipResult> {
    // 1) 未启用 AI:零数据读取、零网络请求(Property 5,需求 8.2)
    if (!settings || settings.aiEnabled === false) {
        return { ok: false, reason: "disabled" };
    }

    // 2) 配置缺失
    if (!settings.endpoint || !settings.apiKey) {
        return { ok: false, reason: "no_config" };
    }

    // 3) 若外部 signal 已经处于 aborted,直接返回 aborted
    if (signal && signal.aborted) {
        return { ok: false, reason: "aborted" };
    }

    // 4) 组合外部 signal 与内部超时定时器
    const controller = new AbortController();
    let timedOut = false;
    let externallyAborted = false;

    const onExternalAbort = () => {
        externallyAborted = true;
        controller.abort();
    };
    if (signal) {
        signal.addEventListener("abort", onExternalAbort);
    }

    const timeoutMs = typeof settings.timeoutMs === "number" && settings.timeoutMs > 0
        ? settings.timeoutMs
        : 8000;
    const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, timeoutMs);

    const { system, user } = buildPrompt(ctx);
    const body = {
        model: settings.model || "",
        messages: [
            { role: "system", content: system },
            { role: "user", content: user },
        ],
    };

    try {
        // 仅向 settings.endpoint 发送(Property 6)
        const response = await fetch(settings.endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${settings.apiKey}`,
            },
            body: JSON.stringify(body),
            signal: controller.signal,
        });

        if (!response || !response.ok) {
            return { ok: false, reason: "network" };
        }

        const data = await response.json();
        const content = extractContentFromResponse(data);
        const tip = extractTip(content);
        if (tip.length === 0) {
            return { ok: false, reason: "bad_response" };
        }
        return { ok: true, tip };
    } catch (err) {
        // 区分超时 / 外部中止 / 一般网络错误
        if (timedOut) {
            return { ok: false, reason: "timeout" };
        }
        if (externallyAborted || (signal && signal.aborted)) {
            return { ok: false, reason: "aborted" };
        }
        return { ok: false, reason: "network" };
    } finally {
        clearTimeout(timer);
        if (signal) {
            signal.removeEventListener("abort", onExternalAbort);
        }
    }
}
