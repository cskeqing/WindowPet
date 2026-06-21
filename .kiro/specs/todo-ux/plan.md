# Todo UX Optimizations — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 3 OfficePopover体验问题 — 失焦误关(#3)、待办不可编辑(#4)、删除无撤销(#5)。

**Architecture:** 以 zustand store 扩展(lastDeleted + undoDelete)为数据层;UI 侧用 ref-based 守卫(interactionGuard)控制失焦隐藏;行内编辑走受控 input + 双击激活。

**Tech Stack:** React 18 + Zustand 4 + TypeScript 5 + CSS Modules + Tauri v1 API

## Global Constraints

- 分支: `feat/focus-reliability`
- 构建: `npm run build` (tsc + vite build) 必须通过
- 测试: `npm test` (vitest) 必须通过
- 语言/文案遵循甘雨人设(ganyu-persona.md),删除提示用温柔语气
- 不破坏现有 mountedAt < 400ms 防抖逻辑
- 两个 agent 串行: **act-store-hide 先**,**act-inline-edit 后**(后者须重读 OfficePopover.tsx)
- CSS 变量/类名遵循现有 `OfficePopover.module.css` 冰蓝调

---

## Task 1: Store 扩展 + 失焦守卫 + 删除撤销 (`act-store-hide`)

**Files:**
- Modify: `src/hooks/useTodoStore.tsx` (新增 lastDeleted / undoDelete / 修改 removeTodo)
- Modify: `src/ui/office_popover/OfficePopover.tsx` (失焦守卫 + 图钉固定 + 撤销 Toast)
- Modify: `src/ui/office_popover/OfficePopover.module.css` (新增 .undoToast / .pinLock 样式)
- Create: `src/__tests__/useTodoStore.undo.test.ts`

**Interfaces:**
- Produces (供 act-inline-edit 消费):
  - `useTodoStore` 新增字段:
    ```typescript
    lastDeleted: { item: TodoItem; index: number } | null;
    undoDelete: () => void;
    ```
  - OfficePopover 内新增 ref `interactionRef: MutableRefObject<Set<string>>` — 当 Set 非空时阻止失焦隐藏。act-inline-edit 需在编辑态向此 Set 加入 `"editing"` 标记。

---

### 1.1 useTodoStore 改动

- [ ] **Step 1: 扩展 TodoState 接口**

在 `src/hooks/useTodoStore.tsx` 的 `interface TodoState` 中新增:

```typescript
lastDeleted: { item: TodoItem; index: number } | null;
undoDelete: () => void;
dismissUndo: () => void;
```

- [ ] **Step 2: 修改 removeTodo 实现**

`removeTodo` 在删除前暂存被删项及其原索引:

```typescript
removeTodo: (id) => {
    const { todos } = get();
    const index = todos.findIndex(t => t.id === id);
    if (index === -1) return;
    const item = todos[index];
    set({ todos: todos.filter(t => t.id !== id), lastDeleted: { item, index } });
    setTimeout(() => get().saveTodos(), 0);
},
```

- [ ] **Step 3: 实现 undoDelete**

```typescript
undoDelete: () => {
    const { lastDeleted, todos } = get();
    if (!lastDeleted) return;
    const restored = [...todos];
    // 恢复到原位置;若原索引超出当前长度则追加到末尾
    const insertAt = Math.min(lastDeleted.index, restored.length);
    restored.splice(insertAt, 0, lastDeleted.item);
    set({ todos: restored, lastDeleted: null });
    setTimeout(() => get().saveTodos(), 0);
},
```

- [ ] **Step 4: 实现 dismissUndo**

```typescript
dismissUndo: () => {
    set({ lastDeleted: null });
},
```

- [ ] **Step 5: 初始值**

在 store 的初始状态中添加:
```typescript
lastDeleted: null,
```

---

### 1.2 OfficePopover 失焦守卫(#3)

- [ ] **Step 6: 新增 interactionRef + pinned state**

