# 技术设计文档 —— 办公伴侣（Office Companion）

## 1. 概述

基于已定稿的需求文档（v1.0），本文档定义办公伴侣功能的技术架构、组件、数据模型和实施路线。

**MVP 范围**：番茄钟计时器 + 宠物状态联动 + 阶段切换提醒 + 办公标签页 + 待办清单 + 简化版统计（今日番茄数 + 累计时长）。

**核心技术决策**：
| 决策 | 选择 | 理由 |
|---|---|---|
| 宠物状态映射 | 自动语义映射 + 回退 | 零配置、可扩展 |
| 提醒通道 | 应用内通知（Mantine） | 不增加 Tauri 权限 |
| 配置文件 | 独立 `office.json` | 与现有设置解耦 |
| 计时精度 | 基于时间戳差值 | 抗休眠/抗 tab 冻结 |

---

## 2. 架构概览

```
┌──────────────────────────────────────────────────────────────────┐
│                      Setting Window (React)                       │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌───────────┐  │
│  │ Office Tab │  │ FocusTimer │  │  TodoList  │  │   Stats   │  │
│  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘  └─────┬─────┘  │
│        │                │               │               │        │
│        └────────────────┴───────────────┴───────────────┘        │
│                                │                                  │
│                    useFocusStore (zustand)                        │
│                    useTodoStore  (zustand)                        │
│                                │                                  │
│              emitUpdatePetsEvent (跨窗口事件)                      │
└────────────────────────────────┼─────────────────────────────────┘
                                 │ EventType.SettingWindowToPetOverlay
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│                  Pet Overlay Window (Phaser)                       │
│                                                                   │
│    Pets.ts ─── 监听 DispatchType.FocusPhaseChange                │
│           └── mapPhaseToState(phase, pet.availableStates)         │
│           └── switchState(targetState)                            │
└──────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│              Tauri Backend (Rust)                                  │
│                                                                   │
│    conf.rs ─── if_app_config_does_not_exist_create_default        │
│           └── 新增 "office.json" 分支                             │
└──────────────────────────────────────────────────────────────────┘
```

**数据流方向**：
1. 用户在 Office Tab 点击"开始" → `useFocusStore` 启动计时
2. 阶段切换 → `emitUpdatePetsEvent` 携带新阶段 → 宠物窗口接收
3. `Pets.ts` 依据阶段 → 调用语义映射 → `switchState` 切换动画
4. 配置 / 统计 / 待办通过 `tauri-plugin-store` 读写 `office.json`

---

## 3. 组件设计

### 3.1 FocusTimer（番茄钟核心）

**职责**：管理计时生命周期（idle → working → shortBreak → longBreak → idle）

**状态机**：
```
         start()
  IDLE ─────────► WORKING
   ▲                  │ timeUp
   │ reset()          ▼
   │           SHORT_BREAK / LONG_BREAK
   │                  │ timeUp
   └──────────────────┘ (next round or complete)
         ▲ pause()/resume() 可在任意运行态调用
```

**实现要点**：
- 用 `setInterval(1000)` 每秒更新 UI 显示
- **实际阶段判断用时间戳差值**：`endTime = Date.now() + duration * 1000`，每 tick 计算 `remaining = endTime - Date.now()`，避免 tab 冻结/休眠后累计误差
- 暂停时记录 `pausedRemaining`，恢复时重算 `endTime`

### 3.2 useFocusStore（zustand）

```typescript
interface FocusState {
  // 配置
  workDuration: number;       // 秒，默认 1500 (25min)
  shortBreakDuration: number; // 秒，默认 300 (5min)
  longBreakDuration: number;  // 秒，默认 900 (15min)
  longBreakInterval: number;  // 默认 4
  enablePetBinding: boolean;  // 默认 true
  enableNotification: boolean;// 默认 true

  // 运行态
  phase: 'idle' | 'working' | 'shortBreak' | 'longBreak';
  remaining: number;          // 当前阶段剩余秒数
  completedPomodoros: number; // 当前会话已完成轮次
  isPaused: boolean;

  // 统计（今日）
  todayPomodoros: number;
  todayFocusSeconds: number;
  statsDate: string;          // "YYYY-MM-DD"，跨日归零

  // Actions
  start: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  tick: () => void;           // 由 setInterval 调用
  loadConfig: () => Promise<void>;
  saveConfig: () => void;
}
```

### 3.3 useTodoStore（zustand）

