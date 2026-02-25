# Change Log

All notable changes to the "free-request" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

- 暂无

## [0.1.0] - 2026-02-25

### Added

- 新增 Postman 风格请求编辑体验：`Params` / `Headers` / `Auth` / `Body` 分栏
- 新增认证方式：`No Auth`、`Bearer Token`、`Basic Auth`
- 新增请求体模式：`raw (JSON)`、`form-data`、`x-www-form-urlencoded`
- 新增响应元信息展示：`Status`、`Time`、`Size`
- 新增响应页签切换：`Body` / `Headers`
- 新增模板变量替换能力：支持在 URL、Header、Body、Auth 中使用 `{{variable}}`
- 新增最小测试骨架与 `npm test` 脚本（请求体解析器单测）

### Changed

- 将数据模型与存储逻辑从 `extension.ts` 抽离至独立模块（`models.ts` / `dataStore.ts`）
- 请求发送链路改造为按 Body 模式构造数据并自动处理对应 Content-Type
- 复制请求时同步复制认证与 Body 模式配置

### Fixed

- 修复请求体 JSON 非法时错误提示不清晰的问题
- 修复历史记录未持久化的问题（重启后历史可恢复）
- 修复 Node 类型诊断噪音（`tsconfig` 增加 `node` / `vscode` types）