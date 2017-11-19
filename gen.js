var WASM_PAGE_SIZE = 64 * 1024;
var TWO_GB = 2 * 1024 * 1024 * 1024;
var TOTAL_STACK = 5 * 1024 * 1024;
var TOTAL_MEMORY = 16 * 1024 * 1024;
var GLOBAL_BASE = 1024;
var STATIC_BUMP = 0;
var QUANTUM_SIZE = 4;
var STACK_ALIGN = 16;
var initializers = [];
var MODULE_NAME = "BinjiGB";

const tmpl = () => `function ${MODULE_NAME}(object) {
  var HEAP,
/** @type {ArrayBuffer} */
  buffer,
/** @type {Int8Array} */
  HEAP8,
/** @type {Uint8Array} */
  HEAPU8,
/** @type {Int16Array} */
  HEAP16,
/** @type {Uint16Array} */
  HEAPU16,
/** @type {Int32Array} */
  HEAP32,
/** @type {Uint32Array} */
  HEAPU32,
/** @type {Float32Array} */
  HEAPF32,
/** @type {Float64Array} */
  HEAPF64;

  object["wasmMemory"] = new WebAssembly.Memory({
    "initial": ${TOTAL_MEMORY / WASM_PAGE_SIZE},
    "maximum": ${TOTAL_MEMORY / WASM_PAGE_SIZE}
  });
  buffer = object["buffer"] = object["wasmMemory"].buffer;
  updateGlobalBufferViews();

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

  ${(function () {
    var name = ["STATIC_BASE", "STATICTOP", "STATIC_BUMP", "tempDoublePtr",
      "TOTAL_STACK", "TOTAL_MEMORY", "DYNAMICTOP_PTR", "STACKTOP",
      "STACK_BASE", "STACK_MAX", "DYNAMIC_BASE"];
    var s = 'function dump() {\n';
    for (const key of name)
      s += 'console.log("' + key + ': ",' + key + ');\n';
    return s + '}';
  })()}

  function alignMemory(size, quantum = 16) {
    return Math.ceil(size/quantum)*quantum;
  }

  function alignUp(x, multiple) {
    var r = x % multiple;
    if (r > 0)
      x += multiple - r;
    return x;
  }

  var SYSCALLS = {
    varargs: 0,
    get: function() {
      SYSCALLS.varargs += 4;
      return HEAP32[(((SYSCALLS.varargs)-(4))>>2)];
    },
  };

  function __syscall140(which, varargs) {
    throw "140 called";
  }

  function ptr2str(array, from) {
    var s = "";
    while (from < array.length && array[from] !== 0) {
      s += String.fromCharCode(array[from++]);
    }
    return s;
  }

  var __syscall146_buffers = [[], /*stdout*/[], /*stderr*/[]];
  function __syscall146_printChar(stream, curr) {
    var buffer = __syscall146_buffers[stream];
    if (curr === 0 || curr === 10) {
      var s = ptr2str(buffer, 0);
      if (stream === 1)
        console.log(s);
      else
        console.error(s);
      buffer.length = 0;
    } else {
      buffer.push(curr);
    }
  }

  function __syscall146(which, varargs) {
    SYSCALLS.varargs = varargs;
    var stream = SYSCALLS.get(), iov = SYSCALLS.get(), iovcnt = SYSCALLS.get();
    var ret = 0;
    for (var i = 0; i < iovcnt; i++) {
        var ptr = HEAP32[(((iov)+(i*8))>>2)];
        var len = HEAP32[(((iov)+(i*8 + 4))>>2)];
        for (var j = 0; j < len; j++) {
          __syscall146_printChar(stream, HEAPU8[ptr+j]);
        }
        ret += len;
    }
    return ret;
  }

  function __syscall54(which, varargs) {
    return 0;
  }

  function __syscall6(which, varargs) {
    throw "6 called";
  }

  var __ATEXIT__ = []
  function __cxa_atexit(func, arg) {
    __ATEXIT__.unshift({ func: func, arg: arg });
  }

  function callRuntimeCallbacks(exports, callbacks) {
    while (callbacks.length > 0) {
      var cb = callbacks.shift();
      if (typeof callback === 'function')
        cb();
      else {
        var func = cb.func;
        if (typeof func === 'number') {
          if (cb.arg === undefined)
            exports["dynCall_v"](func)
          else
            exports["dynCall_vi"](func, cb.arg);
        } else {
          func(cb.arg);
        }
      }
    }
  }

  function preMain(exports) {
    ${(function() {
      var s = "";
      for (const init of initializers) {
        s += 'exports["' + init + '"]();\n';
      }
      return s;
    })()}
  }

  function postMain(exports) {
    callRuntimeCallbacks(exports, __ATEXIT__);
  }

  function abort() {
    throw "abort";
  }

  function __assert_fail() {
    throw "assert fail";
  }

  function exit() {
    console.error("exit");
  }

  function getTotalMemory() {
    return TOTAL_MEMORY;
  }

  function enlargeMemory() {
    var LIMIT = ${TWO_GB - WASM_PAGE_SIZE};
    if (HEAP32[DYNAMICTOP_PTR >> 2] > LIMIT) {
      console.error("Cannot enlarge memory, asked to go up to " + HEAP32[DYNAMICTOP_PTR >> 2] + " bytes");
      return false;
    }
    var OLD_TOTAL_MEMORY = TOTAL_MEMORY;
    TOTAL_MEMORY = Math.max(TOTAL_MEMORY, MIN_TOTAL_MEMORY);

    while (TOTAL_MEMORY < HEAP32[DYNAMICTOP_PTR >> 2]) {
      if (TOTAL_MEMORY <= ${512 * 1024 * 1024})
        TOTAL_MEMORY = alignUp(2 * TOTAL_MEMORY, ${WASM_PAGE_SIZE});
      else
        TOTAL_MEMORY = Math.min(alignUp((3 * TOTAL_MEMORY + 2147483648) / 4, ${WASM_PAGE_SIZE}), LIMIT);
    }

    if (reallocBuffer(TOTAL_MEMORY) == -1 || object["buffer"].byteLength != TOTAL_MEMORY) {
      TOTAL_MEMORY = OLD_TOTAL_MEMORY;
      return false;
    }
    return true;
  }

  function updateGlobalBufferViews() {
    object['HEAP8'] = HEAP8 = new Int8Array(buffer);
    object['HEAP16'] = HEAP16 = new Int16Array(buffer);
    object['HEAP32'] = HEAP32 = new Int32Array(buffer);
    object['HEAPU8'] = HEAPU8 = new Uint8Array(buffer);
    object['HEAPU16'] = HEAPU16 = new Uint16Array(buffer);
    object['HEAPU32'] = HEAPU32 = new Uint32Array(buffer);
    object['HEAPF32'] = HEAPF32 = new Float32Array(buffer);
    object['HEAPF64'] = HEAPF64 = new Float64Array(buffer);
  }

  function reallocBuffer(size) {
    size = alignUp(size, ${WASM_PAGE_SIZE});
    var old = object["buffer"];
    var oldSize = old.byteLength;
    var result = object["wasmMemory"].grow((size - oldSize) / ${WASM_PAGE_SIZE});
    if (result !== (-1|0)) {
      buffer = object["buffer"] = object["wasmMemory"].buffer;
      updateGlobalBufferViews();
    }
    return result;
  }

  function sbrk(increment) {
    increment = increment|0;
    var oldDynamicTop = 0;
    var oldDynamicTopOnChange = 0;
    var newDynamicTop = 0;
    var totalMemory = 0;
    increment = ((increment + 15) & -16)|0;
    oldDynamicTop = HEAP32[DYNAMICTOP_PTR>>2]|0;
    newDynamicTop = oldDynamicTop + increment | 0;

    if (((increment|0) > 0 & (newDynamicTop|0) < (oldDynamicTop|0)) // Detect and fail if we would wrap around signed 32-bit int.
      | (newDynamicTop|0) < 0) { // Also underflow, sbrk() should be able to be used to subtract.
      throw "abort memory growth";
      return -1;
    }

    HEAP32[DYNAMICTOP_PTR>>2] = newDynamicTop;
    totalMemory = getTotalMemory()|0;
    if ((newDynamicTop|0) > (totalMemory|0)) {
      if ((enlargeMemory()|0) == 0) {
        HEAP32[DYNAMICTOP_PTR>>2] = oldDynamicTop;
        return -1;
      }
    }
    return oldDynamicTop|0;
  }

  function staticAlloc(size) {
    var ret = STATICTOP;
    STATICTOP += size;
    STATICTOP = (((STATICTOP)+15)&-16);
    return ret;
  }

  function allocate() {
    var zeroinit = true;
    var size = 1;
    var stop;
    var ret = staticAlloc(1);
    var ptr = ret;
    stop = ret + (size & ~3);
    for (; ptr < stop; ptr += 4)
      HEAP32[((ptr)>>2)] = 0;
    stop = ret + size;
    while (ptr < stop)
      HEAP8[((ptr++)>>0)] = 0;
    return ret;
  }

  function mergeMemory(newBuffer) {
    var oldBuffer = object["buffer"];
    var oldView = new Uint8Array(oldBuffer);
    var newView = new Uint8Array(newBuffer);
    oldView.set(newView.subarray(STATIC_BASE, STATIC_BASE + STATIC_BUMP), STATIC_BASE);
    newView.set(oldView);
    object["buffer"] = buffer = newBuffer;
    updateGlobalBufferViews();
  }

  var imports = {
    "global": {
      "NaN": NaN,
      "Infinity": Infinity,
      "Math": Math,
    },
    "env": {
      "abort": abort,
      "exit": exit,
      "sbrk": sbrk,
      "__assert_fail": __assert_fail,
      "__syscall140": __syscall140,
      "__syscall146": __syscall146,
      "__syscall54": __syscall54,
      "__syscall6": __syscall6,
      "__cxa_atexit": __cxa_atexit,
      "__dso_handle": 0,
      "memory": object["wasmMemory"],
      "memoryBase": STATIC_BASE,
      "tableBase": 0,
    },
  };

  return {
    "imports": imports,
    "mergeMemory": mergeMemory,
    "dump": dump,
    "preMain": preMain,
    "postMain": postMain,
  };
}`;

function readMetaData(/** @type {string} */line) {
  const METADATA_TAG = ";; METADATA: ";
  line = line.substr(line.lastIndexOf(METADATA_TAG) + METADATA_TAG.length);
  var metadata = JSON.parse(line);

  STATIC_BUMP = metadata["staticBump"];
  if (STATIC_BUMP % 16 != 0)
    STATIC_BUMP = STATIC_BUMP + STATIC_BUMP % 16 - 16;

  initializers = metadata["initializers"];
}

const fs = require("fs");
const wast = fs.readFileSync("binjigb.wast", "utf8");
readMetaData(wast);
console.log(tmpl());