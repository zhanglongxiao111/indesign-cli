# 工具套件自动化

`run-all-tools.js` 启动 MCP 服务器，遍历在 `src/types` 下导出的每个工具定义，并记录每次调用的通过/失败状态。

## 用法

```
node tests/tool-suite/run-all-tools.js
```

日志存储在 `tests/tool-suite/logs/` 目录下，文件名包含时间戳。每个日志条目包含工具名称、成功标志以及返回的消息或错误，以供事后分析。