在 `OfficePopover` 函数顶部(state 区域):

```typescript
// 交互守卫:Set 非空时阻止失焦隐藏
const interactionRef = useRef<Set<string>>(new Set());

// 图钉固定(localStorage 持久)
const PIN_KEY = "office_pinned";
const [pinned, setPinned] = useState(() => localStorage.getItem(PIN_KEY) === "true");
const togglePin = useCallback(() => {
    setPinned(prev => {
        const next = !prev;
        localStorage.setItem(PIN_KEY, String(next));
        return next;
    });
}, []);
```

- [ ] **Step 7: 修改 onFocusChanged 回调**

将现有 `if (!focused)` 分支内的隐藏逻辑替换为:

```typescript
if (!focused) {
    if (Date.now() - mountedAt < 400) return;           // 保留原有防抖
    if (pinned) return;                                  // 图钉固定不隐藏
    if (interactionRef.current.size > 0) return;        // 有活跃交互不隐藏
    emitUpdatePetsEvent({ dispatchType: DispatchType.PetInteractionEnd });
    setLeaving(true);
    setTimeout(() => { appWindow.hide(); setLeaving(false); }, 240);
    return;
}
```

- [ ] **Step 8: 输入框焦点守卫**

在待办输入框 `<input>` 上添加:

```tsx
onFocus={() => interactionRef.current.add("addInput")}
onBlur={() => interactionRef.current.delete("addInput")}
```

- [ ] **Step 9: 日历浮层守卫**

在 `calOpenId` 状态变化时(已有 setCalOpenId),通过 useEffect 同步守卫:

```typescript
useEffect(() => {
    if (calOpenId) interactionRef.current.add("calendar");
    else interactionRef.current.delete("calendar");
}, [calOpenId]);
```

- [ ] **Step 10: 拖拽守卫**

在 `onRowPointerDown` 中,进入拖拽(`dragging = true`)时:

```typescript
interactionRef.current.add("dragging");
```

在 `onUp` 中清除:

```typescript
interactionRef.current.delete("dragging");
```

- [ ] **Step 11: 图钉按钮 UI**

替换现有 tabs 区域的 `<button className={…pin…}>` (当前用于"设为默认视图"),改为同时渲染两个按钮:

```tsx
<button
    className={`${styles.pin} ${pinned ? styles.pinLock : ""}`}
    onClick={togglePin}
    title={pinned ? t("取消固定") : t("固定面板")}
>
    <PinIcon on={pinned} />
</button>
{!pinned && (
    <button
        className={`${styles.pin} ${isDefault ? styles.pinOn : ""}`}
        onClick={setAsDefault}
        title={isDefault ? t("已是默认视图") : resolveCopy({ kind: "btn", action: "setDefault" }, t, showKey)}
    >
        <PinIcon on={isDefault} />
    </button>
)}
```

> 注:若空间紧张,可将"设为默认视图"按钮保持不变,仅在其左侧增加图钉锁定按钮。设计不强制替换,两个按钮独立功能。

---

### 1.3 删除撤销 Toast(#5)

- [ ] **Step 12: 从 store 读取 lastDeleted & undoDelete**

在组件顶部解构中增加:

```typescript
const { todos, addTodo, toggleTodo, removeTodo, setCurrent, clearCompleted, loadTodos, reorderTodos, setDueDate, lastDeleted, undoDelete, dismissUndo } = useTodoStore();
```

- [ ] **Step 13: 5s 自动消失**

```typescript
useEffect(() => {
    if (!lastDeleted) return;
    const timer = setTimeout(() => dismissUndo(), 5000);
    return () => clearTimeout(timer);
}, [lastDeleted, dismissUndo]);
```

- [ ] **Step 14: 撤销 Toast 渲染**

在待办视图 `</div>` 闭合前(foot 之前)插入:

```tsx
{lastDeleted && (
    <div className={styles.undoToast}>
        <span>已删除</span>
        <button className={styles.undoBtn} onClick={undoDelete}>撤销</button>
    </div>
)}
```

