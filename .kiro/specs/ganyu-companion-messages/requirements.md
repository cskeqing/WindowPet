# Requirements Document

## Introduction

本功能为 WindowPet 桌宠应用的工作面板(Office Popover,点击宠物后弹出的番茄钟 + 待办面板)引入桌宠"甘雨"的人设文案体系。目标是把面板中现有的中性提示文案,替换为甘雨(温柔、勤勉、贴心的秘书人设)口吻的亲切、有陪伴感的中文文案,并在后续引入基于大语言模型(LLM)的个性化贴心提示。

功能分两个阶段交付:

- **阶段一(静态人设文案)**:将面板内现有的时段问候语、专注阶段状态标签、空状态、按钮提示、引导页等文案,改写为甘雨口吻的静态文案,通过现有 i18n 机制提供,不破坏多语言支持。
- **阶段二(AI 个性化贴心提示)**:引入 LLM,分析用户本地的待办记录、完成情况、专注统计、当前时段等"物理世界信息",在面板打开和阶段切换等时机生成个性化贴心提示。需覆盖数据来源、隐私保护、调用时机、失败降级与性能等约束。

本文档对两个阶段的需求均做出定义,但阶段二的实现以阶段一完成为前提。

## Glossary

- **Office_Popover**:工作面板组件(`src/ui/office_popover/OfficePopover.tsx`),宠物被点击后弹出,包含番茄钟与待办两个视图。
- **Ganyu_Persona**:桌宠"甘雨"的人设,文案风格定义为温柔、勤勉、贴心、有陪伴感的秘书口吻。
- **Static_Copy**:阶段一的静态人设文案,内容固定,通过 i18n 资源提供。
- **AI_Tip**:阶段二由 LLM 生成的个性化贴心提示文本。
- **Tip_Service**:阶段二负责构造提示词、调用 LLM、处理返回与降级的模块。
- **LLM_Provider**:可配置的大语言模型服务端点(含端点地址与 API key)。
- **i18n_System**:应用现有的多语言机制(i18next / react-i18next),通过 `t()` 函数按当前语言返回文案,资源位于 `src/locale/{lang}/translation.json`。
- **Focus_Phase**:专注阶段,取值为 `idle`(准备开始)、`working`(专注中)、`shortBreak`(小憩)、`longBreak`(长休息)之一。
- **Office_Data**:工作面板的本地数据存储(`office.json`),包含 `focus`(专注配置)、`stats`(今日专注统计:日期/番茄数/专注秒数)、`todos`(待办项数组)、`runState`(运行状态)。
- **Time_Segment**:基于当前时刻划分的时段(凌晨、早上、中午、下午、晚上)。
- **Ganyu_Settings**:本功能新增的可配置项集合(是否启用 AI 提示、LLM 端点、API key、隐私开关等)。
- **User**:使用桌宠应用的最终用户。

## Requirements

### Requirement 1:甘雨人设静态文案风格规范

**User Story:** 作为用户,我希望工作面板里的文案是甘雨口吻的亲切中文,这样我在使用番茄钟和待办时能感受到温柔的陪伴。

#### Acceptance Criteria

1. THE Office_Popover SHALL 使用符合 Ganyu_Persona 风格(温柔、勤勉、贴心、有陪伴感)的中文文案展示所有面向用户的提示性文本。
2. THE Static_Copy SHALL 采用第二人称"你"称呼 User,并以甘雨的第一人称"我"指代桌宠。
3. THE Static_Copy SHALL 在每条文案中只表达一个意图(一条问候、一条状态或一条提示)。
4. WHERE 某条 Static_Copy 是提示或鼓励性质,THE Static_Copy SHALL 使用陈述或邀请语气而非命令语气。
5. THE Static_Copy SHALL 保持每条文案在 30 个汉字以内,以适配面板的展示区域。

### Requirement 2:时段问候文案

**User Story:** 作为用户,我希望打开面板时甘雨能根据当前时间向我问好,这样每次打开都有被记挂的感觉。

#### Acceptance Criteria

