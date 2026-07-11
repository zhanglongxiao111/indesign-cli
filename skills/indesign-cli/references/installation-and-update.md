# 安装与更新

用户电脑只需预先安装 Adobe InDesign；浏览器使用系统 Edge。

首次安装使用公司提供的 Setup：

```powershell
& "<setup-path>\indesign-cli-agent-setup.exe" install
```

已经安装后可重新注册命令并检查更新：

```powershell
indesign-cli-agent install
```

检查状态：

```powershell
indesign-cli-agent health
indesign-cli-agent server health --deep --connect-indesign
indesign-cli-agent tool list --domain html
```

普通命令启动前会自动检查运行环境更新；更新失败时继续使用当前可用版本。旧 `0.4.2` 单文件版不能直接升级，必须重新运行新版 Setup。用户不需要另装 Node、Python、npm、Git 或 HTML 插件。
