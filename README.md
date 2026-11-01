# DSH Plugins

独立维护的 DeepSeek Harness 插件集合。每个插件放在 `plugins/<name>/`；当前仅包含 **Responses Web Search**。不修改 DSH 或 New API 源码。

## Web Search

替换 DSH 的搜索 provider，保留内置 `web_search` 工具、结果引用卡片和 HTTP `web_fetch`。每次搜索单独调用 Responses API 的服务端 `web_search`，默认 **`gpt-6.1-sol` / `low`**。只发送搜索问题，不发送整个聊天记录。

请求使用数组 `input`、`store: false`、SSE；只有原生搜索实际完成后才返回结果。引用来自服务端的 `url_citation` 和搜索来源，不从模型正文猜测 URL。取消、总超时、HTTP 错误、流中断会明确报错，不回退 DeepSeek。

### 安装

需要 Node 22+ 和兼容的 DSH（目前针对 Desktop `0.2.1-rc.3`）。在仓库目录执行：

```sh
npm ci
npm test
dsh plugin --profile desktop add /absolute/path/to/dsh-plugins
```

macOS Desktop 自带 CLI：

```sh
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop add /absolute/path/to/dsh-plugins
```

安装 bundle 后，将下面条目追加到 `~/.dsh/profiles/desktop/cordis.patch.yml`。先备份配置；不要覆盖原有配置。重启 Desktop 后生效。

### 复用已有模型路由（推荐）

```yaml
- id: web-search-responses
  config:
    provider: my-codex-route
    model: gpt-6.1-sol
    reasoningEffort: low
```

`provider` 是已有 `llm-pi-ai.config.providers` 中的路由名。插件在每次搜索时读取它的 `baseURL` 和 `apiKeyEnv`，并通过 DSH credentials 服务解析密钥，不读取个人凭证文件。聊天模型可以不同于搜索模型。此模式仅支持 API key 的 `openai-responses` 路由，不读取 Codex OAuth 登录记录。

### 独立配置

```yaml
- id: web-search-responses
  config:
    baseURL: https://gateway.example/v1
    apiKeyEnv: MY_GATEWAY_API_KEY
    model: gpt-6.1-sol
    reasoningEffort: low
    timeoutMs: 90000
```

在 DSH 凭证管理中保存 `MY_GATEWAY_API_KEY`。也支持 `apiKey` 字面值（标记为 secret），但建议使用凭证引用，避免把密钥写入配置或 Git。`baseURL` 应含 API 前缀，例如 `/v1`；也接受完整 `/v1/responses`。仅支持 HTTPS 或本机回环 HTTP，不跟随重定向。

显式 `baseURL` / `apiKeyEnv` / `apiKey` 优先于复用路由；自定义 llm-pi-ai entry ID 时设置 `providerNamespace`。模型和 reasoning effort 始终由搜索插件独立配置。DSH 外层工具的超时可能早于插件的 `timeoutMs`。

每次搜索产生一次模型请求，使用所配置 key 的额度；多问题搜索可能产生多次请求。不承诺搜索工具费用与网关内部美元额度完全等价。

### 卸载

```sh
dsh plugin --profile desktop remove @zxdvd/dsh-plugins
```

删除自己添加的 `web-search-responses` 配置条目，并恢复安装前的 `web.searchProvider`（默认 `deepseek-official`）。本 bundle 不删除 DeepSeek 插件，撤销后可恢复。

## 开发

`plugins/web-search/core.js` 是无运行时依赖的请求、SSE、结果处理模块；`index.js` 是 DSH 注册入口，通过声明的 DSH 库接入宿主服务。`options.js` 负责路由复用。测试使用 Node 内置测试工具和本地 HTTP server，无付费请求。

部分网关的最终 `response.completed.output` 为空；解析器会保留先前 `response.output_item.done` 中的完整搜索和消息项，但没有终结事件仍报错。不能只读取最后一帧。

CLI 验证方法与本机验收结果见 [验证记录](docs/validation.md)。

增加插件时创建独立目录和 package export，在 bundle patch 中添加可独立禁用的 entry；只有出现实际共享需求时才抽公共库。不包含图片生成、独立 Alpha Search 或 OAuth token 管理。
