# Implementation Plan: i18n Completion & API Key Disclosure

Branch: `feat/focus-reliability`  
Date: 2026-06-21

---

## Overview

Two independent optimizations, file-disjoint, parallelizable.

| Track | Scope | Files touched |
|-------|-------|---------------|
| act-i18n (#8) | Add missing i18n keys for OfficePopover + MiniCalendar hardcoded Chinese | `src/locale/{en,kh,zh-CN,zh-TW}/translation.json`, `src/ui/office_popover/OfficePopover.tsx`, `src/ui/office_popover/MiniCalendar.tsx` |
| act-keychain-disclosure (#7) | Add plaintext storage warning in AI settings UI | `src/ui/setting_tabs/office/GanyuAiSettings.tsx` (+ locale files shared with #8 but keys are disjoint) |

---

## Issue #8: i18n Completion

### 8.1 Audit — Hardcoded Chinese t() keys in OfficePopover.tsx

| Line(s) | Current code | Problem |
|---------|--------------|---------|
| tabs | `t("待办")` | Chinese used as i18n key |
| tabs | `t("专注")` | Chinese used as i18n key |
| tab pin | `t("已是默认视图")` | Chinese as key |
| tab pin | `t("取消固定")` | Chinese as key |
| tab pin | `t("固定面板")` | Chinese as key |
| skip btn | `t("跳到下一段")` | Chinese as key |
| focus task | `t("正在进行")` | Chinese as key |
| more hint | `t("还有") {N} t("项")` | Split Chinese, no interpolation |
| drag handle | `t("拖动可调整顺序")` | Chinese as key |
| due btn | `t("设置截止日期")` | Chinese as key |
| star | `t("当前任务")` | Chinese as key |
| undo toast | `t("已删除")` | Chinese as key |
| undo toast | `t("撤销")` | Chinese as key |
| onboard | `t("选择常用的工作台，我会记住你的偏好")` | Chinese as key |
| onboard | `t("待办清单")` | Chinese as key |
| onboard | `t("记录任务，逐项完成")` | Chinese as key |
| onboard | `t("专注计时")` | Chinese as key |
| onboard | `t("番茄钟，沉浸投入")` | Chinese as key |
| phaseLabel | `t("已暂停")` | Chinese as key |

### 8.2 Audit — Hardcoded Chinese in MiniCalendar.tsx

| Line(s) | Current code | Problem |
|---------|--------------|---------|
| monthLabel | `` `${year}年${month+1}月` `` | Template literal, not i18n |
| weekdays | `t("一"), t("二"), …, t("日")` | Chinese chars as keys |
| quick btns | `t("今天")`, `t("明天")`, `t("周末")`, `t("清除")` | Chinese as key |

### 8.3 Audit — Non-i18n string concatenation (dueLabel function)

| Expression | Problem |
|------------|---------|
| `` `逾期${-diff}天` `` | Hardcoded Chinese, no i18n, no interpolation |
| `"今天"` | Hardcoded |
| `"明天"` | Hardcoded |
| `` `${diff}天后` `` | Hardcoded |
| `` `${d.getMonth()+1}月${d.getDate()}日` `` | Hardcoded date format |


### 8.4 Unified i18n Key Naming & Translation Table

Convention: use English semantic keys (camelCase path under `"office"` namespace for UI chrome; `ganyu.*` namespace already handles persona copy).

#### 8.4.1 OfficePopover UI chrome keys

| New key | zh-CN | zh-TW | en | kh |
|---------|-------|-------|----|----|
| `office.tab.todo` | 待办 | 待辦 | Todo | កិច្ចការ |
| `office.tab.focus` | 专注 | 專注 | Focus | ផ្ដោត |
| `office.isDefaultView` | 已是默认视图 | 已是預設檢視 | Already default view | ជាទិដ្ឋភាពលំនាំដើមហើយ |
| `office.unpin` | 取消固定 | 取消固定 | Unpin | ដកម្ជុល |
| `office.pin` | 固定面板 | 固定面板 | Pin panel | ម្ជុលផ្ទាំង |
| `office.skipToNext` | 跳到下一段 | 跳到下一段 | Skip to next | រំលងទៅបន្ទាប់ |
| `office.inProgress` | 正在进行 | 正在進行 | In progress | កំពុងដំណើរការ |
| `office.moreItems` | 还有 {{count}} 项 | 還有 {{count}} 項 | {{count}} more below | នៅសល់ {{count}} ទៀត |
| `office.dragToReorder` | 拖动可调整顺序 | 拖動可調整順序 | Drag to reorder | អូសដើម្បីរៀបចំលំដាប់ |
| `office.setDueDate` | 设置截止日期 | 設定截止日期 | Set due date | កំណត់ថ្ងៃផុតកំណត់ |
| `office.currentTask` | 当前任务 | 當前任務 | Current task | កិច្ចការបច្ចុប្បន្ន |
| `office.deleted` | 已删除 | 已刪除 | Deleted | បានលុប |
| `office.undo` | 撤销 | 撤銷 | Undo | មិនធ្វើវិញ |
| `office.paused` | 已暂停 | 已暫停 | Paused | បានផ្អាក |

#### 8.4.2 Onboarding keys

| New key | zh-CN | zh-TW | en | kh |
|---------|-------|-------|----|----|
| `office.onboard.subtitle` | 选择常用的工作台，我会记住你的偏好 | 選擇常用的工作台，我會記住你的偏好 | Pick your main workspace — I'll remember your choice | ជ្រើសកន្លែងធ្វើការដែលប្រើញឹក ខ្ញុំនឹងចងចាំ |
| `office.onboard.todoTitle` | 待办清单 | 待辦清單 | Todo List | បញ្ជីកិច្ចការ |
| `office.onboard.todoDesc` | 记录任务，逐项完成 | 記錄任務，逐項完成 | Track tasks, check them off | កត់កិច្ចការ បញ្ចប់ម្តងមួយ |
| `office.onboard.focusTitle` | 专注计时 | 專注計時 | Focus Timer | កំណត់ពេលផ្ដោត |
| `office.onboard.focusDesc` | 番茄钟，沉浸投入 | 番茄鐘，沉浸投入 | Pomodoro, deep work | ប៉ូម៉ូដូរ៉ូ ផ្ដោតស៊ី |

#### 8.4.3 MiniCalendar keys

| New key | zh-CN | zh-TW | en | kh |
|---------|-------|-------|----|----|
| `office.cal.monthLabel` | {{year}}年{{month}}月 | {{year}}年{{month}}月 | {{month}}/{{year}} | ខែ{{month}} ឆ្នាំ{{year}} |
| `office.cal.weekMon` | 一 | 一 | Mo | ច |
| `office.cal.weekTue` | 二 | 二 | Tu | អ |
| `office.cal.weekWed` | 三 | 三 | We | ព |
| `office.cal.weekThu` | 四 | 四 | Th | ព្រ |
| `office.cal.weekFri` | 五 | 五 | Fr | សុ |
| `office.cal.weekSat` | 六 | 六 | Sa | ស |
| `office.cal.weekSun` | 日 | 日 | Su | អា |
| `office.cal.today` | 今天 | 今天 | Today | ថ្ងៃនេះ |
| `office.cal.tomorrow` | 明天 | 明天 | Tomorrow | ថ្ងៃស្អែក |
| `office.cal.weekend` | 周末 | 週末 | Weekend | ចុងសប្តាហ៍ |
| `office.cal.clear` | 清除 | 清除 | Clear | សម្អាត |

#### 8.4.4 Due-date label keys (with interpolation)

| New key | zh-CN | zh-TW | en | kh |
|---------|-------|-------|----|----|
| `office.due.overdue` | 逾期{{days}}天 | 逾期{{days}}天 | {{days}}d overdue | ផុតកំណត់{{days}}ថ្ងៃ |
| `office.due.today` | 今天 | 今天 | Today | ថ្ងៃនេះ |
| `office.due.tomorrow` | 明天 | 明天 | Tomorrow | ថ្ងៃស្អែក |
| `office.due.soon` | {{days}}天后 | {{days}}天後 | In {{days}} days | {{days}}ថ្ងៃទៀត |
| `office.due.later` | {{month}}月{{day}}日 | {{month}}月{{day}}日 | {{month}}/{{day}} | ថ្ងៃទី{{day}} ខែ{{month}} |


### 8.5 Implementation Steps (act-i18n)

1. **Add all keys from §8.4 to each locale file** under an `"office"` top-level object:
   - `src/locale/zh-CN/translation.json` — Chinese values (preserve current wording)
   - `src/locale/zh-TW/translation.json` — Traditional Chinese
   - `src/locale/en/translation.json` — English
   - `src/locale/kh/translation.json` — Khmer

2. **Refactor OfficePopover.tsx**:
   - Replace all `t("Chinese text")` with `t("office.xxx")` per §8.4.1/8.4.2.
   - Replace `t("还有") {N} t("项")` with `t("office.moreItems", { count: hiddenBelow })`.
   - Replace `t("正在进行") · {current.text}` with `t("office.inProgress")`.
   - Replace `t("已暂停")` with `t("office.paused")`.

3. **Refactor MiniCalendar.tsx**:
   - Replace template literal `${year}年${month+1}月` with `t("office.cal.monthLabel", { year, month: month+1 })`.
   - Replace weekday `t("一")` … `t("日")` with `t("office.cal.weekMon")` … `t("office.cal.weekSun")`.
   - Replace quick buttons `t("今天")` etc. with `t("office.cal.today")` etc.

4. **Refactor dueLabel() in OfficePopover.tsx**:
   - Accept a `t` function parameter.
   - Return `t("office.due.overdue", { days: -diff })` etc. with interpolation.
   - Callers pass `t` from the component scope.

---

## Issue #7: API Key Plaintext Storage Disclosure

### 7.1 Current State

- `useGanyuSettings` persists `apiKey` as plaintext inside `settings.json → app.ganyu.apiKey`.
- UI in `GanyuAiSettings.tsx` shows `maskedApiKey()` (dots + last 4 chars).
- No explicit warning that the key is stored in cleartext on disk.

### 7.2 Design

Add a persistent `Alert` (Mantine `<Alert>`) inside the `<Collapse>` section of `GanyuAiSettings.tsx`, positioned directly below the `<PasswordInput>` for API key. Visible **whenever `aiEnabled` is true OR apiKey is non-empty**.

Content (i18n key: `office.ai.keyStorageWarning`):

| Lang | Text |
|------|------|
| zh-CN | 你的 API Key 以明文保存在本地配置文件中，请妥善保管。 |
| zh-TW | 你的 API Key 以明文保存在本地設定檔中，請妥善保管。 |
| en | Your API key is stored in plaintext in the local config file. Keep it safe. |
| kh | API Key របស់អ្នកត្រូវបានរក្សាទុកជាអក្សរធម្មតានៅក្នុងឯកសារកំណត់រចនាសម្ព័ន្ធមូលដ្ឋាន។ សូមរក្សាវាឱ្យមានសុវត្ថិភាព។ |

### 7.3 Implementation Steps (act-keychain-disclosure)

1. **Add key `office.ai.keyStorageWarning`** to all four locale files (values per §7.2).

2. **In `GanyuAiSettings.tsx`**, after the `<PasswordInput>` block, add:
   ```tsx
   {(aiEnabled || get().apiKey) && (
       <Alert variant="light" color="yellow" icon={<IconAlertCircle size={16} />} p="xs">
           <Text size="xs">{t("office.ai.keyStorageWarning")}</Text>
       </Alert>
   )}
   ```
   Use existing imports (`Alert`, `Text`, `IconAlertCircle`).

3. Do NOT modify `useGanyuSettings.tsx` — storage mechanism unchanged.

### 7.4 Visibility condition

Show the warning when:
- `aiEnabled === true`, OR
- `maskedApiKey()` returns non-empty (i.e., a key has been saved).

This ensures users see the disclosure even if they disable AI but leave the key stored.

---

## File Ownership (Non-overlapping)

| Track | Exclusive files |
|-------|----------------|
| act-i18n | `src/locale/*/translation.json` (office.* keys), `src/ui/office_popover/OfficePopover.tsx`, `src/ui/office_popover/MiniCalendar.tsx` |
| act-keychain-disclosure | `src/ui/setting_tabs/office/GanyuAiSettings.tsx`, `src/locale/*/translation.json` (office.ai.keyStorageWarning key only) |

Locale files are shared but keys are disjoint (`office.tab.*`, `office.cal.*`, `office.due.*` vs `office.ai.keyStorageWarning`). No merge conflict.

---

## Acceptance Criteria

### #8 i18n
- [ ] All `t("Chinese...")` calls in OfficePopover.tsx and MiniCalendar.tsx replaced with English semantic keys.
- [ ] `dueLabel()` uses `t()` with interpolation (`{{days}}`, `{{month}}`, `{{day}}`).
- [ ] `moreItems` uses `t("office.moreItems", { count })` — single key with interpolation.
- [ ] All four locale files contain the new keys with correct translations.
- [ ] `zh-CN` values match the original Chinese text exactly.
- [ ] No raw Chinese strings remain in `.tsx` source (except inside `ganyu.*` i18n keys which are correct).

### #7 API Key Disclosure
- [ ] Yellow `<Alert>` visible in AI settings when key is stored or AI is enabled.
- [ ] Alert text comes from `t("office.ai.keyStorageWarning")`.
- [ ] All four locale files have the key.
- [ ] `useGanyuSettings.tsx` is NOT modified.
- [ ] Existing `maskedApiKey` display logic unchanged.

---

## Verification Commands

```bash
# 1. Ensure no Chinese-character t() keys remain in office_popover components
grep -nP 't\("[^\x00-\x7F]+"\)' src/ui/office_popover/OfficePopover.tsx src/ui/office_popover/MiniCalendar.tsx
# Expected: no output (exit 1)

# 2. Ensure no hardcoded Chinese template literals in dueLabel / monthLabel
grep -nP '`[^`]*[\x{4e00}-\x{9fff}][^`]*`' src/ui/office_popover/OfficePopover.tsx src/ui/office_popover/MiniCalendar.tsx
# Expected: no output (exit 1)

# 3. Verify new keys exist in en translation
node -e "const j=require('./src/locale/en/translation.json'); const k=['office.tab.todo','office.due.overdue','office.cal.monthLabel','office.ai.keyStorageWarning']; k.forEach(p=>{const v=p.split('.').reduce((o,k)=>o&&o[k],j); if(!v) throw new Error('Missing: '+p)}); console.log('OK')"

# 4. Verify zh-CN values preserved
node -e "const j=require('./src/locale/zh-CN/translation.json'); console.assert(j.office.tab.todo==='待办'); console.assert(j.office.due.today==='今天'); console.log('OK')"

# 5. TypeScript compiles without errors
npx tsc --noEmit

# 6. Verify disclosure Alert exists in GanyuAiSettings
grep -n 'office.ai.keyStorageWarning' src/ui/setting_tabs/office/GanyuAiSettings.tsx
# Expected: at least one match
```

---

## Notes

- i18next interpolation syntax: `{{variable}}` (double curly braces).
- i18next `fallbackLng` is `en`, so English keys are the ultimate fallback — critical they exist.
- No plural forms needed for `office.moreItems` since we use `{{count}}` as a simple number display, not i18next pluralization (no `_one`/`_other` suffixes needed for this case — the sentence structure works regardless of count in all four languages).
- `dueLabel()` currently returns `{ text, level }`. After refactor it will return `{ text: t("office.due.xxx", {...}), level }` — same interface, just localized text.
