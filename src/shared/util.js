/* @flow */

// 创建一个空的对象
export const emptyObject = Object.freeze({})

// These helpers produce better VM code in JS engines due to their
// explicitness and function inlining.

// 以下为判断是否为某种类型的辅助函数，这些辅助函数可以在js引擎里更好的工作
// 因为判断都是忽视了类型转换

// 判断是否为undefined或null
export function isUndef (v: any): boolean %checks {
  return v === undefined || v === null
}

// 不为undefined或null
export function isDef (v: any): boolean %checks {
  return v !== undefined && v !== null
}

// 是否严格为true
export function isTrue (v: any): boolean %checks {
  return v === true
}
 // 是否严格为false
export function isFalse (v: any): boolean %checks {
  return v === false
}

/**
 * Check if value is primitive.
 */

// 是否为基础类型：string|number|boolean|symbol
export function isPrimitive (value: any): boolean %checks {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    // $flow-disable-line
    typeof value === 'symbol' ||
    typeof value === 'boolean'
  )
}

/**
 * Quick object check - this is primarily used to tell
 * Objects from primitive values when we know the value
 * is a JSON-compliant type.
 */

// 判断是否为JSON格式的对象，数组也会返回true
export function isObject (obj: mixed): boolean %checks {
  return obj !== null && typeof obj === 'object'
}

/**
 * Get the raw type string of a value, e.g., [object Object].
 */
const _toString = Object.prototype.toString

// 获取数据原始类型
export function toRawType (value: any): string {
  return _toString.call(value).slice(8, -1)
}

/**
 * Strict object type check. Only returns true
 * for plain JavaScript objects.
 */
// 判断是否为普通的js对象
export function isPlainObject (obj: any): boolean {
  return _toString.call(obj) === '[object Object]'
}

// 判断是否为一个正则表达式
export function isRegExp (v: any): boolean {
  return _toString.call(v) === '[object RegExp]'
}

/**
 * Check if val is a valid array index.
 */
// 判断是否为合法的数组索引
export function isValidArrayIndex (val: any): boolean {
  const n = parseFloat(String(val))
  return n >= 0 && Math.floor(n) === n && isFinite(val)
}

// 判断是否符合promise形式
export function isPromise (val: any): boolean {
  return (
    isDef(val) &&
    typeof val.then === 'function' &&
    typeof val.catch === 'function'
  )
}

/**
 * Convert a value to a string that is actually rendered.
 */
// 将一个值转化为String类型
export function toString (val: any): string {
  return val == null
    ? ''
    : Array.isArray(val) || (isPlainObject(val) && val.toString === _toString)
      ? JSON.stringify(val, null, 2)
      : String(val)
}

// 尝试将一个字符串转为数字，转化失败则返回原字符串
export function toNumber (val: string): number | string {
  const n = parseFloat(val)
  return isNaN(n) ? val : n
}


// 返回一个检测指定值是否包含某个集合的函数
// makeMap("div,span,p") 返回一个用于检测标签是否为div,span,p三种标签之一的函数
export function makeMap (
  str: string,
  expectsLowerCase?: boolean
): (key: string) => true | void {
  const map = Object.create(null)
  const list: Array<string> = str.split(',')
  for (let i = 0; i < list.length; i++) {
    map[list[i]] = true
  }
  return expectsLowerCase
    ? val => map[val.toLowerCase()]
    : val => map[val]
}

// 检测是否为内置标签（slot、component）的函数
export const isBuiltInTag = makeMap('slot,component', true)

// 检测是否为保留属性的函数
export const isReservedAttribute = makeMap('key,ref,slot,slot-scope,is')

// 从数组中删除指定的元素
export function remove (arr: Array<any>, item: any): Array<any> | void {
  if (arr.length) {
    const index = arr.indexOf(item)
    if (index > -1) {
      return arr.splice(index, 1)
    }
  }
}

/**
 * 检测某个对象自身是否包含了某个属性
 */
const hasOwnProperty = Object.prototype.hasOwnProperty
export function hasOwn (obj: Object | Array<*>, key: string): boolean {
  return hasOwnProperty.call(obj, key)
}

/**
 * 创建一个具有缓存能力的纯函数
 */
export function cached<F: Function> (fn: F): F {
  const cache = Object.create(null)
  return (function cachedFn (str: string) {
    const hit = cache[str]
    return hit || (cache[str] = fn(str))
  }: any)
}

// 将连接符分隔的字符串转为驼峰命名的函数，该函数具有缓存能力
const camelizeRE = /-(\w)/g
export const camelize = cached((str: string): string => {
  return str.replace(camelizeRE, (_, c) => c ? c.toUpperCase() : '')
})

// 首字母转为大写，具有缓存能力
export const capitalize = cached((str: string): string => {
  return str.charAt(0).toUpperCase() + str.slice(1)
})