1. WHEN Office_Popover 打开且当前小时数在 0 至 4(含)之间,THE Office_Popover SHALL 展示对应"凌晨"Time_Segment 的甘雨问候文案。
2. WHEN Office_Popover 打开且当前小时数在 5 至 10(含)之间,THE Office_Popover SHALL 展示对应"早上"Time_Segment 的甘雨问候文案。
3. WHEN Office_Popover 打开且当前小时数在 11 至 13(含)之间,THE Office_Popover SHALL 展示对应"中午"Time_Segment 的甘雨问候文案。
4. WHEN Office_Popover 打开且当前小时数在 14 至 17(含)之间,THE Office_Popover SHALL 展示对应"下午"Time_Segment 的甘雨问候文案。
5. WHEN Office_Popover 打开且当前小时数在 18 至 23(含)之间,THE Office_Popover SHALL 展示对应"晚上"Time_Segment 的甘雨问候文案。
6. THE Office_Popover SHALL 保留现有按 `new Date().getHours()` 计算时段的逻辑边界(5、11、14、18)。

### Requirement 3:专注阶段状态文案

**User Story:** 作为用户,我希望番茄钟的状态标签用甘雨口吻表达,这样专注与休息的切换更有温度。

#### Acceptance Criteria

1. WHILE Focus_Phase 为 `working`,THE Office_Popover SHALL 展示甘雨口吻的"专注中"状态文案。
2. WHILE Focus_Phase 为 `shortBreak`,THE Office_Popover SHALL 展示甘雨口吻的"小憩"状态文案。
3. WHILE Focus_Phase 为 `longBreak`,THE Office_Popover SHALL 展示甘雨口吻的"长休息"状态文案。
4. WHILE Focus_Phase 为 `idle`,THE Office_Popover SHALL 展示甘雨口吻的"准备开始"状态文案。

### Requirement 4:事件触发的鼓励与赞美文案

**User Story:** 作为用户,我希望在开始专注、进入休息、完成任务等关键节点收到甘雨的鼓励或赞美,这样我更有动力坚持。

#### Acceptance Criteria

1. WHEN User 将一个待办项标记为完成,THE Office_Popover SHALL 展示甘雨口吻的赞美文案。
2. WHILE 待办列表为空,THE Office_Popover SHALL 展示甘雨口吻的空状态关怀文案。
3. WHILE 专注计时处于 `idle` 且存在未完成待办,THE Office_Popover SHALL 在副标题区域展示甘雨口吻的引导文案。
4. THE Office_Popover SHALL 为"开始"、"暂停"、"重置"、"设为当前"、"删除"、"设为默认视图"等交互控件提供甘雨口吻的提示文案(title/placeholder)。
5. THE Office_Popover SHALL 为底部统计区域(今日专注番茄数、专注分钟数)提供甘雨口吻的文案标签。

### Requirement 5:引导页文案

**User Story:** 作为首次使用的用户,我希望引导页用甘雨口吻介绍工作台选择,这样初次见面就感到亲切。

#### Acceptance Criteria

1. WHEN User 首次打开 Office_Popover(未设置默认视图),THE Office_Popover SHALL 展示甘雨口吻的初次见面问候与工作台选择引导文案。
2. THE Office_Popover SHALL 为"待办清单"与"专注计时"两个选择卡片提供甘雨口吻的标题与描述文案。
3. THE Office_Popover SHALL 展示甘雨口吻的引导提示,说明之后可在顶部随时切换视图。

### Requirement 6:i18n 多语言兼容

**User Story:** 作为使用不同语言的用户,我希望甘雨文案不破坏应用现有的多语言支持,这样切换语言时面板仍能正常显示。

#### Acceptance Criteria

1. THE Static_Copy SHALL 通过现有 i18n_System 的 `t()` 函数提供,而非新增独立的文案读取机制。
2. THE i18n_System SHALL 为应用现有支持的每种语言(en、kh、zh-CN、zh-TW)提供对应的甘雨文案条目。
3. IF 当前语言缺失某条甘雨文案条目,THEN THE i18n_System SHALL 回退到默认语言(en)的对应条目。
4. WHEN User 在设置中切换语言,THE Office_Popover SHALL 仅在下次渲染时以新语言展示对应文案。
5. THE i18n_System SHALL 为甘雨人设文案使用稳定的文案键(key),以便各语言资源一一对应。

### Requirement 7:AI 个性化提示的数据输入(阶段二)

**User Story:** 作为用户,我希望甘雨能基于我的待办与专注情况给出个性化的贴心提示,这样提示更贴合我的真实状态。

