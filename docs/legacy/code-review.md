# 仓库代码审查报告

## 仓库概览
- 项目提供了一个面向 Adobe InDesign 的 Model Context Protocol (MCP) 服务器，入口在 `src/index.js`，统一注册 130+ 工具处理器并通过一个大型 `switch` 分派调用。
- README 详细说明了自动化能力（文档、页面、样式、导出、图书等）以及运行依赖（Node 18、Windows COM 或 macOS AppleScript）。

## 优点
- 工具分类清晰，处理器模块化，且通过 `stringUtils` 提供统一的响应格式和常用转义函数，便于扩展更多 InDesign 操作。
- `ScriptExecutor` 在 Windows 上缓存 COM 对象、在 macOS 上封装 AppleScript，兼容两种平台的自动化通道。
- `SessionManager` 维护页面尺寸、最近创建对象等状态，为自动定位等高级功能提供基础支持。

## 主要问题
1. **命令注入风险（高）**  
   `executeAppleScript` 直接将传入脚本拼接到 `osascript -e '${script}'` 中执行，一旦脚本或路径含有单引号就可能逃逸 shell，引入远程命令执行风险；同时该路径未经转义即可被外部参数影响。
2. **临时脚本文件竞争（中）**  
   macOS 执行逻辑把 JSX 写入固定的 `../../temp_script.jsx` 并同步写删；并发调用时多个请求会互相覆盖或删除，导致脚本串扰甚至执行错误，建议使用唯一文件名或锁。
3. **ExtendScript 注入点未转义（高）**  
   `textHandlers.createTextFrame` 把 `textColor`、`alignment` 等参数直接插入双引号字符串中，没有使用 `escapeJsxString`，用户只需传入 `"Black\"; alert('pwn'); //"` 即可注入任意 ExtendScript。
4. **导出处理器同样缺少转义（高）**  
   `exportPDF` 直接把 `pages` 字符串写入 `app.pdfExportPreferences.pageRange = "${pages}"`；`exportImages` 把 `format` 拼入 `"${format}"`，均可被恶意值破坏脚本或注入代码。需要像路径一样调用 `escapeJsxString` 并校验格式。
5. **事件 API 兼容性风险（中）**  
   `SessionManager` 扩展 `EventTarget` 并使用 `CustomEvent`，但 Node 18 在某些运行时并未内建 `CustomEvent`，可能在服务器启动时抛出 `ReferenceError`，建议提供 polyfill 或回退逻辑。
6. **小问题**  
   `scriptExecutor.js` 引入了 `os` 却未使用，可清理以避免 lint 失败。

## 其他观察
- 测试框架通过 Node 子进程顺序执行大量脚本，需要真实 InDesign 实例才能通过，自动化 CI 环境难以覆盖，建议补充单元测试或模拟层。
- `UtilityHandlers.executeInDesignCode` 允许执行任意 ExtendScript，是刻意暴露的危险入口，生产环境应增加访问控制或沙箱。

## 测试
- 未运行自动化测试（审查任务，且现有测试依赖真实的 InDesign 桌面环境）。
