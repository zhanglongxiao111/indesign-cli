# InDesign MCP Server 项目同步文档（Windows 适配版）

更新时间：{自动生成于提交时}

## 1. 项目概览
- 名称：InDesign MCP Server（基于 Model Context Protocol 的 InDesign 自动化服务）
- 目标：让 Agent/脚本以“工具调用”的方式操控 Adobe InDesign，完成文档创建、内容编排、样式管理、导出等专业工作流
- 技术栈：Node.js + MCP SDK；脚本在 InDesign 端执行 ExtendScript（JavaScript）
- 目录结构（简）：
  - src/core：MCP 服务器、脚本执行器、会话管理
  - src/handlers：各类功能处理器（文档/页面/文本/图形/样式/导出等）
  - src/types：工具定义（约 135+）
  - tests：基础与集成测试
  - docs：文档

## 2. 本次改造内容（Windows 适配）
- 背景：原项目在 macOS 上通过 AppleScript 调用 InDesign；Windows 无 AppleScript，需替换执行通道
- 方案：采用 Windows COM + DoScript 直连 InDesign.Application（通过 winax）
- 实施要点：
  - 在 src/core/scriptExecutor.js 中新增 Windows 分支：
    - 自动检测 InDesign ProgID（优先 InDesign.Application.2025）
    - 通过 COM 调用 app.DoScript 执行 ExtendScript
    - 强制无界面（UserInteractionLevels.NEVER_INTERACT）
  - 保留 macOS 分支（AppleScript + 临时 JSX），实现跨平台透明切换
  - 路径与字符串转义适配，确保中文/空格/反斜杠路径稳定

## 3. 当前进度与状态
- 已完成
  - Windows COM 执行通道打通（winax）
  - 基础端到端用例验证：新建文档 → 添加文本 → 导出 PDF
  - 基础工作流测试通过（创建文档/翻页/文本/图形/保存）
  - 导出时自动创建目标文件夹
- 待完善（进行中）
  - place_image：在多类型路径（中文/网络盘/空格）下的稳健性
  - export_images、package_document：Windows 下的路径与目标目录创建细节
  - ProgID 探测与报错信息进一步增强

## 4. 运行与配置（Windows）
- 前置条件
  - Windows 10/11
  - Adobe InDesign 2025（常规桌面版）已安装并能正常启动
  - Node.js 18+（建议 18 或 20 LTS）
- 安装依赖
  - 在项目根目录执行：
    - npm install
    - npm install winax
- 启动 MCP 服务器
  - node src/index.js
  - 该服务使用 MCP Stdio Transport，对接支持 MCP 的 Agent 即可（以命令行进程方式启动）
- 快速自测（示例）
  - 端到端（示例导出到 D:/Indesign-Exports/mcp-demo.pdf）：
    1) create_document: { width: 210, height: 297, pages: 1 }
    2) create_text_frame: { content: "Hello Windows!", x: 30, y: 30, width: 120, height: 30, fontSize: 14 }
    3) export_pdf: { filePath: "D:/Indesign-Exports/mcp-demo.pdf", preset: "High Quality Print" }
- 路径规范
  - 建议使用绝对路径，分隔符可用 `/` 或 `\`（内部已做兼容与转义）
  - 中文/空格路径支持；建议避免过长路径和受限权限目录

## 5. 在不同电脑之间迁移（环境准备）
- 必备软件
  1) Adobe InDesign 2025（桌面版）
  2) Node.js 18+
- 项目拉取与依赖
  1) git clone <repo>
  2) cd indesign-cli && npm install
- 可能的系统依赖（仅在个别机器上需要）
  - 若安装 winax 失败：
    - 安装 Visual Studio Build Tools（含“Desktop development with C++”）或 Microsoft C++ 运行库
    - 确保 Python（用于 node-gyp）和必要的编译工具可用
- 权限与首次运行
  - 首次通过 COM 启动 InDesign 可能较慢，耐心等待
  - 如杀毒/管控软件拦截 COM，请加入信任/白名单

## 6. 与 MCP 客户端对接说明
- 该服务器走标准 MCP Stdio，建议在 Agent 侧以“启动一个进程并通过 stdio 通信”的方式接入
- 启动命令：node src/index.js
- 工具列表：调用 ListTools（tools/list）可获取；或参阅 src/types 下的定义

## 7. 常见问题与排查
- “ActiveXObject is not a constructor / 无法创建 InDesign COM 对象”
  - 可能原因：winax 加载异常或系统缺组件；或 InDesign 未正确注册 COM ProgID
  - 处理：重装/修复 winax；检查 InDesign 安装；尝试管理员终端运行；安装 VC++ 运行库
- “Syntax error / 语法错误（DoScript）”
  - 多因注入的 ExtendScript 文本被额外转义或不完整导致
  - 处理：确保不要对代码做重复的引号/换行转义；优先使用项目内置 handler 的工具
- 导出失败/路径错误
  - 确认导出目录是否存在；目前已内置“若不存在则创建目录”的逻辑
  - 使用绝对路径；避免受限目录（如系统盘敏感位置）
- 字体/颜色名无效
  - 若指定字体/色板不存在，将回退默认值；可先创建/导入所需资源

## 8. 代码层关键改动点
- src/core/scriptExecutor.js
  - Windows 分支：通过 winax 创建 InDesign.Application.2025（含回退列表），调用 app.DoScript
  - 强制无界面执行；错误捕获并向上返回
  - macOS 分支：保留 AppleScript 通道
- 处理器中的路径与字符串
  - 对 open/save/export 等涉及 File/Folder 的参数，统一走 escape 处理
  - 导出类工具在执行前会尝试创建目标目录

## 9. 推荐使用方式（设计团队）
- 把 MCP Server 作为“设计自动化底座”，由 Agent 编排工具链（创建文档→导入素材→自动排版→导出）
- 模板/样式的维护：统一在 InDesign 模板中维护样式与色板，由工具对其引用与应用
- 对外部资源（图片、字体、CSV 数据等）使用稳定的绝对路径与结构化目录

## 10. 后续路线图
- 完成图片放置与批量导出在 Windows 下的增强测试
- 扩展测试覆盖到全部核心工具分类
- 提供更清晰的错误代码与故障自诊建议

---

如需定制更多工具（如数据合并、特定导出预设、品牌手册模板自动化），请在 issues 中提交需求或直接联系维护者。
