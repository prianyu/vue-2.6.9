/* @flow */

import VNode, { cloneVNode } from './vnode'
import { createElement } from './create-element'
import { resolveInject } from '../instance/inject'
import { normalizeChildren } from '../vdom/helpers/normalize-children'
import { resolveSlots } from '../instance/render-helpers/resolve-slots'
import { normalizeScopedSlots } from '../vdom/helpers/normalize-scoped-slots'
import { installRenderHelpers } from '../instance/render-helpers/index'

import {
  isDef,
  isTrue,
  hasOwn,
  camelize,
  emptyObject,
  validateProp
} from '../util/index'

export function FunctionalRenderContext (
  data: VNodeData,
  props: Object,
  children: ?Array<VNode>,
  parent: Component, // 上下文
  Ctor: Class<Component>
) {
  const options = Ctor.options
  // ensure the createElement function in functional components
  // gets a unique context - this is necessary for correct named slot check
  // 确保createElement可以获得一个唯一的上下文，对于命名插槽等需要依赖这个上下文
  let contextVm
  // _uid是创建实例时调用_init方法添加的，函数式组件是不会调用_init方法的
  // 有_uid属性说明parent不是一个函数式组件实例
  if (hasOwn(parent, '_uid')) {
    // 以parent作为原型创建一个上下文，并引用parent
    contextVm = Object.create(parent)
    // $flow-disable-line
    contextVm._original = parent
  } else {
    // 说明parent本身也是一个函数式组件
    // 这种情况下，我们希望确保能够保持一个真实的上下文实例
    // the context vm passed in is a functional context as well.
    // in this case we want to make sure we are able to get a hold to the
    // real context instance.
    contextVm = parent
    // $flow-disable-line
    parent = parent._original
  }
  const isCompiled = isTrue(options._compiled) // 标记是否编译
  const needNormalization = !isCompiled // 是否需要规范化

  // 上下文里包含data,props,children,parent,listeners,injections,$slots,$scopedSlots,$options
  this.data = data // 传递给组件的整个数据对象，作为 createElement 的第二个参数传入组件
  this.props = props // 供所有 prop 的对象
  this.children = children // VNode 子节点的数组
  this.parent = parent // 对父组件的引用
  this.listeners = data.on || emptyObject // 父组件注册的所有事件监听，为data.on的别名
  this.injections = resolveInject(options.inject, parent) //  如果使用了 inject 选项，则该对象包含了应当被注入的 property
  // @suspense
  // 用于获取$slots的函数，返回结果为一个包含了所有插槽的对象
  this.slots = () => {
    if (!this.$slots) {
      // 规范化$slots
      normalizeScopedSlots(
        data.scopedSlots,
        this.$slots = resolveSlots(children, parent) // 将children解析为slots
      )
    }
    return this.$slots
  }


  //  返回一个暴露传入的作用域插槽的对象。也以函数形式暴露普通插槽
  Object.defineProperty(this, 'scopedSlots', ({
    enumerable: true,
    get () {
      return normalizeScopedSlots(data.scopedSlots, this.slots())
    }
  }: any))

  // support for compiled functional template
  if (isCompiled) {
    // exposing $options for renderStatic()
    this.$options = options
    // pre-resolve slots for renderSlot()
    this.$slots = this.slots()
    this.$scopedSlots = normalizeScopedSlots(data.scopedSlots, this.$slots) //
  }

  if (options._scopeId) {
    this._c = (a, b, c, d) => {
      const vnode = createElement(contextVm, a, b, c, d, needNormalization)
      if (vnode && !Array.isArray(vnode)) {
        vnode.fnScopeId = options._scopeId
        vnode.fnContext = parent
      }
      return vnode
    }
  } else {
    this._c = (a, b, c, d) => createElement(contextVm, a, b, c, d, needNormalization)
  }
}

// 安装各种内部方法，如_e, _v, ...
installRenderHelpers(FunctionalRenderContext.prototype)

// 创建函数式组件
// 1. 设置props
// 2. 设置渲染上下文，传递给render函数
// 3. 执行render函数生成VNode
export function createFunctionalComponent (
  Ctor: Class<Component>, // 构造函数
  propsData: ?Object, // props数据
  data: VNodeData, // data
  contextVm: Component, // 上下文
  children: ?Array<VNode> // 子节点
): VNode | Array<VNode> | void {
  const options = Ctor.options
  const props = {}
  const propOptions = options.props
  if (isDef(propOptions)) { // 从propsData中获取props对应的值
    for (const key in propOptions) {
      props[key] = validateProp(key, propOptions, propsData || emptyObject)
    }
  } else {
    if (isDef(data.attrs)) mergeProps(props, data.attrs) // 将data.attrs合并至props
    if (isDef(data.props)) mergeProps(props, data.props) // 将data.props合并至props，即data.props会覆盖data.attrs
  }

  // 创建函数式组件的渲染上下文
  const renderContext = new FunctionalRenderContext(
    data,
    props,
    children,
    contextVm,
    Ctor
  )

  // 创建vnode
  // 函数式组件的render函数的this为null，其createElement为渲染上线文的_c函数，第二个参数为渲染上下文本身
  const vnode = options.render.call(null, renderContext._c, renderContext)

  // 在生成的VNode对象上添加一些标记，表示该VNode是一个函数式组件生成的，最后返回VNode
  if (vnode instanceof VNode) {
    return cloneAndMarkFunctionalResult(vnode, data, renderContext.parent, options, renderContext)
  } else if (Array.isArray(vnode)) {
    const vnodes = normalizeChildren(vnode) || []
    const res = new Array(vnodes.length)
    for (let i = 0; i < vnodes.length; i++) {
      res[i] = cloneAndMarkFunctionalResult(vnodes[i], data, renderContext.parent, options, renderContext)
    }
    return res
  }
}

function cloneAndMarkFunctionalResult (vnode, data, contextVm, options, renderContext) {
  // #7817 clone node before setting fnContext, otherwise if the node is reused
  // (e.g. it was from a cached normal slot) the fnContext causes named slots
  // that should not be matched to match.
  const clone = cloneVNode(vnode)
  clone.fnContext = contextVm
  clone.fnOptions = options
  if (process.env.NODE_ENV !== 'production') {
    (clone.devtoolsMeta = clone.devtoolsMeta || {}).renderContext = renderContext
  }
  if (data.slot) {
    (clone.data || (clone.data = {})).slot = data.slot
  }
  return clone
}

// 合并props，所有的key会转为驼峰命名
function mergeProps (to, from) {
  for (const key in from) {
    to[camelize(key)] = from[key]
  }
}
