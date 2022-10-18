/* @flow */

import type Watcher from './watcher'
import config from '../config'
import { callHook, activateChildComponent } from '../instance/lifecycle'

import {
  warn,
  nextTick,
  devtools,
  inBrowser
} from '../util/index'

export const MAX_UPDATE_COUNT = 100 // 循环执行的次数

const queue: Array<Watcher> = [] // 观察者队列
const activatedChildren: Array<Component> = [] // 激活的keep-alive组件队列
let has: { [key: number]: ?true } = {} // 所有已经加入队列的观察者的id的集合
let circular: { [key: number]: number } = {} // 用于登记某一个观察者被循环执行的次数
let waiting = false // 标记当前队列是否正在等待刷新
let flushing = false  // 标记当前队列是否正在刷新
let index = 0 //记录当前正在执行的观察者在队列中的索引

/**
 * Reset the scheduler's state.
 * 重置调度状态
 * 将队列、index、waiting、flushing等恢复到初始状态
 */
function resetSchedulerState () {
  index = queue.length = activatedChildren.length = 0
  has = {}
  if (process.env.NODE_ENV !== 'production') {
    circular = {}
  }
  waiting = flushing = false
}

// Async edge case #6566 requires saving the timestamp when event listeners are
// attached. However, calling performance.now() has a perf overhead especially
// if the page has thousands of event listeners. Instead, we take a timestamp
// every time the scheduler flushes and use that for all event listeners
// attached during that flush.
export let currentFlushTimestamp = 0

// Async edge case fix requires storing an event listener's attach timestamp.
let getNow: () => number = Date.now

// Determine what event timestamp the browser is using. Annoyingly, the
// timestamp can either be hi-res (relative to page load) or low-res
// (relative to UNIX epoch), so in order to compare time we have to use the
// same timestamp type when saving the flush timestamp.
if (
  inBrowser &&
  window.performance &&
  typeof performance.now === 'function' &&
  document.createEvent('Event').timeStamp <= performance.now()
) {
  // if the event timestamp is bigger than the hi-res timestamp
  // (which is evaluated AFTER) it means the event is using a lo-res timestamp,
  // and we need to use the lo-res version for event listeners as well.
  getNow = () => performance.now()
}

/**
 * Flush both queues and run the watchers.
 */
function flushSchedulerQueue () {
  currentFlushTimestamp = getNow() // 当前刷新时的时间戳
  flushing = true // 标记为正在刷新队列
  let watcher, id
    
  // Sort queue before flush.
  // This ensures that:
  // 1. Components are updated from parent to child. (because parent is always
  //    created before the child)
  // 2. A component's user watchers are run before its render watcher (because
  //    user watchers are created before the render watcher)
  // 3. If a component is destroyed during a parent component's watcher run,
  //    its watchers can be skipped.
  // 根据id对队列进行升序排序，主要是为了确保几件事：
  // 1. 从父组件到子组件的更新组件，因为父组件总是比子组件先创建
  // 2. 用户watcher比渲染watcher先执行，因为用户watcher比渲染watcher先创建
  // 3. 如果在组件在父组件的watcher中销毁时，可以忽略其watcher
  queue.sort((a, b) => a.id - b.id) 

  // do not cache length because more watchers might be pushed
  // as we run existing watchers
  // 遍历观察者队列
  // 由于在刷新队列的过程钟，队列可能是在不断增加的，所以在刷新队列时不能将当下的length进行缓存
  for (index = 0; index < queue.length; index++) {
    watcher = queue[index] // 当前观察者
    if (watcher.before) { // 有before钩子则执行before钩子，比如beforeUpdate
      watcher.before()
    }
    id = watcher.id
    has[id] = null // 执行后从队列中移除观察者
    watcher.run() // 执行观察者的run方法，即重新求值并执行回调
    // in dev build, check and stop circular updates.
    // has[id]不为bull，说明run的时候又触发了重新求值，陷入了循环
    // 如vm.$watch("test", function(){ this.test = new Date()})
    if (process.env.NODE_ENV !== 'production' && has[id] != null) {
      circular[id] = (circular[id] || 0) + 1
      if (circular[id] > MAX_UPDATE_COUNT) { // 循环的次数超过了MAX_UPDATE_COUNT（100次）则认为陷入了死循环
        warn(
          'You may have an infinite update loop ' + (
            watcher.user
              ? `in watcher with expression "${watcher.expression}"`
              : `in a component render function.`
          ),
          watcher.vm
        )
        break
      }
    }
  }

  // keep copies of post queues before resetting state
  // 重置队列之前保留已经执行更新的队列副本
  const activatedQueue = activatedChildren.slice()
  const updatedQueue = queue.slice()

  // 重置调度状态
  resetSchedulerState()

  // call component updated and activated hooks
  callActivatedHooks(activatedQueue) // 执行keep-alive组件的activated钩子
  callUpdatedHooks(updatedQueue)// 执行updated生命周期

  // devtool hook
  /* istanbul ignore if */
  if (devtools && config.devtools) {
    devtools.emit('flush')
  }
}


// 执行updated钩子
function callUpdatedHooks (queue) {
  let i = queue.length
  while (i--) {
    const watcher = queue[i]
    const vm = watcher.vm
    // 只有组件实例的渲染watcher为当前watcher且未销毁已挂载过时才执行updated钩子
    if (vm._watcher === watcher && vm._isMounted && !vm._isDestroyed) {
      callHook(vm, 'updated')
    }
  }
}

/**
 * Queue a kept-alive component that was activated during patch.
 * The queue will be processed after the entire tree has been patched.
 * patch阶段keep-alive组件在激活的队列
 * 队列在整个树patch完后会执行
 */
export function queueActivatedComponent (vm: Component) {
  // setting _inactive to false here so that a render function can
  // rely on checking whether it's in an inactive tree (e.g. router-view)
  vm._inactive = false
  activatedChildren.push(vm)
}

// 执行keep-alive的activated生命周期
function callActivatedHooks (queue) {
  for (let i = 0; i < queue.length; i++) {
    queue[i]._inactive = true
    activateChildComponent(queue[i], true /* true */)
  }
}

/**
 * Push a watcher into the watcher queue.
 * Jobs with duplicate IDs will be skipped unless it's
 * pushed when the queue is being flushed.
 * 将观察者推进观察者队列
 * id重复的任务将被忽略，除非在刷新队列时将其推进队列
 */
export function queueWatcher (watcher: Watcher) {
  const id = watcher.id // 观察者id
  if (has[id] == null) { // 队列中没有该观察者
    has[id] = true // 队列中标记该观察者
    if (!flushing) { // 如果还没刷新，则将观察者压入队列
      queue.push(watcher)
    } else {
      // if already flushing, splice the watcher based on its id
      // if already past its id, it will be run next immediately.
      // 如果已经进入了队列刷新阶段，则根据当前watcher的id
      //将当前的watcher拼接到刷新队列中（刷新队列时会对队列做排序）

      let i = queue.length - 1
      while (i > index && queue[i].id > watcher.id) {
        i--
      }
      queue.splice(i + 1, 0, watcher)
    }
    // queue the flush
    if (!waiting) { // 等待刷新队列
      waiting = true

      if (process.env.NODE_ENV !== 'production' && !config.async) {
        flushSchedulerQueue()
        return
      }
      nextTick(flushSchedulerQueue)
    }
  }
}
