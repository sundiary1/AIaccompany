# Mind Island 当前上下文

此文件压缩开发历史，供继续协作时快速读取；不代表应用中的用户长期记忆，也不包含聊天正文或密钥。

## 当前成果

本地版本 V0.9.0（雨林正念岛待视觉与功能验收，V0.7.1 记忆专项验收完成）。React + TypeScript + Vite；Three.js + R3F + Drei；独立 FastAPI 代理；Python 内置 SQLite。无需 Docker / PostgreSQL。

- V0.9.0：首页第四岛为用户海滩小车模型，位于心屿后方，桌面 T 字、手机纵列侧枝，三条连接各三朵云。`/mindfulness` 使用独立 Island 模型、部件弹簧和独立 HTMLAudio 播放器；无正式音频时不请求空文件。音轨清单在 `frontend/src/components/Mindfulness/mindfulnessTracks.ts`，资源放 `frontend/public/audio/mindfulness/`。后台停帧、减少动态、静态降级和离页清理已验证；10 项新单测、13 项既有前端、98 项后端 Mock、7 项脚本测试及构建/规范检查通过，未调用真实 AI。详见 `docs/RAINFOREST_MINDFULNESS_V090.md`，实体 iOS/Android 音频仍待实机验收。
- 正念电脑端后续改为一屏自适应高度，常见 600–1000px 窗口高度无页面滚动且控件完整；手机保持纵向。雨林克隆材质提亮，水面增加静态低分辨率环境高光，捕获组件 memo 避免随音频进度重复计算；源 GLB 未改。全局演示黑条已移除。
- 统一导航实验在 `codex/unified-navigation-v1`：共享 PageHeader、Animal Island 按钮/弹窗和配套 naive-icons 1.7.0，桌面 72px / 手机 56px；书屋工具移到导航下方，正念合并标题，沙盒手机次要操作收入更多。原版已提交 `9466f5b` 并上传标签 `v0.9.0-before-unified-navigation`，main 保持原版。见 `docs/UNIFIED_NAVIGATION_V1.md`，等待用户视觉验收。

- `/island-preview`：用户提供的飞机岛替换可见心屿，溪流小岛作为沙屿；三朵悬浮云、角色与双岛共用运动父级。旧果冻岛与角色 GLB 未改，正交相机适配桌面与手机竖屏。
- V0.8.0 追加用户小木屋作为第三岛，复用现有 Canvas / 运动 / 相机和配置。桌面书屋—心屿—沙屿对齐，手机采用纵向布局，两条连接各三朵云。`/mandala` 有 6 幅原创封闭 SVG（动物、自然与几何题材，不显示难度；原九幅径向图案已移除）、MIT Mandala Maker 适配的 6/8/12/16 轴画笔、撤销/重做、缩放和 2048px PNG；只在内存编辑，不入库或发给 AI。详见 `docs/MANDALA_DEMO_V080.md`。
- 页面底色统一白色；聊天只保留对话、输入与必要操作，去掉角色介绍和辅助文案。横屏不再作为专项验收目标。
- 首页进一步精简：移除暂停动态、岛屿信息按钮、动态状态文字和“02 心屿与沙屿”编号；默认持续运动，保留减少动态及隐藏页面暂停机制。
- UI 已实际接入 `animal-island-ui@2.3.0` 的 Button / Input / Switch / Card，暖棕文字、柔和绿色、白底；`IslandUI/` 管理适配与主题。原生多行输入、Radix 弹窗及全部数据逻辑保留，详见 `docs/UI_REFACTOR_ANIMAL.md`。
- 首页正在做「云雾森林」视觉实验：近白分层 CSS/SVG 背景、实际 Background / Card / Title / Tooltip、群岛地图、可拖动旋转缩放的正交相机和复位。背景动画可关闭，减少动态与隐藏页面仍暂停；只引用于首页，详见 `docs/FOREST_HOME_EXPERIMENT.md`。旧“固定相机”记录属于实验前状态。
- 点击小屿在当前页面聊天；桌面右侧、手机底部面板。
- OpenAI-compatible SSE / 非流式回退；已适配 DeepSeek；取消、重试、异常与安全响应。
- schema v1 历史会话与消息；v2 记忆、授权、来源、版本、任务和调用计数；v3 独立 `sandplay_projects` 作品表。
- 自动记忆及使用开关默认关闭；只提取授权之后完成且已保存的普通回合。
- 临时聊天不保存正文，不读写长期记忆。
- `/sandplay`：完整沙屿 V15 同源 iframe，80 种程序化沙具、九大分类、溪流与浏览器存档；离开卸载，不发送给 AI。V0.7 新增 SQLite 多作品、revision 冲突控制和受控 JSON 桥接，首次命名、已有作品防抖保存；旧存档仅主动导入。新增模型以 Three.js 程序化建模为主，既有 Blender/GLB 保留。
- 沙盘顶部已精简为单行导航与作品操作；移除未命名占位、常驻保存状态和指定装饰文案，保留失败提示与未保存离开卡片。原 HTML 文字仅通过宿主 CSS 隐藏，不改只读原件。

## 关键文件