```typescript
interface TodoItem {
  id: string;           // crypto.randomUUID()
  text: string;
  completed: boolean;
  createdAt: number;    // Date.now()
  isCurrent: boolean;   // 标记为"当前任务"
}

interface TodoState {
  todos: TodoItem[];
  
  addTodo: (text: string) => void;
  toggleTodo: (id: string) => void;
  editTodo: (id: string, text: string) => void;
  removeTodo: (id: string) => void;
  setCurrent: (id: string) => void;
  clearCompleted: () => void;
  loadTodos: () => Promise<void>;
  saveTodos: () => void;
}
```

### 3.4 宠物状态语义映射

```typescript
// src/utils/focusPetMapping.ts

const WORK_STATES = ['sit', 'stand', 'sleep', 'idle'];   // 安静类
const BREAK_STATES = ['walk', 'greet', 'jump', 'crawl']; // 活跃类
const CELEBRATE_STATES = ['greet', 'jump'];               // 庆祝类

/**
 * 从宠物可用状态中选择第一个匹配语义的状态
 * 找不到则回退 availableStates[0]
 */
function mapPhaseToState(
  phase: 'working' | 'shortBreak' | 'longBreak' | 'celebrate',
  availableStates: string[]
): string {
  const pool = phase === 'celebrate' ? CELEBRATE_STATES
    : phase === 'working' ? WORK_STATES
    : BREAK_STATES;
  
  return pool.find(s => availableStates.includes(s))
    ?? availableStates[0];
}
```

**验证**：以 Ayaka 为例（states: climb, crawl, drag, fall, greet, jump, sit, stand, walk）
- 工作 → `sit`（命中 WORK_STATES[0] = sit ✓）
- 休息 → `walk`（命中 BREAK_STATES[0] = walk ✓）
- 庆祝 → `greet`（命中 CELEBRATE_STATES[0] = greet ✓）

---

## 4. 数据模型

### 4.1 office.json（持久化配置 + 统计）

```json
{
  "app": {
    "focus": {
      "workDuration": 1500,
      "shortBreakDuration": 300,
      "longBreakDuration": 900,
      "longBreakInterval": 4,
      "enablePetBinding": true,
      "enableNotification": true
    },
    "stats": {
      "date": "2026-06-09",
      "todayPomodoros": 0,
      "todayFocusSeconds": 0
    },
    "todos": []
  }
}
```

### 4.2 TodoItem 持久化结构

```json
{
  "id": "uuid-v4",
  "text": "完成设计文档",
  "completed": false,
  "createdAt": 1749484800000,
  "isCurrent": true
}
```

### 4.3 Rust 端默认配置

新增文件 `src-tauri/src/app/default/office.json`：
```json
{
  "focus": {
    "workDuration": 1500,
    "shortBreakDuration": 300,
    "longBreakDuration": 900,
    "longBreakInterval": 4,
    "enablePetBinding": true,
    "enableNotification": true
  },
  "stats": {
    "date": "",
    "todayPomodoros": 0,
    "todayFocusSeconds": 0
  },
  "todos": []
}
```

并在 `conf.rs` 的 `if_app_config_does_not_exist_create_default` 函数增加 `"office.json"` 分支。

---

## 5. 接口定义

### 5.1 新增 DispatchType

```typescript
// src/types/IEvents.ts 新增
export enum DispatchType {
  // ... 现有 ...
  FocusPhaseChange = 'Focus phase change',      // 阶段切换
  FocusTodoCelebrate = 'Focus todo celebrate',  // 完成待办庆祝
}
```

### 5.2 跨窗口事件 payload

```typescript
// 阶段切换事件
{
  dispatchType: DispatchType.FocusPhaseChange,
  value: 'working' | 'shortBreak' | 'longBreak' | 'idle'
}

// 待办完成庆祝事件
{
  dispatchType: DispatchType.FocusTodoCelebrate,
  value: true
}
```

### 5.3 Pets.ts 事件监听（伪代码）

```typescript
// 在现有 event listener 的 switch 中追加
case DispatchType.FocusPhaseChange: {
  const phase = payload.value as string;
  if (phase === 'idle') {
    // 恢复随机行为
    this.resumeRandomBehavior();
  } else {
    const targetState = mapPhaseToState(phase, pet.availableStates);
    this.switchState(pet, targetState, { repeat: -1 });
    // 暂停随机状态切换
    pet.canPlayRandomState = false;
  }
  break;
}

case DispatchType.FocusTodoCelebrate: {
  const celebrateState = mapPhaseToState('celebrate', pet.availableStates);
  this.switchState(pet, celebrateState, { repeat: 2 });
  // 播完后恢复当前阶段状态
  break;
}
```

---

## 6. 事件流（时序）

