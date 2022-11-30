/* @flow */

import { toNumber, toString, looseEqual, looseIndexOf } from 'shared/util'
import { createTextVNode, createEmptyVNode } from 'core/vdom/vnode'
import { renderList } from './render-list'
import { renderSlot } from './render-slot'
import { resolveFilter } from './resolve-filter'
import { checkKeyCodes } from './check-keycodes'
import { bindObjectProps } from './bind-object-props'
import { renderStatic, markOnce } from './render-static'
import { bindObjectListeners } from './bind-object-listeners'
import { resolveScopedSlots } from './resolve-scoped-slots'
import { bindDynamicKeys, prependModifier } from './bind-dynamic-keys'

export function installRenderHelpers (target: any) {
  target._o = markOnce // v-once指令运行时帮助程序，为VNode打上静态标记
  target._n = toNumber // 转为数字
  target._s = toString // 转为字符串，对象会使用JSON.stringify
  target._l = renderList // 运行时渲染v-for列表的帮助函数，循环遍历val值，依次为每一项执行rendern方法生成VNode，最终返回数组
  target._t = renderSlot
  target._q = looseEqual // 判断两个值是否相等
  target._i = looseIndexOf // 相当于indexOf方法
  /**
   * 运行时负责生成静态树的Vnode的帮助程序，完成了以下两件事：
   * 1. 执行staticRenderFns数组中指定下标的渲染函数，生成静态树的VNode并缓存，下次再渲染时从缓存中直接读取（isInFor必须为true)
   * 2. 为静态的VNode打上静态标记
   */
  target._m = renderStatic
  target._f = resolveFilter
  target._k = checkKeyCodes
  target._b = bindObjectProps
  target._v = createTextVNode // 创建文本VNode节点
  target._e = createEmptyVNode // 创建空VNode
  target._u = resolveScopedSlots
  target._g = bindObjectListeners
  target._d = bindDynamicKeys
  target._p = prependModifier
}
