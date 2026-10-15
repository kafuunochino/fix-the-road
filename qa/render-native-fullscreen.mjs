import {createRequire} from 'node:module';import fs from 'node:fs';import {nativePhone} from './native-phone-harness.mjs';
const require=createRequire(import.meta.url),{createCanvas,GlobalFonts}=require('@napi-rs/canvas');GlobalFonts.registerFromPath('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc','Noto Sans CJK SC');
const output=new URL('./native-fullscreen/',import.meta.url);fs.mkdirSync(output,{recursive:true});
for(const [name,width,height,dpr,safe] of [['iphone-390',390,844,3,{top:47,bottom:34,left:0,right:0}],['tall-412',412,1000,2.625,{top:24,bottom:24,left:0,right:0}],['wide-540',540,1200,2,{top:40,bottom:32,left:0,right:0}]]){
 const h=nativePhone({width,height,dpr,safe,canvas:createCanvas(1,1)});fs.writeFileSync(new URL(name+'-native-not-phone.png',output),h.canvas.toBuffer('image/png'));
 fs.writeFileSync(new URL(name+'-layout.json',output),JSON.stringify({verification:'Simulated tt host, exact native bundle, real Canvas raster. NOT physical phone.',size:h.size(),layout:h.snapshot().layout},null,2));h.destroy();
}
