import { useEffect, useRef, useState } from "react";
import { CopyScene } from "../ui/office_popover/ganyuCopy";
import { GanyuSettings } from "./useGanyuSettings";
import { useGanyuSettings } from "./useGanyuSettings";
import { generateTip, TipContext } from "../services/tipService";

/**
 * `useGanyuTip` —— AI 个性化话术钩子(可选增强层)。
 *
 * 封装「调用 + 去重 + 中止 + 回落」的 React 逻辑,供 `OfficePopover` 使用。
 *
 * 双路文案中的「增强层」:静态甘雨话术(`fallback`)始终是地基与兜底,
 * 本钩子在其之上叠加可选的 AI 提示。任何时刻——AI 未启用、加载中、超时、
 * 报错、端点不可用、面板已关闭——展示文本都回落到非空的 `fallback`,
 * 因此用户永远能看到一条符合人设的文案(见 design.md「3. AI 提示钩子」)。
 *
 * 行为约束:
 * - 初始 `text === fallback`(先静态;需求 9.5)。成功后才覆盖为裁剪后的 AI_Tip。
 * - 打开面板与阶段切换时触发请求(需求 9.1/9.2);以「场景 + 关键上下文」指纹去重,
 *   相同指纹不重复请求(需求 10.4)。
 * - 组件卸载 / 面板关闭(指纹变化触发清理)时 `AbortController.abort()`,
 *   忽略迟到结果(需求 10.3)。
 * - 任意失败 / 未启用 → 保持 `fallback`(需求 9.3/9.4)。
 *
 * @param args.enabled      是否启用 AI 路径(由调用方传入,通常为 `aiEnabled`)。
 * @param args.scene        当前文案场景,参与回落与去重指纹。
 * @param args.buildContext 构造 `TipContext` 的工厂;在请求时调用以取最新上下文。
 * @param args.fallback     来自静态文案池的兜底话术(永远非空)。
 * @returns `{ text, loading }` —— 当前应展示的文本与加载态。
 */
export function useGanyuTip(args: {
    enabled: boolean;
    scene: CopyScene;
    buildContext: () => TipContext;
    fallback: string;
}): { text: string; loading: boolean } {
    const { enabled, scene, buildContext, fallback } = args;

    // 从 Ganyu_Settings store 读取配置,组装为传给 tipService 的 GanyuSettings。
    const aiEnabled = useGanyuSettings((s) => s.aiEnabled);
    const endpoint = useGanyuSettings((s) => s.endpoint);
    const apiKey = useGanyuSettings((s) => s.apiKey);
    const model = useGanyuSettings((s) => s.model);
    const timeoutMs = useGanyuSettings((s) => s.timeoutMs);
    const longWorkThresholdSeconds = useGanyuSettings((s) => s.longWorkThresholdSeconds);
    const disclosureShown = useGanyuSettings((s) => s.disclosureShown);

    // 初始展示静态兜底文案(需求 9.5)。
    const [text, setText] = useState<string>(fallback);
    const [loading, setLoading] = useState<boolean>(false);

    // 始终以最新的 buildContext / settings 发起请求,避免 effect 闭包过期。
    const buildContextRef = useRef(buildContext);
    buildContextRef.current = buildContext;

    const settingsRef = useRef<GanyuSettings>({
        aiEnabled,
        endpoint,
        apiKey,
        model,
        timeoutMs,
        longWorkThresholdSeconds,
        disclosureShown,
    });
    settingsRef.current = {
        aiEnabled,
        endpoint,
        apiKey,
        model,
        timeoutMs,
        longWorkThresholdSeconds,
        disclosureShown,
    };

    // AI 路径的「有效启用」需同时满足:调用方启用 + 设置中已开启。
    const effectiveEnabled = enabled && aiEnabled;

    // 去重指纹:场景 + 关键上下文字段。`nowISO` 由调用方按「每次打开稳定」提供,
    // 因此同一次打开内重复渲染指纹不变(去重,需求 10.4),阶段切换 / 重新打开则变化
    // (重新请求,需求 9.1/9.2)。`enabled` 变化也会改变指纹。
    let fingerprint = "disabled";
    if (effectiveEnabled) {
        const ctx = buildContext();
        fingerprint = JSON.stringify({
            scene,
            segment: ctx.segment,
            nowISO: ctx.nowISO,
            phase: ctx.phase,
            todayPomodoros: ctx.todayPomodoros,
            todayFocusSeconds: ctx.todayFocusSeconds,
            completedPomodoros: ctx.completedPomodoros,
            continuousFocusSeconds: ctx.continuousFocusSeconds,
            todos: ctx.todos.map((tt) => ({ text: tt.text, completed: tt.completed })),
        });
    }

    useEffect(() => {
        // 未启用:始终保持静态兜底,不发请求(需求 9.4/8.2)。
        if (!effectiveEnabled) {
            setLoading(false);
            setText(fallback);
            return;
        }

        // 新一轮请求:先展示静态文案(需求 9.5),再异步覆盖。
        setText(fallback);
        setLoading(true);

        const controller = new AbortController();
        let settled = false;

        generateTip(buildContextRef.current(), settingsRef.current, controller.signal)
            .then((result) => {
                // 迟到结果:若已中止(面板关闭 / 指纹变化),忽略(需求 10.3)。
                if (controller.signal.aborted) return;
                settled = true;
                if (result.ok && result.tip && result.tip.trim().length > 0) {
                    setText(result.tip);
                } else {
                    // 任意失败 → 保持静态兜底(需求 9.3/9.4)。
                    setText(fallback);
                }
                setLoading(false);
            })
            .catch(() => {
                if (controller.signal.aborted) return;
                settled = true;
                setText(fallback);
                setLoading(false);
            });

        return () => {
            // 卸载 / 指纹变化:中止未完成请求,忽略迟到结果(需求 10.3)。
            if (!settled) {
                controller.abort();
            }
        };
        // 指纹去重:仅当指纹或兜底文案变化时才重新请求(需求 10.4)。
        // buildContext / settings 通过 ref 取最新值,无需列入依赖。
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fingerprint, fallback, effectiveEnabled]);

    return { text, loading };
}
