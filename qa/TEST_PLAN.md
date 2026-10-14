# 修好这条路 · 测试记录与待验收项目

## 已通过：自动化 64 / 64

日期：2026-10-14。命令：`npm run check`。原始输出：`qa/test-results.txt`。

### 纯规则 29 项

- 所有道路的旋转端口、双路岔口选择。
- 10 个关卡完整解法，包括所有车辆；实际路径与手工路线完全相符，不依赖意外捷径。
- 所有关卡开始时未解开。
- 正确到达、断路、错误目的地、错误车库、关闭岔口、越界、缺失车辆。
- 双车必须改变共享岔口才可分别正确送达。
- 无效操作不改变状态，转动/发车/撤销保持不可变状态语义。
- 四次旋转、两次岔口切换回到原状。
- 遍历所有道路初始格的各方向，追踪安全且不污染关卡数据。
- 全部解法完成后逐步撤销，可精确回到初始状态。
- 不可信存档的版本、类型、关卡 ID、重复值和非法数字处理。

### 模拟 Canvas 指针流程 21 项

- 10 个关卡分别通过画布命中区域的 down/up 指针事件完成、显示结果并重玩。
- 失败发车、预览、提示、撤销、重置。
- 第二辆车未切岔口被正确拒绝，切换后完成。
- 弹层隔离点击，阻止穿透到棋盘。
- 行驶中不提供重复发车命中区；切换关卡取消旧动画。
- 暂停冻结动画、恢复继续；destroy 清理所有监听和帧回调。
- 360 × 740、DPR 3 下的逻辑指针映射。
- 存储被拒绝及取消触控事件不破坏流程。
- 点击必须在同一目标开始和结束，不能从格外滑入触发。
- 发车后、下一绘制帧前立即失效旧命中区，不能在动画中修改道路或重置。
- 次要触点及其 up/cancel 不会吞掉主触点。
- 拖动离开目标再返回不触发旋转。
- Canvas 侧边栏入口在不支持时隐藏；支持时只有显式点击才导航，pending 防重，失败提示与最新返回状态均不会修改进度。

独立复核发现了以上点击边界、发车后旧命中区、多点触控问题；已修复并加入对应回归测试。

这些使用模拟绘图上下文，只验证逻辑/调用/输入，不证明真实像素视觉。

### 适配与构建 6 项

- tt 适配器仅创建一个 canvas，正确设置 DPR，触摸坐标保持逻辑像素。
- 生成的抖音入口在没有 window/document/localStorage 的 fake-tt VM 中启动、绘制、响应触摸并保存设置。
- 单文件 HTML 无外部依赖，在模拟 browser adapter 中启动。
- 重复构建逐字节一致。
- canonical AppID、显式空覆盖、测试 ID 覆盖、非法值拒绝；测试结束恢复真实 ID，逐项验证 SHA-256 manifest。
- 实际生成的 tt 候选包只响应受支持的 Canvas 侧边栏点击，不自动导航；最新 onShow 替换返回状态，成功回调不伪造奖励。

这些不是抖音开发者工具或实机验证。

## 受保护侧边栏模拟测试 8 项

- 在 Canvas 创建前同步注册 onShow 并检查支持，不自动导航。
- 缺失、不支持、能力检查失败时不显示可用导航。
- 点击调用真实 API 路径，pending 防重，成功回调不伪造返回。
- 每次 onShow 都替换旧状态，部分匹配不算侧边栏进入。
- 导航失败、取消、抛错降级；中断后正常返回可结清 pending。
- 旧回调不能覆盖新状态；destroy 清理监听并结清挂起请求。
- tt 适配器持有侧边栏生命周期。

候选清单：`artifacts/douyin-candidate-manifest.json`；真实 AppID 已配置，但这不证明官方预检、上传、审核或手机兼容通过。

## 浏览器视觉验收：未完成

真实 Chromium 尝试在页面加载前因执行环境 socket 限制失败。独立云浏览器访问 http://127.0.0.1:4172 返回连接拒绝。虽然开发服务器会话已运行，但隔离环境间 localhost 不可达。