```
用户点击"开始专注"
  │
  ├─► useFocusStore.start()
  │     ├─ phase = 'working'
  │     ├─ endTime = now + workDuration
  │     └─ setInterval(tick, 1000)
  │
  ├─► emitUpdatePetsEvent({ FocusPhaseChange, 'working' })
  │     └─► Pets.ts: 所有宠物 → sit/stand (安静)
  │
  └─► 计时运行中...
        │
        ├─ remaining === 0
        │   ├─ completedPomodoros++
        │   ├─ todayPomodoros++, todayFocusSeconds += workDuration
        │   ├─ showNotification("工作完成，开始休息！")
        │   ├─ phase = 'shortBreak' (or 'longBreak')
        │   ├─ emitUpdatePetsEvent({ FocusPhaseChange, 'shortBreak' })
        │   │     └─► Pets.ts: 宠物 → walk/greet (活跃)
        │   └─ saveConfig() → office.json
        │
        ├─ 休息 remaining === 0
        │   ├─ showNotification("休息结束，继续专注！")
        │   ├─ phase = 'working' (下一轮)
        │   └─ emitUpdatePetsEvent({ FocusPhaseChange, 'working' })
        │
        └─ 用户点击"重置"
            ├─ clearInterval
            ├─ phase = 'idle'
            └─ emitUpdatePetsEvent({ FocusPhaseChange, 'idle' })
                  └─► Pets.ts: 恢复 canPlayRandomState = true
```

---

## 7. 错误处理

| 场景 | 策略 |
|---|---|
| `office.json` 不存在 | Rust 端 `if_app_config_does_not_exist_create_default` 自动创建默认配置 |
| `office.json` 格式损坏 | `loadConfig` 捕获 JSON 解析异常，回退到内存中默认值，并 log error |
| 宠物无法匹配任何语义状态 | `mapPhaseToState` 回退到 `availableStates[0]`，永远不会返回 undefined |
| 计时器 tab 冻结/休眠唤醒 | 基于时间戳差值，下一 tick 自动修正；如已超时则立即触发阶段切换 |
| 跨窗口事件发送失败（宠物窗口已关闭/pause） | `WebviewWindow.getByLabel('main')` 返回 null 时静默跳过，不阻塞计时 |
| Store 保存失败 | 捕获异常，showNotification 提示用户，不影响运行态 |
| 待办清单为空时点击"清除已完成" | 无操作，按钮可 disabled 或静默跳过 |

---

## 8. UI 布局规划

### 8.1 标签页注册

在 `ESettingTab` enum 中新增 `Office = 5`（排在 About 后面），对应图标 `IconClock` 或 `IconTargetArrow`。

在 `SettingWindow.tsx` 的 `settingTabs` 数组中新增：
```typescript
{
  Component: OfficeMemo,
  title: t("Office Companion"),
  description: t("Focus timer, pet companion, and todo list"),
  Icon: <IconTargetArrow size="1rem" />,
  label: t('Office'),
  tab: ESettingTab.Office,
}
```

### 8.2 Office Tab 内部布局