- `backend/demo_ai/main.py`：独立应用、生命周期、loopback / Host / Origin 校验。
- `chat_routes.py`、`provider.py`：聊天流与供应商适配。
- `database.py`、`repositories/`：事务、会话、记忆和幂等。
- `memory_worker.py`、`memory_rules.py`：后台提取、证据与敏感规则。
- `prompts/`：陪伴人设与记忆提取指令分离。
- `frontend/src/components/Chat/`：聊天与记忆信箱，不需要重新创建。
- `frontend/src/components/IslandPreview/`：沿用角色状态，不按 token 重建模型。
- `frontend/src/components/Mandala/`：UI、封闭模板、对称引擎、版本化纯数据校验和 PNG 导出分离；`frontend/public/licenses/mandala-maker-MIT.txt` 保留来源许可。原始木屋仅本机保留，完整压缩 `.blend` 可纳入版本管理。
- `island-world.ts`：三岛、桌面/手机布局、出生点、入口和未来路线；云位置从各布局的岛岸坐标生成。`CloudBridge.tsx` 用一个 InstancedMesh 绘制两组云，尚不是可行走桥面。
- `assets/blender/`：保留 bpy、blend、GLB、角色四视图及验证报告。
- `assets/legacy/sandplay-v15/`：只读原版及校验和；`frontend/public/legacy/` 为独立运行副本及宿主 seam，见 `docs/SANDPLAY_DEMO_V07.md`。

## 不可破坏的边界

- API Key 仅在 `backend/demo_ai/.env.local`；不进前端、日志、Git。
- 默认数据库 `backend/demo_ai/data/mind_island_demo.sqlite3`；全部忽略。
- 临时聊天不调用记忆模块；普通上下文由服务端读取完整已完成回合。
- 稳定请求 ID；失败/取消不算完整回复；同会话并发受控。
- 记忆仅凭真实用户消息字面证据；敏感内容不可自动保存；手动编辑不得自动覆盖。
- 重复合并来源；明确更正保留版本；不确定冲突待核对，旧条目暂不注入。
- 删除聊天级联处理来源与任务；延迟任务必须重新校验 epoch / 消息存在性。
- 沙盘未保存离开/切换提醒使用 Animal Island UI Modal，确认 Promise 仅控制是否继续原操作；保存成功仍以 API 确认为准，浏览器刷新保留原生保护。
- 只把授权、enabled、approved 的相关记忆作为不可信参考，当前表达优先。
- 不做心理诊断、隐蔽长期记忆、向量服务、语音或其他岛屿，除非新任务授权。

## 费用与恢复

单 worker；每回合唯一任务；默认 20 秒 / 768 输出 tokens / 每 UTC 日 20 次调用。失败不自动重试，人工重试总尝试上限 2。重启恢复 pending；中断的 running 标为 failed，防止重复付费。提取失败不影响已保存聊天。取消后已发出的上游请求可能仍计费。

## 验证基线

V0.5 完成时：73 项后端 Mock 测试通过；TypeScript / Vite、Ruff、相关前端 Biome 通过；桌面与触摸模拟通过。真实 API 提取调用 0 次。SQLite v1→v2 保留原历史，GLB 未变。

V0.6：原版字节保留；80 工厂、9 分类、横竖屏触摸、旧存档、PNG、CDN 失败与卸载验证通过；后端 73 / 脚本 6 项测试、前端 36 文件检查及构建通过。未改后台或真实数据；快速连续触摸和浮层拥挤需继续实机验收。

V0.7：独立作品库与受控模块桥接；86 项后端 / 4 项桥接数据 / 6 项脚本测试通过，桌面三作品恢复、失败重试、双页面冲突、主动旧档导入及横竖屏触摸验证通过。实际库迁移 2→3，8 张原表指纹不变。详情见 `docs/SANDPLAY_DEMO_V07.md`。

V0.7.1：现有 DeepSeek 配置真实验收 8 次 HTTP 请求（4 聊天 / 4 提取），指定三类记忆入库、跨会话实际注入、雨天→晴天同 ID 更新通过；93 项后端 Mock 测试及构建通过。修复句式预筛、窄范围类别兼容、活动相关检索、明确偏好更正及失败可见性；敏感规则未放宽，9 张正式表指纹不变。见 `docs/MEMORY_LIVE_VALIDATION_V071.md`。以后常规测试仍只用 Mock，不自动重复付费验收。后续补上明确姓名/称呼的提取和身份检索，98 项后端 Mock 测试通过；用户必须开启“使用已有记忆”才注入，不回扫旧消息。

保守规则可能漏掉复杂表达；SQLite/备份未加密；实体手机键盘与更广泛真实提取质量尚未系统验证。既有 3D bundle 约 1.04 MB，有 chunk 大小和 THREE.Clock 弃用提示。

V0.7.2：两模型独立重新导入验证通过；98 项后端 Mock、3 项岛屿、4 项沙盘桥接、7 项仓库/资产测试通过，类型检查/构建/规范检查通过。桌面与手机竖屏点击、聊天动作、静态降级、历史和沙盘作品恢复通过；正式既有行未变，验收期间默认代理并行新增记录已保留。原模型、导出命令、实际尺寸和截图见 `docs/ISLAND_WORLD_V072.md`。未开发行走控制器或新 AI 功能。

## 当前版本管理约定

`origin` 指向 sundiary1/AIaccompany；`upstream` 保留官方模板。主分支 `main`。当前入口是根 README 和开发指南；旧交付记录位于 `docs/history/`，其中过时环境描述不可当作当前事实。