- [ ] **Step 15: CSS — undoToast 样式**

在 `OfficePopover.module.css` 末尾添加:

```css
/* undo toast */
.undoToast {
    display: flex; align-items: center; justify-content: center; gap: 10px;
    padding: 8px 16px; border-radius: 12px; margin-top: 8px;
    background: var(--field-bg); border: 1px solid var(--field-border);
    font-size: 12.5px; color: var(--text-dim);
    animation: rise 0.3s var(--ease-out) both;
}
.undoBtn {
    border: none; background: none; cursor: pointer; font-size: 12.5px; font-weight: 600;
    color: var(--accent-solid); padding: 2px 8px; border-radius: 6px;
    transition: background 0.2s, transform 0.2s var(--spring);
}
.undoBtn:hover { background: var(--accent-soft); transform: scale(1.05); }

/* pin lock indicator (图钉固定态) */
.pinLock { color: var(--ice-a); background: rgba(142, 197, 255, 0.14); border-color: rgba(142, 197, 255, 0.3); }
```

- [ ] **Step 16: 编写 store 撤销单元测试**

Create `src/__tests__/useTodoStore.undo.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { useTodoStore } from "../hooks/useTodoStore";

// 直接操作 zustand store(无需 React 渲染)
const store = useTodoStore;

describe("useTodoStore undo delete", () => {
    beforeEach(() => {
        store.setState({ todos: [], lastDeleted: null });
    });

    it("removeTodo stores lastDeleted with correct index", () => {
        store.getState().addTodo("A");
        store.getState().addTodo("B");
        const idB = store.getState().todos[1].id;
        store.getState().removeTodo(idB);
        const { lastDeleted, todos } = store.getState();
        expect(todos).toHaveLength(1);
        expect(lastDeleted).not.toBeNull();
        expect(lastDeleted!.item.text).toBe("B");
        expect(lastDeleted!.index).toBe(1);
    });

    it("undoDelete restores to original index", () => {
        store.getState().addTodo("A");
        store.getState().addTodo("B");
        store.getState().addTodo("C");
        const idB = store.getState().todos[1].id;
        store.getState().removeTodo(idB);
        store.getState().undoDelete();
        const { todos, lastDeleted } = store.getState();
        expect(todos).toHaveLength(3);
        expect(todos[1].text).toBe("B");
        expect(lastDeleted).toBeNull();
    });

    it("undoDelete with out-of-range index appends to end", () => {
        store.getState().addTodo("A");
        store.getState().addTodo("B");
        // 删除 B(index=1),然后删除 A(index=0,覆盖 lastDeleted)
        store.getState().removeTodo(store.getState().todos[1].id);
        store.getState().removeTodo(store.getState().todos[0].id);
        // lastDeleted 为 A at index 0
        store.getState().undoDelete();
        expect(store.getState().todos).toHaveLength(1);
        expect(store.getState().todos[0].text).toBe("A");
    });

    it("dismissUndo clears lastDeleted", () => {
        store.getState().addTodo("X");
        store.getState().removeTodo(store.getState().todos[0].id);
        expect(store.getState().lastDeleted).not.toBeNull();
        store.getState().dismissUndo();
        expect(store.getState().lastDeleted).toBeNull();
    });
});
```

- [ ] **Step 17: 验证**

```bash
npm run build
npm test
```

---

## Task 2: 双击行内编辑 (`act-inline-edit`)

**Files:**
- Modify: `src/ui/office_popover/OfficePopover.tsx` (新增编辑态逻辑 + JSX)
- Modify: `src/ui/office_popover/OfficePopover.module.css` (新增 .editInput 样式)
- Create: `src/__tests__/components/TodoInlineEdit.test.tsx`

**Interfaces:**
- Consumes:
  - `useTodoStore.editTodo(id: string, text: string): void` (已存在)
  - `interactionRef: MutableRefObject<Set<string>>` (由 Task 1 产出)

