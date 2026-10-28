# 发布到 DSH 插件市场

Harness 里装的 `dshmarket` 只是市场客户端，插件列表来自策划仓库
[awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)。
上架 = 公开 GitHub 仓库 + 可选 npm 发布 + 一条 YAML 的 PR。

## 仓库现状

- 仓库：https://github.com/Kseleven/dsh-pomodoro-timer （public）
- 默认分支：`master`
- topic：`dsh-plugin` ✅
- `package.json` 的 `repository` / `homepage` / `bugs` 已指向该仓库

收录 CI 要求仓库**至少 1 天**。仓库创建于 2026-10-28，所以
**2026-10-29 之后**再去提 PR。

## npm 是可选的

不发布 npm 也能上架，市场会直接从 GitHub 仓库安装；本插件没有构建步骤，
安装时不会要求批准构建。发布 npm 的好处只是安装更快、有版本号、不依赖 GitHub 可达：

```sh
npm login
npm publish --access public     # 包名 dsh-pomodoro-card
```

若发布 npm，`repository` 已指回上面的仓库；市场会自动识别 npm 映射。

## 提 PR 到 awesome-dsh-plugin

Fork [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)，
新增**一个**文件 `data/plugins/Kseleven__dsh-pomodoro-timer.yml`：

```yaml
url: https://github.com/Kseleven/dsh-pomodoro-timer
name: Kseleven/dsh-pomodoro-timer
category: ui
description:
  en: A pomodoro timer docked below the composer, with focus/break cycles, inline settings, chime and optional system notifications.
  zh: 输入框下方的番茄钟：专注/休息轮转、内联设置、提示音与系统通知。
icon: https://raw.githubusercontent.com/Kseleven/dsh-pomodoro-timer/master/icon.png
```

- `category` 从固定集合取（`ui` / `usage` / `tools` / `fun` …），`description.en` 必填。
- 每个 PR 最多 3 条；不要手改自动生成的 README。
- 提交前对照 [contributing.md](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md)。

CI 会校验仓库确实声明了 `dsh.bundle`、仓库年龄、awesome-lint 和站点构建；合并后
站点与市场通常一天内刷新。

## 验证

- 条目页：`https://awesome-dsh-plugin.com/p/Kseleven/dsh-pomodoro-timer/`
- Harness 里打开市场搜索 `pomodoro`。
- 直接看数据：`curl -s https://awesome-dsh-plugin.com/plugins.json | grep dsh-pomodoro-timer`

## 截图（可选）

在仓库根目录添加 `screenshots.json`，列出 1–8 张仓库内相对路径图片：

```json
["screenshots/main.png"]
```

## 注意

本机目前是用 symlink 装的开发副本。装市场版本前，先在插件管理里卸掉本地
`dsh-pomodoro-card` bundle，否则同一个槽位会挂两个番茄钟。
