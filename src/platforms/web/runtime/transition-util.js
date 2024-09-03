/* @flow */

import { inBrowser, isIE9 } from 'core/util/index'
import { addClass, removeClass } from './class-util'
import { remove, extend, cached } from 'shared/util'

// 根据vnode.data.transition中的信息解析transition
// 得到transition各种状态的CSS名称以及事件回调等信息
export function resolveTransition (def?: string | Object): ?Object {
  if (!def) {
    return
  }
  /* istanbul ignore else */
  // transition配置定义是个对象
  if (typeof def === 'object') {
    const res = {}
    if (def.css !== false) { // 使用CSS过渡
      // 通过name属性获取样式类后合并到对象中
      extend(res, autoCssTransition(def.name || 'v'))
    }
    extend(res, def)
    return res
  } else if (typeof def === 'string') { // 字符串则返回样式类名称的对象
    return autoCssTransition(def)
  }
}

// 根据name获取中状态的CSS名称
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

export const hasTransition = inBrowser && !isIE9 // 是否支持css transition
// 过渡事件类型
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
// 动画的api名称，优先使用requestAnimationFrame
const raf = inBrowser
  ? window.requestAnimationFrame
    ? window.requestAnimationFrame.bind(window)
    : setTimeout
  : /* istanbul ignore next */ fn => fn()

// 下一帧动画
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
    addClass(el, cls) // 给元素添加对应的类名
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
  // 获取动画的信息{动画类型，执行时长，需要执行动画的属性的个数}
  const { type, timeout, propCount } = getTransitionInfo(el, expectedType)
  if (!type) return cb()
  const event: string = type === TRANSITION ? transitionEndEvent : animationEndEvent // 动画结束事件名
  let ended = 0

  // 动画或过渡结束的回调
  // 结束后执行回调并移除事件监听
  const end = () => {
    el.removeEventListener(event, onEnd)
    cb()
  }
  const onEnd = e => {
    if (e.target === el) { // 确保事件是在目标元素中触发
      if (++ended >= propCount) { // 运行完毕则执行回调
        end()
      }
    }
  }
  // 超时兜底，防止由于某些情况下未触发transitionend或animationend事件
  // 导致的回到不被调用的问题
  setTimeout(() => {
    // 超时了动画执行的个数小于应执行个数
    if (ended < propCount) {
      end()
    }
  }, timeout + 1)
  el.addEventListener(event, onEnd) // 添加事件回调
}

const transformRE = /\b(transform|all)(,|$)/ // transition property中transform属性的匹配

// 获取过渡或动画的相关信息
export function getTransitionInfo (el: Element, expectedType?: ?string): {
  type: ?string;
  propCount: number;
  timeout: number;
  hasTransform: boolean;
} {

  // 获取transition和animation所有属性的delay和duration
  // 并计算动画的最长时长
  const styles: any = window.getComputedStyle(el) // 获取所有的样式
  // JSDOM may return undefined for transition properties
  const transitionDelays: Array<string> = (styles[transitionProp + 'Delay'] || '').split(', ') // transition delay
  const transitionDurations: Array<string> = (styles[transitionProp + 'Duration'] || '').split(', ') // transition duration
  const transitionTimeout: number = getTimeout(transitionDelays, transitionDurations)
  const animationDelays: Array<string> = (styles[animationProp + 'Delay'] || '').split(', ') // animation delay
  const animationDurations: Array<string> = (styles[animationProp + 'Duration'] || '').split(', ') // animation duration
  const animationTimeout: number = getTimeout(animationDelays, animationDurations)

  let type: ?string
  let timeout = 0
  let propCount = 0
  /* istanbul ignore if */
  if (expectedType === TRANSITION) {// transition类型
    if (transitionTimeout > 0) {
      type = TRANSITION
      timeout = transitionTimeout
      propCount = transitionDurations.length
    }
  } else if (expectedType === ANIMATION) { // animation类型
    if (animationTimeout > 0) {
      type = ANIMATION
      timeout = animationTimeout
      propCount = animationDurations.length
    }
  } else { // 同时存在
    timeout = Math.max(transitionTimeout, animationTimeout) // 取较大的时长
    type = timeout > 0
      ? transitionTimeout > animationTimeout
        ? TRANSITION
        : ANIMATION // 取较大时长的类型
      : null
    propCount = type
      ? type === TRANSITION
        ? transitionDurations.length
        : animationDurations.length
      : 0
  }
  // 是否是transition类型且有transform属性过渡
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
// 计算所有的duration和delay值的最长时间
function getTimeout (delays: Array<string>, durations: Array<string>): number {
  /* istanbul ignore next */

  // 确保数组长度一致
  while (delays.length < durations.length) {
    delays = delays.concat(delays)
  }

  // 返回所有的duration+delay值的最长时间
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
