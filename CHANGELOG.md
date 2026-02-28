# Change Log

All notable changes to the "free-request" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

## [0.0.5] - 2026-02-28

### Added

- 支持单个 Collection 导出与导入（含子集合与请求）

### Changed

- `Ctrl/Cmd+S` 保存前会同步 PATH 请求名，避免必须失焦后左侧才刷新

## [0.0.4] - 2026-02-28

### Changed

- 版本号升级至 `0.0.4`
- 发布新的 `0.0.4` VSIX 安装包

## [0.0.3] - 2026-02-27

### Added

- 新增 Postman 风格 Body 类型：`none`、`form-data`、`x-www-form-urlencoded`、`raw`、`binary`、`GraphQL`
- 新增 `raw` 子类型：`Text`、`JavaScript`、`JSON`、`HTML`、`XML`
- 新增 `binary` 模式文件选择并支持以二进制内容发送
- 新增 `GraphQL` 模式（`Query` + `Variables`），并校验 `Variables` 为合法 JSON 对象
- 新增响应 Body 格式选择器：`Auto`、`JSON`、`XML`、`HTML`、`Text`
- 新增响应区显式搜索按钮（请求编辑页与单独响应页）
- 新增响应区“自动换行 / 不换行”切换按钮（请求编辑页与单独响应页）
- 新增 History 单条记录查看能力，可展示对应请求与响应详情
- 新增 History 单条删除与标题栏一键清空

### Changed

- Params 与 URL 同步时保留 `{{variable}}` 模板占位符，避免被 URL 编码后失效
- 请求 Body 的 `Pretty/Raw` 扩展为支持 `raw + json/xml/html`

### Fixed

- 修复单独响应页将 JSON 响应误判为“非 JSON 响应”的问题
- 修复单独响应页 JSON 高亮与请求编辑页规则不一致的问题
- 修复请求编辑页脚本转义问题导致整页按钮不可点击的问题

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

## [0.0.2] - 2026-02-27

### Added

- 增加 `*` 激活与受限工作区支持（`untrustedWorkspaces`），进一步修复 Remote Linux 下命令未激活导致的 not found

### Changed

- 将请求编辑器默认环境选项由 `All Variables` 调整为 `NO ENVIRONMENTS`
- 选择 `NO ENVIRONMENTS` 时不再获取环境变量（不进行变量替换）
- 允许扩展在 `workspace/ui` 双宿主运行，降低 Remote SSH 下 VSIX 安装位置差异导致命令不可用的风险

### Fixed

- 提升扩展版本并增加 `onStartupFinished` 激活，修复 Remote SSH 场景下偶发命令未注册（如 `free-request.importData`）
- 调整激活流程：先注册命令再初始化树视图，避免 Linux 远端树视图初始化异常导致所有命令不可用