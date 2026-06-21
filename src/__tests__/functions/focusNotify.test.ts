import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @tauri-apps/api/notification
const mockIsPermissionGranted = vi.fn();
const mockRequestPermission = vi.fn();
const mockSendNotification = vi.fn();

vi.mock("@tauri-apps/api/notification", () => ({
    isPermissionGranted: (...args: unknown[]) => mockIsPermissionGranted(...args),
    requestPermission: (...args: unknown[]) => mockRequestPermission(...args),
    sendNotification: (...args: unknown[]) => mockSendNotification(...args),
}));

import { focusNotify } from "../../utils/focusNotify";

describe("focusNotify", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("sends notification when permission already granted", async () => {
        mockIsPermissionGranted.mockResolvedValue(true);

        await focusNotify("Title", "Body");

        expect(mockIsPermissionGranted).toHaveBeenCalled();
        expect(mockRequestPermission).not.toHaveBeenCalled();
        expect(mockSendNotification).toHaveBeenCalledWith({ title: "Title", body: "Body" });
    });

    it("requests permission and sends if granted", async () => {
        mockIsPermissionGranted.mockResolvedValue(false);
        mockRequestPermission.mockResolvedValue("granted");

        await focusNotify("T", "B");

        expect(mockRequestPermission).toHaveBeenCalled();
        expect(mockSendNotification).toHaveBeenCalledWith({ title: "T", body: "B" });
    });

    it("does not send if permission denied", async () => {
        mockIsPermissionGranted.mockResolvedValue(false);
        mockRequestPermission.mockResolvedValue("denied");

        await focusNotify("T", "B");

        expect(mockSendNotification).not.toHaveBeenCalled();
    });

    it("does not throw on error (graceful degradation)", async () => {
        mockIsPermissionGranted.mockRejectedValue(new Error("not in tauri"));

        await expect(focusNotify("T", "B")).resolves.toBeUndefined();
        expect(mockSendNotification).not.toHaveBeenCalled();
    });
});