// 将驼峰命名转为连接符分隔的字符串
const hyphenateRE = /\B([A-Z])/g
export const hyphenate = cached((str: string): string => {
  return str.replace(hyphenateRE, '-$1').toLowerCase()
})

/**
 * Simple bind polyfill for environments that do not support it,
 * e.g., PhantomJS 1.x. Technically, we don't need this anymore
 * since native bind is now performant enough in most browsers.
 * But removing it would mean breaking code that was able to run in
 * PhantomJS 1.x, so this must be kept for backward compatibility.
 */
// bind 方法的polyfill
// 大部分浏览器都是支持原生的bind方法的，但是 PhantomJS 1.x是不支持的，用于兼容
// 在支持的浏览器上面将使用原生的bind，否则使用polyfill版本的bind

function polyfillBind (fn: Function, ctx: Object): Function {
  function boundFn (a) {
    const l = arguments.length
    return l
      ? l > 1
        ? fn.apply(ctx, arguments)
        : fn.call(ctx, a)
      : fn.call(ctx)
  }

  boundFn._length = fn.length
  return boundFn
}

function nativeBind (fn: Function, ctx: Object): Function {
  return fn.bind(ctx)
}

export const bind = Function.prototype.bind
  ? nativeBind
  : polyfillBind

/**
 * 将一个类数组对象转化为一个真正的数组
 */
export function toArray (list: any, start?: number): Array<any> {
  start = start || 0
  let i = list.length - start
  const ret: Array<any> = new Array(i)
  while (i--) {
    ret[i] = list[i + start]
  }
  return ret
}

/**
 * 合并两个对象，将_from合并至to
 */
export function extend (to: Object, _from: ?Object): Object {
  for (const key in _from) {
    to[key] = _from[key]
  }
  return to
}

/**
 * 将一个对象数组转化为一个简单的对象
 */
export function toObject (arr: Array<any>): Object {
  const res = {}
  for (let i = 0; i < arr.length; i++) {
    if (arr[i]) {
      extend(res, arr[i])
    }
  }
  return res
}

/* eslint-disable no-unused-vars */

/**
 * Perform no operation.
 * Stubbing args to make Flow happy without leaving useless transpiled code
 * with ...rest (https://flow.org/blog/2017/05/07/Strict-Function-Call-Arity/).
 * 两个没有任何操作的函数
 * 参数是给flow检测用的，实际用不到
 */
// 空函数
export function noop (a?: any, b?: any, c?: any) {}

// 永远返回false的函数
export const no = (a?: any, b?: any, c?: any) => false

/* eslint-enable no-unused-vars */

// 一个给啥返啥的函数
export const identity = (_: any) => _

/**
 * Generate a string containing static keys from compiler modules.
 * 用于从“compiler”模块中生成一个包含静态键的字符串
 * 目录：platforms/web/compiler/index
 */
export function genStaticKeys (modules: Array<ModuleOptions>): string {
  return modules.reduce((keys, m) => {
    return keys.concat(m.staticKeys || [])
  }, []).join(',')
}

/**
 * 检测两个值是否大致相等的
 * 完全相等、基本类型转为字符串后相等、对象的格式是一致的
 * 以上三种情况均被任务是相等的
 */
export function looseEqual (a: any, b: any): boolean {
  if (a === b) return true
  const isObjectA = isObject(a)
  const isObjectB = isObject(b)
  if (isObjectA && isObjectB) {
    try {
      const isArrayA = Array.isArray(a)
      const isArrayB = Array.isArray(b)
      if (isArrayA && isArrayB) {
        return a.length === b.length && a.every((e, i) => {
          return looseEqual(e, b[i])
        })
      } else if (a instanceof Date && b instanceof Date) {
        return a.getTime() === b.getTime()
      } else if (!isArrayA && !isArrayB) {
        const keysA = Object.keys(a)
        const keysB = Object.keys(b)
        return keysA.length === keysB.length && keysA.every(key => {
          return looseEqual(a[key], b[key])
        })
      } else {
        /* istanbul ignore next */
        return false
      }
    } catch (e) {
      /* istanbul ignore next */
      return false
    }
  } else if (!isObjectA && !isObjectB) {
    return String(a) === String(b)
  } else {
    return false
  }
}

/**
 * Return the first index at which a loosely equal value can be
 * found in the array (if value is a plain object, the array must
 * contain an object of the same shape), or -1 if it is not present.
 * 判断数组里是否包含某个元素（使用looseEqual检测）并返回其索引
 */
export function looseIndexOf (arr: Array<mixed>, val: mixed): number {
  for (let i = 0; i < arr.length; i++) {
    if (looseEqual(arr[i], val)) return i
  }
  return -1
}

/**
 * Ensure a function is called only once.
 * 返回一个只执行一次的函数
 */

export function once (fn: Function): Function {
  let called = false
  return function () {
    if (!called) {
      called = true
      fn.apply(this, arguments)
    }
  }
}
