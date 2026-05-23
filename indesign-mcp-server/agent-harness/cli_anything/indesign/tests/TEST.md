# InDesign Agent CLI 测试计划

## 单元测试

- JSON envelope。
- 路径脱敏。
- 工具目录和 domain 查询。
- 21 个 hidden handler 进入目录、可调用且有 schema。
- session compact 输出不保存完整参数。
- PDF / IDML 产物验证。
- server health 基础项目文件检查。

## MCP 冒烟

- `tool domains`
- `tool list --domain template`
- `tool list --domain export`
- `server health`

## 真实 InDesign E2E

需要 Windows、Adobe InDesign、`winax`。

- `server health --deep`
- `script run`
- 导出 PDF 后执行 `export verify`

真实 E2E 需要显式设置 `INDESIGN_E2E=1`。
