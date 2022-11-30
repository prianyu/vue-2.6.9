/* @flow */

import config from '../config'
import VNode, { createEmptyVNode } from './vnode'
import { createComponent } from './create-component'
import { traverse } from '../observer/traverse'

import {
  warn,
  isDef,
  isUndef,
  isTrue,
  isObject,
  isPrimitive,
  resolveAsset
} from '../util/index'

import {
  normalizeChildren,
  simpleNormalizeChildren
} from './helpers/index'

// 用于children的规范化
const SIMPLE_NORMALIZE = 1 // 简单类型的规范化，针对的是编译阶段生成的render函数
const ALWAYS_NORMALIZE = 2 // 针对的是用户自定义的render函数

// 在initRender方法中，会往外保留两个函数vm._c和vm.$createElement
// 分别用于内部创建元素以及用户自定义的render函数
// 其中_c的最后一个参数（即alwaysNormalize）固定为false，$createElement则固定为true

// wrapper function for providing a more flexible interface
// without getting yelled at by flow
// 该函数是对_createElement的包装，主要是做了一些参数的规范化
export function createElement (
  context: Component, // 在对外提供时，会绑定上下文
  tag: any, // 创建的节点名，可以是标签、组件或者一个resolve了标签或组件的async函数
  data: any, // 与模板中attribute对应的数据对象，是可选的
  children: any, // 子级的VNodes,也是由createELement创建的，也可以是单纯的字符串代表文本节点
  normalizationType: any, // 子节点规范化的类型
  alwaysNormalize: boolean // 是否为ALWAYS_NORMALIZE规范化类型，这个参数在用户手写的render中设置为true，在内部的编译生成的render中设置为false
): VNode | Array<VNode> {
  // 参数重载
  // data是可选的，当data传的是数组或者普通类型时，将其当作子元素来处理(比如插槽和文本)
  if (Array.isArray(data) || isPrimitive(data)) { 
    normalizationType = children
    children = data
    data = undefined
  }
  if (isTrue(alwaysNormalize)) {
    normalizationType = ALWAYS_NORMALIZE
  }
  return _createElement(context, tag, data, children, normalizationType)
}

// 核心的创建元素的函数
export function _createElement (
  context: Component,
  tag?: string | Class<Component> | Function | Object,
  data?: VNodeData,
  children?: any,
  normalizationType?: number
): VNode | Array<VNode> {
  if (isDef(data) && isDef((data: any).__ob__)) {
    process.env.NODE_ENV !== 'production' && warn(
      `Avoid using observed data object as vnode data: ${JSON.stringify(data)}\n` +
      'Always create fresh vnode data objects in each render!',
      context
    )
    return createEmptyVNode()
  }
  // object syntax in v-bind
  // 针对有is属性的组件处理，如tr标签的is属性等
  if (isDef(data) && isDef(data.is)) {
    tag = data.is
  }
  if (!tag) { // 空白的tag，创建并返回空节点
    // in case of component :is set to falsy value
    return createEmptyVNode()
  }
  // warn against non-primitive key
  if (process.env.NODE_ENV !== 'production' &&
    isDef(data) && isDef(data.key) && !isPrimitive(data.key)
  ) {
    if (!__WEEX__ || !('@binding' in data.key)) {
      warn(
        'Avoid using non-primitive value as key, ' +
        'use string/number value instead.',
        context
      )
    }
  }
  // support single function children as default scoped slot
  // 子节点数组中第一个元素为函数时，将其当作默认的插槽，并清空子节点列表
  // @suspense
  if (Array.isArray(children) &&
    typeof children[0] === 'function'
  ) {
    data = data || {}
    data.scopedSlots = { default: children[0] }
    children.length = 0
  }
  if (normalizationType === ALWAYS_NORMALIZE) { // 用户自定义的render中的，children规范化
    children = normalizeChildren(children)
  } else if (normalizationType === SIMPLE_NORMALIZE) { // 编译生成的render中的children规范化
    children = simpleNormalizeChildren(children)
  }
  let vnode, ns
  if (typeof tag === 'string') { // tag是字符串
    let Ctor
    ns = (context.$vnode && context.$vnode.ns) || config.getTagNamespace(tag)
    if (config.isReservedTag(tag)) { // 原生HTML标签
      // platform built-in elements
      vnode = new VNode(
        config.parsePlatformTagName(tag), data, children,
        undefined, undefined, context
      )
    } else if ((!data || !data.pre) && isDef(Ctor = resolveAsset(context.$options, 'components', tag))) { // 组件
      // 已经注册了的组件，则创建组件VNode
      // component
      vnode = createComponent(Ctor, data, context, children, tag)
    } else {
      // unknown or unlisted namespaced elements
      // check at runtime because it may get assigned a namespace when its
      // parent normalizes children
      // 未知的或者未列出命名空间的元素
      // 在runtime时对其进行检查，因为父级规范化子级时可能会为其分配命名空间
      vnode = new VNode(
        tag, data, children,
        undefined, undefined, context
      )
    }
  } else { // 组件构造器或者组件选项
    // direct component options / constructor
    vnode = createComponent(tag, data, context, children)
  }
  // 返回生成的vnode
  if (Array.isArray(vnode)) {
    return vnode
  } else if (isDef(vnode)) {
    if (isDef(ns)) applyNS(vnode, ns)
    if (isDef(data)) registerDeepBindings(data)
    return vnode
  } else {
    return createEmptyVNode()
  }
}

function applyNS (vnode, ns, force) {
  vnode.ns = ns
  if (vnode.tag === 'foreignObject') {
    // use default namespace inside foreignObject
    ns = undefined
    force = true
  }
  if (isDef(vnode.children)) {
    for (let i = 0, l = vnode.children.length; i < l; i++) {
      const child = vnode.children[i]
      if (isDef(child.tag) && (
        isUndef(child.ns) || (isTrue(force) && child.tag !== 'svg'))) {
        applyNS(child, ns, force)
      }
    }
  }
}

// ref #5318
// necessary to ensure parent re-render when deep bindings like :style and
// :class are used on slot nodes
// 解决了style和class等深度绑定的属性不触发更新的问题
// <transition><div :style="obj"></div></transtion>
// this.obj.color  = 'red'
function registerDeepBindings (data) {
  if (isObject(data.style)) {
    traverse(data.style)
  }
  if (isObject(data.class)) {
    traverse(data.class)
  }
}
