# Focus Reliability Fixes — Implementation Plan

## Context

- **Tauri version**: v1 (tauri 1.5.4 in Cargo.toml, @tauri-apps/api ^1.5.6, @tauri-apps/cli 1.5.14)
- **Test runner**: vitest ^1.6.0 (scripts: `npm test`, `npm run test:component`)
- **Build command**: `npm run build` (runs `tsc && vite build`)
- **Branch**: `feat/focus-reliability`

---

## Fix #1 — System Notification (act-notification)

### Problem

`useFocusStore.tick()` calls `showNotification()` from `src/utils/notification.tsx` — a Mantine in-app toast. The OfficePopover window is hidden (`appWindow.hide()`) when it loses focus, so the toast renders in a hidden webview and the user never sees it.

### Solution

Create `src/utils/focusNotify.ts` — a standalone utility that sends **native OS notifications** via `@tauri-apps/api/notification`. `showNotification()` in `src/utils/notification.tsx` is **unchanged** (still used for in-app toasts elsewhere).

### Tauri v1 Notification Permission

Add `notification` to the allowlist in `src-tauri/tauri.conf.json`:

```jsonc
// Inside "tauri" > "allowlist":
"notification": {
  "all": true
}
```

No Rust plugin needed — Tauri v1 bundles notification support in the core allowlist.

### New File: `src/utils/focusNotify.ts`

```typescript
/**
 * Native OS notification for focus timer phase transitions.
 * Uses @tauri-apps/api/notification (Tauri v1 core).
 * Falls back to showNotification (in-app toast) if permission denied or API unavailable.
 */
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/api/notification";
import { showNotification } from "./notification";

export async function focusNotify(title: string, body: string): Promise<void> {
  try {
    let granted = await isPermissionGranted();
    if (!granted) {
      const permission = await requestPermission();
      granted = permission === "granted";
    }
    if (granted) {
      sendNotification({ title, body });
    } else {
      // Graceful degradation: fall back to in-app toast
      showNotification({ title, message: body });
    }
  } catch {
    // API unavailable (e.g., dev mode without Tauri runtime)
    showNotification({ title, message: body });
  }
}
```

### Changes to `src/hooks/useFocusStore.tsx` (act-notification scope)

Replace the two `showNotification` calls inside `tick()` with `focusNotify`:

