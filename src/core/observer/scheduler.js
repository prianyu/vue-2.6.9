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
// 处理#6566这个边界条件，详情见src/platforms/web/runtime/modules/events.js/add()
// 由于performance.now是因为它的创建是有成本的，如果每次附加事件监听器时都调用性能开销会比较大
// 因此在每次任务调度时获取一个时间戳，并将其用于刷新期间的所有的事件监听
export let currentFlushTimestamp = 0

// Async edge case fix requires storing an event listener's attach timestamp.
// 默认的获取时间戳的方法
let getNow: () => number = Date.now 

// 在某些浏览器中，事件的时间戳可能不是高分辨率的，这会导致时间的比较出现问题
// 所以为了解决这些兼容问题，必须根据浏览器的实际情况选择合适的时间戳获取方法
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
  // 说明event.timestamp使用的hi-res时间戳(相对页面加载)
  getNow = () => performance.now()
}

/**
 * Flush both queues and run the watchers.
 * 刷新队列并执行队列中的watcher
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
  // 3. 如果子组件在父组件执行watcher的过程中被销毁时，可以忽略其watcher
  // 排序后queue是有序的，刷新期间如果有新的watcher进队列会插入到合适的位置，保持有序性
  queue.sort((a, b) => a.id - b.id) 

  // do not cache length because more watchers might be pushed
  // as we run existing watchers
  // 遍历队列，依次执行watcher的run方法
  // 由于在刷新队列的过程中，队列可能是在不断增加的，所以在刷新队列时不能将当下的length进行缓存
  for (index = 0; index < queue.length; index++) {
    watcher = queue[index] // 当前watcher
    if (watcher.before) { // 有before钩子则执行before钩子，比如beforeUpdate
      watcher.before()
    }
    id = watcher.id
    has[id] = null // 执行后从队列中移除观察者
    watcher.run() // 执行watcher的run方法，即重新求值并执行回调
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
  // 重置队列之前保留需要执行activated钩子的子元素
  const activatedQueue = activatedChildren.slice()
  const updatedQueue = queue.slice()

  // 重置调度状态
  resetSchedulerState()

  // call component updated and activated hooks
  callActivatedHooks(activatedQueue) // 执行keep-alive组件的activated钩子
  callUpdatedHooks(updatedQueue)// 执行updated生命周期

  // devtool hook
  // 触发开发者工具的flush事件
  /* istanbul ignore if */
  if (devtools && config.devtools) {
    devtools.emit('flush')
  }
}


// 执行每一个组件实例的updated钩子
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
  // 将失活状态标记为false
  // 在一些渲染函数（比如router-view组件）在激活组件或者失活组件时会检测节点是否处于失活的节点树上
  vm._inactive = false 
  activatedChildren.push(vm) // 将当前实例添加至待激活的队列
}

// 执行keep-alive的activated生命周期
function callActivatedHooks (queue) {
  for (let i = 0; i < queue.length; i++) {
    queue[i]._inactive = true // 先标记为失活状态
    // 激活组件
    activateChildComponent(queue[i], true /* true */)
  }
}

/**
 * Push a watcher into the watcher queue.
 * Jobs with duplicate IDs will be skipped unless it's
 * pushed when the queue is being flushed.
 * 将watcher添加到观察者队列中
 * 重复的watcher将被忽略，除非在刷新队列时将其推进队列
 */
export function queueWatcher (watcher: Watcher) {
  const id = watcher.id // 观察者id
  if (has[id] == null) { // 队列中没有该观察者
    has[id] = true // 队列中标记该观察者
    if (!flushing) { 
      // 如果不是在刷新阶段则将watcher压入队列（无序）
      queue.push(watcher)
    } else { 
      // 如果已经在刷新阶段，则将watcher插入到队列中合适的位置，以保证队列的有序
      // 也就是说队列刷新的过程中queue是可能会改变的
      // if already flushing, splice the watcher based on its id
      // if already past its id, it will be run next immediately.
      let i = queue.length - 1
      while (i > index && queue[i].id > watcher.id) {
        i--
      }
      queue.splice(i + 1, 0, watcher)
    }
    // queue the flush
    // 如果还没有等待刷新，则设置等待刷新状态，并调用nextTick刷新队列
    // 即queueWatcher函数多次调用时，在waiting为true期间只会执行一次队列的刷新
    if (!waiting) {
      waiting = true
      if (process.env.NODE_ENV !== 'production' && !config.async) {
        flushSchedulerQueue()
        return
      }
      // 异步刷新队列
      nextTick(flushSchedulerQueue)
    }
  }
}
