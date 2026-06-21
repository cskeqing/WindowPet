# Plan: AI Cache & Reset Consistency

> 分支: `feat/focus-reliability`
> 状态: 设计契约(不改源码)
> 日期: 2026-06-21

---

## 概览

两个独立优化,文件互不相交,可并行实施。

| # | 问题 | 方案 | 涉及文件 |
|---|------|------|----------|
| 6 | `useGanyuTip` 每次打开面板重新请求 LLM(nowISO 每次刷新导致指纹变化) | 模块级 TTL 缓存,缓存 key 对 nowISO 按时间窗口量化 | `src/hooks/useGanyuTip.tsx`(必要时 `src/services/tipService.ts`) |
| 10 | `useFocusStore.reset()` 无条件 emit `FocusPhaseChange:idle`,无视 `enablePetBinding` | reset 中 emit 前加 `config.enablePetBinding` 守卫 | `src/hooks/useFocusStore.tsx` |

---

## #6 — AI 话术 TTL 缓存

### 根因分析

`useGanyuTip` 中指纹计算包含 `ctx.nowISO`(每次调用 `buildContext()` 都取当前时间 ISO 字符串)。面板每次打开(组件重挂载)→ `nowISO` 变化 → fingerprint 变化 → effect 重新执行 → 发起新 LLM 请求。

### 设计

1. **时间窗口量化**:计算 fingerprint 时,将 `nowISO` 量化到 N 分钟窗口(例如 3 分钟),即 `quantizedMinute = Math.floor(Date.now() / (TTL_MS)) * TTL_MS`。同一窗口内多次打开面板 → 指纹相同 → effect 依赖不变 → 不重新请求。

2. **模块级结果缓存**(在 `useGanyuTip.tsx` 文件顶层):
   ```ts
   interface CacheEntry { fingerprint: string; tip: string; ts: number; }
   let tipCache: CacheEntry | null = null;
   const TTL_MS = 3 * 60 * 1000; // 3 分钟
   ```

3. **effect 内命中判断**:请求前检查 `tipCache`,若 `tipCache.fingerprint === fingerprint && Date.now() - tipCache.ts < TTL_MS`,则直接 `setText(tipCache.tip); setLoading(false); return;` 不发请求。

4. **缓存写入**:LLM 返回成功且 `result.ok` 时,更新 `tipCache = { fingerprint, tip: result.tip, ts: Date.now() }`。

5. **保留现有行为**:
   - 未启用/失败 → 仍回落 `fallback`,不写缓存。
   - 面板关闭(组件卸载)→ `controller.abort()` 中止迟到结果,与现有逻辑一致。
   - 阶段切换(phase 变化)→ fingerprint 中 `phase` 字段变化 → 缓存 miss → 正常请求。

6. **fingerprint 计算调整**(核心改动):
   ```ts
   // Before (每次打开都不同):
   nowISO: ctx.nowISO,
   
   // After (按 TTL 窗口量化):
   nowWindow: Math.floor(Date.now() / TTL_MS),
   ```

### 文件归属

- `src/hooks/useGanyuTip.tsx`:加 TTL 常量、CacheEntry 类型、模块级 `tipCache`、effect 内缓存命中逻辑、fingerprint 计算改用量化窗口。
- `src/services/tipService.ts`:无改动(网络逻辑不变)。

### 验收标准

| # | 标准 | 验证方式 |
|---|------|----------|
| A1 | 连续开关面板(< 3 min 内),LLM 只调用一次 | 在 `generateTip` 入口打断点/console.log,重复开关面板观察调用次数 |
| A2 | 超过 TTL 窗口后再开面板,发起新请求 | 等 ≥ 3 min 后再开,确认有新请求 |
| A3 | phase 切换(working→shortBreak)即使 < 3 min 也重新请求 | 因 phase 字段入指纹,指纹变化触发请求 |
| A4 | AI 未启用 / 失败时仍展示 fallback | 关闭 AI 开关验证;断网验证 |
| A5 | 面板关闭时 abort 迟到请求,不更新已卸载组件 state | React DevTools 无 "Can't perform state update on unmounted component" 警告 |
| A6 | 现有 vitest 测试通过 | `npx vitest run` |

---

## #10 — reset 受 enablePetBinding 控制

### 根因分析

`useFocusStore.tsx` 中:
- `start()`:有 `if (config.enablePetBinding) { emitUpdatePetsEvent(...) }`
- `skip()`:有 `if (config.enablePetBinding) { emitUpdatePetsEvent(...) }`
- `tick()`:有 `if (config.enablePetBinding) { emitUpdatePetsEvent(...) }`
- `loadConfig()`:有 `if (config.enablePetBinding) { emitUpdatePetsEvent(...) }`
- **`reset()`**:直接调用 `emitUpdatePetsEvent(...)`,无守卫 ← BUG

### 设计

将 `reset()` 中:
```ts
emitUpdatePetsEvent({ dispatchType: DispatchType.FocusPhaseChange, newValue: 'idle' });
```
改为:
```ts
if (config.enablePetBinding) {
    emitUpdatePetsEvent({ dispatchType: DispatchType.FocusPhaseChange, newValue: 'idle' });
}
```

一行守卫,与 `start`/`skip`/`tick` 模式完全一致。

### 文件归属

- `src/hooks/useFocusStore.tsx`:仅改 `reset` 方法内 1 处。

### 验收标准

| # | 标准 | 验证方式 |
|---|------|----------|
| B1 | `enablePetBinding = false` 时,reset 不 emit FocusPhaseChange | 在 `emitUpdatePetsEvent` 打断点,关闭联动后 reset,断点不命中 |
| B2 | `enablePetBinding = true` 时,reset 照常 emit idle | 开启联动后 reset,断点命中且 newValue = 'idle' |
| B3 | 其他方法(start/pause/skip/tick)行为不变 | 现有测试通过 |
| B4 | 构建通过 | `npm run build` |
| B5 | 现有测试通过 | `npx vitest run` |

---

## 验证命令(统一)

```bash
# 类型检查 + 构建
npm run build

# 单元测试
npx vitest run

# 针对 #6 的快速验证(若有对应测试文件)
npx vitest run src/__tests__/hooks/useGanyuTip

# 针对 #10 的快速验证(若有对应测试文件)
npx vitest run src/__tests__/hooks/useFocusStore
```

---

## 并行实施指引

| 执行单元 | 标识 | 改动文件 | 依赖 |
|----------|------|----------|------|
| act-ai-cache | #6 | `src/hooks/useGanyuTip.tsx` | 无 |
| act-reset-consistency | #10 | `src/hooks/useFocusStore.tsx` | 无 |

两者文件互不相交,无共享状态,可同时分发给并行 agent 实施。
