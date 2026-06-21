import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { dueLabelInfo, dueDiffDays } from "../../ui/office_popover/OfficePopover";

/**
 * dueLabelInfo 单元测试:验证截止日期标签返回正确的 i18n key + 插值参数 + 紧急等级。
 */

// Mock localDateStr to control "today"
vi.mock("../../utils/date", () => ({
    localDateStr: () => "2026-06-21",
}));

describe("dueDiffDays", () => {
    it("returns 0 for today", () => {
        expect(dueDiffDays("2026-06-21")).toBe(0);
    });
    it("returns -1 for yesterday", () => {
        expect(dueDiffDays("2026-06-20")).toBe(-1);
    });
    it("returns 1 for tomorrow", () => {
        expect(dueDiffDays("2026-06-22")).toBe(1);
    });
    it("returns positive for future dates", () => {
        expect(dueDiffDays("2026-06-28")).toBe(7);
    });
});

describe("dueLabelInfo", () => {
    it("returns overdue key with days count for past dates", () => {
        const result = dueLabelInfo("2026-06-18");
        expect(result).toEqual({
            key: "office.due.overdue",
            params: { days: 3 },
            level: "overdue",
        });
    });

    it("returns today key for today", () => {
        const result = dueLabelInfo("2026-06-21");
        expect(result).toEqual({
            key: "office.due.today",
            params: {},
            level: "today",
        });
    });

    it("returns tomorrow key for +1 day", () => {
        const result = dueLabelInfo("2026-06-22");
        expect(result).toEqual({
            key: "office.due.tomorrow",
            params: {},
            level: "soon",
        });
    });

    it("returns daysLater key for 2-3 days ahead", () => {
        const result = dueLabelInfo("2026-06-23");
        expect(result).toEqual({
            key: "office.due.daysLater",
            params: { days: 2 },
            level: "soon",
        });
    });

    it("returns date key with month/day for 4+ days ahead", () => {
        const result = dueLabelInfo("2026-07-05");
        expect(result).toEqual({
            key: "office.due.date",
            params: { month: 7, day: 5 },
            level: "later",
        });
    });
});
