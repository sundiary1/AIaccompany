# 统一玻璃导航 · 视觉验收版

2026-10-26。作用范围：品牌入口、群岛、沙盒、曼陀罗书屋（含编辑器）、雨林正念。模板管理后台仍保留模板导航。

## 版本备份

改动前的完整版本已提交为 `1953155`，标签 `v0.9.0-before-glass-navigation`，均已上传 `origin`。

- [旧版提交](https://github.com/sundiary1/AIaccompany/commit/1953155)
- [旧版标签](https://github.com/sundiary1/AIaccompany/tree/v0.9.0-before-glass-navigation)

新版本继续在 `codex/unified-navigation-v1` 分支。未修改 main，未重写提交历史。

## 表现与操作

- 五个产品页面共享 `GlassNavigation`，不再各自定义导航的玻璃表面。
- 桌面：距顶部 24px、左右 32px、64px 高、22px 圆角；白色半透明背景、16px 模糊、细高光与克制阴影。
- 仅品牌入口 `/` 的桌面导航：鼠标离开导航约 4 秒后向上收起并轻微内缩；顶部留一个小把手。向上滚动、鼠标移到顶部 24px 区域或按 Tab 会展开；向下滚动可立即收起。
- 群岛、沙盒、书屋和正念页在所有设备上保持显示，不响应自动隐藏或滚动收起。`autoHide` 默认关闭，仅入口显式启用。
- 品牌入口鼠标在导航上、导航控件获得焦点或可见 dialog 打开时保持展开。隐藏导航使用 inert，避免键盘进入屏幕外的按钮。
- 手机/触屏：固定在顶部 16px、左右 16px、56px 高、18px 圆角，不启动自动隐藏。窗口或输入方式变化后重新判断；手机从桌面隐藏状态切回时立即展开。
- 减少动态设置下不播放收缩/滑动过渡。后台标签页清除等待计时，重新可见时展开；卸载清理计时和事件监听。
- 功能页保留恒定导航占位；品牌入口保持覆盖场景的方式，不占用场景高度。
- 继续使用实际 Animal Island Button、既有图标、字体和主题变量。没有新增依赖，也未修改 GLB、相机、AI、存储或播放器业务。

## 小屏适配

群岛地图已按追加要求删除“让心，轻轻靠岸。”及“不急着去哪里，先在这里停一会儿。”，并清理相关空容器和样式；品牌入口文案保留。群岛页调整 stage 的手机最小高度为 `min(400px, 52dvh)`，以容纳玻璃导航外边距；375×667 仍保持一屏，未改变岛屿布局和相机配置。沙盒作品抽屉顶部改到 104px，避开桌面玻璃块；其他业务逻辑不变。

## 实际验证

使用 Edge 浏览器和触摸模拟；所有 API 测试采用 Mock，无真实 AI 请求、无正式数据库写入。

| 检查 | 结果 |
| --- | --- |
| 五页桌面 1440×900 | 导航边距、64px 高度、透明色和 backdrop-filter 一致，正常页面无横向滚动及 JS 错误 |
| 最新要求：入口桌面自动隐藏 / 顶部展开，其他四页常驻 | 通过（最新验收替换之前五页自动隐藏实验） |
| 导航焦点停留超过 4 秒 / Tab 展开 | 通过 |
| 沙盒作品抽屉 | 保留原操作；已等待原 iframe 完成加载再截图 |
| 入口向下滚动收起 / 向上滚动展开 | 原机制保留；功能页滚动不隐藏 |
| 手机 390×844、沙盒 375×812 | 等待超过 4 秒及滚动后仍固定显示；可点击返回、作品、保存、更多和绘画导出 |
| 群岛 375×667 | 无横向及纵向页面溢出，导航和入口完整 |
| 曼陀罗桌面/手机编辑器 | 导出按钮和原工具保留，画布仍可用 |
| 正念手机页 | 保留原纵向滚动，顶部导航常驻 |
| 桌面/手机尺寸切换、reduced-motion | 机制保留；减少动态时 transition duration 为 0s |
| `bun run --filter frontend check:demo` | 88 文件通过 |
| `bun run --filter frontend build` | TypeScript + Vite 通过；原有大型 Three chunk 警告仍在 |
| `test:landing` / `test:islands` / `test:sandplay` / `test:mandala` / `test:mindfulness` | 5 / 4 / 4 / 5 / 10，合计 28 项通过 |

导航是浏览器 DOM/CSS 交互，本轮直接验证实际计时、焦点、弹窗、滚动及响应式行为，没有增加只重复实现条件的单元测试。后端未修改，未执行真实供应商或后端业务验收。实体 iOS/Android、Safari 的玻璃合成仍待实机确认。

## 文件

新增：

- `frontend/src/components/IslandUI/GlassNavigation.tsx`
- `frontend/src/components/IslandUI/glass-navigation.module.css`
- `frontend/src/components/IslandUI/useNavigationVisibility.ts`
- 本报告和 `docs/screenshots/glass-navigation/` 的无私人数据验收截图。

修改：

- `IslandUI/PageHeader.tsx`、`page-header.module.css`：复用共享表面，保留页面提供的按钮和回调。
- `Landing/LandingPage.tsx`、`landing.module.css`：用同一表面替换独立导航外壳，原内容和进入动作保留。
- `IslandPreview/IslandPreviewPage.tsx`、`island-preview.module.css`：删除地图文案及空容器/样式，小屏高度适配。
- `Sandplay/sandplay.module.css`：作品抽屉顶部间距。
- `docs/PROJECT_CONTEXT.md`：当前导航约定。

## 截图

| 页面 | 桌面 | 手机 |
| --- | --- | --- |
| 品牌入口 | [桌面](screenshots/glass-navigation/desktop-landing.png) | [手机](screenshots/glass-navigation/mobile-landing.png) |
| 群岛 | [桌面](screenshots/glass-navigation/desktop-islands.png) | [手机](screenshots/glass-navigation/mobile-islands.png) |
| 沙盒 | [桌面](screenshots/glass-navigation/desktop-sandplay.png) | [手机](screenshots/glass-navigation/mobile-sandplay.png) |
| 书屋 | [桌面](screenshots/glass-navigation/desktop-mandala.png) | [手机](screenshots/glass-navigation/mobile-mandala.png) |
| 绘画编辑器 | [桌面](screenshots/glass-navigation/desktop-mandala-editor.png) | [手机](screenshots/glass-navigation/mobile-mandala-editor.png) |
| 正念 | [桌面](screenshots/glass-navigation/desktop-mindfulness.png) | [手机](screenshots/glass-navigation/mobile-mindfulness.png) |

[桌面收起状态](screenshots/glass-navigation/desktop-hidden.png) · [375×667 群岛](screenshots/glass-navigation/mobile-islands-short.png)

等待用户视觉验收后再调整透明度、收起延迟或边距；本轮不扩展其他功能。
