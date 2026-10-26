# 沙屿 V15 原版参考

来源为用户提供的 `沙屿_心理沙盘_V15_溪流优化.html`。本机附件文件名不带“(1)”；实际包含 80 种沙具、九大分类及 V15 溪流，不是替代实现。

- `sandplay-v15.original.html`：逐字节保留的参考副本，本机设为只读。
- `manifest.json`：来源文件名、大小与 SHA-256。
- 可运行副本：`frontend/public/legacy/sandplay-v15.html`。

参考文件大小 123347 bytes，SHA-256：

```text
1beaa99df80b5979b26f4555020d692c4bc93ca0ef58ff12fdc7a7889b48f53b
```

V0.6 运行副本在原 importmap 前插入 `sandplay-host.css` 与 `sandplay-host.js`。完整原文（包括模型、CSS、渲染、手势、存档、截图）未改写；V0.7 另增唯一 `MIND_ISLAND_BRIDGE_START/END` 标记片段，在 ES Module 内向独立桥接模块传入受控序列化/加载回调。移除两行引用及该片段后恢复原始字节，单元测试检查此约束。`.gitattributes` 避免 Git 自动转换这两份 HTML 的换行。

`sandplay-host.js` 继续处理加载/设置；`sandplay-bridge.js` 处理同源 JSON 获取、校验后加载、新建及主动旧存档导入，详见 `docs/SANDPLAY_DEMO_V07.md`。不向 AI 传输作品。宿主样式只处理矮横屏时原素材栏遮挡地块/视角按钮的问题，不改变相机参数或模型坐标。原版 CSS 使用 rect 计算射线，等比画布变换后的横屏拖放已经实际验证。

Three.js 0.161.0 继续通过原 jsDelivr importmap 加载。React 路由 `/sandplay` 将其作为独立同源 iframe 展示，离开即卸载。

存储继续使用 `sand-island-scene-v6` 和原版 JSON；兼容 v4/v2/v1 恢复。不同浏览器、主机名、端口及 `file://` 有不同存储空间，格式兼容不会自动搬迁跨来源作品。
