# Emscripten experiment

An experiment to facilitate discussion in [@kripken/emscripten#5794](https://github.com/kripken/emscripten/issues/5794).
Tons of duck tapes because I am not that familiar with Node.js.

## Procedure

Preparation

```
git clone https://github.com/binji/binjgb
cd binjgb
set EMCC_WASM_BACKEND=1
```

Compile C code to get `binjigb.wast` and `binjigb.wasm` (`binjigb.js` will not be used).

```
emcc -s WASM=1 -O2 -s NO_FILESYSTEM=1 -I src -s EXPORTED_FUNCTIONS="@src\emscripten\exported.json" ^
  src\emulator.c src\emscripten\wrapper.c -o binjigb.js
```

Generate JS code [test.js](binjigb/test.js)

```
node gen.js > test.js
```

Optionally optimize `.wasm`

```
wasm-opt -O2 -o binjigb-opt.wasm binjigb.wasm
```

## Result

[Generated JS code](binjigb/test.js) is about 8KB, Closure Compiler can further reduce it to about 3KB with
`SIMPLE_OPTIMIZATION` (see [test.min.js](binjigb/test.min.js)).

## Explanation

### Use case supported.

- `TOTAL_MEMORY`, `TOTAL_STACK`, `GLOBAL_BASE` and `STATIC_BUMP` are determined in code generation rather than in runtime, I doubt if any user actually tunes them in runtime.
- Assume latest browser, no polyfill, native WebAssembly mode only.
- `MODULARIZE` mode only and exports as little functions as possible, this allows closure compiler to do more DCE.
- Only uses simple C libraries such as `printf`.
- NO GL, SDL etc. Write your own JS code to handle keyboard/mouse interaction, graphic and audio.
  `.wasm` should only do maths operations.
- No `EM_ASM`, a very bad practice in my opinion.
- Directly call WebAssembly functions (`instance.exports.main()`), no wrapper function (`ccall`, `cwrap`).
- No `ccall`, string stuff and other utilities for JS convenience in _generated code_. I might put some string/array helper functions in a separate util.js and user can optionally include it, but still no for `ccall` and `cwrap`.

[binjgb](https://github.com/binji/binjgb) statisfies most of these contraints.

```js
// See demo.html
var Module = {};
var binjigb = BinjiGB(Module);
fetch("binjigb-opt.wasm")
.then(res => res.arrayBuffer())
.then(WebAssembly.compile)
.then(module => WebAssembly.instantiate(module, binjigb.imports))
.then(instance => {

  // This part is required because demo.js from binjigb assumes all functions are exported globally
  // and all function names have '_' prefix.
  window._malloc = instance.exports.malloc;
  function compatibility(funcs) {
    for (var f in funcs) window["_" + f] = funcs[f]; // export wasm functions
    for (var h in Module) window[h] = Module[h]; // export buffer, HEAP*
  }
  compatibility(instance.exports);
  console.log("Done");
});
```

For simple hello world example, it should look something like this.

```js
var Module = {};
var hello = Hello(Module);
fetch("hello.wasm")
.then(res => res.arrayBuffer())
.then(WebAssembly.compile)
.then(module => WebAssembly.instantiate(module, hello.imports))
.then(instance => {
  // hello.preMain(instance.exports);
  instance.exports.main();
  // hello.postMain(instance.exports);
});
```

## What the generated JS code does.

- Set up stack, heap and static memory in `WebAssembly.Memory`.
- Provide import object for `WebAssembly.instantiate` (see [gen.js#L298](gen.js#L298)).
- Provide `preMain` and `postMain` that must be run before and after `instance.exports.main()` is called.

User writes his own code to fetch, compile, instantiate and run WebAssembly.
`SIDE_MODULE` is very minimal, but perhaps too minimal because non-trivial functions that are difficult to polyfill
like `printf` will not be available.

Since wrapper code like below is not generated, code size is very small. There might be some performance improvement as well.

```js
var real____fixunstfsi = asm["__fixunstfsi"]; asm["__fixunstfsi"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real____fixunstfsi.apply(null, arguments);
};
var ___fixunstfsi = Module["___fixunstfsi"] = function() { return Module["asm"]["__fixunstfsi"].apply(null, arguments) };
```

### Generate code without modifying Python script

[gen.js](gen.js) is Node.js code that extract metadata (`STATIC_DUMP` and global initializers) directly from the last line of
`binjigb.wast`. I do this because I can't figure out how to hijack `emcc.py` and other complicated Python scripts to get
those information.

### Use of ES6 Template String as Template Engine

I write the code generator in Node.js so that I can use
[ES6 template string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals)
as the template engine instead of a mixture of C macros (`#if`, `#endif`) and `{{{ var }}}` that needs to be parsed by Python and Node.js.
Added benefit is code editor can syntax highlight the code as usual. This idea is inspired by
[lit-html](https://github.com/PolymerLabs/lit-html).

Some highlights about the use of ES6 template string in `gen.js`:

Template

```js
  object["wasmMemory"] = new WebAssembly.Memory({
    "initial": ${TOTAL_MEMORY / WASM_PAGE_SIZE},
    "maximum": ${TOTAL_MEMORY / WASM_PAGE_SIZE}
  });
```

Output

```js
  object["wasmMemory"] = new WebAssembly.Memory({
    "initial": 256,
    "maximum": 256
  });
```

Template

```js
  ${(function () {
    var name = ["STATIC_BASE", "STATICTOP", "STATIC_BUMP", "tempDoublePtr",
      "TOTAL_STACK", "TOTAL_MEMORY", "DYNAMICTOP_PTR", "STACKTOP",
      "STACK_BASE", "STACK_MAX", "DYNAMIC_BASE"];
    var s = 'function dump() {\n';
    for (const key of name)
      s += 'console.log("' + key + ': ",' + key + ');\n';
    return s + '}';
  })()}
```

Output

```js
  function dump() {
console.log("STATIC_BASE: ",STATIC_BASE);
console.log("STATICTOP: ",STATICTOP);
console.log("STATIC_BUMP: ",STATIC_BUMP);
console.log("tempDoublePtr: ",tempDoublePtr);
console.log("TOTAL_STACK: ",TOTAL_STACK);
console.log("TOTAL_MEMORY: ",TOTAL_MEMORY);
console.log("DYNAMICTOP_PTR: ",DYNAMICTOP_PTR);
console.log("STACKTOP: ",STACKTOP);
console.log("STACK_BASE: ",STACK_BASE);
console.log("STACK_MAX: ",STACK_MAX);
console.log("DYNAMIC_BASE: ",DYNAMIC_BASE);
}
```

### Important constants and variables

JS code generated by Emscripten has many important constants and variables to set up stack, heap and static memory. I
tried to read and understand the Emscripten-generated code so that `gen.js` can directly generate them without looking at Emscripten-generated
JS code. Below is the template I use after some trials and errors, only tested with some small C codes and `binjigb`. It works in those tests,
but might actually be completely wrong.

```js
  var STATIC_BASE = ${GLOBAL_BASE};
  var STATICTOP = ${GLOBAL_BASE + STATIC_BUMP + 16};
  var STATIC_BUMP = ${STATIC_BUMP};
  var tempDoublePtr = ${GLOBAL_BASE + STATIC_BUMP};
  var TOTAL_STACK = ${TOTAL_STACK};
  var TOTAL_MEMORY = ${TOTAL_MEMORY};
  var DYNAMICTOP_PTR = allocate();
  var STACKTOP = alignMemory(STATICTOP);
  var STACK_BASE = STACKTOP;
  var STACK_MAX = STACK_BASE + TOTAL_STACK;
  var DYNAMIC_BASE = alignMemory(STACK_MAX);
  HEAP32[DYNAMICTOP_PTR>>2] = DYNAMIC_BASE;
  // weirdity
  STACKTOP = STACK_BASE + TOTAL_STACK;
  STACK_MAX = STACK_BASE;
  HEAP32[1024 >> 2] = STACKTOP;
```

## Problems

### JS functions to be linked in import object

Currently import object may have redundant JS functions not used by `.wasm`, for instance `__cxa_atexit` and `__dso_handle`
are actually not used in `binjigb.wasm`.

Latest Node.js itself has WebAssembly support, so it is possible to use `WebAssmebly.Module.imports` and `WebAssembly.Module.exports`
to list down imported and exported functions, but since some JS functions have dependencies on other JS functions/objects (like
`__cxa_atexit` requires `__ATEXIT__` array), I need a better resolve dependencies in code generation.

### Exceptions and Threads

I have not figured out how to implement C++ exceptions and pthreads in JS. Hopefully
[Exception](https://github.com/WebAssembly/exception-handling) and
[Thread](https://github.com/WebAssembly/threads) proposals will make it easier.

## Demo

[demo.html](binjigb/demo.html) is slightly modified.

https://rongjiecomputer.github.io/minimal-emscripten/binjigb/demo.html
