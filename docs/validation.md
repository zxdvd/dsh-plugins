# 验证记录

## 2026-11-01 首次验收

- Host：macOS DeepSeek Harness Desktop `0.2.1-rc.3`，使用其内置 `dsh` CLI。
- `npm test`：13 项通过，覆盖请求协议、UTF-8/SSE 分片、空终结 output、失败/截断流、来源过滤和去重、配置优先级、真实本地 HTTP、取消和总超时、敏感错误脱敏及入口依赖。
- `npm pack --dry-run`：仅包含公开源代码、配置模板与说明，无用户凭证。
- 通过官方 `dsh plugin --profile desktop add <repo>` 安装，Desktop 显示 bundle 已安装并启用。
- 最终重启 Desktop 后，插件详情显示 `1 total · 1 running`，`web-search-responses Running`。
- 通过独立 headless profile 运行实际 `web_search`：复用现有 Responses 路由和 DSH credentials，Sol / low；收到成功工具结果、官网来源和最终回答，CLI exit 0，stderr 无加载警告。
- 验证查询：Python 官网的最新稳定版本。目的为确认真实搜索调用与来源输出，不将易变版本号作为测试断言。
- 未修改 DSH、New API 源码或服务器配置。

## 优先使用 CLI 复验

在本机 DSH profiles 下创建独立测试 profile，避免修改桌面的聊天默认模型或会话：

1. 复制 Desktop 的 profile package.json，保留插件依赖；将 bundles 设为 `@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-headless`、`@zxdvd/dsh-plugins`。
2. 在测试 profile patch 中放入已有 `llm-pi-ai` 路由、`agent-default-model`、`web-search-responses` 配置。引用 credentials 中的 key，不复制密钥字面值。
3. 加上 `- id: credentials` / `disabled: false`，因为官方 headless bundle 默认关闭 GUI 凭证服务。
4. 安装测试 profile 依赖后运行：

```sh
dsh --profile <test-profile> --json '只调用一次 web_search，搜索 Python 官网最新稳定版，给出官网来源链接。不要使用其他工具，不要修改文件。'
```

应出现 `tool_call` 的 `tool: web_search`、`tool_result` 的 `status: completed` 以及 `final`。仅有 exit 0 不足以证明搜索成功：模型也可能正常回答“搜索失败”。

真实搜索会消耗所配置 key 的额度。定期复验时，桌面只需确认 bundle 已启用；协议和错误路径以 CLI / 自动化测试为主。
