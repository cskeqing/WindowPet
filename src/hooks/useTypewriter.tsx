import { useEffect, useRef, useState } from "react";

/**
 * 打字机效果钩子。
 *
 * 把传入的目标文本逐字"敲"出来,营造甘雨像在写便签的陪伴感。
 * 当 `text` 变化时(例如重新打开面板、AI 提示覆盖静态文案),
 * 会从头重新播放打字动画。
 *
 * 设计:
 * - 逐字符推进(用 Array.from 正确处理 emoji / 代理对)。
 * - 尊重系统"减少动态效果":prefers-reduced-motion 时直接显示完整文本。
 * - 卸载或文本变化时清理定时器,避免泄漏与串字。
 *
 * @param text     目标文本
 * @param speedMs  每个字符的间隔毫秒数(默认 55ms,温柔不拖沓)
 * @param startDelayMs 开始前的停顿(默认 120ms,等入场动画稳定)
 * @returns { display, done } —— 当前已敲出的文本,以及是否敲完
 */
export function useTypewriter(
    text: string,
    speedMs: number = 55,
    startDelayMs: number = 120
): { display: string; done: boolean } {
    const [display, setDisplay] = useState("");
    const [done, setDone] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const full = text ?? "";

        // 尊重"减少动态效果":直接整段显示
        const prefersReduced =
            typeof window !== "undefined" &&
            window.matchMedia &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        if (prefersReduced || full.length === 0) {
            setDisplay(full);
            setDone(true);
            return;
        }

        const chars = Array.from(full);
        let i = 0;
        setDisplay("");
        setDone(false);

        const tick = () => {
            i += 1;
            setDisplay(chars.slice(0, i).join(""));
            if (i >= chars.length) {
                setDone(true);
                return;
            }
            timerRef.current = setTimeout(tick, speedMs);
        };

        timerRef.current = setTimeout(tick, startDelayMs);

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [text, speedMs, startDelayMs]);

    return { display, done };
}
