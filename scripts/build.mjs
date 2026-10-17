import transformer from './transform-es2018.cjs';
const { transformES2018 } = transformer;
import { readFile, mkdir, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const config=JSON.parse(await readFile(path.join(root,'config/douyin.json'),'utf8'));
const appid=process.env.DOUYIN_APP_ID===undefined?config.appid:process.env.DOUYIN_APP_ID;
if(appid!==''&&!/^tt[a-zA-Z0-9]{8,64}$/.test(appid))throw Error('Invalid DOUYIN_APP_ID override');
// Deliberately explicit audited module graph, not a general JavaScript bundler.
const graph={
  'src/rules.js':[],
  'src/levels.js':['src/rules.js'],
  'src/canvas-game.js':['src/levels.js','src/rules.js'],
  'adapters/rewarded.js':[],
  'adapters/browser.js':['adapters/rewarded.js'],
  'adapters/douyin-sidebar.js':[],
  'adapters/tt.js':['adapters/rewarded.js','adapters/douyin-sidebar.js']
};
const exported=new Map();
const source=new Map();
for(const [file,deps] of Object.entries(graph)){
  let code=await readFile(path.join(root,file),'utf8');const resolved=[];
  code=code.replace(/^import\s+\{([\w,\s]+)\}\s+from\s+(['"])([^'"]+)\2;\s*$/gm,(whole,names,quote,target)=>{
    const dependency=path.posix.normalize(path.posix.join(path.posix.dirname(file),target));
    if(!deps.includes(dependency))throw Error(`Unexpected dependency in ${file}: ${target}`);
    if(!exported.has(dependency))throw Error(`Dependency order error: ${file} -> ${dependency}`);
    for(const name of names.split(',').map(n=>n.trim()).filter(Boolean))if(!exported.get(dependency).has(name))throw Error(`Unresolved import ${name} in ${file}`);
    resolved.push(dependency);return '';
  });
  if([...new Set(resolved)].sort().join('|')!==[...deps].sort().join('|'))throw Error(`Import graph mismatch: ${file}`);
  const names=new Set();
  code=code.replace(/^export\s+(const|function)\s+(\w+)/gm,(whole,kind,name)=>{names.add(name);return `${kind} ${name}`;});
  // An unsupported remaining module declaration fails parse; never silently strips it.
  new vm.Script(code,{filename:file});
  exported.set(file,names);source.set(file,`// Source: ${file}\n${code}`);
}
const core=['src/rules.js','src/levels.js','src/canvas-game.js'];
const assemble=(files,entry)=>`(function(){\n'use strict';\n${files.map(f=>source.get(f)).join('\n')}\n${entry}\n})();\n`;

const audioNames=['turn','switch','send','win','error'];
const ttAudio=Object.fromEntries(audioNames.map(name=>[name,`assets/${name}.wav`]));
const ttEntry=`const platform=createTTPlatform(tt,{requestAnimationFrame,cancelAnimationFrame},${JSON.stringify(ttAudio)});\nstartGame(platform);`;
const ttCode=transformES2018(assemble([...core,'adapters/rewarded.js','adapters/douyin-sidebar.js','adapters/tt.js'],ttEntry));new vm.Script(ttCode,{filename:'game.js'});
const out=path.join(root,'dist/douyin');await mkdir(path.join(out,'assets'),{recursive:true});
await writeFile(path.join(out,'game.js'),ttCode);
await writeFile(path.join(out,'game.json'),JSON.stringify({deviceOrientation:'portrait',showStatusBar:false,menuButtonStyle:'light'},null,2)+'\n');
await writeFile(path.join(out,'project.config.json'),JSON.stringify({description:config.description,projectname:config.projectname,appid,setting:{es6:true}},null,2)+'\n');
await copyFile(path.join(root,'assets/tap.wav'),path.join(out,'assets/tap.wav'));
for(const name of audioNames)await copyFile(path.join(root,`assets/${name}.wav`),path.join(out,`assets/${name}.wav`));
const browserAudio={};for(const name of audioNames)browserAudio[name]='data:audio/wav;base64,'+(await readFile(path.join(root,`assets/${name}.wav`))).toString('base64');
const browserEntry=`const platform=createBrowserPlatform(document.getElementById('game'),window,${JSON.stringify(browserAudio)});\nconst game=startGame(platform);\nwindow.roadDemo={getSnapshot:game.getSnapshot};\nwindow.addEventListener('pagehide',event=>{if(!event.persisted){game.destroy();platform.destroy();}});`;
const browserCode=assemble([...core,'adapters/rewarded.js','adapters/browser.js'],browserEntry);new vm.Script(browserCode,{filename:'demo.js'});
if(/<\/script/i.test(browserCode))throw Error('Unexpected script closing sequence in source');
const html=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#102c40"><title>修好这条路 · 城市复线 · 50关 0.3.2</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#102c40}canvas{--safe-top:env(safe-area-inset-top,0px);--safe-right:env(safe-area-inset-right,0px);--safe-bottom:env(safe-area-inset-bottom,0px);--safe-left:env(safe-area-inset-left,0px);display:block;width:100%;height:100%;height:100dvh;touch-action:none}</style></head><body><canvas id="game" aria-label="修好这条路：点击道路旋转，橙色岔口切换方向，完成后发车。"></canvas><script>${browserCode}</script></body></html>\n`;
await mkdir(path.join(root,'deliverables'),{recursive:true});await writeFile(path.join(root,'deliverables/fix-the-road-demo.html'),html);
const hashes={};
for(const file of ['game.js','game.json','project.config.json','assets/tap.wav',...audioNames.map(name=>`assets/${name}.wav`)])hashes[file]=createHash('sha256').update(await readFile(path.join(out,file))).digest('hex');
await writeFile(path.join(root,'dist/douyin-build-manifest.json'),JSON.stringify({appid,projectname:config.projectname,version:config.version,files:hashes},null,2)+'\n');
console.log(`Built dist/douyin for ${config.projectname}; AppID=${appid||'(empty test override)'}. Official upload and phone verification are separate. Offline HTML rebuilt.`);
