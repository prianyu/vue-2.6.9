/* @flow */
/* globals MutationObserver */

import { noop } from 'shared/util'
import { handleError } from './error'
import { isIE, isIOS, isNative } from './env'

export let isUsingMicroTask = false // 用于标记是否使用了微任务

const callbacks = []
let pending = false

function flushCallbacks () {
  pending = false
  const copies = callbacks.slice(0)
  callbacks.length = 0
  for (let i = 0; i < copies.length; i++) {
    copies[i]()
  }
}

// Here we have async deferring wrappers using microtasks.
// In 2.5 we used (macro) tasks (in combination with microtasks).
// However, it has subtle problems when state is changed right before repaint
// (e.g. #6813, out-in transitions).
// Also, using (macro) tasks in event handler would cause some weird behaviors
// that cannot be circumvented (e.g. #7109, #7153, #7546, #7834, #8109).
// So we now use microtasks everywhere, again.
// A major drawback of this tradeoff is that there are some scenarios
// where microtasks have too high a priority and fire in between supposedly
// sequential events (e.g. #4521, #6690, which have workarounds)
// or even between bubbling of the same event (#6566).
/**
 * 使用微任务实现的异步任务包装哈函数
 * Vue在实现这个函数的时候经过了好多个迭代的版本，先后遇到了不少的问题
 * 1. 在2.4版本中，其背后实现的机制是microtask，优雅降级的方式是Promise > MutationObserver > setTimeout
 * 这种方案下，发现Microtask由于其优先级过高，会导致其触发会发生在顺序发生的事件、甚至同一事件源冒泡监听回调之间(e.g. #4521, #6690，#6566)
 * #4521：将一个input[checkbox]元素包裹在一个有v-on:click事件的div中，div会触发事件，但是input[checkbox]无法正常工作
 * 2. 在2.5.0~2.5.1版本中，Vue优先使用macrotask，优雅降级的方式为setImmediate>MessageChannel > Promise > setTimeout
 * 3. 在2.5.2~2.5.final版本中，Vue则结合使用microtask/macrotask，采用两种降级方案，分别为
 * setImmediate>MessageChannel>setTimeout;Promise > macroTimerFunc
 * 其内部体现为
 * （1）定义了两个函数microTimerFunc、macroTimerFunc ，默认使用microTimerFunc
 * （2）声明了一个useMacroTask，用于标记判断使用何种任务
 * （3）暴露withMacroTask API，用于在一些特别的场景下强制使用macroTask
 *  使用这种方案的主要原因是全部使用macrotask会导致一些比较微妙的、难以察觉的问题(e.g. #6813, out-in transitions)
 * 4. Vue在做了权衡之后，在Macrotask和Microtask做了取舍
 * （1）忍受microtask高优先级带来的有些场景下的优先执行
 * （2）这些场景可以在业务中用一些变通的方式来处理
 * （3）增加了一个只读变量：isUsingMicrotask
 * 最终优先级：Promise > MutationObserver > setImmediate > setTimeout
 */
let timerFunc

// The nextTick behavior leverages the microtask queue, which can be accessed
// via either native Promise.then or MutationObserver.
// MutationObserver has wider support, however it is seriously bugged in
// UIWebView in iOS >= 9.3.3 when triggered in touch event handlers. It
// completely stops working after triggering a few times... so, if native
// Promise is available, we will use it:
/* istanbul ignore next, $flow-disable-line */
// Promise.then和MutationObserver都可以使用微任务，MutationObserver的支持度会更广泛些
// 但是在iOS >9.3.3中，其事件处理有严重的bug，其在触发几次之后就不再触发了，因此优先使用Promise.then
if (typeof Promise !== 'undefined' && isNative(Promise)) {// 优先使用Promise
  const p = Promise.resolve()
  timerFunc = () => {
    p.then(flushCallbacks)
    // In problematic UIWebViews, Promise.then doesn't completely break, but
    // it can get stuck in a weird state where callbacks are pushed into the
    // microtask queue but the queue isn't being flushed, until the browser
    // needs to do some other work, e.g. handle a timer. Therefore we can
    // "force" the microtask queue to be flushed by adding an empty timer.
    // 在一些有问题的UIWebview中，虽然回调被推入了微任务队列，但是队列不会被刷新，
    // 需要等到浏览器做一些其他的操作才会工作，比如使用了计时器。因此，我们可以
    // 正在一个定时器来强制刷新队列
    if (isIOS) setTimeout(noop)
  }
  isUsingMicroTask = true // 标记使用了微任务
} else if (!isIE && typeof MutationObserver !== 'undefined' && (
  isNative(MutationObserver) ||
  // PhantomJS and iOS 7.x
  MutationObserver.toString() === '[object MutationObserverConstructor]'
)) { // 降级到MutationObserver
  // Use MutationObserver where native Promise is not available,
  // e.g. PhantomJS, iOS7, Android 4.4
  // (#6466 MutationObserver is unreliable in IE11)

  // 通过不断监听一个文本节点的内容来实现刷新队列
  let counter = 1
  const observer = new MutationObserver(flushCallbacks)
  const textNode = document.createTextNode(String(counter))
  observer.observe(textNode, {
    characterData: true
  })
  timerFunc = () => {
    counter = (counter + 1) % 2
    textNode.data = String(counter)
  }
  isUsingMicroTask = true // 标记为微任务
} else if (typeof setImmediate !== 'undefined' && isNative(setImmediate)) {
  // 宏任务中，优先使用setImmediate来实现
  // Fallback to setImmediate.
  // Techinically it leverages the (macro) task queue,
  // but it is still a better choice than setTimeout.
  timerFunc = () => {
    setImmediate(flushCallbacks)
  }
} else { // 最后的降级策略为setTimeout
  // Fallback to setTimeout.
  timerFunc = () => {
    setTimeout(flushCallbacks, 0)
  }
}

// 执行异步任务
export function nextTick (cb?: Function, ctx?: Object) {
  let _resolve
  // 将回调函数压入callbacks
  callbacks.push(() => {
    if (cb) {
      try {
        cb.call(ctx)
      } catch (e) {
        handleError(e, ctx, 'nextTick')
      }
    } else if (_resolve) {// 没有传cb且支持Promise，返回一个Promise
      _resolve(ctx)
    }
  })
  // 非pending状态下执行回调函数
  if (!pending) {
    pending = true
    timerFunc()
  }
  // $flow-disable-line
  if (!cb && typeof Promise !== 'undefined') {
    return new Promise(resolve => {
      _resolve = resolve
    })
  }
}
