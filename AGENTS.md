# DSH Plugins

- 本仓库维护独立 DSH 插件，不修改 DSH 安装包、DSH 上游或 New API 源码。
- 插件按 `plugins/<name>/` 分目录，导出入口写在根 package.json；bundle entry 必须可单独关闭。
- 只通过宿主服务读取配置和凭证，不把个人 Base URL、API key、聊天内容、生产响应写入仓库。
- 修改协议或错误处理后运行 `npm test`；验证安装包的文件清单。实网测试必须使用本机凭证，输出只含非敏感状态。
- 保留 DSH 原生搜索结果结构与取消信号。服务端错误不直接复制进日志或模型上下文。
