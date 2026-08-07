# 安装与更新

用户电脑只需预先安装 Adobe InDesign；浏览器使用系统 Edge。

首次安装使用公司提供的 Setup：

```powershell
& "\\daga-nas5\sa-ai-app\tools\indesign-cli\indesign-cli-agent-setup.exe"
```

Setup 返回体里的 `registration.launcher_abspath` 是可执行文件绝对路径。**先记下它，后续所有调用都用它**，下文统一写作 `<agent-exe>`。

已经安装后可重新注册命令并检查更新：

```powershell
& "<agent-exe>" install
```

检查状态：

```powershell
& "<agent-exe>" health
& "<agent-exe>" server health --deep --connect-indesign
& "<agent-exe>" tool list --domain html
```

## 在 Agent 运行时里安装

部分 Agent 运行时会把 `HOME` / `LOCALAPPDATA` 重定向到隔离目录，安装落点随之改变，并且**注册的用户 PATH 在当次会话不会生效**。典型表现是 Setup 返回 `registered: true`，紧接着调用裸命令 `indesign-cli-agent` 却报找不到命令。

处理方式：

- 用 `registration.launcher_abspath` 作为 `<agent-exe>`，不要依赖裸命令。
- 同一返回体里的 `path_effective_in_current_process` 为 `false`，即当次会话不要指望 PATH。
- 只有 `Get-Command indesign-cli-agent` 真能查到时，才可以用裸命令。
- 需要 Node 时用 `server health` 返回的 `node.bundled_node_path`（运行时自带的 node 绝对路径），不要满盘搜索。`node.available` 只表示 PATH 上有没有 node，CLI 并不依赖它。

如果丢失了 Setup 返回体，默认安装落点是 `%LOCALAPPDATA%\indesign-cli\bin\indesign-cli-agent.exe`；在重定向环境里，`%LOCALAPPDATA%` 本身已被指向隔离目录。

普通命令启动前会自动检查运行环境更新；更新失败时继续使用当前可用版本。旧 `0.4.2` 单文件版不能直接升级，必须重新运行新版 Setup。用户不需要另装 Node、Python、npm、Git 或 HTML 插件。
