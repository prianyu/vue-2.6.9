/* @flow */

import {
  tip,
  toArray,
  hyphenate,
  formatComponentName,
  invokeWithErrorHandling
} from '../util/index'
import { updateListeners } from '../vdom/helpers/index'

// 事件初始化
export function initEvents (vm: Component) {
  vm._events = Object.create(null)
  vm._hasHookEvent = false
  /**
  init parent attached events
  父组件绑定的传递给子组件的事件列表
  updateComponentListeners会对所有的事件创建一个函数调用者(invoker)，用于捕获错误
  其真实的事件回调会存储在调用者的fns属性上，
  invoker = function() {}
  invoker.fns = vm.$options._parentListeners[name]
  最终vm.$options._parentListeners的结果为类似以下的格式
  {
    click: invoker(){}
    custom: invoker() {}
  }
  
*/
  const listeners = vm.$options._parentListeners
  if (listeners) {
    // 更新子组件的事件
    updateComponentListeners(vm, listeners)
  }
}

let target: any // 用于标记正在解析的Vue实例

// 为target添加事件
function add (event, fn) {
  target.$on(event, fn)
}

// target移除事件
function remove (event, fn) {
  target.$off(event, fn)
}

//创建一个执行一次的函数
function createOnceHandler (event, fn) {
  const _target = target
  return function onceHandler () {
    const res = fn.apply(null, arguments)
    if (res !== null) {
      _target.$off(event, onceHandler)
    }
  }
}

// 更新子组件的事件
export function updateComponentListeners (
  vm: Component,
  listeners: Object,
  oldListeners: ?Object
) {
  target = vm // 标记当前正在解析的实例
  // 执行事件监听的更新
  updateListeners(listeners, oldListeners || {}, add, remove, createOnceHandler, vm)
  target = undefined // 事件更新完毕
}

export function eventsMixin (Vue: Class<Component>) {
  const hookRE = /^hook:/
  // 绑定事件
  Vue.prototype.$on = function (event: string | Array<string>, fn: Function): Component {
    const vm: Component = this
    if (Array.isArray(event)) { // 传入一个事件数组，则遍历并绑定
      for (let i = 0, l = event.length; i < l; i++) {
        vm.$on(event[i], fn)
      }
    } else { // 事件最终会存储在_events属性上
      (vm._events[event] || (vm._events[event] = [])).push(fn)
      // optimize hook:event cost by using a boolean flag marked at registration
      // instead of a hash lookup
      if (hookRE.test(event)) { // hook:update
        vm._hasHookEvent = true
      }
    }
    return vm
  }

  // $once只是$on和off的包装，在执行完后会立马执行$off卸载事件
  Vue.prototype.$once = function (event: string, fn: Function): Component {
    const vm: Component = this
    function on () {
      vm.$off(event, on)
      fn.apply(vm, arguments)
    }
    on.fn = fn
    vm.$on(event, on)
    return vm
  }

  // 卸载事件
  Vue.prototype.$off = function (event?: string | Array<string>, fn?: Function): Component {
    const vm: Component = this
    // all
    if (!arguments.length) { // 没有传递参数，卸载所有的事件
      vm._events = Object.create(null)
      return vm
    }
    // array of events
    if (Array.isArray(event)) { // 传递的是一个数组，则遍历并卸载
      for (let i = 0, l = event.length; i < l; i++) {
        vm.$off(event[i], fn)
      }
      return vm
    }
    // specific event
    const cbs = vm._events[event] // 获取对应的事件所有的回调函数
    if (!cbs) { // 没有回调函数，无需处理
      return vm
    }
    if (!fn) { // 没有传fn，则卸载当前事件所有的回调函数
      vm._events[event] = null
      return vm
    }
    // specific handler
    let cb
    let i = cbs.length
    while (i--) {
      cb = cbs[i]
      // 传递了fn和event，则卸载掉对应的事件对应的回调函数
      // 由于$once对$on和$off包装后将回调函数绑定在了处理回调的fn上
      // 所以比对的时候需要使用cb.fn
      if (cb === fn || cb.fn === fn) {
        cbs.splice(i, 1) // 删除
        break
      }
    }
    return vm
  }

  // 触发事件
  Vue.prototype.$emit = function (event: string): Component {
    const vm: Component = this
    if (process.env.NODE_ENV !== 'production') {
      const lowerCaseEvent = event.toLowerCase() // 将事件名转为小写
      if (lowerCaseEvent !== event && vm._events[lowerCaseEvent]) { // 转为小写后有对应的事件，但是触发时传递不是小写
        // 浏览器对属性大小写不敏感，v-on不能绑定驼峰命名的事件
        tip(
          `Event "${lowerCaseEvent}" is emitted in component ` +
          `${formatComponentName(vm)} but the handler is registered for "${event}". ` +
          `Note that HTML attributes are case-insensitive and you cannot use ` +
          `v-on to listen to camelCase events when using in-DOM templates. ` +
          `You should probably use "${hyphenate(event)}" instead of "${event}".`
        )
      }
    }
    let cbs = vm._events[event] // 获取对应的事件的所有回调函数
    if (cbs) {
      cbs = cbs.length > 1 ? toArray(cbs) : cbs
      const args = toArray(arguments, 1) // 截取参数列表
      const info = `event handler for "${event}"`
      for (let i = 0, l = cbs.length; i < l; i++) {
        // 遍历并执行回调函数，由于回调函数是外部定义的，为避免意外，会对错误进行捕获
        invokeWithErrorHandling(cbs[i], vm, args, vm, info)
      }
    }
    return vm
  }
}
