/* @flow */

import { isDef, isUndef } from 'shared/util'
import { updateListeners } from 'core/vdom/helpers/index'
import { isIE, isFF, supportsPassive, isUsingMicroTask } from 'core/util/index'
import { RANGE_TOKEN, CHECKBOX_RADIO_TOKEN } from 'web/compiler/directives/model'
import { currentFlushTimestamp } from 'core/observer/scheduler'

// normalize v-model event tokens that can only be determined at runtime.
// it's important to place the event as the first in the array because
// the whole point is ensuring the v-model callback gets called before
// user-attached handlers.
// 规范化只能在运行时确定的“v-model"事件的标记
// 由于在编译阶段无法确定合适的事件类型，所以在编译节点会将事件使用通用的占位符来记录
// 在运行时则可以根据所处的环境选择合适的事件
// 该函数就是运行时将占位符替换为合适的事件

// 将事件作为数组中的第一个事件（在用户附加处理程序之前）是为了确保数据的一致性
// 同时也保证了响应式更新
function normalizeEvents (on) {
  /* istanbul ignore if */
  if (isDef(on[RANGE_TOKEN])) { // 有on.__r
    // IE input[type=range] only supports `change` event
    // IE浏览器中input[type=range]只能触发change事件，而不是input事件

    // 转换为合适的事件类型类型后添加事件处理函数。
    // 并确保v-model的回调函数在用户添加的处理程序之前被调用
    const event = isIE ? 'change' : 'input'
    on[event] = [].concat(on[RANGE_TOKEN], on[event] || [])
    delete on[RANGE_TOKEN] // 删除on.__r
  }
  // 向后兼容处理
  // This was originally intended to fix #4521 but no longer necessary
  // after 2.5. Keeping it for backwards compat with generated code from < 2.4
  /* istanbul ignore if */
  if (isDef(on[CHECKBOX_RADIO_TOKEN])) {// 有on.__c
    // 转换为change事件并确保回调函数在用户的定义的处理程序之前调用
    on.change = [].concat(on[CHECKBOX_RADIO_TOKEN], on.change || [])
    delete on[CHECKBOX_RADIO_TOKEN]
  }
}

let target: any // 用于记录当前处理的DOM元素

// 创建一个只触发一次的事件处理程序的包装函数
function createOnceHandler (event, handler, capture) {
  // 删除时target需要被引用，所以要保存一个闭包引用
  const _target = target // save current target element in closure
  return function onceHandler () {
    const res = handler.apply(null, arguments)
    // 执行结果返回null则不会移除
    if (res !== null) {
      remove(event, onceHandler, capture, _target)
    }
  }
}

// #9446: Firefox <= 53 (in particular, ESR 52) has incorrect Event.timeStamp
// implementation and does not fire microtasks in between event propagation, so
// safe to exclude.
// 微任务修复标记
// 火狐<=53版本的事件戳实现有问题，并且微任务不会在事件传播之间触发
const useMicrotaskFix = isUsingMicroTask && !(isFF && Number(isFF[1]) <= 53)

// 给目标DOM元素添加事件监听
function add (
  name: string,
  handler: Function,
  capture: boolean,
  passive: boolean
) {
  // async edge case #6566: inner click event triggers patch, event handler
  // attached to outer element during patch, and triggered again. This
  // happens because browsers fire microtask ticks between event propagation.
  // the solution is simple: we save the timestamp when a handler is attached,
  // and the handler would only fire if the event passed to it was fired
  // AFTER it was attached.
  // 一些边界条件的处理，浏览器的微任务队列在事件传播之间触发，从而会导致事件被触发两次，如下：
  /**
   <div class="header" v-if="expand"> // block 1
    <i @click="expand = false, countA++">Expand is True</i> // element 1
  </div>
  <div class="expand" v-if="!expand" @click="expand = true, countB++"> // block 2
    <i>Expand is False</i> // element 2
  </div>
   */
  // 1. 当点击内部的i元素，i元素上的事件会触发一次，接着事件会往外部的div冒泡
  // 2. i上的事件触发后会在nextTick中触发一次更新，当使用的使微任务时，微任务在冒泡过程中触发，这个点击事件就会被附加到外部的div上
  // 3. 由于此时DOM结构是一致的，所以i和div都会被复用，当事件到达外部的div时，会触发该div的click事件，所以导致触发了两次
  // 解决的办法是在事件附着到元素的时候（在一次事件循环中）保存一个时间戳，对原始的处理函数进行包装，只有当事件触发的时间大于这个保存的时间时，才会触发事件处理
  if (useMicrotaskFix) {
    const attachedTimestamp = currentFlushTimestamp
    const original = handler
    handler = original._wrapper = function (e) {
      if (
        // no bubbling, should always fire.
        // this is just a safety net in case event.timeStamp is unreliable in
        // certain weird environments...
        // 事件不是冒泡的过来的事件则总是触发，防止一些特定的环境下event.timeStamp不可靠的问题
        e.target === e.currentTarget ||
        // event is fired after handler attachment
        // 事件在处理程序附加之后触发
        e.timeStamp >= attachedTimestamp ||
        // bail for environments that have buggy event.timeStamp implementations
        // #9462 iOS 9 bug: event.timeStamp is 0 after history.pushState
        // #9681 QtWebEngine event.timeStamp is negative value
        // 针对错误的event.timeStamp的场景：iOS9和QtWebEngine中该值可能为负值或0
        e.timeStamp <= 0 ||
        // #9448 bail if event is fired in another document in a multi-page
        // electron/nw.js app, since event.timeStamp will be using a different
        // starting reference
        // 针对多页应用（如Electron和NW.js应用）中，不同的文档事件时间戳可能会使用不同的起始参考
        e.target.ownerDocument !== document
      ) {
        return original.apply(this, arguments)
      }
    }
  }
  // 给目标DOM元素添加事件监听
  target.addEventListener(
    name,
    handler,
    supportsPassive
      ? { capture, passive }
      : capture
  )
}

// 从目标DOM元素中移除事件
function remove (
  name: string,
  handler: Function,
  capture: boolean,
  _target?: HTMLElement
) {
  (_target || target).removeEventListener(
    name,
    handler._wrapper || handler, // 移除事件（或经过包装的事件）处理程序
    capture
  )
}

// 对比新老节点，更新事件监听
function updateDOMListeners (oldVnode: VNodeWithData, vnode: VNodeWithData) {
  // 新老节点都没有事件不处理
  if (isUndef(oldVnode.data.on) && isUndef(vnode.data.on)) { 
    return
  }
  const on = vnode.data.on || {} // 新节点事件
  const oldOn = oldVnode.data.on || {} // 老节点事件
  target = vnode.elm // DOM节点
  normalizeEvents(on) // 规范化v-model的事件，将占位符事件替换为运行时事件
  // 对比新老节点的事件，更新事件
  // 1. 移除老的事件
  // 2. 更新旧的事件的回调函数
  // 3. 添加新的事件监听
  // 4. 处理单次监听的事件
  updateListeners(on, oldOn, add, remove, createOnceHandler, vnode.context)
  target = undefined // 事件更新完毕释放DOM的引用
}

export default {
  create: updateDOMListeners,
  update: updateDOMListeners
}