#### Acceptance Criteria

1. WHEN Tip_Service 生成 AI_Tip,THE Tip_Service SHALL 从 Office_Data 读取 `todos`(待办文本与完成状态)、`stats`(今日番茄数与专注秒数)、`runState`(当前 Focus_Phase 与已完成番茄数)作为输入。
2. WHEN Tip_Service 生成 AI_Tip,THE Tip_Service SHALL 将当前时间与对应 Time_Segment 作为输入。
3. WHILE 当前连续专注时长达到可配置的提醒阈值,THE Tip_Service SHALL 生成提醒休息的 AI_Tip。
4. WHILE 存在未完成待办,THE Tip_Service SHALL 能生成针对未完成任务的鼓励性 AI_Tip。
5. THE AI_Tip SHALL 保持 Ganyu_Persona 风格,并遵循需求 1 中定义的长度与语气约束。

### Requirement 8:AI 提示的隐私保护(阶段二)

**User Story:** 作为注重隐私的用户,我希望能控制本地数据是否上传给模型,这样我的工作内容不会在我不知情时被发送。

#### Acceptance Criteria

1. THE Ganyu_Settings SHALL 提供 AI 个性化提示的启用/停用开关,且默认值为停用。
2. WHILE AI 个性化提示处于停用状态,THE Tip_Service SHALL 不读取 Office_Data 用于模型调用,也不发起任何 LLM_Provider 网络请求。
3. WHEN User 首次启用 AI 个性化提示,THE Office_Popover SHALL 向 User 说明哪些本地数据将被发送至 LLM_Provider。
4. THE Ganyu_Settings SHALL 仅在 User 首次启用 AI 个性化提示时展示该数据使用说明,不在设置页或初始化等其他场景重复展示。
5. THE Ganyu_Settings SHALL 允许 User 配置 LLM_Provider 的端点地址与 API key。
6. THE Ganyu_Settings SHALL 将 LLM_Provider 的 API key 存储在本地,并且不在面板 UI 中以明文回显完整 key。
7. IF 本地存储不可用导致无法保存 Ganyu_Settings,THEN THE Tip_Service SHALL 阻止启用任何 AI 个性化提示功能。
8. WHERE User 配置了自定义 LLM_Provider 端点,THE Tip_Service SHALL 仅向该用户配置的端点发送请求,不向其他第三方端点发送数据。

### Requirement 9:AI 提示的调用时机与失败降级(阶段二)

**User Story:** 作为用户,我希望 AI 提示在合适的时机出现,并且在模型不可用时面板仍能正常使用,这样体验不会被打断。

#### Acceptance Criteria

1. WHEN Office_Popover 打开且 AI 个性化提示已启用,THE Tip_Service SHALL 发起一次 AI_Tip 生成请求。
2. WHEN Focus_Phase 发生切换且 AI 个性化提示已启用,THE Tip_Service SHALL 发起一次 AI_Tip 生成请求。
3. IF LLM_Provider 不可用、超时或返回错误,THEN THE Office_Popover SHALL 回退展示对应场景的 Static_Copy。
4. IF AI 个性化提示已停用,THEN THE Office_Popover SHALL 展示对应场景的 Static_Copy。
5. WHILE AI_Tip 正在生成,THE Office_Popover SHALL 先展示 Static_Copy,并在 AI_Tip 成功返回后更新展示内容。

### Requirement 10:AI 提示的性能与非阻塞(阶段二)

**User Story:** 作为用户,我希望打开面板和切换阶段时界面立即响应,这样 AI 提示的加载不会让面板卡顿。

#### Acceptance Criteria

1. WHEN Tip_Service 发起 AI_Tip 生成请求,THE Tip_Service SHALL 以异步方式执行,不阻塞 Office_Popover 的渲染与交互。
2. THE Tip_Service SHALL 为 LLM_Provider 请求设置可配置的超时时间,无论该超时值大小都仍发起请求,超时后按需求 9 进行降级。
3. WHEN User 在 AI_Tip 返回前关闭 Office_Popover,THE Tip_Service SHALL 放弃或忽略该次未完成的请求结果。
4. THE Tip_Service SHALL 避免在单次面板打开过程中对同一上下文重复发起冗余的 AI_Tip 请求。
