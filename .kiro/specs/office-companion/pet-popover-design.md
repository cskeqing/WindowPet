# 技术设计文档 —— 点击桌宠弹出办公气泡浮窗（Pet Office Popover）

> 父规格:`office-companion`(见同目录 `requirements.md` / `design.md`)。本文档是其交互增量:把「办公伴侣」的待办与专注能力,通过**点击桌宠**就地呼出一个 **macOS 风格毛玻璃气泡浮窗**,无需打开设置窗口。
>
> 视觉小样(已评审认可方向 A):`./mockups/pet-popover.html`

---

## 1. 概述

### 1.1 目标
- 点击桌宠 → 在宠物身旁弹出一个贴合 macOS 设计语言的**气泡浮窗**,可直接写待办、看/控专注计时。
- 体验"就地、灵动、不打断",作为与普通番茄钟 App 的差异点。
- 复用既有 `useFocusStore` / `useTodoStore` / `office.json` / 宠物联动事件,不重复造轮子。

### 1.2 范围
- **多宠物能力保留**:产品仍支持多只宠物的添加/管理,本次不裁剪。
- **办公功能按单宠物设计**:浮窗与专注体验以"单只宠物"为基准设计;多宠物时按 §5.3 的规则优雅降级(点哪只从哪只弹、联动作用于全部宠物,不引入按宠物隔离的办公状态)。

### 1.3 非目标(本增量不做)
- 不改动设置窗口现有 Office 标签页的功能(它继续作为"完整管理"入口存在)。
- 不做多设备同步、复杂任务管理、第三方集成(沿用父规格的 Out of Scope)。

---

## 2. 视觉设计语言(macOS Vibrancy / Refined-Cozy)

以视觉小样 `mockups/pet-popover.html` 为视觉基准,设计令牌如下(实现时落到 CSS 变量,支持明/暗):

| 维度 | 规范 |
|---|---|
| 字体 | 标题 `ui-serif/"New York"`、计时器 `ui-rounded/"SF Pro Rounded"`、正文 `-apple-system/"SF Pro Text"`(Apple 原生、离线可渲染,避免通用 AI 风) |
| 毛玻璃 | `backdrop-filter: blur(42px) saturate(180%)` + 1px 高光内描边 + 多层柔影 + 26px 圆角(真机用原生 vibrancy,见 §8) |
| 强调色 | 暖珊瑚渐变 `#ffb27a → #ff7d72`(与宠物冷蓝撞色,提高记忆点) |
| 暗色玻璃 | `rgba(28,27,34,0.55)`;亮色玻璃 `rgba(252,251,253,0.60)` |
| 动效 | 入场弹簧 `cubic-bezier(0.34,1.56,0.64,1)`:浮窗 `scale(0.94)+translateY` 弹入,内容 stagger 上浮;按钮/勾选 micro-interaction;指向宠物的小尖角 |
| 信息层级 | 头部问候(随时间)→ 专注环(主视觉)→ 快速加待办 → 任务列表 → 今日统计 |

浮窗尺寸基准 **332px 宽**,内容高度自适应(预留窗口 ~360×540,见 §5.1)。

---

## 3. 架构概览

```
┌────────────── 覆盖层窗口 "main" (Phaser, 透明全屏点击穿透) ──────────────┐
│  Pets.ts                                                                │
│   • gameobjectup 中以 pointer.getDistance() 阈值区分「点击 vs 拖拽」      │
│   • 点击 → 计算该宠物的屏幕坐标(含 devicePixelRatio)                    │
│   • invoke('show_office_popover', { x, y })                              │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ Tauri command
                                ▼
┌────────────── Rust (src-tauri) ──────────────┐
│  cmd/utils: show_office_popover(app, x, y)    │
│   • 取或建 "office-popover" 窗口(无边框/透明/ │
│     置顶/skipTaskbar/不可缩放)                │
│   • 应用 vibrancy(mac)/acrylic(win)        │
│   • 按 (x,y) 定位 + 屏幕边缘 clamp            │
│   • show + set_focus                          │
└───────────────────────────────┬───────────────┘
                                │ WindowUrl::App("/office-popover")
                                ▼
┌────────────── 弹窗窗口 "office-popover" (React) ──────────────┐
│  OfficePopover  (自定义 CSS 还原 Mac 毛玻璃视觉)              │
│   • 复用 useFocusStore / useTodoStore                        │
│   • 显示时 loadConfig()/loadTodos() 从 office.json 拉最新     │
│   • 编辑 → 持久化 office.json + 广播 OfficeDataChanged        │
│   • 失焦 appWindow.hide()(保活不销毁,保证计时器续跑)        │
└───────────────────────────────┬───────────────────────────────┘
                                │ emitUpdatePetsEvent (既有)
                                ▼
                     宠物联动(FocusPhaseChange / FocusTodoCelebrate)
                                ▲
                                │ OfficeDataChanged(新增,双向 reload)
                     设置窗口 "setting" Office 标签页(若同时开着则刷新)

数据真相源:office.json(tauri-plugin-store),三窗口共享读写。
```

