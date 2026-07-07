# 报告_tests_e2e_Agent

说明：只读审查，未实际跑真实 InDesign。以下结论基于当前仓库文件与命令输出。

## 结论摘要

- 主门禁是 `tests/index.js:49`，但它只覆盖 17 个 suite、5 个 required suite，coverage 也只有 11 组 handler；它不能代表 CLI hidden-handler、tool-suite、agent UX hardening 和真实 E2E 的全部风险。
- `tests/real-e2e/lib/scenarios.mjs:54` 已经是 1442 行的多职责巨石，应该按“公共 helper + 单 phase 文件”拆。
- `agent-harness/cli_anything/indesign/tests/test_core.py:35` 有 103 个测试，明显已经不是“单一兼容入口”，应拆成多个聚焦模块。
- 当前 spec 的验证基线不够，缺少 runner 语法检查、`run-agent-ux-hardening`、`run-architecture-presentation --inventory/phase` 的分批 smoke、以及 `test_full_e2e.py` 的 gated 真实 InDesign 门禁。
- 文档口径已漂移：`tests/README.md` 仍写“13 个处理程序 / 135 个工具”，但 `tests/index.js` 的 `HANDLER_COVERAGE` 只有 11 组，已经不一致。

## 当前测试地图

| 入口 | 当前状态 | 作用 | 观察 |
| --- | --- | --- | --- |
| `tests/index.js:49` | 665 行，17 个 suite，5 个 required | Node 主门禁，跑核心 JS 测试并生成 coverage | `--coverage` 现在只影响输出，不改变选择逻辑 |
| `tests/test-master-runner-cli.js:1` | 独立脚本 | 只测 `tests/index.js` 的 `--suite` 过滤和快速失败 | 应归到 runner 元测试，不进业务 suite |
| `tests/tool-suite/run-all-tools.js:7` | 383 行 | 暴力遍历 `src/types/*` 的 tool definitions 并逐个调用 | 直接读源码定义，绕过未来 registry/artifact SSOT |
| `tests/unified-test-runner.js:1` | 355 行 | 单文档老 runner | 代码搜索只找到文档引用，像遗留物 |
| `tests/real-e2e/run-architecture-presentation.mjs:19` + `lib/scenarios.mjs:54` | 218 行 + 1442 行 | 真实 E2E 主入口，含 inventory/assets 与 8 个 phase | 现在把编排、脚本生成、断言、覆盖记录混在一起 |
| `tests/real-e2e/run-agent-ux-hardening.mjs:19` + `validators/validate-coverage.mjs:1` | 211 行 + 4 个 validator | CLI 契约 smoke：COM、args-file、导出格式、batch、session、close_document | 这是当前最重要的 contract smoke 之一 |
| `agent-harness/cli_anything/indesign/tests/test_core.py:35` | 1914 行，103 个测试 | Python CLI catch-all：包元数据、catalog/router、plugin、health、runtime、bootstrapper | 必须拆，不然会继续变成垃圾桶 |
| `agent-harness/cli_anything/indesign/tests/test_full_e2e.py:31` | 2 个测试，`INDESIGN_E2E=1` 才跑 | 真实 InDesign 的 gated E2E | 应保持独立，不要并进 `test_core.py` |

## 分批验证矩阵

| 批次 | 目标 | 必跑命令 | 说明 |
| --- | --- | --- | --- |
| A | 入口与协议护栏 | `node --check tests\index.js`、`node --check tests\real-e2e\run-architecture-presentation.mjs`、`node --check tests\real-e2e\run-agent-ux-hardening.mjs`、`node --check tests\tool-suite\run-all-tools.js`、`node scripts\validate_schemas.js`、`node scripts\check_duplicates.mjs`、`node scripts\quick_check.mjs`、`node tests\index.js --required` | 先把语法、schema、重复映射和核心 JS 门禁锁住 |
| B | registry / router / catalog | `node tests\real-e2e\run-architecture-presentation.mjs --inventory --offline`、`node tests\test-master-runner-cli.js`、`node tests\tool-suite\run-all-tools.js` | 这批要抓 SSOT 漂移；`tool-suite` 后续应改成读 artifact，不要再直连 `src/types/*` |
| C | handler runtime 与文档/内容域 | `node tests\real-e2e\run-architecture-presentation.mjs --phase main_deck_setup --offline`、`--phase content_text_table --offline`、`--phase template_flow --offline`、`--phase destructive_scratch --offline` | 对应 document/page/style/text/graphics/object/master/spread 的回归 |
| D | 隐藏能力与发布门禁 | `node tests\real-e2e\run-agent-ux-hardening.mjs --offline`、`node tests\real-e2e\run-architecture-presentation.mjs --phase presentation_hidden --offline`、`--phase book_hidden --offline`、`--phase export_package --offline`、`node tests\real-e2e\run-architecture-presentation.mjs --full --offline`、`INDESIGN_E2E=1 python -m pytest agent-harness\cli_anything\indesign\tests\test_full_e2e.py -q` | 这批最后跑，覆盖真实导出、Book、Presentation、负向契约和真实 InDesign |

本地快跑时，`node tests/index.js --suite "<suite name>"` 比整套 `--required` 更合适；优先用这些名字：`Response Semantics`、`Basic Connectivity`、`Document Foundation`、`Document Preferences`、`Grid and Layout`、`Content Management`、`PageItem and Group`、`Advanced Features`、`Enhanced Functionality`、`Error Handling`、`Bounds Checking`、`Real Image Placement`、`Image Fix`、`Image Assets`、`Absolute Path Handling`。

## 测试拆分建议

