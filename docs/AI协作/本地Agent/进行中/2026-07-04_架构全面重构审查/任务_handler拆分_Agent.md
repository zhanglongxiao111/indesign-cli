# 任务：handler 拆分审查

## 角色

你是只读架构审查 Agent。不要修改任何文件，不要运行破坏性命令，不要提交。

模型要求：`gpt-5.4-mini`，reasoning effort `xhigh`。

## 目标

审查当前 handler 文件职责，给出全面重构时的拆分边界。重点不是行数，而是 SRP：每个新模块应该只有清晰职责。

## 重点文件

- `src/handlers/documentHandlers.js`
- `src/handlers/advancedTemplateHandlers.js`
- `src/handlers/pageItemHandlers.js`
- `src/handlers/pageHandlers.js`
- `src/handlers/graphicsHandlers.js`
- `src/handlers/bookHandlers.js`
- `src/handlers/spreadHandlers.js`
- `src/handlers/exportHandlers.js`
- `src/handlers/utilityHandlers.js`
- `src/core/scriptExecutor.js`
- `src/utils/stringUtils.js`
- `docs/superpowers/specs/2026-07-04-indesign-architecture-refactor-design.md`

## 必答问题

1. 哪些 handler 文件同时承担多个职责？按职责列出拆分建议。
2. 哪些工具共享相同的脚本执行、JSON parse、错误包装模式，适合进入 `src/handlers/runtime.js`？
3. 哪些逻辑不应该抽进 runtime，避免过度抽象？
4. 拆分时哪些旧 facade 必须保留以避免 import 断裂？
5. 当前 spec 的 handler 拆分顺序是否合理？是否有更低风险顺序？

## 输出格式

返回一份可直接落盘为 `报告_handler拆分_Agent.md` 的 Markdown：

- 结论摘要
- handler 职责切分表
- runtime helper 候选能力
- 不应抽象的能力
- 风险列表：P0/P1/P2
- 对正式 spec 的修改建议
- 建议的验证命令

