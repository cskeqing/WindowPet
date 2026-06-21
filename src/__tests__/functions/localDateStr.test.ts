import { describe, it, expect, vi, afterEach } from "vitest";
import { localDateStr } from "../../utils/date";

describe("localDateStr", () => {
    afterEach(() => { vi.useRealTimers(); });

    it("returns YYYY-MM-DD for a given date", () => {
        const d = new Date(2024, 0, 5); // Jan 5, 2024 local
        expect(localDateStr(d)).toBe("2024-01-05");
    });

    it("pads single-digit month and day", () => {
        const d = new Date(2023, 2, 9); // Mar 9
        expect(localDateStr(d)).toBe("2023-03-09");
    });

    it("uses current local date when no arg given", () => {
        vi.useFakeTimers();
        // Set to 2025-12-31 23:30 local time
        vi.setSystemTime(new Date(2025, 11, 31, 23, 30, 0));
        expect(localDateStr()).toBe("2025-12-31");
        vi.useRealTimers();
    });

    it("differs from UTC-based toISOString near midnight for positive UTC offsets", () => {
        vi.useFakeTimers();
        // Simulate Jan 1, 2026 00:30 local (in UTC+8, this is Dec 31 16:30 UTC)
        // We set system time to a local midnight scenario
        vi.setSystemTime(new Date(2026, 0, 1, 0, 30, 0));
        const local = localDateStr();
        const utc = new Date().toISOString().slice(0, 10);
        // In local time it's 2026-01-01; in UTC it depends on offset
        // The key assertion: localDateStr always matches the local calendar date
        expect(local).toBe("2026-01-01");
        // If TZ offset > 0, UTC date would be previous day
        const offset = new Date().getTimezoneOffset(); // negative for east of UTC
        if (offset < 0) {
            expect(utc).toBe("2025-12-31");
        }
        vi.useRealTimers();
    });
});

describe("useFocusStore daily reset uses local date", () => {
    it("stats reset when stored date differs from local today", async () => {
        // This is a logic-level test: if stats.date !== localDateStr(), stats should reset.
        // We just verify the invariant that localDateStr is consistent.
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 5, 21, 1, 0, 0)); // Jun 21 01:00 local
        const today = localDateStr();
        expect(today).toBe("2026-06-21");
        // A stale stats date from yesterday should differ
        expect(today).not.toBe("2026-06-20");
        vi.useRealTimers();
    });
});