已准备 `deliverables/fix-the-road-demo.html`，供支持的私有文件预览路线使用。尚未截图，不报告视觉通过。

待验收：

- 手机竖屏 390 × 844、360 × 740，桌面窗口缩放；确保文字/按钮不溢出、6 × 6 格可点击。
- 原生鼠标及 touch 输入，实际旋转、动画、错误目的地反馈。
- 双车完整闭环，最后一关返回地图。
- 发车连点、选关/重置/弹层反复操作、后台再前台。
- 真正 localStorage 存档恢复、损坏存档、拒绝存储。
- 真实音频播放/静音及自动播放限制。
- HTML 文件直接打开以及普通 HTTP 浏览器启动。

## 抖音与实机：未完成

- 真实 AppID 已核验并配置：tt0b947d2995edc0c502。仍需开发者工具导入、平台日志与包体验验证。
- 根据当前平台要求补齐能力检查、侧边栏/入口及失败降级。
- 开发者工具预览、Android/iOS 实机触摸与屏幕适配。
- 后台/恢复、存储、音频、平台回调与重启兼容。
- 获得所需账号/权限后上传测试或体验版，并核验状态。

不以 fake-tt 或 H5 流程通过替代以上验收，不把用户游玩建议替代开发侧测试责任。

## 0.2.0 手机施工UI回归

- 对最终独立HTML原样执行浏览器适配器，8组视口各完成10关并检查所有菜单/结算/工具命中区≥44 CSS px、安全区内。
- 双车送达后撤销/重发、错误分岔、菜单中切关、错误存储、暂停/恢复、仅安全区改变时取消手势均覆盖。
- 320×480结算目标文字必须在下一关按钮上方保留间距；不只检测按钮互不重叠。
- 原生Canvas预览检查了主地图、6列道路、工具箱、手册和短屏结算；它不替代真实浏览器或真机验收。
- 待真实环境继续检查：iOS/Android动态视口、刘海和宿主胶囊、声音、真实字体、触控、性能及抖音编译。


## 0.3.0 Campaign acceptance

- Exactly 50 fixed levels. Preserve baseline first-ten data digest. Replay every initial solution with zero coins, tools or revival, following exact authored paths. Verify 50 unique route topologies; 20 crane levels, including 10 requiring panel reuse after the first vehicle.
- Exercise actual shipped standalone HTML via its browser adapter at eight viewports (including 320px plus safe insets). All 50 solutions use pointer events; no debug state mutation. All new panels additionally check >=44 CSS pixels, safe containment and nonoverlapping hitboxes at four extreme viewports.
- Demonstrate all 40 finite-budget stages can stop from player errors and freely restart. Exhaust work without refund-through-undo; allow one optional recovery, never require it for the initial solution.
- Economy: first clear pays20 exactly once, replays and delivery undo cannot duplicate; limited work tool costs12 once/run, revival costs20 once/run. Currency underflow/invalid saves/legacy migration/storage denial covered. Coins are local only, no purchases.
- Reward SDK adapter: default disabled, no real ad IDs. Test four explicit mock results, busy rejection, close validation, duplicate/stale callback, count-only share rejection, rejected/throwing show, timeout, cancellation, cleanup-await and failed cleanup. Restart/background/destroy must not leave locked gameplay or late rewards.
- Native Canvas approximate screenshots reviewed with registered Noto CJK: 390x844 and320x480 main, crane, brake animation, failure, mock-ad choices, revived play, all chapter tabs, result and tool shop. These are not browser/phone screenshots.
- Not completed: independent current-version reviewer, real browser audio/pixels, touchscreen/device UI, official Douyin tools or real SDK callbacks. Real ads and public upload remain disabled/out of scope.


## 0.3.1 purchase recovery regressions

Retain all198 prior checks; add20 receipt/refund regressions. Exact HTML with actual adapter/localStorage map: tool/revive/both reload, repeated refund, free restart, other-level selection, permanent leave, failure preservation, bfcache effect preservation, win settlement, repeated clear, write-before/after/uncertain failures, refund/settlement persistence failure, boot-time failure, multi-click and stale-tab overwrite rejection. Re-run all50 solutions at8 viewports after the patch. No browser/device execution claim.
