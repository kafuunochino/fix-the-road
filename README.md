# 修好这条路 · Canvas Demo

一个道路旋转解谜游戏。后半段加入“双车接力”：两辆送货车共用道路，需要在两次发车之间切换共享岔口，把面包和鲜花分别送到正确的目的地。

独立 GitHub 私有仓库：https://github.com/kafuunochino/fix-the-road

## 当前阶段

先以 demo 和跑通流程为目标，用户负责游玩体验与后续方向建议。正式方向是抖音小游戏优先，后续再考虑微信兼容。

- 已实现 Canvas2D 画面和所有游戏控件，不依赖 DOM/CSS 游戏界面。
- 10 个手工设计关卡，前 4 关熟悉道路旋转，第 5–10 关是双车接力。
- 支持道路旋转、共享岔口、路线预览、车辆动画、撤销、重置、提示、选关、音效开关、本地进度。
- `npm run check`：64 项自动化测试全部通过，涵盖纯规则、Canvas 指针流程、fake-tt 适配和构建。
- 尚未完成真实浏览器视觉验收、抖音开发者工具验收、iOS/Android 实机验收，未上传抖音测试/体验版。
- 开发侧负责每轮开发或修改后的源码同步及远端提交核验，不将尚未同步的本地代码描述为已备份。

## 运行与交付物

需要 Node.js 20 或更高版本。无 npm 第三方依赖，不需要安装依赖。

```sh
npm test       # 构建后执行全部测试
npm run check # 语法检查 + 构建 + 全部测试
npm run build # 生成离线 HTML 和抖音候选目录
npm run serve # 开发服务器，默认端口 4172
```

- 源码预览：启动服务器后打开 http://localhost:4172 。`PORT` 可指定其他端口。在隔离执行环境中，其他浏览器或进程可能无法访问这个 localhost。
- 单文件离线预览：`deliverables/fix-the-road-demo.html`。用现代浏览器直接打开，所有脚本与提示音内嵌，不访问远程资源。文件来源的存储行为可能因浏览器而异，无法保存时不影响游玩。
- 抖音候选目录：`dist/douyin/`，包含 `game.js`、`game.json`、`project.config.json` 和提示音，默认使用已核验的非敏感 AppID `tt0b947d2995edc0c502`。应用名称为“修好这条路”，目前仍未上传测试包；不能将生成目录当作已完成平台验收或上传。
- 旧版 DOM/SVG 原型保留在 `prototype-dom.html`、`style.css`、`src/app.js`、`src/art.js`，仅作设计快照，不进入 Canvas 或抖音构建。

## 玩法

1. 点击道路，使它顺时针旋转 90°，让道路两端接上。
2. 可以预览当前小车能走多远，也可以使用提示找出第一处待调整的位置。
3. 黄色车送面包到面包店，紫色车送鲜花到花园。
4. 第 5 关起，第一辆到达后要点击橙色岔口换方向，才能发送第二辆。
5. 无倒计时、无体力、无失败惩罚。撤销可以退回道路转动或上一次成功送达。

## 架构

- `src/rules.js`：无渲染、无存储依赖的纯规则及不可变状态变更。
- `src/levels.js`：10 个手工布局、初始旋转和完整参考解法。
- `src/canvas-game.js`：`startGame(platform)`，所有画面、控件、指针命中和游戏循环。
- `adapters/browser.js`：唯一的浏览器 DOM 接口层，负责 Canvas 尺寸、指针、存储、音频及生命周期。
- `adapters/tt.js`：显式注入的抖音候选适配层；目前只经过模拟宿主验证，不等于实机 SDK 验证。
- `adapters/douyin-sidebar.js`：受保护的侧边栏能力检查与导航；同步监听最新 onShow，仅在支持时显示 Canvas 入口，必须由玩家点击后导航，不发放奖励。
- `config/douyin.json`：已核验的非敏感 AppID、应用名、版本及描述。`DOUYIN_APP_ID` 可覆盖构建，显式空串仅用于测试；测试完成恢复 canonical ID。
- `artifacts/douyin-candidate-manifest.json`：冻结候选的应用 ID、版本、相对路径和 SHA-256 清单。上传前应与 `dist/douyin/` 逐文件核验。
- `scripts/build.mjs`：限定模块图的确定性组装器，校验命名 import/export 和依赖顺序；不是通用打包器。后续正式工程应换用经验证且锁版本的构建工具。
- `test/`：规则、指针游戏流程、适配器、构建测试。
- `qa/test-results.txt`：最近一次检查输出；`qa/TEST_PLAN.md`：覆盖与未完成验证项。

平台接口约定：

```js
startGame({
  canvas,
  getSize: () => ({ width, height, dpr }),
  onPointer, onResize, onPause, onResume,
  requestFrame, cancelFrame,
  storage: { getItem, setItem },
  audio: { play, setMuted },
  sidebar // optional guarded platform capability
}) // returns { destroy(), getSnapshot() }
```

指针事件为 `{type: 'down'|'move'|'up'|'cancel', x, y, id}`，坐标使用逻辑像素，不是设备像素。适配器设置 backing canvas 尺寸，渲染器设置 DPR transform。`getSnapshot()` 仅为只读测试观察，不提供状态修改接口。

## 测试责任和已知限制

开发侧负责 bug 与流程测试，用户负责体验建议，不把开发侧应完成的错误排查转嫁给用户。

自动化通过不等于真人游玩、截图检查或平台兼容通过。当前本地 Chromium 启动被执行环境的 socket 限制阻止，独立云浏览器也不能访问该隔离 localhost；正在通过可支持的文件预览路线补充验收。完整限制见测试计划。

- 已配置真实抖音 AppID，已实现并模拟测试侧边栏候选路径；真实平台能力检查、平台入口要求、编译、提审和测试版上传仍未验证。不能用函数名存在或 mock 通过代替平台预检。
- 未接入平台登录、广告、支付、排行榜、云存档或联网服务。
- 微信运行时未实现；纯规则和平台接口为未来迁移提供边界，不宣称现已兼容。
- 尚未完成 Canvas 键盘与屏幕阅读器体验；主要输入是触控与鼠标。
- 原型仅提供一种简短原创提示音，不是完整声音设计。

## 美术、声音和隐私

美术全部由原创 Canvas / SVG / CSS 代码绘制，不购买素材，不引用外部图片或字体。提示音为程序生成 WAV。

游戏不需要账户或后台，进度仅存在当前设备/浏览器本地存储中；清除数据、无痕模式或换设备可能丢失进度。这不影响 GitHub 源码备份。
