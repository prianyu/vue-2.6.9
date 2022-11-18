/* @flow */

import { inBrowser, isIE9, warn } from 'core/util/index'
import { mergeVNodeHook } from 'core/vdom/helpers/index'
import { activeInstance } from 'core/instance/lifecycle'

import {
  once,
  isDef,
  isUndef,
  isObject,
  toNumber
} from 'shared/util'

import {
  nextFrame,
  resolveTransition,
  whenTransitionEnds,
  addTransitionClass,
  removeTransitionClass
} from '../transition-util'

export function enter (vnode: VNodeWithData, toggleDisplay: ?() => void) {
  const el: any = vnode.elm // 真实DOM元素

  // call leave callback now
  if (isDef(el._leaveCb)) { // 执行离开的回调
    el._leaveCb.cancelled = true
    el._leaveCb()
  }

  // 解析得到transition的各种状态的类名、事件回调等
  // 如fade-enter fade-enter-active/beforeEnter、afterEnter
  const data = resolveTransition(vnode.data.transition)
  if (isUndef(data)) {
    return
  }

  /* istanbul ignore if */
  // 非DOM节点或者有_enterCb会回调则直接结束
  if (isDef(el._enterCb) || el.nodeType !== 1) {
    return
  }

  const {
    css,
    type,
    enterClass,
    enterToClass,
    enterActiveClass,
    appearClass,
    appearToClass,
    appearActiveClass,
    beforeEnter,
    enter,
    afterEnter,
    enterCancelled,
    beforeAppear,
    appear,
    afterAppear,
    appearCancelled,
    duration
  } = data

  // activeInstance will always be the <transition> component managing this
  // transition. One edge case to check is when the <transition> is placed
  // as the root node of a child component. In that case we need to check
  // <transition>'s parent for appear check.
  // activeInstance为全局变量，代表当前激活的组件，这里是transition组件
  let context = activeInstance
  let transitionNode = activeInstance.$vnode // 占位符节点
  // 一致找到占位符节点的父组件
  while (transitionNode && transitionNode.parent) {
    context = transitionNode.context
    transitionNode = transitionNode.parent
  }

  // 其祖先没有mounted的时候则为首次渲染
  const isAppear = !context._isMounted || !vnode.isRootInsert

  // 默认情况下，第一次渲染不触发过渡效果
  if (isAppear && !appear && appear !== '') {
    return
  }

  // 解析各种class名称以及回调函数
  // 对首次渲染做了区分
  const startClass = isAppear && appearClass
    ? appearClass
    : enterClass
  const activeClass = isAppear && appearActiveClass
    ? appearActiveClass
    : enterActiveClass
  const toClass = isAppear && appearToClass
    ? appearToClass
    : enterToClass

  const beforeEnterHook = isAppear
    ? (beforeAppear || beforeEnter)
    : beforeEnter
  const enterHook = isAppear
    ? (typeof appear === 'function' ? appear : enter)
    : enter
  const afterEnterHook = isAppear
    ? (afterAppear || afterEnter)
    : afterEnter
  const enterCancelledHook = isAppear
    ? (appearCancelled || enterCancelled)
    : enterCancelled

    // 用户定义的动画执行的时间
  const explicitEnterDuration: any = toNumber(
    isObject(duration)
      ? duration.enter
      : duration
  )

  if (process.env.NODE_ENV !== 'production' && explicitEnterDuration != null) {
    checkDuration(explicitEnterDuration, 'enter', vnode)
  }

  // 是否设置了CSS过渡，默认为true
  // 当css设置为false后，Vue会跳过CSS的检测
  // 一般再纯javascript过渡的元素上会将css设置为false
  const expectsCSS = css !== false && !isIE9
  // 根据enterHook的参数数量，判断是否为用户控制过渡
  // 参数为两个的时候表示用户想自己控制
  const userWantsControl = getHookArgumentsLength(enterHook)

  // 定义了一个只执行一次的el_enterCb函数
  const cb = el._enterCb = once(() => {
    if (expectsCSS) { // 使用CSS过渡
      removeTransitionClass(el, toClass) // 移除name-enter-to类名
      removeTransitionClass(el, activeClass) // 移除name-enter-active类名
    }
    // leave函数执行后会将cb._enterCb.cancelled设置为true
    if (cb.cancelled) {
      if (expectsCSS) {
        removeTransitionClass(el, startClass) // 移除name-enter
      }
      enterCancelledHook && enterCancelledHook(el) // 执行enterCancelled回调函数
    } else { // 执行afterEnter回调函数
      afterEnterHook && afterEnterHook(el)
    }
    el._enterCb = null // 重置el._enterCb
  })

  // 处理v-show为false或者没有v-show指令的时候
  // 在节点被插入的时候执行enterHook回调
  // enterHook一定比beforeEnterHook晚执行
  if (!vnode.data.show) {
    // remove pending leave element on enter by injecting an insert hook
    // 往vnode的insert钩子中添加一个回调函数
    mergeVNodeHook(vnode, 'insert', () => {
      const parent = el.parentNode
      const pendingNode = parent && parent._pending && parent._pending[vnode.key]
      if (pendingNode &&
        pendingNode.tag === vnode.tag &&
        pendingNode.elm._leaveCb
      ) {
        pendingNode.elm._leaveCb()
      }
      // 这个地方可能会二次执行，所以才套上了一层once函数
      enterHook && enterHook(el, cb)
    })
  }

  // start enter transition
  // 开始执行过渡
  beforeEnterHook && beforeEnterHook(el) // 执行beforeEnter钩子
  if (expectsCSS) {
    // 添加startClass，activeClass（在组件的create钩子执行）
    addTransitionClass(el, startClass) 
    addTransitionClass(el, activeClass)
    nextFrame(() => { // 下一帧
      removeTransitionClass(el, startClass) // 移除startClass
      if (!cb.cancelled) { // 过渡没有被取消
        addTransitionClass(el, toClass) // 添加toClass
        if (!userWantsControl) {
          // 非用户控制enterHook来决定动画
          if (isValidDuration(explicitEnterDuration)) {
            setTimeout(cb, explicitEnterDuration)
          } else {
            // 监听transition/animation事件，结束时执行回调函数
            whenTransitionEnds(el, type, cb)
          }
        }
      }
    })
  }

  // v-show为true
  // 调用enterHook
  if (vnode.data.show) {
    toggleDisplay && toggleDisplay()
    enterHook && enterHook(el, cb)
  }

  // 不是通过css来控制动画，也没有用户自定义控制
  if (!expectsCSS && !userWantsControl) {
    cb()
  }
}

