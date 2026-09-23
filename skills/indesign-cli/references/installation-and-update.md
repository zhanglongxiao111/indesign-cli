# 安装与更新

用户电脑只需预先装好 Adobe InDesign；浏览器用系统自带的 Edge。

## 在 SA-AIAPP 里（优先）

SA-AIAPP 每次启动都会从公司货架把 InDesign 工具装进本机工具箱，并保持最新版。入口是环境变量 `SA_AGENT_INDESIGN`：

```powershell
& $env:SA_AGENT_INDESIGN tool list --domain html
```

- 只要有这个变量，就把它当作 `<agent-exe>`。**不要自己运行 Setup，也不要去找 launcher。**
- 要查运行环境目录、自带的 node 或 Edge，运行 `& "<agent-exe>" server health`，分别读 `data.runtime.root`、`data.node.bundled_node_path`、`data.edge.path`。`health` 和 `install` 是 launcher 才有的命令，SA 入口不支持。
- 没有这个变量，说明本机 SA 还没更新到提供它的版本，或者工具箱这次没装成功。先按下一节用 launcher 把任务做完，再提醒用户更新或重启 SA-AIAPP。

## 不在 SA 里：launcher

首次安装用公司提供的 Setup：

```powershell
& "\\daga-nas5\sa-ai-app\tools\indesign-cli\indesign-cli-agent-setup.exe"
```

Setup 返回体里的 `registration.launcher_abspath` 是 launcher 的绝对路径。**先记下它，后面所有调用都用它作 `<agent-exe>`。**

装好以后，可以重新注册命令并检查更新：

```powershell
& "<agent-exe>" install
```

检查状态：

```powershell
& "<agent-exe>" health
& "<agent-exe>" server health --deep --connect-indesign
& "<agent-exe>" tool list --domain html
```

除 `health`、`version`、`install` 外，其它普通命令启动前都会先检查运行环境有没有更新。**更新失败时它会继续用旧版本，只在返回体的 `data.update.warnings` 里留一条记录**，而命令本身照常成功。所以只要 `warnings` 不为空（比如出现 `EDGE_NOT_AVAILABLE`），就把原文转告用户，不要当成正常情况。旧的 `0.4.2` 单文件版不能直接升级，必须重新运行新版 Setup。用户不需要另外安装 Node、Python、npm、Git 或 HTML 插件。

### 在隔离的 Agent 运行时里安装

有些 Agent 运行时会把 `HOME`、`LOCALAPPDATA` 重定向到隔离目录，安装位置会跟着变，而且**注册的用户 PATH 在本次会话里不生效**。典型表现是：Setup 返回 `registered: true`，紧接着调用裸命令 `indesign-cli-agent` 却提示找不到命令。

处理方式：

- 用 `registration.launcher_abspath` 作 `<agent-exe>`，不要依赖裸命令。
- 同一返回体里 `path_effective_in_current_process` 为 `false`，意思是本次会话别指望 PATH。
- 只有 `Get-Command indesign-cli-agent` 真能查到时，才可以用裸命令。
- 需要 Node 时，用 `server health` 返回的 `node.bundled_node_path`（运行环境自带的 node 的绝对路径），不要满盘搜索。`node.available` 只表示 PATH 上有没有 node，CLI 并不依赖它。

如果 Setup 的返回体丢了，默认安装位置是 `%LOCALAPPDATA%\indesign-cli\bin\indesign-cli-agent.exe`；在重定向环境里，`%LOCALAPPDATA%` 本身已经指向隔离目录。
