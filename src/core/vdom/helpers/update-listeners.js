/* @flow */

import {
  warn,
  invokeWithErrorHandling
} from 'core/util/index'
import {
  cached,
  isUndef,
  isTrue,
  isPlainObject
} from 'shared/util'


//解析事件名和事件修饰符
/**
 * vue中，有几个事件修饰符最终会被转为特殊的字符添加在事件名的前面
 * passive: &
 * once: ~
 * capture: !
 */
const normalizeEvent = cached((name: string): {
  name: string,
  once: boolean,
  capture: boolean,
  passive: boolean,
  handler?: Function,
  params?: Array<any>
} => {
  const passive = name.charAt(0) === '&' // 是否有passive修饰符（&）
  name = passive ? name.slice(1) : name // 去除&符后的name
  const once = name.charAt(0) === '~' // Prefixed last, checked first 是否有once修饰符
  name = once ? name.slice(1) : name // 再去除~修饰符后的name
  const capture = name.charAt(0) === '!' // 是否有capture修饰符（!）
  name = capture ? name.slice(1) : name // 去除修饰符后的name
  return {
    name,
    once,
    capture,
    passive // 没有返回params，bug?
  }
})

// 由于父组件的事件绑定回调函数是外部定义的，不能保证正确执行，所以需要做一些错误捕获
// 创建事件调用者，该调用者可以捕获错误，包括Promise错误
export function createFnInvoker (fns: Function | Array<Function>, vm: ?Component): Function {
  function invoker () {
    const fns = invoker.fns
    if (Array.isArray(fns)) {
      const cloned = fns.slice()
      for (let i = 0; i < cloned.length; i++) {
        invokeWithErrorHandling(cloned[i], null, arguments, vm, `v-on handler`)
      }
    } else {
      // return handler return value for single handlers
      return invokeWithErrorHandling(fns, null, arguments, vm, `v-on handler`)
    }
  }
  invoker.fns = fns // 将回调函数存到fns属性上
  return invoker
}


// 更新事件监听器
// 新事件会覆盖旧事件，同时移除旧的不需要的事件
export function updateListeners (
  on: Object,
  oldOn: Object,
  add: Function,
  remove: Function,
  createOnceHandler: Function,
  vm: Component
) {
  let name, def, cur, old, event
  for (name in on) {
    def = cur = on[name] // 可以是falsy|function|array<function>
    old = oldOn[name]
    event = normalizeEvent(name) // 解析事件名和事件修饰符等信息
    /* istanbul ignore if */
    if (__WEEX__ && isPlainObject(def)) {
      cur = def.handler
      event.params = def.params
    }
    if (isUndef(cur)) { // 无效的事件绑定
      process.env.NODE_ENV !== 'production' && warn(
        `Invalid handler for event "${event.name}": got ` + String(cur),
        vm
      )
    } else if (isUndef(old)) { // 如果没有旧的事件
      if (isUndef(cur.fns)) { // 还未创建事件调用者
        cur = on[name] = createFnInvoker(cur, vm)
      }
      if (isTrue(event.once)) { // 如果有once修饰符，则创建一个只执行一次的函数调用
        cur = on[name] = createOnceHandler(event.name, cur, event.capture)
      }
      // 添加事件
      add(event.name, cur, event.capture, event.passive, event.params)
    } else if (cur !== old) { // 既有新事件又有旧事件
      // 此时旧事件已经创建过函数的调用者了
      //将调用者中存储的事件指向新的事件
      old.fns = cur 
      on[name] = old //直接使用旧的调用者
    }
  }
  // 删除旧的事件
  for (name in oldOn) {
    if (isUndef(on[name])) {
      event = normalizeEvent(name)
      remove(event.name, oldOn[name], event.capture)
    }
  }
}
