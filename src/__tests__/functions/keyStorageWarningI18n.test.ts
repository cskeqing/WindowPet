import { describe, it, expect } from "vitest";
import en from "../../locale/en/translation.json";
import zhCN from "../../locale/zh-CN/translation.json";
import zhTW from "../../locale/zh-TW/translation.json";
import kh from "../../locale/kh/translation.json";

describe("ganyu.ai.keyStorageWarning i18n key", () => {
    it.each([
        ["en", en],
        ["zh-CN", zhCN],
        ["zh-TW", zhTW],
        ["kh", kh],
    ])("%s has a non-empty keyStorageWarning", (_lang, data) => {
        const val = (data as any).ganyu?.ai?.keyStorageWarning;
        expect(val).toBeTruthy();
        expect(typeof val).toBe("string");
        expect(val.length).toBeGreaterThan(10);
    });
});