1. **Import change** — add:
   ```typescript
   import { focusNotify } from "../utils/focusNotify";
   ```
   (Keep the existing `import { showNotification } ...` only if it's used elsewhere in the file; currently it is NOT used elsewhere, so remove it.)

2. **Call site 1** (work phase complete, ~line 143):
   ```typescript
   // Before:
   showNotification({ title: i18next.t("Focus Complete"), message: i18next.t("Time to take a break!") });
   // After:
   focusNotify(i18next.t("Focus Complete"), i18next.t("Time to take a break!"));
   ```

3. **Call site 2** (break phase complete, ~line 157):
   ```typescript
   // Before:
   showNotification({ title: i18next.t("Break Over"), message: i18next.t("Let's get back to focus!") });
   // After:
   focusNotify(i18next.t("Break Over"), i18next.t("Let's get back to focus!"));
   ```

### Acceptance Criteria (Fix #1)

- [ ] `src-tauri/tauri.conf.json` allowlist includes `"notification": { "all": true }`.
- [ ] `src/utils/focusNotify.ts` exists with the signature `focusNotify(title: string, body: string): Promise<void>`.
- [ ] `useFocusStore.tsx` imports and calls `focusNotify` instead of `showNotification` for phase-complete events.
- [ ] `src/utils/notification.tsx` is **untouched**.
- [ ] `npm run build` passes (tsc + vite).
- [ ] `npm test` passes (vitest, with focusNotify unit test).

---

## Fix #2 — Timezone Consistency (act-timezone)

### Problem

`useFocusStore.tsx` defines `todayStr()` using `new Date().toISOString().slice(0, 10)` which yields a **UTC** date string. This causes daily pomodoro stats to reset at UTC midnight (08:00 CST) instead of local midnight.

`OfficePopover.tsx` already has the correct `localToday()` and `MiniCalendar.tsx` has `ymd()` — all duplicates of the same logic.

### Solution

Create a shared `src/utils/date.ts` with a single canonical helper, then replace all three duplicates.

### New File: `src/utils/date.ts`

```typescript
/**
 * Returns the local date as YYYY-MM-DD string, unaffected by UTC offset.
 */
export function localDateStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}
```

### Changes to `src/hooks/useFocusStore.tsx` (act-timezone scope)

1. **Remove** the local `todayStr()` function definition (lines 20–22).
2. **Add import**:
   ```typescript
   import { localDateStr } from "../utils/date";
   ```
3. **Replace all `todayStr()` calls** with `localDateStr()`:
   - Initial `stats` object (~line 49): `date: localDateStr()`
   - `loadConfig` stats check (~line 58–59): `localDateStr()`
   - `recordPomodoro` comparisons (~line 170–171): `localDateStr()`

### Changes to `src/ui/office_popover/OfficePopover.tsx` (act-timezone scope)

1. **Remove** the local `localToday()` function definition (lines 29–35).
2. **Add import**:
   ```typescript
   import { localDateStr } from "../../utils/date";
   ```
3. **Replace all `localToday()` calls** with `localDateStr()`:
   - `dueDiffDays()` function: `new Date(localDateStr() + "T00:00:00")`

### Changes to `src/ui/office_popover/MiniCalendar.tsx` (act-timezone scope)

1. **Remove** the local `ymd()` function definition (lines 6–10).
2. **Add import**:
   ```typescript
   import { localDateStr } from "../../utils/date";
   ```
3. **Replace all `ymd(...)` calls** with `localDateStr(...)` (same signature — accepts optional Date).

### Acceptance Criteria (Fix #2)

- [ ] `src/utils/date.ts` exists with the signature `localDateStr(d?: Date): string`.
- [ ] `useFocusStore.tsx` no longer contains `todayStr` or `toISOString().slice`.
- [ ] `OfficePopover.tsx` no longer contains a local `localToday()` definition.
- [ ] `MiniCalendar.tsx` no longer contains a local `ymd()` definition.
- [ ] All three files import `localDateStr` from `../utils/date` (or `../../utils/date`).
- [ ] `npm run build` passes.
- [ ] `npm test` passes (vitest, with localDateStr unit test).

---

## Execution Order

```
act-notification (first)
├── Create src/utils/focusNotify.ts
├── Add "notification" to tauri.conf.json allowlist
├── Edit useFocusStore.tsx: replace showNotification → focusNotify
├── Add unit test: src/__tests__/focusNotify.test.ts
└── Verify: npm run build && npm test

act-timezone (second, depends on act-notification having finished useFocusStore edits)
├── Create src/utils/date.ts
├── Edit useFocusStore.tsx: remove todayStr, use localDateStr
├── Edit OfficePopover.tsx: remove localToday, use localDateStr
├── Edit MiniCalendar.tsx: remove ymd, use localDateStr
├── Add unit test: src/__tests__/date.test.ts
└── Verify: npm run build && npm test
```

---

## Verification Commands

```bash
# TypeScript compile + Vite bundle
npm run build

# All unit tests
npm test

# Targeted test run (after writing test files)
npx vitest run src/__tests__/focusNotify.test.ts
npx vitest run src/__tests__/date.test.ts
```

---

## Files Modified / Created Summary

| File | Owner | Action |
|------|-------|--------|
| `src/utils/focusNotify.ts` | act-notification | CREATE |
| `src-tauri/tauri.conf.json` | act-notification | EDIT (add notification allowlist) |
| `src/hooks/useFocusStore.tsx` | act-notification (1st), act-timezone (2nd) | EDIT |
| `src/__tests__/focusNotify.test.ts` | act-notification | CREATE |
| `src/utils/date.ts` | act-timezone | CREATE |
| `src/ui/office_popover/OfficePopover.tsx` | act-timezone | EDIT |
| `src/ui/office_popover/MiniCalendar.tsx` | act-timezone | EDIT |
| `src/__tests__/date.test.ts` | act-timezone | CREATE |
| `src/utils/notification.tsx` | — | **UNTOUCHED** |
