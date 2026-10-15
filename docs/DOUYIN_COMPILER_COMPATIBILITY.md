# Douyin compiler compatibility

2026-10-15: native build lowers optional chaining, nullish coalescing, logical assignment and optional catch bindings to ES2018 using Babel AST. Acorn rejects any remaining newer syntax. HTML gameplay is unchanged.

Build-time dependencies: @babel/parser, @babel/traverse, @babel/generator, @babel/types, acorn. Resolve from installed modules or DOUYIN_TOOLING_NODE_MODULES. Runtime contains no compiler dependencies. Unsupported parameter-initializer transforms and private fields fail explicitly rather than guessing.

Validation: 235 tests pass, including 17 syntax/semantic transform regressions. Official upload and phone runtime verification remain separate.
