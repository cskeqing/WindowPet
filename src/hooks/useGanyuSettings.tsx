import { create } from "zustand";
import { Store } from "tauri-plugin-store-api";
import { invoke } from "@tauri-apps/api/tauri";
import { getAppSettings } from "../utils/settings";

// Persisted under settings.json -> "app" object, "ganyu" section.
// (getAppSettings/setConfig store the app settings object under the "app" key,
//  see useFocusStore/useTodoStore which keep their data under office.json's "app".)
export interface GanyuSettings {
    aiEnabled: boolean;        // default false (Requirement 8.1)
    endpoint: string;          // user configured endpoint (Requirement 8.5)
    apiKey: string;            // stored locally, masked in UI (Requirement 8.6)
    model?: string;
    timeoutMs: number;         // configurable timeout (Requirement 10.2), default 8000
    longWorkThresholdSeconds: number; // long-work care threshold (Requirement 7.3)
    disclosureShown: boolean;  // whether first-launch data-usage disclosure has shown (Requirement 8.4)
}

export const DEFAULT_GANYU_SETTINGS: GanyuSettings = {
    aiEnabled: false,
    endpoint: "",
    apiKey: "",
    model: "",
    timeoutMs: 8000,
    longWorkThresholdSeconds: 5400,
    disclosureShown: false,
};

const SETTINGS_CONFIG_NAME = "settings.json";
const APP_KEY = "app";

// Awaitable read-modify-write that persists ONLY the `ganyu` section while
// preserving every other key under settings.json's "app" object.
// Throws if local storage/persistence is unavailable so callers can react
// (e.g. enableAi must refuse to enable when this fails — Requirement 8.7).
async function persistGanyuSettings(ganyu: GanyuSettings): Promise<void> {
    const configPath: string = await invoke("combine_config_path", { config_name: SETTINGS_CONFIG_NAME });
    // Read existing app settings to preserve unrelated keys.
    let appData: Record<string, unknown> = {};
    try {
        const existing = await getAppSettings({ configName: SETTINGS_CONFIG_NAME, key: APP_KEY, withErrorDialog: false });
        if (existing && typeof existing === "object") appData = existing as Record<string, unknown>;
    } catch {
        /* file may not exist yet; start from empty app object */
    }
    const store = new Store(configPath);
    await store.set(APP_KEY, { ...appData, ganyu });
    await store.save();
}

interface GanyuSettingsState extends GanyuSettings {
    loadSettings: () => Promise<void>;
    updateSettings: (partial: Partial<GanyuSettings>) => Promise<void>;
    enableAi: () => Promise<boolean>;
    maskedApiKey: () => string;
}

export const useGanyuSettings = create<GanyuSettingsState>()((set, get) => ({
    ...DEFAULT_GANYU_SETTINGS,

    loadSettings: async () => {
        try {
            const data = await getAppSettings({ configName: SETTINGS_CONFIG_NAME, withErrorDialog: false });
            const ganyu = (data && typeof data === "object" ? (data as Record<string, unknown>).ganyu : undefined) as Partial<GanyuSettings> | undefined;
            set({ ...DEFAULT_GANYU_SETTINGS, ...(ganyu || {}) });
        } catch {
            // keep defaults if storage is unavailable
            set({ ...DEFAULT_GANYU_SETTINGS });
        }
    },

    updateSettings: async (partial) => {
        const current: GanyuSettings = {
            aiEnabled: get().aiEnabled,
            endpoint: get().endpoint,
            apiKey: get().apiKey,
            model: get().model,
            timeoutMs: get().timeoutMs,
            longWorkThresholdSeconds: get().longWorkThresholdSeconds,
            disclosureShown: get().disclosureShown,
        };
        const next: GanyuSettings = { ...current, ...partial };
        set({ ...partial });
        try {
            await persistGanyuSettings(next);
        } catch {
            // revert in-memory state if persistence failed
            set({ ...current });
            throw new Error("Failed to persist Ganyu settings");
        }
    },

    // Enable AI. If persistence is unavailable, refuse to enable and keep
    // aiEnabled=false (Requirement 8.7). Returns true on success, false otherwise.
    enableAi: async () => {
        const current: GanyuSettings = {
            aiEnabled: get().aiEnabled,
            endpoint: get().endpoint,
            apiKey: get().apiKey,
            model: get().model,
            timeoutMs: get().timeoutMs,
            longWorkThresholdSeconds: get().longWorkThresholdSeconds,
            disclosureShown: get().disclosureShown,
        };
        const next: GanyuSettings = { ...current, aiEnabled: true, disclosureShown: true };
        try {
            await persistGanyuSettings(next);
            set({ aiEnabled: true, disclosureShown: true });
            return true;
        } catch {
            // storage unavailable → reject enabling, keep aiEnabled=false
            set({ aiEnabled: false });
            return false;
        }
    },

    // Returns a masked form of the apiKey that is NOT equal to the original and
    // never contains the full contiguous plaintext (at most the last 4 chars).
    // Empty key → "" (Requirement 8.6).
    maskedApiKey: () => {
        const key = get().apiKey;
        if (!key) return "";
        const visible = 4;
        if (key.length <= visible) return "•".repeat(key.length);
        return "•".repeat(key.length - visible) + key.slice(-visible);
    },
}));
