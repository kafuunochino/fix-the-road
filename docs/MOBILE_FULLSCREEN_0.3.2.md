# Mobile fullscreen correction 0.3.2

Reported on a physical phone: scene does not occupy the full screen and large blank margins surround it. No phone screenshot or host/system dimensions were supplied, so the exact host-specific trigger remains unconfirmed.

Confirmed code issues: logical scene capped at 480×920 then centered; viewport outside the safe rectangle only painted a flat color; square map centered with unused vertical bands; native adapter used window dimensions ahead of screen dimensions and did not subscribe to optional window resize events. A missing CSS style is NOT asserted as the cause: native Canvas is not a DOM Canvas.

Corrections: remove scene caps; paint grid background over entire canvas before inset content; retain safe controls and square road tiles; use remaining tall-phone area for city/depot scenery; prefer native screen logical extent, with explicitly supplied resize-event container dimensions taking precedence; read getMenuButtonLayout first; preserve DPR rendering and direct logical touch coordinates. Existing platform optional fallback remains supported. No game rules, 50-level solutions, coin receipts, or actual ad enablement changed.

Validation: 245 passing tests, including existing 235 and 10 new exact ES2018 native-bundle simulated-host tests. Eight profiles from 320×568 to 540×1200, tablet and wide orientation cover scene extent, backingstore/DPR, safe controls, taps, smaller window vs screen dimensions, resize gesture cancellation and listener cleanup. Three actual native Canvas raster previews use the exact native bundle with simulated host APIs; these are NOT phone screenshots or official emulator validation. Physical-phone confirmation and platform upload are still required.

Official references checked 2026-10-15:
- https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/api/javascript-api/drawing/picture/tt-create-canvas
- https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/guide/dev-guide/bytedance-mini-game
- https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/guide/game-engine/godot/adaptation-checklist
- https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/api/interface/menu/tt-get-menu-button-layout

Reproduce: npm test; node qa/render-native-fullscreen.mjs. Canvas rendering uses @napi-rs/canvas and an installed Noto CJK font. No external runtime assets are required.