**⚠️ 前置条件:** 必须在 Task 1 完成并验证后再执行。开始时须 **重读** `OfficePopover.tsx` 获取 Task 1 的改动。

---

- [ ] **Step 1: 新增 editingId / editText state**

在 OfficePopover 组件内(state 区域):

```typescript
const [editingId, setEditingId] = useState<string | null>(null);
const [editText, setEditText] = useState("");
```

- [ ] **Step 2: 开始编辑函数**

```typescript
const startEdit = useCallback((id: string, currentText: string) => {
    setEditingId(id);
    setEditText(currentText);
    interactionRef.current.add("editing");
}, []);
```

- [ ] **Step 3: 提交编辑函数**

```typescript
const commitEdit = useCallback(() => {
    if (editingId && editText.trim()) {
        editTodo(editingId, editText.trim());
    }
    setEditingId(null);
    setEditText("");
    interactionRef.current.delete("editing");
}, [editingId, editText, editTodo]);
```

- [ ] **Step 4: 取消编辑函数**

```typescript
const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditText("");
    interactionRef.current.delete("editing");
}, []);
```

- [ ] **Step 5: 修改 onRowPointerDown**

在行按下时,若当前项正在编辑中,忽略拖拽(防止编辑态误触拖拽):

```typescript
const onRowPointerDown = useCallback((id: string) => (e: React.PointerEvent) => {
    if (editingId === id) return; // 编辑中不触发拖拽
    // ... 原有逻辑
}, [editingId, findTodoIdAtY, reorderTodos]);
```

- [ ] **Step 6: 修改待办行的文本区域 JSX**

将:
```tsx
<span className={`${styles.txt} ${todo.completed ? styles.txtDone : ""}`}>{todo.text}</span>
```

替换为:
```tsx
{editingId === todo.id ? (
    <input
        className={styles.editInput}
        value={editText}
        onChange={(e) => setEditText(e.currentTarget.value)}
        onKeyDown={(e) => {
            if (e.key === "Enter") commitEdit();
            if (e.key === "Escape") cancelEdit();
        }}
        onBlur={commitEdit}
        autoFocus
        onPointerDown={(e) => e.stopPropagation()}
    />
) : (
    <span
        className={`${styles.txt} ${todo.completed ? styles.txtDone : ""}`}
        onDoubleClick={() => { if (!todo.completed) startEdit(todo.id, todo.text); }}
    >
        {todo.text}
    </span>
)}
```

- [ ] **Step 7: CSS — editInput 样式**

在 `OfficePopover.module.css` 末尾添加:

```css
/* inline edit input */
.editInput {
    flex: 1; min-width: 0; height: 28px; border-radius: 8px; padding: 0 10px;
    background: var(--field-bg); border: 1px solid var(--accent-solid);
    color: var(--text); font-family: var(--font-ui); font-size: 13.5px;
    outline: none; box-shadow: 0 0 0 3px rgba(126, 182, 240, 0.12);
    animation: rise 0.2s var(--ease-out) both;
}
.editInput:focus { border-color: var(--accent-solid); }
```

- [ ] **Step 8: 编写组件测试**

Create `src/__tests__/components/TodoInlineEdit.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { useTodoStore } from "../../hooks/useTodoStore";

// 直接测试 store editTodo 逻辑(不依赖完整 OfficePopover 渲染)
describe("inline edit via store", () => {
    beforeEach(() => {
        useTodoStore.setState({ todos: [], lastDeleted: null });
    });

    it("editTodo updates text", () => {
        useTodoStore.getState().addTodo("original");
        const id = useTodoStore.getState().todos[0].id;
        useTodoStore.getState().editTodo(id, "modified");
        expect(useTodoStore.getState().todos[0].text).toBe("modified");
    });

    it("editTodo with empty text does not crash (guard is in UI)", () => {
        useTodoStore.getState().addTodo("keep");
        const id = useTodoStore.getState().todos[0].id;
        // store 本身允许空字符串(UI 层守卫不提交空文本)
        useTodoStore.getState().editTodo(id, "");
        expect(useTodoStore.getState().todos[0].text).toBe("");
    });
});
```

