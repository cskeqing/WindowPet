# WindowPet 优化 Backlog

> 用户视角的优化清单。按优先级顺序处理,每项走「1 判断 agent + 2 行动 agent」Superpowers 流水线:
> judge-design → act-A → act-B(串行改共享文件)→ judge-verify(构建+测试+验收,NEEDS_CHANGES 回环)。
> 工作分支:`feat/focus-reliability`(后续可拆分)。改动累积在分支上,合并前需人工审。

## 状态图例
- ✅ done(已构建+测试+评审通过)
- 🔄 in-progress
- ⬜ todo

---

## 已完成

- ✅ **#1 番茄钟完成改用系统通知** — 新建 `src/utils/focusNotify.ts`;`useFocusStore.tick()` 两处替换;`tauri.conf.json`/`Cargo.toml` 开权限。
- ✅ **#2 统计时区一致性 bug** — 新建 `src/utils/date.ts` `localDateStr()`;`useFocusStore` 6 处 UTC→本地;`OfficePopover`/`MiniCalendar` 去重。
- ✅ **#3 面板失焦即隐藏,易误关** — `interactionRef` 守卫(输入/日历/拖拽/编辑中不隐藏)+ 图钉固定(localStorage),保留防抖。
- ✅ **#4 待办行内编辑** — 双击进入,Enter/失焦提交、Esc 取消、空文本不提交,编辑中不触发拖拽/隐藏。
- ✅ **#5 删除撤销** — `useTodoStore` lastDeleted+undoDelete(),面板内 5s「已删除·撤销」提示,恢复原位置。
- ✅ **#6 AI 话术 TTL 缓存** — `useGanyuTip` 指纹用量化时间窗口 `nowWindow`,模块级 3min TTL 缓存,命中不重发;回落/中止行为不变。
- ✅ **#10 reset petBinding 一致性** — `reset()` 的 emit 加 `enablePetBinding` 守卫,与 start/pause/skip 一致。
- ✅ **#8 甘雨文案 i18n** — OfficePopover/MiniCalendar 共 30 处中文 key 化为 `office.*`,截止/日历标签改插值,补齐 en/kh/zh-CN/zh-TW;zh-CN 文案不变。
- ✅ **#7 API Key 明文披露** — `GanyuAiSettings` 加明文存储警示 `Alert`(走 i18n,四语言)。

---

## 待决策

- ⏸ **#9 资源体积偏大** — `public/media/Nahida.png` 5MB 等。**风险**:它们是 `frameSize` 精灵图,改尺寸会破坏动画,只能做"保持尺寸的无损/调色板重压缩"。本机无 `pngquant`,仅 `sips`(无损收益有限)。需先决定:是否安装 `pngquant`/`oxipng` 做有损调色板压缩(保尺寸),压后须逐只验证动画无错位。**未执行,待用户拍板。**

---

## 待办(按优先级)
（已清空 — 除 #9 待决策外,清单完成）

---

## 备注
- 真正有价值的项有限,清单清空即应停止,不为改而改。
- 无人值守不自动合并;每批完成后人工审 / 提交 / PR。
