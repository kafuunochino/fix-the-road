import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import transformer from '../scripts/transform-es2018.cjs';
const {transformES2018}=transformer;
const cases=[
`let coercions=0;const key={toString(){coercions++;return 'v'}};const obj={v:null};obj[key]??=7;result=[obj.v,coercions];`,
`try{throw 9;}catch{result='caught';}`, 
`let calls=0;const obj={v:9,get method(){calls++;return function(n){return this.v+n;}}};result=[obj.method?.(3),calls];`,
`let keys=0,args=0;const obj=null;result=[obj?.[keys++]?.(args++),keys,args];`,
`const obj={v:7,method(){return {v:this.v}}};result=[obj?.method().v,obj?.method?.().v];`,
`let n=0;const f=()=>{n++;return null;};result=[f()?.x.y.z,n];`,
`result=[0??7,false??7,''??7,null??7,undefined??7];`,
`let n=0;const obj={v:0};function key(){n++;return 'v'};obj[key()]??=9;obj[key()]||=4;obj[key()]&&=8;result=[obj.v,n];`,
`let gets=0,sets=0,objects=0,keys=0,rhs=0;const obj={get v(){gets++;return undefined},set v(x){sets++;}};function factory(){objects++;return obj};factory()[++keys?'v':'x']??=++rhs;result=[gets,sets,objects,keys,rhs];`,
`let a=null;try{result=(a?.b).c?.d;}catch(e){result=e.name;}`,
`const a={b:null};result=a?.b?.c?.d;`,
`let a=null;result=(a?.b)?.c;`,
`const o={x:5,get f(){return function(){return this.x}}};result=o?.f?.();`,
`const a={x:9,f(){return function(){return this===undefined}}};result=a?.f()();`,
`let n=0;const o={f(){return n}};result=o?.f?.(null?.x)??++n;`,
`let calls=0;const a={get b(){calls++;return null}};result=[a?.b?.c,calls];`
];
for(const [i,code]of cases.entries())test('ES2018 semantics '+i,()=>{const execute=s=>{const context={};vm.runInNewContext("'use strict';var result;"+s,context);return JSON.stringify(context.result);};assert.equal(execute(transformES2018(code)),execute(code));});

test('unsupported parameter initializer is rejected rather than miscompiled',()=>{assert.throws(()=>transformES2018('function f(a=x?.y){return a;}'),/parameter initializers/);});
