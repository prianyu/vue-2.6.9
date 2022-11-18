/* @flow */

import { inBrowser, isIE9 } from 'core/util/index'
import { addClass, removeClass } from './class-util'
import { remove, extend, cached } from 'shared/util'

// 解析transition
// 得到transition各种状态的CSS名称以及事件回调等信息
export function resolveTransition (def?: string | Object): ?Object {
  if (!def) {
    return
  }
  /* istanbul ignore else */
  if (typeof def === 'object') {
    const res = {}
    if (def.css !== false) {
      extend(res, autoCssTransition(def.name || 'v'))
    }
    extend(res, def)
    return res
  } else if (typeof def === 'string') {
    return autoCssTransition(def)
  }
}

// 获取中状态的CSS名称
const autoCssTransition: (name: string) => Object = cached(name => {
  return {
    enterClass: `${name}-enter`,
    enterToClass: `${name}-enter-to`,
    enterActiveClass: `${name}-enter-active`,
    leaveClass: `${name}-leave`,
    leaveToClass: `${name}-leave-to`,
    leaveActiveClass: `${name}-leave-active`
  }
})

export const hasTransition = inBrowser && !isIE9
const TRANSITION = 'transition'
const ANIMATION = 'animation'

// Transition property/event sniffing
// 对transition和animation属性及其事件名的嗅探
export let transitionProp = 'transition'
export let transitionEndEvent = 'transitionend'
export let animationProp = 'animation'
export let animationEndEvent = 'animationend'
if (hasTransition) {
  /* istanbul ignore if */
  if (window.ontransitionend === undefined &&
    window.onwebkittransitionend !== undefined
  ) {
    transitionProp = 'WebkitTransition'
    transitionEndEvent = 'webkitTransitionEnd'
  }
  if (window.onanimationend === undefined &&
    window.onwebkitanimationend !== undefined
  ) {
    animationProp = 'WebkitAnimation'
    animationEndEvent = 'webkitAnimationEnd'
  }
}

// binding to window is necessary to make hot reload work in IE in strict mode
// 动画的api名称
const raf = inBrowser
  ? window.requestAnimationFrame
    ? window.requestAnimationFrame.bind(window)
    : setTimeout
  : /* istanbul ignore next */ fn => fn()

export function nextFrame (fn: Function) {
  raf(() => {
    raf(fn)
  })
}

// 添加指定的transition样式类名
export function addTransitionClass (el: any, cls: string) {
  const transitionClasses = el._transitionClasses || (el._transitionClasses = [])
  if (transitionClasses.indexOf(cls) < 0) {
    transitionClasses.push(cls)
    addClass(el, cls) // 添加对应的类名
  }
}

// 删除指定的样式类名
export function removeTransitionClass (el: any, cls: string) {
  if (el._transitionClasses) {
    remove(el._transitionClasses, cls)
  }
  removeClass(el, cls)
}

export function whenTransitionEnds (
  el: Element,
  expectedType: ?string,
  cb: Function
) {
  // 获取动画的信息{动画类型，timeout，需要执行动画的属性的个数}
  const { type, timeout, propCount } = getTransitionInfo(el, expectedType)
  if (!type) return cb()
  const event: string = type === TRANSITION ? transitionEndEvent : animationEndEvent // 动画结束事件名
  let ended = 0
  const end = () => {
    el.removeEventListener(event, onEnd)
    cb()
  }
  const onEnd = e => {
    if (e.target === el) {
      if (++ended >= propCount) {
        end()
      }
    }
  }
  setTimeout(() => {
    if (ended < propCount) {
      end()
    }
  }, timeout + 1)
  el.addEventListener(event, onEnd) // 添加事件回调
}

const transformRE = /\b(transform|all)(,|$)/

// 获取动画的各种信息
export function getTransitionInfo (el: Element, expectedType?: ?string): {
  type: ?string;
  propCount: number;
  timeout: number;
  hasTransform: boolean;
} {
  const styles: any = window.getComputedStyle(el) // 获取所有的样式
  // JSDOM may return undefined for transition properties
  const transitionDelays: Array<string> = (styles[transitionProp + 'Delay'] || '').split(', ') // transition delay
  const transitionDurations: Array<string> = (styles[transitionProp + 'Duration'] || '').split(', ') // transition duration
  const transitionTimeout: number = getTimeout(transitionDelays, transitionDurations)
  const animationDelays: Array<string> = (styles[animationProp + 'Delay'] || '').split(', ') // animation delay
  const animationDurations: Array<string> = (styles[animationProp + 'Duration'] || '').split(', ') // animation duration
  const animationTimeout: number = getTimeout(animationDelays, animationDurations)
  debugger

  let type: ?string
  let timeout = 0
  let propCount = 0
  /* istanbul ignore if */
  if (expectedType === TRANSITION) {
    if (transitionTimeout > 0) {
      type = TRANSITION
      timeout = transitionTimeout
      propCount = transitionDurations.length
    }
  } else if (expectedType === ANIMATION) {
    if (animationTimeout > 0) {
      type = ANIMATION
      timeout = animationTimeout
      propCount = animationDurations.length
    }
  } else {
    timeout = Math.max(transitionTimeout, animationTimeout)
    type = timeout > 0
      ? transitionTimeout > animationTimeout
        ? TRANSITION
        : ANIMATION
      : null
    propCount = type
      ? type === TRANSITION
        ? transitionDurations.length
        : animationDurations.length
      : 0
  }
  const hasTransform: boolean =
    type === TRANSITION &&
    transformRE.test(styles[transitionProp + 'Property'])
  return {
    type, // 动画类型
    timeout, // timeout
    propCount, // 需要执行动画的属性个数
    hasTransform // 是否有transform
  }
}

function getTimeout (delays: Array<string>, durations: Array<string>): number {
  /* istanbul ignore next */

  while (delays.length < durations.length) {
    delays = delays.concat(delays)
  }

  return Math.max.apply(null, durations.map((d, i) => {
    return toMs(d) + toMs(delays[i])
  }))
}

// Old versions of Chromium (below 61.0.3163.100) formats floating pointer numbers
// in a locale-dependent way, using a comma instead of a dot.
// If comma is not replaced with a dot, the input will be rounded down (i.e. acting
// as a floor function) causing unexpected behaviors
// 旧版本的Chromium内核使用逗号来格式化浮点
// 如果不将逗号替换为点可能会发生意外的行为
// 转为毫秒
function toMs (s: string): number {
  return Number(s.slice(0, -1).replace(',', '.')) * 1000
}
