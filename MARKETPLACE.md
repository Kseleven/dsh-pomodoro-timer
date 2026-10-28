# 发布到 DSH 插件市场

Harness 里装的 `dshmarket` 只是市场客户端，插件列表来自策划仓库
[awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)。
上架 = 公开 GitHub 仓库 + 可选 npm 发布 + 一条 YAML 的 PR。

## 0. 把占位符换成你的 GitHub 用户名

包清单里的 `YOUR_GITHUB` 是占位符。建好仓库后执行一次：

```sh
GITHUB_USER=<你的 GitHub 用户名>
npm pkg set \
  repository.url="git+https://github.com/$GITHUB_USER/dsh-pomodoro-card.git" \
  homepage="https://github.com/$GITHUB_USER/dsh-pomodoro-card" \
  bugs.url="https://github.com/$GITHUB_USER/dsh-pomodoro-card/issues"
git commit -am "chore: point repository metadata at GitHub"
```

## 1. 公开 GitHub 仓库

- 仓库名建议 `dsh-pomodoro-card`，public。
- 给仓库加 topic：`dsh-plugin`（收录 CI 会检查）。
- 仓库需要**至少 1 天**的年龄才会被收录。

## 2. 可选：发布 npm

不发布也能上架（市场会从 GitHub 安装，只是首次安装要批准一次构建步骤）；
发布成 npm 包则安装更快、不需要现场构建。

```sh
npm login
npm publish --access public
```

要求：

- 包名 `dsh-pomodoro-card`（已确认 npm 上没人占用）。
- `package.json` 的 `repository` 指回上架的仓库（第 0 步已处理）。
- 不要把 `private: true` 加回来。

## 3. 提 PR 到 awesome-dsh-plugin

Fork [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)，
新增**一个**文件 `data/plugins/<owner>__<repo>.yml`（注意是两个下划线），例如
`data/plugins/octocat__dsh-pomodoro-card.yml`：

```yaml
url: https://github.com/octocat/dsh-pomodoro-card
name: octocat/dsh-pomodoro-card
category: ui
description:
  en: A pomodoro timer docked below the composer, with focus/break cycles, inline settings, chime and optional system notifications.
  zh: 输入框下方的番茄钟：专注/休息轮转、内联设置、提示音与系统通知。
icon: https://raw.githubusercontent.com/octocat/dsh-pomodoro-card/main/icon.png
```

- `category` 从固定集合取（`ui` / `usage` / `tools` / `fun` …），`description.en` 必填。
- 每个 PR 最多 3 条；不要手改自动生成的 README。
- 建议附上 `screenshots.json`（见下文）让详情页有图。
- 提交前对照 [contributing.md](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md)。

CI 会校验仓库确实声明了 `dsh.bundle`、仓库年龄、awesome-lint 和站点构建；合并后
站点与市场通常一天内刷新。

## 4. 验证

- 条目页：`https://awesome-dsh-plugin.com/p/<owner>/dsh-pomodoro-card/`
- Harness 里打开市场搜索 `pomodoro`。
- 也可以直接看数据：`curl -s https://awesome-dsh-plugin.com/plugins.json | grep dsh-pomodoro-card`

## 5. 截图（可选）

在仓库根目录添加 `screenshots.json`，列出 1–8 张仓库内相对路径图片：

```json
["screenshots/main.png"]
```

## 注意

本机目前是用 symlink 装的开发副本。装市场版本前，先在插件管理里卸掉本地
`dsh-pomodoro-card` bundle，否则同一个槽位会挂两个番茄钟。
