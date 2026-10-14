/** Optional developer raster review using a preinstalled @napi-rs/canvas.
 * Not required to build/play; not browser screenshots or phone validation.
 */
import {createRequire} from 'node:module';
import fs from 'node:fs';
import {LEVELS} from '../src/levels.js';
import {createPhoneHarness} from './phone-harness.mjs';
const require=createRequire(import.meta.url),{createCanvas,GlobalFonts}=require('@napi-rs/canvas');
const font='/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc';
if(fs.existsSync(font))GlobalFonts.registerFromPath(font,'Noto Sans CJK SC');
const cases=[
 ['road-phone-320',320,568,{top:44,right:0,bottom:34,left:0},1],
 ['road-phone-320-level10',320,568,{top:44,right:0,bottom:34,left:0},10],
 ['road-phone-390',390,844,{top:47,right:0,bottom:34,left:0},5],
 ['road-phone-320-compact',320,480,{top:20,right:0,bottom:16,left:0},10],
 ['road-desktop',1440,900,{top:0,right:0,bottom:0,left:0},8]
];
for(const [name,width,height,safeInsets,level] of cases){
 const h=createPhoneHarness({width,height,safeInsets,canvas:createCanvas(width,height)});h.tap('levels');h.tap(`level-${level}`);h.assertTargets();
 fs.writeFileSync(new URL(`./${name}.png`,import.meta.url),h.canvas.toBuffer('image/png'));
 if(width===320&&height===568&&level===10){h.tap('tools');fs.writeFileSync(new URL('./road-phone-tools.png',import.meta.url),h.canvas.toBuffer('image/png'));h.tap('help');fs.writeFileSync(new URL('./road-phone-help.png',import.meta.url),h.canvas.toBuffer('image/png'));}
 if(width===320&&height===480){for(const action of LEVELS[level-1].solution){if(action.type==='turn')h.tap(`tile-${action.index}`);else{h.tap('dispatch');h.finish();}}fs.writeFileSync(new URL('./road-phone-win-compact.png',import.meta.url),h.canvas.toBuffer('image/png'));}
 h.destroy();
}
console.log('Approximate native Canvas raster previews generated; not browser or phone screenshots.');
