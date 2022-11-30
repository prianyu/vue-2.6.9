/* @flow */

import {
  warn,
  nextTick,
  emptyObject,
  handleError,
  defineReactive
} from '../util/index'

import { createElement } from '../vdom/create-element'
import { installRenderHelpers } from './render-helpers/index'
import { resolveSlots } from './render-helpers/resolve-slots'
import { normalizeScopedSlots } from '../vdom/helpers/normalize-scoped-slots'
import VNode, { createEmptyVNode } from '../vdom/vnode'

import { isUpdatingChildComponent } from './lifecycle'

// 初始化与render相关的一些属性和方法
export function initRender (vm: Component) {
  vm._vnode = null // 子树的根节点
  vm._staticTrees = null // v-once cached trees v-once标记的组件渲染后的静态的树
  const options = vm.$options
  // 在父元素中的占位符
  // 解析到子组件时，会创建一个占位的父vnode
  // 这个vnode保存着各种组件的信息，如渲染上下文，children，Ctor，data等
  const parentVnode = vm.$vnode = options._parentVnode 
  const renderContext = parentVnode && parentVnode.context // 渲染上下文
 // 插槽处理，解析组件中插槽的内容

  // 非作用域插槽的内容处理
  // _renderChildren为组件内子节点组成的VNode数组，这个处理主要做几件事：
  // 1. 删除VNode上的data.attrs.slot属性
  // 2. 对VNode按照是否命名做了分组处理
  // 3. 对每一个分组，如果只包含空白的VNode节点，则删除该分支
  // 4. 最终会返回一个分组后的插槽对象，如{default: [VNode, VNode], footer: [VNode, VNode], header: [VNode]}
  vm.$slots = resolveSlots(options._renderChildren, renderContext) 
  // 作用域插槽，初始化为空对象
  vm.$scopedSlots = emptyObject 



  // bind the createElement fn to this instance
  // so that we get proper render context inside it.
  // args order: tag, data, children, normalizationType, alwaysNormalize
  // internal version is used by render functions compiled from templates
  // 将createElement绑定到当前实例，这样在渲染时就可以获得正确的渲染上下文，这个函数给内部模板编译时使用
  vm._c = (a, b, c, d) => createElement(vm, a, b, c, d, false)
  // normalization is always applied for the public version, used in
  // user-written render functions.
  // 这个函数提供给用户自定义的render函数
  vm.$createElement = (a, b, c, d) => createElement(vm, a, b, c, d, true)

  // $attrs & $listeners are exposed for easier HOC creation.
  // they need to be reactive so that HOCs using them are always updated
  // 响应式的$attrs和$listeners属性
  const parentData = parentVnode && parentVnode.data

  // 从占位组件提取传进来的attrs和listeners
  /* istanbul ignore else */
  // obj,key,val,customSetter,shallow
  if (process.env.NODE_ENV !== 'production') {
    defineReactive(vm, '$attrs', parentData && parentData.attrs || emptyObject, () => {
      !isUpdatingChildComponent && warn(`$attrs is readonly.`, vm)
    }, true)
    defineReactive(vm, '$listeners', options._parentListeners || emptyObject, () => {
      !isUpdatingChildComponent && warn(`$listeners is readonly.`, vm)
    }, true)
  } else {
    defineReactive(vm, '$attrs', parentData && parentData.attrs || emptyObject, null, true)
    defineReactive(vm, '$listeners', options._parentListeners || emptyObject, null, true)
  }
}

export let currentRenderingInstance: Component | null = null // 当前渲染的实例

// for testing only
export function setCurrentRenderingInstance (vm: Component) {
  currentRenderingInstance = vm
}

export function renderMixin (Vue: Class<Component>) {
  // install runtime convenience helpers
  installRenderHelpers(Vue.prototype)

  Vue.prototype.$nextTick = function (fn: Function) {
    return nextTick(fn, this)
  }
  // 需要区分vnode和$vnode的区别和联系
  // $vnode是组件占位符，vnode是其真实渲染的DOM元素的虚拟节点，执行render函数生成
  // vnode.parent === vm.$vnode === vm.$options._parentVnode
  // 以组件<custom>为例，$vnode则是custom本身，其最终可能为{tag: "vue-component-1-cutrom", ...}
  // vnode则为custom组件内容根节点对应的vnode
  Vue.prototype._render = function (): VNode {
    const vm: Component = this
    // render函数和外层的占位节点
    const { render, _parentVnode } = vm.$options

    // 规范化插槽
    // _parentVnode不为空，说明是子组件（使用VueComponent创建过来的）
    // 对其插槽做规范化处理
    // 走到这里，vm.$slots在initRender的时候已经做了分组处理，
    // 而vm.$scopedSlots初始化时为空对象，后续则作为上一次的执行结果
    // _parentVnode.data.scopedSlots则也是已经分组的作用域插槽节点的集合(函数)
    // 处理完成后$slots和$scopedSlots都包含了所有的插槽，其中$scopedSlots是以函数的形式存储的插槽
    if (_parentVnode) {
      vm.$scopedSlots = normalizeScopedSlots(
        _parentVnode.data.scopedSlots,
        vm.$slots,
        vm.$scopedSlots // 上一次的$scopedSlots，初始化为空对象                                              
      )
    }

    // set parent vnode. this allows render functions to have access
    // to the data on the placeholder node.
    //提供了一个让render函数访问占位节点的上下文环境
    vm.$vnode = _parentVnode
    // render self
    let vnode
    try {
      // There's no need to maintain a stack becaues all render fns are called
      // separately from one another. Nested component's render fns are called
      // when parent component is patched.
      // 所有的render函数都是单独调用的，
      // 而所有的嵌套组件的render都会在父组件patch时执行
      // 因此无需维护一个栈
      currentRenderingInstance = vm // 标记当前正在渲染的组件实例
      // 调用render函数，接收的参数为vm.$createElement函数
      // vm._renderProxy一般就是vm
      vnode = render.call(vm._renderProxy, vm.$createElement)
    } catch (e) {
      handleError(e, vm, `render`)
      // return error render result,
      // or previous vnode to prevent render error causing blank component
      /* istanbul ignore else */
      if (process.env.NODE_ENV !== 'production' && vm.$options.renderError) {
        try {
          vnode = vm.$options.renderError.call(vm._renderProxy, vm.$createElement, e)
        } catch (e) {
          handleError(e, vm, `renderError`)
          vnode = vm._vnode
        }
      } else {
        vnode = vm._vnode
      }
    } finally {
      currentRenderingInstance = null
    }
    // if the returned array contains only a single node, allow it
    // 仅允许返回一个节点
    if (Array.isArray(vnode) && vnode.length === 1) {
      vnode = vnode[0]
    }
    // return empty vnode in case the render function errored out
    // 多个根节点
    if (!(vnode instanceof VNode)) {
      if (process.env.NODE_ENV !== 'production' && Array.isArray(vnode)) {
        warn(
          'Multiple root nodes returned from render function. Render function ' +
          'should return a single root node.',
          vm
        )
      }
      vnode = createEmptyVNode()
    }
    // set parent
    // 绑定父子关系vnode.parent = vm.$vnode
    // vm._vnode = vnode
    vnode.parent = _parentVnode
    return vnode
  }
}