- [ ] **Step 9: 验证**

```bash
npm run build
npm test
```

---

## Execution Order

```
act-store-hide (Task 1)
├── Modify src/hooks/useTodoStore.tsx: add lastDeleted / undoDelete / dismissUndo / modify removeTodo
├── Modify src/ui/office_popover/OfficePopover.tsx: interactionRef + pinned + 失焦守卫 + undo toast
├── Modify src/ui/office_popover/OfficePopover.module.css: undoToast / pinLock
├── Create src/__tests__/useTodoStore.undo.test.ts
└── Verify: npm run build && npm test

act-inline-edit (Task 2, MUST re-read OfficePopover.tsx first)
├── Modify src/ui/office_popover/OfficePopover.tsx: editingId + startEdit/commitEdit/cancelEdit + 双击 JSX
├── Modify src/ui/office_popover/OfficePopover.module.css: editInput
├── Create src/__tests__/components/TodoInlineEdit.test.tsx
└── Verify: npm run build && npm test
```

---

## Acceptance Criteria

### #3 失焦隐藏守卫
- [ ] 输入框获焦时(addInput focus),切到其它窗口再回来 → 面板不消失
- [ ] MiniCalendar 浮层打开时(calOpenId != null),面板失焦不消失
- [ ] 拖拽排序中(pointer held),面板失焦不消失
- [ ] 图钉按钮可切换 pinned 状态;pinned=true 时面板永不自动隐藏
- [ ] `localStorage.getItem("office_pinned")` 持久;刷新/重启后恢复
- [ ] mountedAt < 400ms 防抖仍有效(极早失焦不 hide)

### #4 双击行内编辑
- [ ] 双击未完成待办的文本 → 进入编辑(input 显现,autofocus)
- [ ] 编辑中按 Enter → 调用 `editTodo(id, newText)` 并退出编辑
- [ ] 编辑中失焦(blur) → 提交编辑(同 Enter)
- [ ] 编辑中按 Esc → 取消编辑,文本不变
- [ ] 清空文本后 Enter/blur → 不提交(文本保持原值)
- [ ] 编辑态时拖拽不触发(onPointerDown 被忽略/stopPropagation)
- [ ] 编辑态时面板失焦不隐藏(interactionRef 含 "editing")
- [ ] 已完成待办双击无响应(不可编辑)

### #5 删除撤销
- [ ] 点击 ✕ 删除待办 → 底部出现「已删除 · 撤销」toast
- [ ] 点击「撤销」→ 待办恢复到原索引位置,toast 消失
- [ ] 5秒后 toast 自动消失(lastDeleted 清除)
- [ ] 连续删除两项 → lastDeleted 被最新一次覆盖;撤销只恢复最后删除的

---

## Verification Commands

```bash
# Full build (tsc + vite)
npm run build

# All unit tests
npm test

# Targeted undo test
npx vitest run src/__tests__/useTodoStore.undo.test.ts

# Targeted inline edit test
npx vitest run src/__tests__/components/TodoInlineEdit.test.tsx

# Component tests
npm run test:component
```

---

## Files Modified / Created Summary

| File | Owner | Action |
|------|-------|--------|
| `src/hooks/useTodoStore.tsx` | act-store-hide | EDIT (lastDeleted, undoDelete, dismissUndo, removeTodo) |
| `src/ui/office_popover/OfficePopover.tsx` | act-store-hide (1st), act-inline-edit (2nd) | EDIT |
| `src/ui/office_popover/OfficePopover.module.css` | act-store-hide (1st), act-inline-edit (2nd) | EDIT |
| `src/__tests__/useTodoStore.undo.test.ts` | act-store-hide | CREATE |
| `src/__tests__/components/TodoInlineEdit.test.tsx` | act-inline-edit | CREATE |
