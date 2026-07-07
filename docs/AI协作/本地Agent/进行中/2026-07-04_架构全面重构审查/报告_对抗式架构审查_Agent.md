# 报告：对抗式架构审查 Agent

本次为只读审查，未修改文件、未启动长期服务、未跑真实 InDesign E2E。

## 总体 verdict

`先修订`

这份设计方向是对的，但当前版本还不能直接执行。最大问题不是“要不要重构”，而是把 registry / artifact / source 体系拆成了两套，同时没有把 `advanced`、`hidden_handler`、`plugin host`、`packaging`、`Skill/docs`、`real E2E` 一起纳入迁移面。现有代码其实已经有 `src/types/index.js` 和 `src/handlers/index.js` 这样的聚合层，真正的收口点是 `src/core/InDesignMCPServer.js` 的手写 `switch`，不是再新造一层 `src/tools/`。

## P0

- 双 SSOT / 双 registry。这个 spec 在 `src/tools/registry.js` 和 `indesign-tool-registry.json` 上再建一套注册表，而语义方案已经把 `src/semantics/registry.js` / `semantics-registry.json` 定成另一套机器可读 registry。`AGENTS.md` 又明确要求工具名、schema、handler 映射和 CLI 展示 id 尽量只有一个权威来源。这不是实现细节，是必须先统一的设计冲突。

## P1

- `advanced` 边界漏掉。`AGENTS.md` 已经把 `src/advanced/` 作为独立入口。当前 CLI / E2E 也仍把 `advanced` 当独立 source：`Router` 直接绑定 `src/advanced/index.js`，`indesign_cli.py` 会同时拉 `advanced` 和 `classic`，`tests/real-e2e/lib/catalog.mjs` 还把它们分源采样。spec 只把 `advancedTemplateHandlers.js` 当拆分对象，没有把 `src/advanced/index.js`、`toolDefinitionsAdvancedTemplates.js`、`tests/real-e2e/lib/catalog.mjs`、`tests/real-e2e/lib/coverage.mjs` 纳入迁移表。
- `hidden_handler` / `plugin host` 边界漏掉。`Catalog`、`Router`、`HiddenHandlerBackend`、`HostActionExecutor` 现在都是真实路径，不是摆设。spec 只说“不要删除暂时隐藏的 handler”，却没把这些 source、host action 和验证路径放进同一批次，cleanup 很容易删早。
- 打包缺口。`indesign-tool-registry.json` 如果要给 `pip install indesign-cli` 后的 CLI 用，必须进包数据和 sdist。当前 `pyproject.toml` 只包含 `skills/*.md` 和 `node/*.mjs`，`MANIFEST.in` 也没有 JSON artifact 规则。spec 没有 `pyproject.toml` / `MANIFEST.in` 的修改项。
- 文档 / Skill 同步缺失。`AGENTS.md` 明确要求 CLI contract 改动同步 `README.md`、`README.en.md` 和 `skills/indesign-cli/SKILL.md`。但当前 README 和 Skill 仍以旧的 `tool domains/list/schema`、`create_text_frame`、`place_image` 口径为主，spec 里只是笼统写“更新 docs”。

## P2

- `src/tools/` 这一层偏重。仓库已经有 `src/types/index.js` 的工具定义聚合、`src/handlers/index.js` 的 handler 聚合，真正需要收口的是 `src/core/InDesignMCPServer.js` 的手写 `switch`。再加一套 `tools/domains/*`，更像复制一遍 domain 结构，不像收口。
- `handler runtime` 可以留，但应是薄封装。`ScriptExecutor` 已经承载执行层，`formatResponse` 已经承载返回包装。spec 里的 `handler runtime` 不要再长成第二套业务框架。

## 过度设计点

- `src/tools/domains/*` 作为并行架构层，和现有 `src/types/` / `src/handlers/` 的 domain 拆分重叠。
- `toolRouter.js` 如果只是再包一层 switch，就没有必要单独升格成新框架。
- `validateRegistry.js`、`artifact.js`、`check_architecture.mjs` 先做成薄检查即可，不要先变成一整套治理系统。
- 文件大小阈值直接硬失败不划算。spec 里写了 600 / 900 / 1200 行阈值，这个信号可以保留，但一开始更适合 warning。

## 必须修改的 spec 条目

- 统一 registry 方案：保留一套 canonical registry / artifact，不要让 `src/tools/*` 和 `src/semantics/*` 并存。
- 补全迁移表：`src/advanced/index.js`、`src/types/toolDefinitionsAdvancedTemplates.js`、`agent-harness/cli_anything/indesign/core/catalog.py`、`agent-harness/cli_anything/indesign/core/router.py`、`agent-harness/cli_anything/indesign/core/plugins/*`、`agent-harness/cli_anything/indesign/core/hidden_*`、`tests/real-e2e/lib/catalog.mjs`、`tests/real-e2e/lib/coverage.mjs`、`tests/real-e2e/run-architecture-presentation.mjs`。
- 补 `pyproject.toml` / `MANIFEST.in` 的 artifact 打包项，或者把 artifact 放进可打包的 Python package 路径。
- 补 `README.md`、`README.en.md`、`skills/indesign-cli/SKILL.md`、`docs/MCP_INSTRUCTIONS.md`、`docs/LLM_PROMPT.md`、`docs/README.md` 的同步项。
- 保留 `tests/index.js --required` 作为顶层门禁，不要让新 test tree 取代它。
- 调整批次顺序：先冻结唯一 registry 和 source map，再做 artifact / packaging，再拆 handler，最后 cleanup。

## 应降级内容

- `artifact_hash`、`schema_version`、`availability`、`contract` 这类元数据只保留必要字段，不要在 spec 里再长出一套复杂投影规则。
- `scripts/check_architecture.mjs` 先做只读检查和 warning。
- `toolRouter.js` 只要是薄 dispatch 就可以，不要让它变成第二个业务层。
- 语义 payload / warning code / selector contract 这类细节留给语义 spec，本 spec 不要重复定义。

## 下一步建议

1. 先把这份 spec 和 `2026-07-03-indesign-tool-semantics-design.md` 合并口径，先定唯一 registry / artifact，再谈实现。
2. 把 advanced、hidden、plugin、packaging、docs、real E2E 的迁移面补齐。
3. 只走一条最小闭环：registry 生成 -> CLI catalog 读取 -> docs/Skill 同步 -> targeted tests。通过后再拆 handler。