**数据流要点**
1. 点击宠物 → Rust 呼出/聚焦浮窗(带屏幕定位)。
2. 浮窗显示即从 office.json 重载,保证与设置窗口/上次状态一致。
3. 浮窗内开始/暂停专注 → 既有 `FocusPhaseChange` 驱动宠物联动;勾选待办 → `FocusTodoCelebrate` 触发庆祝。
4. 浮窗或设置窗口的任一编辑 → 写 office.json + 广播 `OfficeDataChanged` → 另一窗口若开着则 reload(保持一致)。

---

## 4. 交互触发(覆盖层 `Pets.ts`)

### 4.1 点击 vs 拖拽
宠物已是 `setInteractive({ draggable: true, pixelPerfect: true })`,现仅处理 `drag`/`dragend`。新增点击识别,**不破坏拖拽**:

```ts
// 伪代码:在 create() 注册
this.input.on('gameobjectup', (pointer, gameObject) => {
  // 按下到抬起位移很小 ⇒ 视为点击;否则是拖拽,忽略
  if (pointer.getDistance() < CLICK_DISTANCE_THRESHOLD) {  // 建议 6px
    this.onPetClicked(gameObject as Pet);
  }
});
```

- 抽出纯函数 `isPetClick(distance: number, threshold = 6): boolean` 便于单测。
- **触发方式默认单击**(见 §13 开放问题,可改双击)。

### 4.2 计算宠物屏幕坐标
覆盖层窗口位于 (0,0) 全屏,游戏世界坐标 ≈ 屏幕逻辑坐标。需考虑缩放:

```ts
const dpr = window.devicePixelRatio || 1;
// 锚点:宠物可见包围盒的右上方
const bounds = pet.getBounds();
const screenX = bounds.right * dpr;        // 物理像素,交给 Rust 定位
const screenY = bounds.top * dpr;
invoke('show_office_popover', { x: screenX, y: screenY });
```

### 4.3 约束
- 点击宠物依赖设置项 **`allowPetInteraction` 为开**(关闭时覆盖层完全穿透,点不到宠物)。本次不改该机制;文档明确此前置条件。
- `allowPetInteraction` 关闭时,办公浮窗仍可经"系统托盘 → 设置窗口 Office 标签"使用,不影响核心。

---

## 5. 弹窗窗口设计

### 5.1 窗口属性("office-popover")
| 属性 | 值 | 说明 |
|---|---|---|
| url | `/office-popover` | 新增 React 路由 |
| decorations | false | 无边框,自绘 Mac 圆角 |
| transparent | true | 配合 vibrancy/圆角 |
| always_on_top | true | 浮于桌面之上 |
| skip_taskbar | true | 不进任务栏/Dock |
| resizable | false | 固定尺寸 |
| inner_size | ~360×540 | 容纳浮窗 + 阴影留白 |
| focusable | true | 输入框需要键盘焦点 |

### 5.2 定位与边缘 clamp
- 默认锚定在宠物右侧、垂直居中偏上(尖角指向宠物)。
- 若右侧/下方超出屏幕工作区 → 翻转到左侧 / 上移,保证完整可见(尖角方向随之调整)。
- 多显示器:按宠物所在显示器的工作区做 clamp(用 Tauri `available_monitors` / `current_monitor`)。

### 5.3 单宠物设计 + 多宠物降级
- **单宠物(推荐设置)**:浮窗锚定该唯一宠物,体验最佳。
- **多宠物**:点哪只就锚定哪只弹出;同一时刻只存在一个浮窗实例(再点别的宠物则移动到新位置并重载)。专注阶段的宠物联动**作用于全部宠物**(沿用父规格 需求2.6),不引入按宠物隔离的办公状态。

