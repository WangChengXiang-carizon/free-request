# Free Request

Free Request 是一个 VS Code 内置的轻量接口调试扩展，目标是提供接近 Postman 的核心请求体验（集合、环境变量、请求编辑、发送与响应查看），并保持更轻量的本地工作流。

## 版本更新（0.0.3）

- 新增 Postman 风格 Body 类型：`none`、`form-data`、`x-www-form-urlencoded`、`raw`、`binary`、`GraphQL`
- `raw` 新增子类型：`Text`、`JavaScript`、`JSON`、`HTML`、`XML`
- 响应区新增格式选择器：`Auto`、`JSON`、`XML`、`HTML`、`Text`
- 响应区新增“自动换行 / 不换行”与显式“搜索”按钮（请求编辑页与单独响应页）
- History 新增单条记录查看页（展示请求与响应快照）
- History 支持单条删除与一键清空

## 功能概览

- Collections / Environments / History 三面板
- History 支持查看、删除、清空
- 支持请求新增、编辑、复制、重命名、删除
- 支持请求方法：`GET`、`POST`、`PUT`、`DELETE`、`PATCH`、`HEAD`、`OPTIONS`
- 支持 `{{variable}}` 模板变量替换（URL / Headers / Body / Auth）
- 支持 Auth：`No Auth`、`Bearer Token`、`Basic Auth`
- 支持 Body 模式：`none`、`form-data`、`x-www-form-urlencoded`、`raw`、`binary`、`GraphQL`
- `raw` 支持子类型：`Text`、`JavaScript`、`JSON`、`HTML`、`XML`
- 响应面板支持 `Status / Time / Size` 元信息，以及 `Body / Headers` 页签

## 安装插件（VSIX）

### 在线安装（Marketplace）

- 浏览器打开：`https://marketplace.visualstudio.com/items?itemName=cxwang.free-request`
- 点击页面中的 `Install`，按提示拉起 VS Code 完成安装

也可以在 VS Code 内安装：

1. 打开扩展面板（Extensions）
2. 搜索 `cxwang.free-request` 或 `Free Request`
3. 点击 `Install` 安装并按提示 `Reload`

### 从vsix安装

1. 从github获取vsix,地址: https://github.com/WangChengXiang-carizon/free-request/releases
2. 打开 VS Code，进入扩展面板（Extensions）。
3. 点击右上角 `...`，选择 `Install from VSIX...`。
4. 选择刚下载的 `.vsix` 文件并确认安装。
5. 安装完成后，按提示 `Reload` VS Code。

安装后，在侧边栏即可看到 `Free Request` 视图容器。

## 当前目录结构

```text
src/
	controller/
		collectionController.ts
		envController.ts
		itemController.ts
		requestController.ts
		systemController.ts
	view/
		requestView.ts
		input.ts
	dataStore.ts
	extension.ts
	models.ts
	requestBodyParser.ts
	test/
```

- `extension.ts`：扩展入口，负责 provider 初始化与 controller 装配
- `controller/*`：命令处理与业务编排
- `view/requestView.ts`：请求编辑页与响应页 Webview 渲染
- `view/input.ts`：统一输入对话框与分步输入工具

## 模块职责与依赖方向

推荐依赖方向（由上到下）：

```text
extension.ts
	-> controller/*
		-> dataStore.ts
		-> view/*
	-> models.ts
```

约束建议：

- `extension.ts` 仅做装配与生命周期管理，避免承载业务细节
- `controller/*` 负责命令响应、参数校验与流程编排
- `dataStore.ts` 负责状态与持久化，不依赖 controller
- `view/*` 负责 UI 渲染与输入工具，不直接操作数据存储
- `models.ts` 作为共享类型层，供所有模块依赖

## 与 Postman 对比

| 能力 | Postman | Free Request |
| --- | --- | --- |
| Collection/Folder 管理 | ✅ | ✅ |
| Environment 变量 | ✅ | ✅ |
| `{{变量}}` 替换 | ✅ | ✅ |
| HTTP Methods（GET/POST/PUT/DELETE/PATCH/HEAD/OPTIONS） | ✅ | ✅ |
| Params/Headers 可视化编辑 | ✅ | ✅ |
| Body 模式切换（none/form-data/x-www-form-urlencoded/raw/binary/GraphQL） | ✅ | ✅ |
| Auth（Bearer/Basic） | ✅ | ✅ |
| 响应查看（Body/Headers） | ✅ | ✅ |
| 响应性能指标（耗时/大小） | ✅ | ✅ |
| Pre-request Script | ✅ | ❌ |
| Test Script | ✅ | ❌ |
| Cookie 管理器 | ✅ | ❌ |
| Mock / Monitor / CI 集成 | ✅ | ❌ |

> 当前定位是「Postman 核心请求能力的 VS Code 内嵌轻量版」，不是完整替代品。

## 快速开始

1. 在 VS Code 启动扩展调试（`F5`）。
2. 打开侧边栏 `Free Request` 容器。
3. 创建 `Collection` 或直接创建 `Request`。
4. 在请求编辑器中设置：
	- Method（GET/POST/PUT/DELETE/PATCH/HEAD/OPTIONS）+ URL
	- Params / Headers
	- Auth（可选）
	- Body 模式与内容
5. 点击 `Send` 查看响应。

## 变量使用示例

先在 Environments 中创建变量：

- `baseUrl = https://jsonplaceholder.typicode.com`
- `token = your_token`

然后在请求中使用：

- URL: `{{baseUrl}}/todos/1`
- Header: `Authorization: Bearer {{token}}`
- Body: `{ "name": "{{userName}}" }`

发送时会自动解析模板变量。

请求编辑器中的 Environment 下拉框默认项为 `NO ENVIRONMENTS`：

- 选择 `NO ENVIRONMENTS` 时，不会获取任何环境变量
- 仅在选择具体环境组时，才会执行 `{{variable}}` 替换

## Body 模式说明

- `none`：不发送请求体
- `form-data`：按键值对构建 `FormData`
- `x-www-form-urlencoded`：按键值对编码为 query string 风格请求体
- `raw`：支持 `Text`、`JavaScript`、`JSON`、`HTML`、`XML`
	- `raw + JSON`：发送前会校验 JSON 格式
	- 其他 raw 子类型按纯文本发送，并自动补齐对应 `Content-Type`（若未手动设置）
- `binary`：选择本地文件后以二进制方式发送（默认 `application/octet-stream`）
- `GraphQL`：提供 `Query` 与 `Variables` 输入区，其中 `Variables` 必须为合法 JSON 对象

## 开发命令

- 安装依赖：`npm install`
- 编译：`npm run compile`
- 监听编译：`npm run watch`
- 测试：`npm test`

## 数据存储

- 默认文件名：`collections.json`
- 固定路径：`~/.cache/.free-request/collections.json`
- 也可通过命令 `Free Request: 手动保存` 后查看状态栏提示的完整路径

## 已知限制

- 暂不支持 Postman 脚本体系（Pre-request / Tests）
- 暂不支持 Cookie 管理、Mock、Monitor
- 暂不支持 OAuth 2.0 等高级认证流程

## 下一步路线（建议）

- 增加 Pre-request / Test Script 基础执行能力
- 增加 Cookie 面板与请求级开关
- 增加导入/导出（Postman Collection 基础兼容）