export function leave (vnode: VNodeWithData, rm: Function) {
  const el: any = vnode.elm

  // call enter callback now
  if (isDef(el._enterCb)) {
    el._enterCb.cancelled = true
    el._enterCb()
  }

  const data = resolveTransition(vnode.data.transition)
  if (isUndef(data) || el.nodeType !== 1) {
    return rm()
  }

  /* istanbul ignore if */
  if (isDef(el._leaveCb)) {
    return
  }

  const {
    css,
    type,
    leaveClass,
    leaveToClass,
    leaveActiveClass,
    beforeLeave,
    leave,
    afterLeave,
    leaveCancelled,
    delayLeave,
    duration
  } = data

  const expectsCSS = css !== false && !isIE9
  const userWantsControl = getHookArgumentsLength(leave)

  const explicitLeaveDuration: any = toNumber(
    isObject(duration)
      ? duration.leave
      : duration
  )

  if (process.env.NODE_ENV !== 'production' && isDef(explicitLeaveDuration)) {
    checkDuration(explicitLeaveDuration, 'leave', vnode)
  }

  const cb = el._leaveCb = once(() => {
    if (el.parentNode && el.parentNode._pending) {
      el.parentNode._pending[vnode.key] = null
    }
    if (expectsCSS) {
      removeTransitionClass(el, leaveToClass)
      removeTransitionClass(el, leaveActiveClass)
    }
    if (cb.cancelled) {
      if (expectsCSS) {
        removeTransitionClass(el, leaveClass)
      }
      leaveCancelled && leaveCancelled(el)
    } else {
      rm()
      afterLeave && afterLeave(el)
    }
    el._leaveCb = null
  })

  if (delayLeave) {
    delayLeave(performLeave)
  } else {
    performLeave()
  }

  function performLeave () {
    // the delayed leave may have already been cancelled
    if (cb.cancelled) {
      return
    }
    // record leaving element
    if (!vnode.data.show && el.parentNode) {
      (el.parentNode._pending || (el.parentNode._pending = {}))[(vnode.key: any)] = vnode
    }
    beforeLeave && beforeLeave(el)
    if (expectsCSS) {
      addTransitionClass(el, leaveClass)
      addTransitionClass(el, leaveActiveClass)
      nextFrame(() => {
        removeTransitionClass(el, leaveClass)
        if (!cb.cancelled) {
          addTransitionClass(el, leaveToClass)
          if (!userWantsControl) {
            if (isValidDuration(explicitLeaveDuration)) {
              setTimeout(cb, explicitLeaveDuration)
            } else {
              whenTransitionEnds(el, type, cb)
            }
          }
        }
      })
    }
    leave && leave(el, cb)
    if (!expectsCSS && !userWantsControl) {
      cb()
    }
  }
}

// only used in dev mode
function checkDuration (val, name, vnode) {
  if (typeof val !== 'number') {
    warn(
      `<transition> explicit ${name} duration is not a valid number - ` +
      `got ${JSON.stringify(val)}.`,
      vnode.context
    )
  } else if (isNaN(val)) {
    warn(
      `<transition> explicit ${name} duration is NaN - ` +
      'the duration expression might be incorrect.',
      vnode.context
    )
  }
}

function isValidDuration (val) {
  return typeof val === 'number' && !isNaN(val)
}

/**
 * Normalize a transition hook's argument length. The hook may be:
 * - a merged hook (invoker) with the original in .fns
 * - a wrapped component method (check ._length)
 * - a plain function (.length)
 */
function getHookArgumentsLength (fn: Function): boolean {
  if (isUndef(fn)) {
    return false
  }
  const invokerFns = fn.fns
  if (isDef(invokerFns)) {
    // invoker
    return getHookArgumentsLength(
      Array.isArray(invokerFns)
        ? invokerFns[0]
        : invokerFns
    )
  } else {
    return (fn._length || fn.length) > 1
  }
}


function _enter (_: any, vnode: VNodeWithData) {
  if (vnode.data.show !== true) { // 非展示状态，则进入
    enter(vnode)
  }
}

export default inBrowser ? {
  create: _enter,
  activate: _enter,
  remove (vnode: VNode, rm: Function) {
    /* istanbul ignore else */
    if (vnode.data.show !== true) {
      leave(vnode, rm)
    } else {
      rm()
    }
  }
} : {}