### 5.4 生命周期与失焦收起
- **保活不销毁**:首次创建后,后续点击走"重定位 + show + focus";失焦(`appWindow.onFocusChanged` 为失焦)→ `appWindow.hide()`。
- 选择 hide 而非 close 的关键原因:**浮窗内运行的专注计时器(`setInterval`)需要在浮窗收起后继续走**(见 §7.2)。
- vibrancy/acrylic 只在创建时应用一次,避免重复开销。

---

## 6. 组件设计(`/office-popover` → `OfficePopover`)

### 6.1 结构
移植视觉小样,拆为:
- `OfficePopover`(容器:玻璃卡片、尖角、入场动画、明暗主题、失焦 hide、显示时重载数据)
- `PopoverFocus`(专注环 + 计时 + 开始/暂停/重置/跳过;订阅 `useFocusStore`)
- `PopoverTodos`(快速加待办 + 列表 + 当前任务星标 + 今日统计;订阅 `useTodoStore`)

### 6.2 实现要点
- **自定义 CSS**(CSS Module / styled)还原 Mac 毛玻璃视觉,**不套用标准 Mantine 外观**(避免与既有组件默认风格冲突);可复用 Mantine 基础原语但需覆盖样式。
- `App.tsx` 新增路由(与 `/setting` 同样包一层 `MantineProvider`,主题令牌可抽公共常量复用)。
- 主题跟随 `office.json`/系统:首版默认跟随系统明暗(`prefers-color-scheme`),后续可加手动切换。
- 复用 `useFocusStore`/`useTodoStore`,**不复制计时/持久化逻辑**;浮窗只是这些 store 的另一个视图。

---

## 7. 跨窗口数据同步与计时器生命周期

### 7.1 数据同步
- **真相源**:`office.json`。三窗口(overlay/setting/popover)各自持有 store 实例(JS 上下文独立)。
- 新增同步事件 `OfficeDataChanged`:任一窗口写入 office.json 后广播;其他已打开窗口收到后 `loadTodos()/loadConfig()` reload。
- 浮窗**每次 show 时主动 reload**,覆盖"被隐藏期间他处修改"的情况(兜底,弱依赖广播)。

### 7.2 计时器归属(关键决策)
- 计时器 `setInterval` 跑在**启动它的那个窗口**。浮窗启动专注后,通过"hide 而非 close"保活,计时器持续走并发 `FocusPhaseChange` 驱动宠物。
- **兜底**:即便浮窗被彻底关闭/“Pause(释放内存)”关掉覆盖层,`runState` 已持久化;覆盖层重建时(`Pets.ts` 既有逻辑)会从 office.json 重新读 phase 并应用宠物联动(父规格 需求12)。
- 远期可选(本期不做):把计时器所有权移到常驻的覆盖层窗口,做到与任何 UI 窗口完全解耦,最稳。本期以"保活 + 时间戳持久化"达成可接受的健壮性,并在 §13 记录该取舍。

---

## 8. 跨平台毛玻璃降级

| 平台 | 方案 |
|---|---|
| macOS | `window-vibrancy` crate 的 `apply_vibrancy(NSVisualEffectMaterial::HudWindow/Popover)`(项目已开 `macOSPrivateApi`) |
| Windows | `apply_acrylic`/`apply_mica`(失败则回退半透明实色) |
| Linux | 无统一原生毛玻璃 → 回退**高不透明度实色玻璃**(`rgba` 提高到 ~0.9),其余视觉(圆角/描边/阴影/动效)保持一致 |

> 注:透明窗口上的 CSS `backdrop-filter` **不会**模糊窗口背后的桌面,真机毛玻璃必须用原生 vibrancy/acrylic;小样里能糊是因为背后有同页壁纸。降级时以原生为主、CSS 为辅。

---

## 9. 接口定义

### 9.1 Rust 命令(新增,注册进 `invoke_handler`)
```rust
#[tauri::command]
pub fn show_office_popover(app: tauri::AppHandle, x: f64, y: f64) { /* 取或建窗口→vibrancy→定位clamp→show+focus */ }
```
- 依赖新增:`Cargo.toml` 增加 `window-vibrancy`。

