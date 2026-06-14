import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import styles from "./MiniCalendar.module.css";

/** 本地 YYYY-MM-DD,避免时区偏移。 */
function ymd(d: Date): string {
    const m = `${d.getMonth() + 1}`.padStart(2, "0");
    const day = `${d.getDate()}`.padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
}

const ChevronLeft = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>);
const ChevronRight = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>);

/**
 * 甘雨风格的迷你日历。冰雪冷色调,圆角玻璃卡片,带快捷选项(今天/明天/本周末/清除)。
 *
 * @param value     当前选中的日期(YYYY-MM-DD)或 undefined
 * @param onSelect  选中某日期或清除(undefined)时回调
 * @param onClose   关闭浮层
 */
export default function MiniCalendar({
    value,
    onSelect,
    onClose,
}: {
    value?: string;
    onSelect: (date: string | undefined) => void;
    onClose: () => void;
}) {
    const { t } = useTranslation();
    const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
    const selected = value ? new Date(value + "T00:00:00") : null;

    // 当前展示的月份(以选中日期或今天为准)
    const [viewDate, setViewDate] = useState(() => {
        const base = selected ?? today;
        return new Date(base.getFullYear(), base.getMonth(), 1);
    });

    const rootRef = useRef<HTMLDivElement>(null);
    // 根据可用空间决定向下还是向上展开,避免溢出面板底部
    const [openUp, setOpenUp] = useState(false);

    useEffect(() => {
        const el = rootRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        // 若卡片底部超出视口(留 8px 余量),则改为向上展开
        if (r.bottom > window.innerHeight - 8) setOpenUp(true);
    }, []);

    // 点击浮层外部关闭(忽略触发按钮本身,避免「关闭→又被 onClick 重新打开」的竞态)
    useEffect(() => {
        const onDown = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (rootRef.current && rootRef.current.contains(target)) return;
            if (target.closest("[data-cal-trigger]")) return;
            onClose();
        };
        // 延迟挂载,避免触发打开的那次点击立即关闭
        const id = setTimeout(() => document.addEventListener("mousedown", onDown), 0);
        return () => { clearTimeout(id); document.removeEventListener("mousedown", onDown); };
    }, [onClose]);

    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const monthLabel = `${year}年${month + 1}月`;

    // 构造 6 行 × 7 列的日期网格(周一为首列)
    const cells = useMemo(() => {
        const first = new Date(year, month, 1);
        // getDay: 0=周日;转成周一为 0
        const leading = (first.getDay() + 6) % 7;
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const arr: (Date | null)[] = [];
        for (let i = 0; i < leading; i++) arr.push(null);
        for (let d = 1; d <= daysInMonth; d++) arr.push(new Date(year, month, d));
        while (arr.length % 7 !== 0) arr.push(null);
        return arr;
    }, [year, month]);

    const weekdays = [t("一"), t("二"), t("三"), t("四"), t("五"), t("六"), t("日")];

    const pick = (d: Date) => { onSelect(ymd(d)); onClose(); };

    const quickPick = (offsetDays: number) => {
        const d = new Date(today);
        d.setDate(d.getDate() + offsetDays);
        onSelect(ymd(d));
        onClose();
    };

    const pickWeekend = () => {
        const d = new Date(today);
        // 本周六:周一为 0 的体系下,周六 index=5
        const idx = (d.getDay() + 6) % 7;
        const add = (5 - idx + 7) % 7;
        d.setDate(d.getDate() + (add === 0 && idx !== 5 ? 7 : add));
        onSelect(ymd(d));
        onClose();
    };

    return (
        <div className={`${styles.cal} ${openUp ? styles.openUp : ""}`} ref={rootRef}>
            <div className={styles.header}>
                <button className={styles.nav} onClick={() => setViewDate(new Date(year, month - 1, 1))}><ChevronLeft /></button>
                <span className={styles.monthLabel}>{monthLabel}</span>
                <button className={styles.nav} onClick={() => setViewDate(new Date(year, month + 1, 1))}><ChevronRight /></button>
            </div>

            <div className={styles.weekRow}>
                {weekdays.map((w, i) => (
                    <span key={i} className={`${styles.weekday} ${i >= 5 ? styles.weekend : ""}`}>{w}</span>
                ))}
            </div>

            <div className={styles.grid}>
                {cells.map((d, i) => {
                    if (!d) return <span key={i} className={styles.empty} />;
                    const isToday = d.getTime() === today.getTime();
                    const isSelected = !!selected && d.getTime() === selected.getTime();
                    const isPast = d.getTime() < today.getTime();
                    return (
                        <button
                            key={i}
                            className={`${styles.day} ${isToday ? styles.today : ""} ${isSelected ? styles.selected : ""} ${isPast ? styles.past : ""}`}
                            disabled={isPast}
                            onClick={() => pick(d)}
                        >
                            {d.getDate()}
                        </button>
                    );
                })}
            </div>

            <div className={styles.quick}>
                <button className={styles.quickBtn} onClick={() => quickPick(0)}>{t("今天")}</button>
                <button className={styles.quickBtn} onClick={() => quickPick(1)}>{t("明天")}</button>
                <button className={styles.quickBtn} onClick={pickWeekend}>{t("周末")}</button>
                {value && (
                    <button className={`${styles.quickBtn} ${styles.clearBtn}`} onClick={() => { onSelect(undefined); onClose(); }}>
                        {t("清除")}
                    </button>
                )}
            </div>
        </div>
    );
}
