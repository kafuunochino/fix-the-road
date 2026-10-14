# 激励复活预留契约（2026-10-14 核对）

当前正式适配器关闭真实广告，无广告位 ID，不开通流量主、不进行网络广告请求。离线演示只提供游戏内明确写着“模拟广告测试”的四种结果选择，不播放商业广告、不产生收入、不把模拟完成描述为真实 SDK 验证。

## 已核对的抖音小游戏官方文档

- [创建接口](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/api/javascript-api/ads/tt-create-rewarded-video-ad)：使用广告需先开通相关能力并取得广告位；iOS 播放/关闭可能触发 onHide/onShow，而 Android 行为不同。文档还描述无广告时可能出现分享替代的 count 回调。
- [关闭回调](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/api/javascript-api/ads/rewarded-video-ad/rewarded-video-ad-on-close)：isEnded 和 count 表达完成信息，官方建议有 count 时使用该字段。
- [显示方法](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/api/javascript-api/ads/rewarded-video-ad/rewarded-video-ad-show)：show 返回的 Promise 不是观看完成凭证。
- [错误回调](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/api/javascript-api/ads/rewarded-video-ad/rewarded-video-ad-on-error)：1004 表示无适合广告，需要业务兼容。
- [注意事项](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/api/javascript-api/ads/rewarded-video-ad/videoAdNotice)：可在用户操作时直接 show；错误监听必须覆盖异常。
- [销毁方法](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/api/javascript-api/ads/rewarded-video-ad/rewarded-video-ad-destroy)：销毁返回 Promise，应完成销毁后再创建实例。

## 本项目保守实现（不是官方额外保证）

`createRewardedService` 提供 `getState / request / cancel / destroy`。request 只结算一次，返回 `completed / cancelled / unavailable / error` 与唯一 requestId。

真实模式还必须满足明确配置 mode=live、非空真实 adUnitId、支持 SDK、shareFallbackDisabled=true。最后一项是未来人工验收的显式门槛，不是 SDK 设置，也不能据此声称已经关闭了平台的分享替代。当前 TT 没有提供这些配置，始终 disabled。

先绑定 close/error 再由玩家点击发起 show。仅活跃请求 onClose 中 isEnded===true 且 count 缺省或有限数值>=1 时认完成；不接受 count-only 的分享替代、show resolve、onLoad、onShow、undefined 关闭结果。这样比官方一般 count 建议更保守，真实接入前须用官方工具及真机确认平台实际行为，并确认不会自动分享替代。未确认前不得激活。

并发请求拒绝，90秒无回调超时不给奖励；取消、提前关闭、错误和无填充都恢复游戏操作。解绑同一函数引用；销毁完成前不创建下一实例；销毁失败则关闭后续真实广告请求，避免不确定实例污染下一请求。游戏另外核对 runId 和 requestId，本局最多复活一次。

宿主后台暂停与广告等待分开管理。广告导致的 onHide 不视为观看失败；恢复事件不奖励。换关、免费重开和销毁令旧回调失效，后台不推进车辆。所有结算失败仍保留免费重开，不把广告变成初始解题必需品。

真实 SDK、真机广告、实际时长/填充和平台自动分享均未验证。测试使用模拟 SDK 与精确 HTML 的模拟浏览器宿主。
