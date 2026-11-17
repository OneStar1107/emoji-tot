# vendor/aora-bot.js

这份文件不是本项目的代码，是从 npm 包 `@aora-bot/element@0.2.0` 的
`dist/` 目录原样复制来的单文件构建（含引擎与懒加载的样式 chunk）。

- 来源：https://github.com/sam70361/aora-bot
- 许可：Aora Bot License 1.1，见仓库根目录 `NOTICE.md` 与上游 `LICENSE`
- 为什么复制而不是 `import`：渲染进程跑的是 file:// 页面，没有打包步骤，
  单文件构建是唯一能让 `<aora-bot>` 直接可用的方式。升级上游时替换这整个目录。
- 不要在这个目录里改代码：改动会在下次替换时丢失。
