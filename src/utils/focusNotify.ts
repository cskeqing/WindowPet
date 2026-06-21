import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/api/notification";

/**
 * Send a native OS notification for focus timer phase transitions.
 * Requests permission if not yet granted; silently degrades on failure.
 */
export async function focusNotify(title: string, body: string): Promise<void> {
    try {
        let granted = await isPermissionGranted();
        if (!granted) {
            const permission = await requestPermission();
            granted = permission === "granted";
        }
        if (granted) {
            sendNotification({ title, body });
        }
    } catch {
        // Graceful degradation: swallow errors (e.g. unsupported platform in dev)
    }
}
