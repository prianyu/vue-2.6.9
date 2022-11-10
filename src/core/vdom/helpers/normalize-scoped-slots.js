/* @flow */

import { def } from 'core/util/lang'
import { normalizeChildren } from 'core/vdom/helpers/normalize-children'
import { emptyObject } from 'shared/util'

// 规范化插槽
export function normalizeScopedSlots (
  slots: { [key: string]: Function } | void, // 分组的作用域插槽节点集合
  normalSlots: { [key: string]: Array<VNode> }, // 分组的普通插槽节点函数集合
  prevSlots?: { [key: string]: Function } | void
): any {
  let res
  const isStable = slots ? !!slots.$stable : true
  const hasNormalSlots = Object.keys(normalSlots).length > 0 // 是否有普通插槽
  const key = slots && slots.$key
  if (!slots) { // 没有作用域插槽
    res = {}
  } else if (slots._normalized) { // 已经处理过了且只有子元素发生了变化，只要重新渲染子元素
    // fast path 1: child component re-render only, parent did not change
    return slots._normalized
  } else if (
    isStable && // 没有动态的key
    prevSlots && // 有上一次处理后的作用域插槽
    prevSlots !== emptyObject && // 不是初次规范化
    key === prevSlots.$key && // key没有发生变化
    !hasNormalSlots && // 没有普通插槽
    !prevSlots.$hasNormal // 上一次也没有普通插槽
  ) {
    // 综上，对于没有普通插槽代理在$scopedSlots的插槽，只需要规范化一次就可以了
    // fast path 2: stable scoped slots w/ no normal slots to proxy,
    // only need to normalize once
    return prevSlots
  } else {
    res = {}
    for (const key in slots) {
      if (slots[key] && key[0] !== '$') {
        // 对slots[key]函数做包装，返回一个新的函数
        res[key] = normalizeScopedSlot(normalSlots, key, slots[key])
      }
    }
  }
  // expose normal slots on scopedSlots
  // 将普通插槽转为函数并暴漏在作用插槽上
  for (const key in normalSlots) {
    if (!(key in res)) {
      res[key] = proxyNormalSlot(normalSlots, key)
    }
  }
  // avoriaz seems to mock a non-extensible $scopedSlots object
  // and when that is passed down this would cause an error
  if (slots && Object.isExtensible(slots)) {
    (slots: any)._normalized = res // 标记规范化后的结果
  }
  def(res, '$stable', isStable) // 标记是否为稳固的插槽（没有动态插槽）
  def(res, '$key', key) // key
  def(res, '$hasNormal', hasNormalSlots) // 标记是否有普通插槽
  return res
}

// 规范化作用插槽，返回一个新函数
function normalizeScopedSlot(normalSlots, key, fn) {
  const normalized = function () {
    let res = arguments.length ? fn.apply(null, arguments) : fn({})
    res = res && typeof res === 'object' && !Array.isArray(res) //执行结果为VNode或者VNode数组
      ? [res] // single vnode 只有一个则转为数组
      : normalizeChildren(res) // 对子元素做规范化处理
      // 最终会返回VNode节点
    return res && (
      res.length === 0 ||
      (res.length === 1 && res[0].isComment) // #9658
    ) ? undefined
      : res
  }
  // this is a slot using the new v-slot syntax without scope. although it is
  // compiled as a scoped slot, render fn users would expect it to be present
  // on this.$slots because the usage is semantically a normal slot.
  // 以下是对新语法v-slot的处理
  // 在新语法中，为了给使用手写render的用户使用"this.$slots"访问作用域插槽，
  // 在this.$slots对作用域插槽做了一层代理，可以访问到this.$scopedSlots里面对应的插槽
  if (fn.proxy) {
    Object.defineProperty(normalSlots, key, {
      get: normalized,
      enumerable: true,
      configurable: true
    })
  }
  return normalized
}

function proxyNormalSlot(slots, key) {
  return () => slots[key]
}