### 9.2 事件(`src/types/IEvents.ts`)
- 复用既有 `EventType.SettingWindowToPetOverlay` + `DispatchType.FocusPhaseChange / FocusTodoCelebrate`(宠物联动,已存在)。
- **新增** `EventType.OfficeDataChanged`(跨窗口数据一致性广播);payload 可携带变更域 `'todos' | 'focus' | 'stats'` 以便精确 reload。

### 9.3 前端窗口 API
- 浮窗内用 `@tauri-apps/api/window` 的 `appWindow.onFocusChanged` 监听失焦 → `appWindow.hide()`。
- `emitUpdatePetsEvent` 既有路径不变。

---

## 10. 错误处理与边界

| 场景 | 策略 |
|---|---|
| vibrancy 应用失败 | 记录 warn,回退半透明实色,不阻断窗口显示 |
| 定位越界/多屏 | 按目标显示器工作区 clamp;取不到显示器信息则退回主屏 |
| `allowPetInteraction` 关闭 | 点不到宠物属预期;经设置窗 Office 标签仍可用 |
| office.json 缺失/损坏 | 沿用既有 `loadConfig/loadTodos` 的 try/catch 回退默认值 |
| 浮窗已显示再次点击宠物 | 重定位到新宠物并保持单实例;不重复创建 |
| 写入竞态(浮窗与设置窗同时改) | 各 store 写入前先读 office.json 再 merge(父规格 需求11);`OfficeDataChanged` 收敛到最新落盘值 |
| 计时器 tab 冻结/休眠 | 既有时间戳差值 + tick 自修正,沿用 |

---

## 11. 国际化与主题
- 新增文案进 `src/locale` 全部 4 语言(en/kh/zh-CN/zh-TW),无硬编码英文;问候语等可本地化。
- 明/暗主题:首版跟随系统;令牌与设置窗主题一致(可抽公共主题常量)。
- 可访问性:输入框/按钮可键盘操作、有可读标签;失焦收起不打断键盘流。

---

## 12. 测试策略
- **单元**:`isPetClick(distance, threshold)` 阈值判定;屏幕坐标换算(给定 dpr/bounds → 期望 x,y);定位 clamp 纯函数(给定锚点+屏幕尺寸+窗口尺寸 → 期望位置与尖角方向)。
- **集成**:mock `invoke`,验证点击宠物触发 `show_office_popover` 且参数正确;mock store 验证显示时 reload。
- **手动验收**:
  1. 单击宠物弹出(首次创建 / 已存在重定位);拖拽不误触。
  2. 失焦自动收起;再点恢复且数据最新。
  3. 浮窗内开始专注 → 宠物切到安静态;勾选待办 → 宠物庆祝。
  4. 收起浮窗后计时器仍在走(保活验证);彻底关闭后覆盖层重建能恢复 phase。
  5. 浮窗与设置窗同开时编辑相互同步。
  6. 屏幕边缘/多屏定位正确;明暗主题与多语言正常。
  7. macOS 毛玻璃观感达标;(若可)Windows/Linux 降级正常。

---

## 13. 技术决策记录(ADR)与开放问题

### 已决策
- **独立弹窗窗口** 而非在覆盖层内渲染:可得原生毛玻璃、可靠键盘焦点、自然失焦收起;代价是定位与跨窗口同步(可控)。
- **方向 A(贴宠物气泡)** 而非独立大面板:差异点、灵动;用"窗口实现的浮窗"兼顾 B 的稳妥。
- **保活 hide-not-close** 维持计时器续跑;以时间戳持久化兜底。
- **office.json 单一真相源 + `OfficeDataChanged` 广播** 做三窗口一致性。

### 开放问题(请你拍板)
1. **触发方式**:单击(默认,带 6px 阈值)还是双击(更防误触,但少一点即时感)?
2. **浮窗内容范围**:首版是否同时含"完整专注计时 + 待办",还是先"待办为主 + 专注精简(仅开始/一瞥)"?(小样是前者)
3. **毛玻璃依赖**:同意引入 `window-vibrancy` crate 吗?(macOS 原生观感所需)
4. **主题**:首版跟随系统即可,还是要在浮窗上也放明/暗手动切换(小样有)?

---

*文档状态:v0.1 —— 待自检与用户评审后进入实现。*