```
┌─────────────────────────────────────────────────────────────┐
│  Title: "Office Companion"                                   │
│  Description: "Focus timer, pet companion, and todo list"    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────── Focus Timer Card ───────────────────────────────┐ │
│  │                                                         │ │
│  │        ⏱ 24:32          (大号倒计时显示)               │ │
│  │        Working           (当前阶段标签)                 │ │
│  │    ● ● ● ○              (番茄轮次指示点)               │ │
│  │                                                         │ │
│  │  [▶ Start]  [⏸ Pause]  [⟲ Reset]                      │ │
│  │                                                         │ │
│  │  📋 当前任务: 完成设计文档                              │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌─────── Today Stats ────────────────────────────────────┐ │
│  │  🍅 3 pomodoros     ⏱ 1h 15m focused                  │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌─────── Todo List ──────────────────────────────────────┐ │
│  │  [+ Add task...]                                        │ │
│  │  ☐ 完成设计文档              ★(current)    [✕]        │ │
│  │  ☑ 复审需求                                 [✕]        │ │
│  │  ☐ 写单测                                   [✕]        │ │
│  │                                                         │ │
│  │  2/3 completed     [Clear completed]                    │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌─────── Settings ───────────────────────────────────────┐ │
│  │  Work duration        [25] min                          │ │
│  │  Short break          [ 5] min                          │ │
│  │  Long break           [15] min                          │ │
│  │  Long break after     [ 4] pomodoros                    │ │
│  │  Pet state binding    [toggle ✓]                        │ │
│  │  Notifications        [toggle ✓]                        │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**Mantine 组件选型**：
- 计时器显示：`Text` + `Badge`（阶段标签）
- 按钮：`Button` / `ActionIcon`
- 统计：`Group` + `Text`
- 待办：`TextInput` + `Checkbox` + `ActionIcon`（删除）+ `Badge`（current）
- 设置：`NumberInput` + `Switch`（复用现有 `SettingSwitch` 模式）
- 整体卡片：`Paper` with shadow

### 8.3 响应式与主题

- 所有颜色使用 Mantine theme tokens，自动适配 dark/light
- 计时器数字使用 `fontFamily: 'monospace'` 保证等宽不跳动
- 布局 Mantine `Stack` 纵向排列，内部 `Group` 横向

---

## 9. 测试策略

### 9.1 单元测试（Vitest）

| 模块 | 测试点 |
|---|---|
| `mapPhaseToState` | 各阶段 × 不同 availableStates 组合，含回退场景 |
| `useFocusStore` | start/pause/resume/reset 状态转移正确性；tick 逻辑；跨日归零 |
| `useTodoStore` | CRUD、setCurrent、clearCompleted |
| 计时精度 | mock Date.now 模拟 tab 冻结后恢复 |

### 9.2 集成测试

| 场景 | 验证 |
|---|---|
| 办公标签页渲染 | 使用 Testing Library 确认计时器、待办、配置区域正确渲染 |
| 事件派发 | mock `WebviewWindow.getByLabel` 验证 `emitUpdatePetsEvent` 被正确调用 |
| 持久化 | mock `tauri-plugin-store-api` 验证 office.json 读写 |

### 9.3 手动验收测试

- 完整番茄轮次 × 宠物状态切换（视觉验证）
- 休眠/唤醒后计时器修正
- 日期跨越后统计归零
- 多宠物同时联动

---

## 10. 实施计划（任务分解）

### Phase 1：基础设施（~1 天）
1. Rust 端添加 `office.json` 默认配置与初始化
2. 新建 `src/types/IOffice.ts` 类型定义
3. 新建 `src/hooks/useFocusStore.tsx`
4. 新建 `src/hooks/useTodoStore.tsx`
5. `IEvents.ts` 新增 `DispatchType`

### Phase 2：番茄钟核心 + 宠物联动（~1.5 天）
6. 新建 `src/utils/focusPetMapping.ts`（语义映射）
7. `Pets.ts` 增加事件监听与状态切换逻辑
8. 实现 `useFocusStore` 的 tick/状态机逻辑
9. 单测覆盖 store 和 mapping

### Phase 3：UI 实现（~1.5 天）
10. 新建 `src/ui/setting_tabs/Office.tsx`（FocusTimer + Stats + TodoList + Settings 区域）
11. `ISetting.ts` 增加 `ESettingTab.Office`
12. `SettingWindow.tsx` 注册办公标签页
13. 国际化：`src/locale/*` 添加办公相关文案
14. 主题适配验证

### Phase 4：集成 & 测试 & 打磨（~1 天）
15. 接入 `showNotification` 实现阶段提醒
16. 集成测试
17. 手动端到端验收
18. Code review & 修复

**总估时**：~5 天

---

## 11. 技术决策记录

### Decision: 计时器实现方式

**Context:** 番茄钟需要在应用窗口可能被冻结/休眠的环境下保持准确。

**Options:**
1. **纯 setInterval 累加** — 简单但 tab 冻结后偏差累积
2. **时间戳差值 + setInterval 刷新 UI** — 用 `endTime - Date.now()` 计算剩余，interval 只负责触发 UI 重绘

**Decision:** Option 2
**Rationale:** Tauri 窗口可能因系统休眠或用户最小化而被冻结。时间戳方式天然抗冻结，唤醒后第一个 tick 即可修正。

### Decision: 状态映射策略

**Context:** 不同宠物 `availableStates` 不一致，需要可靠地将专注阶段映射到动画。

**Options:**
1. **硬编码映射表** — 每个宠物单独配置
2. **语义列表 + 回退** — 维护语义优先级列表，取第一个可用状态
3. **用户手动配置** — UI 里让用户选

**Decision:** Option 2
**Rationale:** 零配置，覆盖所有现有 50+ 宠物无需额外操作。所有宠物至少有 `stand`/`walk`/`sit` 中的一个，回退到 `availableStates[0]` 确保不会出错。后续可叠加 Option 3 作为高级选项。

---

*文档状态：v1.0 —— 待审阅确认后进入实施。*
