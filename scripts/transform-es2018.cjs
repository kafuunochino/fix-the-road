'use strict';
// Build-time only. Uses installed Babel AST tools, no regex syntax rewriting.
const fs=require('node:fs');
function dependency(name){try{return require(name);}catch{return require((process.env.DOUYIN_TOOLING_NODE_MODULES||'/workspace/shared/douyin-cli-tooling/node_modules')+'/'+name);}}
const parser=dependency('@babel/parser'),traverse=dependency('@babel/traverse').default,generate=dependency('@babel/generator').default,t=dependency('@babel/types'),acorn=dependency('acorn');
function transformES2018(source){
 const ast=parser.parse(source,{sourceType:'unambiguous'});
 const clone=n=>t.cloneNode(n,true),undef=()=>t.unaryExpression('void',t.numericLiteral(0));
 const seq=xs=>xs.length===1?xs[0]:t.sequenceExpression(xs);
 const chain=n=>t.isOptionalMemberExpression(n)||t.isOptionalCallExpression(n);
 function temp(path,hint){const fn=path.findParent(p=>p.isFunction());if(fn&&path.node.start<fn.node.body.start)throw Error('ES2018 lowering in function parameter initializers is unsupported');const id=path.scope.generateUidIdentifier(hint);path.scope.push({id:clone(id),kind:'var'});return id;}
 const assign=(a,b)=>t.assignmentExpression('=',clone(a),b);
 const nullish=n=>t.logicalExpression('||',t.binaryExpression('===',clone(n),t.nullLiteral()),t.binaryExpression('===',clone(n),undef()));
 function lowerChain(path){
  if(chain(path.parent)&&((t.isOptionalMemberExpression(path.parent)&&path.parent.object===path.node)||(t.isOptionalCallExpression(path.parent)&&path.parent.callee===path.node)))return;
  if(t.isUnaryExpression(path.parent,{operator:'delete'}))throw path.buildCodeFrameError?.('delete optional chain unsupported')||Error('delete optional chain unsupported');
  const parts=[];let base=path.node;
  while(chain(base)){if(t.isOptionalMemberExpression(base)){parts.unshift({kind:'member',optional:base.optional,property:base.property,computed:base.computed});base=base.object;}else{parts.unshift({kind:'call',optional:base.optional,args:base.arguments});base=base.callee;}}
  if(t.isSuper(base))throw Error('super optional chain unsupported');
  function next(index,value,receiver){if(index===parts.length)return value;const p=parts[index];
   if(p.kind==='member'){
    if(t.isPrivateName(p.property))throw Error('Private member must be lowered before ES2018 transform');
    const obj=temp(path,'chainObject'),access=t.memberExpression(clone(obj),clone(p.property),p.computed),rest=next(index+1,access,obj);
    return seq([assign(obj,value),p.optional?t.conditionalExpression(nullish(obj),undef(),rest):rest]);
   }
   if(p.args.some(a=>t.isArgumentPlaceholder(a)))throw Error('Partial application unsupported');
   const fn=temp(path,'chainFunction');
   const invoke=receiver?t.callExpression(t.memberExpression(clone(fn),t.identifier('call')),[clone(receiver),...p.args.map(clone)]):t.callExpression(clone(fn),p.args.map(clone));
   const rest=next(index+1,invoke,null);
   return seq([assign(fn,value),p.optional?t.conditionalExpression(nullish(fn),undef(),rest):rest]);
  }
  let result;
  // obj.method?.() must retain obj as this, and evaluate obj/getter once.
  if(parts[0].kind==='call'&&t.isMemberExpression(base)){
   if(t.isSuper(base.object)||t.isPrivateName(base.property))throw Error('Unsupported optional call receiver');
   const obj=temp(path,'callReceiver');result=seq([assign(obj,clone(base.object)),next(0,t.memberExpression(clone(obj),clone(base.property),base.computed),obj)]);
  }else result=next(0,clone(base),null);
  path.replaceWith(result);
 }
 traverse(ast,{
  CatchClause(path){if(!path.node.param)path.node.param=path.scope.generateUidIdentifier('ignoredError');},
  OptionalMemberExpression:lowerChain,OptionalCallExpression:lowerChain,
  LogicalExpression:{exit(path){if(path.node.operator!=='??')return;const value=temp(path,'nullish');path.replaceWith(seq([assign(value,path.node.left),t.conditionalExpression(nullish(value),path.node.right,clone(value))]));}},
  AssignmentExpression:{exit(path){const n=path.node;if(!['??=','||=','&&='].includes(n.operator))return;const prefix=[];let target=n.left;
   if(t.isMemberExpression(target)){
    if(t.isSuper(target.object)||t.isPrivateName(target.property))throw Error('Unsupported logical assignment receiver');
    const obj=temp(path,'assignObject');prefix.push(assign(obj,target.object));let key=target.property;
    if(target.computed){const k=temp(path,'assignKey');prefix.push(assign(k,key));key=k;}
    target=t.memberExpression(clone(obj),clone(key),target.computed);
   }else if(!t.isIdentifier(target))throw Error('Unsupported logical assignment target');
   const set=t.assignmentExpression('=',clone(target),n.right);
   if(n.operator==='??='){const value=temp(path,'assignedValue');prefix.push(assign(value,clone(target)),t.conditionalExpression(nullish(value),set,clone(value)));}
   else prefix.push(t.logicalExpression(n.operator.slice(0,-1),clone(target),set));
   path.replaceWith(seq(prefix));
  }}
 });
 const output=generate(ast,{comments:true,compact:false}).code+'\n';
 // Fail loudly on all remaining syntax newer than ES2018 (including class fields).
 acorn.parse(output,{ecmaVersion:2018,sourceType:'script'});return output;
}
module.exports={transformES2018};
if(require.main===module){const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('Usage: node transform-es2018.cjs input.js output.js');fs.writeFileSync(output,transformES2018(fs.readFileSync(input,'utf8')));}
