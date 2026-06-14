import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { appWindow } from "@tauri-apps/api/window";
import { useTranslation } from "react-i18next";
import { useFocusStore } from "../../hooks/useFocusStore";
import { useTodoStore } from "../../hooks/useTodoStore";
import { useGanyuSettings } from "../../hooks/useGanyuSettings";
import { useGanyuTip } from "../../hooks/useGanyuTip";
import { useTypewriter } from "../../hooks/useTypewriter";
import { TipContext } from "../../services/tipService";
import { FocusPhase } from "../../types/IOffice";
import { emitUpdatePetsEvent } from "../../utils/event";
import { DispatchType } from "../../types/IEvents";
import { getTimeSegment, resolveCopy, CopyScene } from "./ganyuCopy";
import MiniCalendar from "./MiniCalendar";
import styles from "./OfficePopover.module.css";

const RING = 327; // 2 * pi * 52
const DEFAULT_VIEW_KEY = "office_default_view";

type View = "focus" | "todo";

function fmt(sec: number): string {
    const s = Math.max(0, Math.floor(sec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m < 10 ? "0" : ""}${m}:${r < 10 ? "0" : ""}${r}`;
}

/** 本地今天的 YYYY-MM-DD(不受时区 toISOString 偏移影响)。 */
function localToday(): string {
    const d = new Date();
    const m = `${d.getMonth() + 1}`.padStart(2, "0");
    const day = `${d.getDate()}`.padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
}

/** 计算 dueDate 距今天的天数差(正=未来,负=逾期,0=今天)。 */
function dueDiffDays(dueDate: string): number {
    const today = new Date(localToday() + "T00:00:00");
    const due = new Date(dueDate + "T00:00:00");
    return Math.round((due.getTime() - today.getTime()) / 86400000);
}

/** 截止日期的友好标签 + 紧急程度(用于配色)。 */
function dueLabel(dueDate: string): { text: string; level: "overdue" | "today" | "soon" | "later" } {
    const diff = dueDiffDays(dueDate);
    if (diff < 0) return { text: `逾期${-diff}天`, level: "overdue" };
    if (diff === 0) return { text: "今天", level: "today" };
    if (diff === 1) return { text: "明天", level: "soon" };
    if (diff <= 3) return { text: `${diff}天后`, level: "soon" };
    const d = new Date(dueDate + "T00:00:00");
    return { text: `${d.getMonth() + 1}月${d.getDate()}日`, level: "later" };
}

function phaseTotal(phase: FocusPhase, c: { workDuration: number; shortBreakDuration: number; longBreakDuration: number }): number {
    if (phase === "shortBreak") return c.shortBreakDuration;
    if (phase === "longBreak") return c.longBreakDuration;
    return c.workDuration;
}

const PlayIcon = () => (<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>);
const PauseIcon = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.2" /><rect x="14" y="5" width="4" height="14" rx="1.2" /></svg>);
const ResetIcon = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v4h4" /></svg>);
const SkipIcon = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M5 5.5v13l9-6.5z" /><rect x="15.5" y="5" width="3" height="14" rx="1" /></svg>);
const CalendarIcon = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4.5" width="18" height="17" rx="2.5" /><path d="M3 9h18M8 2.5v4M16 2.5v4" /></svg>);
const PlusIcon = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>);
const CheckIcon = () => (<svg viewBox="0 0 24 24"><path d="M4 12l5 5L20 6" /></svg>);
const TimerIcon = () => (<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="13" r="8" /><path d="M12 13V9M9 2h6M12 5V2" /></svg>);
const ListIcon = () => (<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8 6h12M8 12h12M8 18h12M3.5 6h.01M3.5 12h.01M3.5 18h.01" /></svg>);
const PinIcon = ({ on }: { on: boolean }) => (<svg width="15" height="15" viewBox="0 0 24 24" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 17v5M9 3h6l-1 6 3 3H7l3-3-1-6z" /></svg>);

// Genshin-style cryo "frostbloom" burst played when the panel opens.
function CryoBurst({ trigger }: { trigger: number }) {
    const shards = 7;
    return (
        <div className={styles.burst} key={trigger}>
            <div className={styles.burstFlash} />
            <div className={styles.burstRing} />
            <div className={styles.burstRing2} />
            {Array.from({ length: shards }).map((_, i) => (
                <span
                    key={i}
                    className={styles.shard}
                    style={{ ["--a" as any]: `${(360 / shards) * i}deg`, ["--d" as any]: `${0.02 * i}s` }}
                />
            ))}
            {Array.from({ length: 6 }).map((_, i) => (
                <span
                    key={`f${i}`}
                    className={styles.flake}
                    style={{ ["--fx" as any]: `${(i - 3) * 38}px`, ["--fd" as any]: `${0.05 * i}s` }}
                >❄</span>
            ))}
        </div>
    );
}

export default function OfficePopover() {
    const { t } = useTranslation();
    const { config, phase, remaining, isPaused, stats, completedPomodoros, start, pause, resume, reset, skip, loadConfig } = useFocusStore();
    const { todos, addTodo, toggleTodo, removeTodo, setCurrent, clearCompleted, loadTodos, reorderTodos, setDueDate } = useTodoStore();
    const aiEnabled = useGanyuSettings((s) => s.aiEnabled);
    const loadGanyuSettings = useGanyuSettings((s) => s.loadSettings);
    const [text, setText] = useState("");
    const [leaving, setLeaving] = useState(false);
    const [showKey, setShowKey] = useState(0);

    // view system: first run shows the chooser; afterwards open the saved default
    const savedDefault = (localStorage.getItem(DEFAULT_VIEW_KEY) as View | null);
    const [onboarding, setOnboarding] = useState(savedDefault == null);
    const [view, setView] = useState<View>(savedDefault ?? "todo");

    // Load fresh data on mount; hide on blur; refresh on (re)focus.
    useEffect(() => {
        const mountedAt = Date.now();
        loadConfig();
        loadTodos();
        loadGanyuSettings();
        const p = appWindow.onFocusChanged(({ payload: focused }) => {
            if (!focused) {
                if (Date.now() - mountedAt < 400) return;
                emitUpdatePetsEvent({ dispatchType: DispatchType.PetInteractionEnd });
                setLeaving(true);
                setTimeout(() => {
                    appWindow.hide();
                    setLeaving(false);
                }, 240);
                return;
            }
            // re-shown: replay open animation + refresh; jump to saved default view
            setLeaving(false);
            setShowKey((k) => k + 1);
            const dv = localStorage.getItem(DEFAULT_VIEW_KEY) as View | null;
            if (dv) { setOnboarding(false); setView(dv); }
            loadTodos();
            if (useFocusStore.getState().intervalId == null) loadConfig();
        });
        return () => { p.then((un) => un()); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const total = phaseTotal(phase, config);
    const offset = total > 0 ? RING * (1 - Math.max(0, Math.min(1, remaining / total))) : 0;
    const running = phase !== "idle" && !isPaused;

    const phaseLabel = (phase !== "idle" && isPaused)
        ? t("已暂停")
        : resolveCopy({ kind: "phaseLabel", phase }, t, showKey);

    const greet = useMemo(() => {
        const segment = getTimeSegment(new Date().getHours());
        return resolveCopy({ kind: "greet", segment }, t, showKey);
        // 以 showKey 为种子:每次打开稳定选一条变体,同一次打开内不闪烁,跨开轮换。
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [t, showKey]);

    const current = todos.find((x) => x.isCurrent && !x.completed);
    const sorted = useMemo(() => {
        const un = todos.filter((x) => !x.completed);
        const done = todos.filter((x) => x.completed);
        return [...un, ...done];
    }, [todos]);
    const completedCount = todos.filter((x) => x.completed).length;
    const pendingCount = todos.length - completedCount;

    // ---- AI 贴心提示(可选增强,覆盖问候/副标题位)----
    // 每次打开稳定的时段与时间戳:以 showKey 为种子,使同一次打开内指纹不变(去重),
    // 重新打开 / 阶段切换时变化(重新请求,需求 9.1/9.2/10.4)。
    const greetSegment = useMemo(
        () => getTimeSegment(new Date().getHours()),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [showKey],
    );
    const tipNowISO = useMemo(
        () => new Date().toISOString(),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [showKey],
    );
    const greetScene: CopyScene = { kind: "greet", segment: greetSegment };

    // 由 focus / todo store 构造 TipContext(隐私边界由 tipService.serializeContext 守住)。
    // continuousFocusSeconds:focus store 未单独保存连续专注时长,这里在 working 阶段
    // 用 config.workDuration - remaining 估算本段已专注秒数,其余阶段记 0(保持简单)。
    const buildContext = useCallback((): TipContext => {
        const continuousFocusSeconds = phase === "working"
            ? Math.max(0, config.workDuration - remaining)
            : 0;
        return {
            segment: greetSegment,
            nowISO: tipNowISO,
            todos: todos.map((x) => ({ text: x.text, completed: x.completed })),
            todayPomodoros: stats.todayPomodoros,
            todayFocusSeconds: stats.todayFocusSeconds,
            phase,
            completedPomodoros,
            continuousFocusSeconds,
        };
    }, [phase, config.workDuration, remaining, greetSegment, tipNowISO, todos, stats.todayPomodoros, stats.todayFocusSeconds, completedPomodoros]);

    // 触发请求于:打开面板(showKey 变化 → tipNowISO 变化 → 指纹变化)与阶段切换
    // (phase 参与指纹)。失败 / 未启用 → 保持静态 greet 兜底(需求 9.3/9.4)。
    const { text: greetTip } = useGanyuTip({
        enabled: aiEnabled,
        scene: greetScene,
        buildContext,
        fallback: greet,
    });

    // 副标题:有当前任务时优先展示任务文本;否则 idle 且有未完成待办给出引导,其余用默认副标题。
    const subtitle = current
        ? current.text
        : (phase === "idle" && pendingCount > 0)
            ? resolveCopy({ kind: "subtitleIdlePending" }, t, showKey)
            : resolveCopy({ kind: "subtitleDefault" }, t, showKey);

    // 完成任务赞美文案(todoCelebrate):当本次打开内有已完成项时,于底部统计区轻量展示。
    const celebrate = resolveCopy({ kind: "todoCelebrate" }, t, showKey);

    // 完成任务时的冰晶绽放特效:记录刚被完成的项 id,动画结束后清除。
    const [burstId, setBurstId] = useState<string | null>(null);
    // 当前打开日历浮层的待办项 id
    const [calOpenId, setCalOpenId] = useState<string | null>(null);
    const onToggle = useCallback((id: string) => {
        const todo = todos.find((x) => x.id === id);
        const willComplete = todo ? !todo.completed : false;
        toggleTodo(id);
        if (willComplete) {
            setBurstId(id);
            setTimeout(() => setBurstId((cur) => (cur === id ? null : cur)), 700);
        }
    }, [todos, toggleTodo]);

    // 打字机效果:问候语先逐字敲出,敲完后副标题再接着写,像甘雨在写便签。
    const { display: greetTyped, done: greetDone } = useTypewriter(greetTip, 60, 140);
    const { display: subtitleTyped } = useTypewriter(
        greetDone ? subtitle : "",
        45,
        80,
    );

    // ---- 待办列表滚动指示(让用户知道下方还有更多事项)----
    const listRef = useRef<HTMLUListElement>(null);
    const [atTop, setAtTop] = useState(true);
    const [atBottom, setAtBottom] = useState(true);
    const [hiddenBelow, setHiddenBelow] = useState(0);

    const recomputeScroll = useCallback(() => {
        const el = listRef.current;
        if (!el) return;
        const { scrollTop, scrollHeight, clientHeight } = el;
        const top = scrollTop <= 1;
        const bottom = scrollTop + clientHeight >= scrollHeight - 1;
        setAtTop(top);
        setAtBottom(bottom);

        // 估算下方还有几项未露出(用平均项高换算,够直观)
        if (bottom) {
            setHiddenBelow(0);
        } else {
            const itemCount = el.children.length;
            const avg = itemCount > 0 ? scrollHeight / itemCount : 1;
            const remainingPx = scrollHeight - (scrollTop + clientHeight);
            setHiddenBelow(Math.max(1, Math.round(remainingPx / avg)));
        }
    }, []);

    const onListScroll = useCallback(() => recomputeScroll(), [recomputeScroll]);

    const scrollListDown = useCallback(() => {
        const el = listRef.current;
        if (!el) return;
        el.scrollBy({ top: el.clientHeight * 0.8, behavior: "smooth" });
    }, []);

    // ---- 待办拖拽排序(整行可拖,用 pointer 事件,兼容 macOS WKWebView)----
    const [dragId, setDragId] = useState<string | null>(null);
    const [overId, setOverId] = useState<string | null>(null);
    const dragIdRef = useRef<string | null>(null);

    // 根据指针 Y 坐标,找出当前悬停在哪一个待办项上方
    const findTodoIdAtY = useCallback((clientY: number): string | null => {
        const listEl = listRef.current;
        if (!listEl) return null;
        const items = listEl.querySelectorAll<HTMLElement>("[data-todo-id]");
        for (const el of Array.from(items)) {
            const r = el.getBoundingClientRect();
            if (clientY >= r.top && clientY <= r.bottom) {
                return el.getAttribute("data-todo-id");
            }
        }
        return null;
    }, []);

    // 整行按下:先记录起点,移动超过阈值(6px)才真正进入拖拽,
    // 这样在行内点击勾选/星标/删除按钮不会被误判为拖拽。
    const onRowPointerDown = useCallback((id: string) => (e: React.PointerEvent) => {
        // 忽略来自按钮的按下(让它们正常响应点击)
        const target = e.target as HTMLElement;
        if (target.closest("button")) return;

        const startY = e.clientY;
        let dragging = false;

        const onMove = (ev: PointerEvent) => {
            if (!dragging) {
                if (Math.abs(ev.clientY - startY) < 6) return;
                // 越过阈值 → 进入拖拽模式
                dragging = true;
                dragIdRef.current = id;
                setDragId(id);
                setOverId(id);
            }
            const targetId = findTodoIdAtY(ev.clientY);
            if (targetId) setOverId(targetId);

            // 拖到列表边缘时自动滚动
            const listEl = listRef.current;
            if (listEl) {
                const r = listEl.getBoundingClientRect();
                if (ev.clientY < r.top + 24) listEl.scrollBy({ top: -8 });
                else if (ev.clientY > r.bottom - 24) listEl.scrollBy({ top: 8 });
            }
        };

        const onUp = (ev: PointerEvent) => {
            if (dragging) {
                const from = dragIdRef.current;
                const to = findTodoIdAtY(ev.clientY);
                if (from && to && from !== to) reorderTodos(from, to);
            }
            dragIdRef.current = null;
            setDragId(null);
            setOverId(null);
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
        };

        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
    }, [findTodoIdAtY, reorderTodos]);

    // 列表内容 / 视图 / 重新打开变化后,重算滚动指示
    useEffect(() => {
        const id = requestAnimationFrame(recomputeScroll);
        return () => cancelAnimationFrame(id);
    }, [recomputeScroll, sorted.length, view, showKey]);

    const onPlay = () => { if (phase === "idle") start(); else if (isPaused) resume(); else pause(); };
    const onAdd = () => { const v = text.trim(); if (!v) return; addTodo(v); setText(""); };
    const focusedMin = Math.round(stats.todayFocusSeconds / 60);

    const chooseView = (v: View) => { localStorage.setItem(DEFAULT_VIEW_KEY, v); setView(v); setOnboarding(false); };
    const setAsDefault = () => { localStorage.setItem(DEFAULT_VIEW_KEY, view); setShowKey((k) => k + 1); };
    const isDefault = savedDefault === view;

    // ---- onboarding (first run) ----
    if (onboarding) {
        return (
            <div key={showKey} className={`${styles.root} ${leaving ? styles.leaving : ""}`}>
                <CryoBurst trigger={showKey} />
                <div className={styles.onboard}>
                    <div className={styles.onboardHead}>
                        <span className={styles.greetK}>{resolveCopy({ kind: "onboardGreet" }, t, showKey)}</span>
                        <span className={styles.greetS}>{t("选择常用的工作台，我会记住你的偏好")}</span>
                    </div>
                    <div className={styles.cards}>
                        <button className={styles.card} onClick={() => chooseView("todo")}>
                            <span className={styles.cardIcon}><ListIcon /></span>
                            <span className={styles.cardTitle}>{t("待办清单")}</span>
                            <span className={styles.cardDesc}>{t("记录任务，逐项完成")}</span>
                        </button>
                        <button className={styles.card} onClick={() => chooseView("focus")}>
                            <span className={styles.cardIcon}><TimerIcon /></span>
                            <span className={styles.cardTitle}>{t("专注计时")}</span>
                            <span className={styles.cardDesc}>{t("番茄钟，沉浸投入")}</span>
                        </button>
                    </div>
                    <div className={styles.onboardHint}>{resolveCopy({ kind: "onboardHint" }, t, showKey)}</div>
                </div>
            </div>
        );
    }

    return (
        <div key={showKey} className={`${styles.root} ${leaving ? styles.leaving : ""}`}>
            <CryoBurst trigger={showKey} />

            {/* header: greeting + segmented tabs */}
            <div className={styles.head}>
                <div className={styles.headText}>
                    <span className={styles.greetK}>
                        {greetTyped}
                        {!greetDone && <span className={styles.caret} />}
                    </span>
                    <span className={styles.greetS}>
                        {subtitleTyped}
                        {greetDone && Array.from(subtitleTyped).length < Array.from(subtitle).length && <span className={styles.caret} />}
                    </span>
                </div>
            </div>

            <div className={styles.tabs}>
                <div className={styles.tabTrack}>
                    <span className={`${styles.tabGlider} ${view === "focus" ? styles.gliderRight : ""}`} />
                    <button className={`${styles.tab} ${view === "todo" ? styles.tabOn : ""}`} onClick={() => setView("todo")}>
                        {t("待办")}{pendingCount > 0 && <span className={styles.tabBadge}>{pendingCount}</span>}
                    </button>
                    <button className={`${styles.tab} ${view === "focus" ? styles.tabOn : ""}`} onClick={() => setView("focus")}>
                        {t("专注")}
                    </button>
                </div>
                <button
                    className={`${styles.pin} ${isDefault ? styles.pinOn : ""}`}
                    onClick={setAsDefault}
                    title={isDefault ? t("已是默认视图") : resolveCopy({ kind: "btn", action: "setDefault" }, t, showKey)}
                >
                    <PinIcon on={isDefault} />
                </button>
            </div>

            {view === "focus" ? (
                <div className={styles.body} key="focus">
                    <section className={`${styles.focus} ${styles[`phase_${phase}`] ?? ""} ${isPaused ? styles.paused : ""}`}>
                        {/* session progress dots — pomodoros toward the long break */}
                        <div className={styles.sessionDots}>
                            {Array.from({ length: Math.max(1, config.longBreakInterval) }).map((_, i) => {
                                const doneInCycle = completedPomodoros % Math.max(1, config.longBreakInterval);
                                const filled = i < (doneInCycle === 0 && completedPomodoros > 0 ? config.longBreakInterval : doneInCycle);
                                const active = i === doneInCycle && phase === "working";
                                return (
                                    <span
                                        key={i}
                                        className={`${styles.sessionDot} ${filled ? styles.sessionDotOn : ""} ${active ? styles.sessionDotActive : ""}`}
                                    />
                                );
                            })}
                        </div>

                        <div className={`${styles.ringWrap} ${running ? styles.ringBreathing : ""}`}>
                            <svg viewBox="0 0 158 158">
                                <defs>
                                    <linearGradient id="popGrad" x1="0" y1="0" x2="1" y2="1">
                                        <stop offset="0" stopColor="#8ec5ff" />
                                        <stop offset="0.55" stopColor="#7eb6f0" />
                                        <stop offset="1" stopColor="#b3a7e8" />
                                    </linearGradient>
                                    <linearGradient id="popGradBreak" x1="0" y1="0" x2="1" y2="1">
                                        <stop offset="0" stopColor="#a9e7d6" />
                                        <stop offset="1" stopColor="#8ec5ff" />
                                    </linearGradient>
                                </defs>
                                <circle className={styles.ringTrack} cx="79" cy="79" r="52" />
                                <circle
                                    className={styles.ringProg}
                                    cx="79" cy="79" r="52"
                                    stroke={phase === "working" || phase === "idle" ? "url(#popGrad)" : "url(#popGradBreak)"}
                                    style={{ strokeDashoffset: offset }}
                                />
                            </svg>
                            <div className={styles.timer}>
                                <div className={styles.time}>{fmt(remaining)}</div>
                                <div className={styles.phase}>
                                    <span className={`${styles.phaseDot} ${running ? styles.run : ""}`} />
                                    {phaseLabel}
                                </div>
                            </div>
                        </div>

                        <div className={styles.controls}>
                            {phase !== "idle" && (
                                <button className={`${styles.ctrl} ${styles.ghost}`} onClick={reset} title={resolveCopy({ kind: "btn", action: "reset" }, t, showKey)}>
                                    <ResetIcon />
                                </button>
                            )}
                            <button className={`${styles.ctrl} ${styles.play}`} onClick={onPlay} title={running ? resolveCopy({ kind: "btn", action: "pause" }, t, showKey) : resolveCopy({ kind: "btn", action: "start" }, t, showKey)}>
                                {running ? <PauseIcon /> : <PlayIcon />}
                            </button>
                            {phase !== "idle" && (
                                <button className={`${styles.ctrl} ${styles.ghost}`} onClick={skip} title={t("跳到下一段")}>
                                    <SkipIcon />
                                </button>
                            )}
                        </div>
                        {current && (
                            <div className={styles.focusTask}>{t("正在进行")} · {current.text}</div>
                        )}
                    </section>
                </div>
            ) : (
                <div className={styles.body} key="todo">
                    <div className={styles.add}>
                        <input
                            className={styles.addInput}
                            placeholder={resolveCopy({ kind: "placeholder", field: "addTodo" }, t, showKey)}
                            value={text}
                            onChange={(e) => setText(e.currentTarget.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") onAdd(); }}
                        />
                        <button className={styles.addBtn} onClick={onAdd} disabled={!text.trim()}><PlusIcon /></button>
                    </div>

                    {todos.length === 0 ? (
                        <div className={styles.empty}>
                            <div className={styles.emptyIcon}>❄️</div>
                            <div className={styles.emptyText}>{resolveCopy({ kind: "todoEmpty" }, t, showKey)}</div>
                        </div>
                    ) : (
                        <div
                            className={`${styles.listWrap} ${atTop ? "" : styles.fadeTop} ${atBottom ? "" : styles.fadeBottom}`}
                        >
                            <ul className={`${styles.list} ${calOpenId ? styles.listOverflowVisible : ""}`} ref={listRef} onScroll={onListScroll}>
                                {sorted.map((todo) => (
                                    <li
                                        key={todo.id}
                                        data-todo-id={todo.id}
                                        className={`${styles.item} ${styles.draggableRow} ${todo.isCurrent && !todo.completed ? styles.itemCurrent : ""} ${dragId === todo.id ? styles.dragging : ""} ${overId === todo.id && dragId !== todo.id ? styles.dragOver : ""}`}
                                        onPointerDown={onRowPointerDown(todo.id)}
                                    >
                                        <span className={styles.dragHandle} title={t("拖动可调整顺序")}>⠿</span>
                                        <span
                                            className={`${styles.check} ${todo.completed ? styles.checkDone : ""}`}
                                            onClick={() => onToggle(todo.id)}
                                        >
                                            <CheckIcon />
                                            {burstId === todo.id && (
                                                <span className={styles.frostBurst}>
                                                    {Array.from({ length: 8 }).map((_, i) => (
                                                        <span
                                                            key={i}
                                                            className={styles.frostShard}
                                                            style={{ ["--fa" as any]: `${45 * i}deg` }}
                                                        />
                                                    ))}
                                                    <span className={styles.frostRing} />
                                                </span>
                                            )}
                                        </span>
                                        <span className={`${styles.txt} ${todo.completed ? styles.txtDone : ""}`}>{todo.text}</span>
                                        {todo.dueDate && !todo.completed && (() => {
                                            const dl = dueLabel(todo.dueDate);
                                            return (
                                                <span className={`${styles.dueBadge} ${styles[`due_${dl.level}`] ?? ""}`}>
                                                    {dl.text}
                                                </span>
                                            );
                                        })()}
                                        {!todo.completed && (
                                            <div className={styles.dueWrap} onPointerDown={(e) => e.stopPropagation()}>
                                                <button
                                                    className={`${styles.dueBtn} ${todo.dueDate ? styles.dueBtnSet : ""}`}
                                                    title={t("设置截止日期")}
                                                    data-cal-trigger
                                                    onClick={() => setCalOpenId((cur) => (cur === todo.id ? null : todo.id))}
                                                >
                                                    <CalendarIcon />
                                                </button>
                                                {calOpenId === todo.id && (
                                                    <MiniCalendar
                                                        value={todo.dueDate}
                                                        onSelect={(date) => setDueDate(todo.id, date)}
                                                        onClose={() => setCalOpenId(null)}
                                                    />
                                                )}
                                            </div>
                                        )}
                                        {!todo.completed && (
                                            <button
                                                className={`${styles.star} ${todo.isCurrent ? styles.starOn : ""}`}
                                                onClick={() => setCurrent(todo.id)}
                                                title={todo.isCurrent ? t("当前任务") : resolveCopy({ kind: "btn", action: "setCurrent" }, t, showKey)}
                                            >{todo.isCurrent ? "★" : "☆"}</button>
                                        )}
                                        <button className={styles.star} onClick={() => removeTodo(todo.id)} title={resolveCopy({ kind: "btn", action: "delete" }, t, showKey)}>✕</button>
                                    </li>
                                ))}
                            </ul>
                            {!atBottom && hiddenBelow > 0 && (
                                <div className={styles.moreHint} onClick={scrollListDown}>
                                    {t("还有")} {hiddenBelow} {t("项")} ↓
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            <div className={styles.foot}>
                <span>🔔 {resolveCopy({ kind: "footer", label: "pomodoros" }, t, showKey)} {stats.todayPomodoros}</span>
                <span className={styles.sep}>·</span>
                <span>⏱ {focusedMin} {resolveCopy({ kind: "footer", label: "minutes" }, t, showKey)}</span>
                {completedCount > 0 && (
                    <span className={styles.count} onClick={clearCompleted} style={{ cursor: "pointer" }} title={celebrate}>
                        {completedCount}/{todos.length}
                    </span>
                )}
            </div>
        </div>
    );
}
