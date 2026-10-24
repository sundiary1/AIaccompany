# 模板来源

Mind Island 基于 [fastapi/full-stack-fastapi-template](https://github.com/fastapi/full-stack-fastapi-template)，初始基线提交 `b1125d8`。保留 MIT [LICENSE](../LICENSE) 和上游提交历史。

保留原模板的 React 管理页面、`backend/app/`、数据库迁移、邮件包、锁文件、Compose 配置及相关开发文档，便于后续按需使用；本机 Demo 入口与这些部署环境解耦。

原模板说明：[后端](../backend/README.md)、[前端](../frontend/README.md)、[完整开发环境](../development.md)、[部署](../deployment.md)、[Compose 部署](../deployment-docker-compose.md)、[上游发行记录](../release-notes.md)。

已移除依赖原作者组织、Release 管理、Cloud / Docker 部署和 PR 机器人的 GitHub 自动化，改为本项目无密钥、无部署的 Demo CI。原始版本仍可从上游 Git 历史恢复。

Git remotes：`origin` 为项目仓库；`upstream` 为官方模板。不要向 upstream 推送项目改动。
