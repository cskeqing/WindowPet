/** 返回本地时区的 YYYY-MM-DD 字符串(避免 toISOString 的 UTC 偏移)。 */
export function localDateStr(d?: Date): string {
    const date = d ?? new Date();
    const m = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    return `${date.getFullYear()}-${m}-${day}`;
}