- `tests/real-e2e/lib/scenarios.mjs` 拆成两层：公共 helper（`callRequired`、`callExpectedFailure`、`scriptRunFile`、`runAudit`、路径/语义工具）和 phase 文件（`bootstrap_contract`、`main_deck_setup`、`content_text_table`、`template_flow`、`destructive_scratch`、`presentation_hidden`、`book_hidden`、`export_package`）。
- `scenarios.mjs` 里的 `write*Script` 工厂应单独移动到脚本/fixture 模块，不要继续和 phase 编排混在一起。
- `agent-harness/cli_anything/indesign/tests/test_core.py` 拆成 `test_cli_entrypoint.py`、`test_package_metadata.py`、`test_catalog_router.py`、`test_plugins.py`、`test_health_runtime.py`、`test_paths_envelope.py`、`test_bootstrapper.py`，然后把 `test_core.py` 收缩成兼容入口。
- `test_core.py` 里应该保留的，只是进程级烟雾：版本/帮助/根命令 JSON envelope、参数解析、输出编码、包元数据、server root/skill 路径、bootstrapper 入口。
- `tests/tool-suite/run-all-tools.js` 应改成消费 registry artifact 或 CLI catalog，而不是直接 import `src/types/*`；`CUSTOM_ARG_BUILDERS` 和执行器也最好分层。
- `tests/unified-test-runner.js` 应标记为 legacy；如果没有消费者，迁走或删掉，不要继续和主门禁绑在一起。
- `tests/test-master-runner-cli.js` 应归入 runner 元测试目录，专门守 `tests/index.js` 的 `--suite` 过滤和失败语义。
- `validators/` 现在已经足够小，先别拆；真要拆也是按“审计 / 负向 / smoke”分。

## 风险列表

| 风险 | 级别 | 结论 |
| --- | --- | --- |
| 主门禁 false green | P0 | `tests/index.js --required` 现在不能覆盖 hidden-handler、tool-suite、agent UX hardening 和 gated real E2E，registry/router 改坏也可能过关 |
| 大文件耦合 | P1 | `scenarios.mjs` 和 `test_core.py` 的职责过载会让回归定位很慢，分批验证也会越来越难 |
| SSOT 漂移 | P1 | `tool-suite` 直接读 `src/types/*`，`tests/README.md` 覆盖率数字也已经和 `tests/index.js` 不一致 |
| 低噪但误导 | P2 | `tests/index.js` 的 `--coverage` 目前是输出开关，不是独立验证模式；`unified-test-runner.js` 也像遗留脚本 |

## 对正式 spec 的修改建议

- 在 `docs/superpowers/specs/2026-07-04-indesign-architecture-refactor-design.md` 的 `## 9 验证基线` 里，补上 `node --check` 对所有 JS runner 的检查，而不只是 `src/core/InDesignMCPServer.js`。
- 把 `run-architecture-presentation --inventory --offline`、`--phase assets --offline`、`--phase main_deck_setup --offline`、`--phase content_text_table --offline`、`--phase template_flow --offline`、`--phase destructive_scratch --offline`、`--phase presentation_hidden --offline`、`--phase book_hidden --offline`、`--phase export_package --offline` 写成正式的分批门禁，而不是只保留 `--full --offline`。
- 把 `tests/real-e2e/run-agent-ux-hardening.mjs` 和 `tests/tool-suite/run-all-tools.js` 明确列成 registry/router / catalog 变更后的必跑项。
- 把 `INDESIGN_E2E=1 python -m pytest agent-harness\cli_anything\indesign\tests\test_full_e2e.py -q` 加进 spec；它是当前唯一真正的 Python 真实 InDesign 门禁。
- 明确 `--coverage` 的语义：如果只是显示 coverage report，就别把它写成“可切换模式”；如果真要模式化，就补实现和测试。
- 如果 spec 继续保留 `scripts/check_architecture.mjs`，要注明这是待实现的检查，不要把它当成当前仓库里已经存在的命令。

## 建议的验证命令

```powershell
# 入口 / 语法 / 规范
node --check tests\index.js
node --check tests\real-e2e\run-architecture-presentation.mjs
node --check tests\real-e2e\run-agent-ux-hardening.mjs
node --check tests\tool-suite\run-all-tools.js
node scripts\validate_schemas.js
node scripts\check_duplicates.mjs
node scripts\quick_check.mjs
node tests\index.js --required
node tests\test-master-runner-cli.js

# 真实 E2E 轻量 smoke
node tests\real-e2e\run-architecture-presentation.mjs --inventory --offline
node tests\real-e2e\run-architecture-presentation.mjs --phase assets --offline
node tests\real-e2e\run-agent-ux-hardening.mjs --offline
node tests\tool-suite\run-all-tools.js

# Python
python -m pytest agent-harness\cli_anything\indesign\tests\test_core.py -q
INDESIGN_E2E=1 python -m pytest agent-harness\cli_anything\indesign\tests\test_full_e2e.py -q

# 分批 phase smoke
node tests\real-e2e\run-architecture-presentation.mjs --phase main_deck_setup --offline
node tests\real-e2e\run-architecture-presentation.mjs --phase content_text_table --offline
node tests\real-e2e\run-architecture-presentation.mjs --phase template_flow --offline
node tests\real-e2e\run-architecture-presentation.mjs --phase destructive_scratch --offline
node tests\real-e2e\run-architecture-presentation.mjs --phase presentation_hidden --offline
node tests\real-e2e\run-architecture-presentation.mjs --phase book_hidden --offline
node tests\real-e2e\run-architecture-presentation.mjs --phase export_package --offline
node tests\real-e2e\run-architecture-presentation.mjs --full --offline
```

