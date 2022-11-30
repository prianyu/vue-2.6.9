/* @flow */

import config from '../config'
import Watcher from '../observer/watcher'
import { mark, measure } from '../util/perf'
import { createEmptyVNode } from '../vdom/vnode'
import { updateComponentListeners } from './events'
import { resolveSlots } from './render-helpers/resolve-slots'
import { toggleObserving } from '../observer/index'
import { pushTarget, popTarget } from '../observer/dep'

import {
  warn,
  noop,
  remove,
  emptyObject,
  validateProp,
  invokeWithErrorHandling
} from '../util/index'

// 整个初始化是一个深度遍历的过程。在实例化子组件的时候，它需要知道当前上下文的Vue实例是什么，并把它作为子组件的父Vue实例
// 在调用_update的过程中，调用__patch__前会将将activeInstance先保存在prevActiveInstance中，并将当前实例vm赋给activeInstance
// 执行完__patch__后再恢复activeInstance为prevActiveInstance
// 当一个vm实例完成了它的所有的子树的patch或者update过程后，activeInstance会回到它的父实例，这样就保证了深度遍历过程中，
// 在实例化子组件时能传入当前子组件的父Vue实例
export let activeInstance: any = null // 激活的实例
export let isUpdatingChildComponent: boolean = false


// 切换当前激活的实例
export function setActiveInstance(vm: Component) {
  const prevActiveInstance = activeInstance // 缓存上一个activeInstance
  activeInstance = vm // 当前激活的实例
  // 返回一个恢复上一个激活实例的函数
  return () => {
    activeInstance = prevActiveInstance
  }
}

// 与实例生命周期相关的属性和方法初始化
export function initLifecycle (vm: Component) {
  const options = vm.$options

  // locate first non-abstract parent
  // 绑定父子关系，只有非抽象的组件才会被作为父级组件
  let parent = options.parent
  if (parent && !options.abstract) { // 组件自身也不是抽象的
    while (parent.$options.abstract && parent.$parent) {
      parent = parent.$parent
    }
    parent.$children.push(vm)
  }

  vm.$parent = parent
  vm.$root = parent ? parent.$root : vm // 记录根实例

  vm.$children = [] // 用于存放子组件
  vm.$refs = {} // $refs

  vm._watcher = null // 渲染watcher
  vm._inactive = null // 组件是否已失活
  vm._directInactive = false
  vm._isMounted = false // 是否已挂载
  vm._isDestroyed = false // 是否已销毁
  vm._isBeingDestroyed = false // 标记组件是否出于正在销毁的阶段
}

// 添加_update方法
export function lifecycleMixin (Vue: Class<Component>) {
  Vue.prototype._update = function (vnode: VNode, hydrating?: boolean) {
    const vm: Component = this
    const prevEl = vm.$el // 页面的挂载点，是一个真实的DOM
    const prevVnode = vm._vnode // 老的VNode
    const restoreActiveInstance = setActiveInstance(vm) //切换当前激活的实例
    vm._vnode = vnode // 由render函数生成的准备更新渲染的新的VNode
    // Vue.prototype.__patch__ is injected in entry points
    // based on the rendering backend used.
    if (!prevVnode) {// 初次渲染节点，对比$el与vnode
      // initial render
      // hydrating:false表示非服务端渲染, removeOnly是给transition-group用的
      // 此处会对$el重新赋值，也就是对$el会有一次替换的过程
      vm.$el = vm.__patch__(vm.$el, vnode, hydrating, false /* removeOnly */)
    } else { // 更新节点，则比对前后两次虚拟节点
      // updates
      vm.$el = vm.__patch__(prevVnode, vnode)
    }

    restoreActiveInstance() //  __patch__完成后恢复到上一次激活的实例（父实例）

    // update __vue__ reference
    if (prevEl) { // 移除旧元素的__vue__引用
      prevEl.__vue__ = null
    }
    if (vm.$el) { // 最新的__vue__引用
      vm.$el.__vue__ = vm
    }
    // if parent is an HOC, update its $el as well
    // 父节点是个高阶组件，则更新其元素节点
    //  @suspense
    if (vm.$vnode && vm.$parent && vm.$vnode === vm.$parent._vnode) {
      vm.$parent.$el = vm.$el
    }
    // 更新的钩子由调度器来调用，确保在父更新的钩子中更新子项
    // updated hook is called by the scheduler to ensure that children are
    // updated in a parent's updated hook.
  }
  // 强制更新组件，调用渲染watcher上的update方法
  Vue.prototype.$forceUpdate = function () {
    const vm: Component = this
    if (vm._watcher) {
      vm._watcher.update()
    }
  }
  // 组件销毁
  Vue.prototype.$destroy = function () {
    const vm: Component = this
    if (vm._isBeingDestroyed) { // 正在销毁的过程中
      return
    }
    callHook(vm, 'beforeDestroy') // 销毁前执行beforeDestroy的钩子
    vm._isBeingDestroyed = true // 标记为正在销毁的状态
    // remove self from parent
    const parent = vm.$parent 
    // 从父组件中移除当前组件
    if (parent && !parent._isBeingDestroyed && !vm.$options.abstract) {
      remove(parent.$children, vm)
    }
    // 将渲染wacher卸载
    if (vm._watcher) {
      vm._watcher.teardown()
    }
    //卸载所有的其他的观察者
    let i = vm._watchers.length
    while (i--) {
      vm._watchers[i].teardown()
    }
    // remove reference from data ob
    // frozen object may not have observer.
    // 删除对于data的引用计数
    if (vm._data.__ob__) {
      vm._data.__ob__.vmCount--
    }
    // call the last hook...
    // 标记为已经销毁的状态
    vm._isDestroyed = true
    // invoke destroy hooks on current rendered tree
    // 在当前呈现的树上调用destroy钩子
    vm.__patch__(vm._vnode, null)
    // 执行销毁完成的钩子
    callHook(vm, 'destroyed')
    // turn off all instance listeners.
    // 移除所有的事件绑定
    vm.$off()
    // remove __vue__ reference
    // 将真实DOM的引用切断
    if (vm.$el) {
      vm.$el.__vue__ = null
    }
    // release circular reference (#6759)
    // 释放循环应用的parent
    if (vm.$vnode) {
      vm.$vnode.parent = null
    }
  }
}


// 组件挂载函数 
export function mountComponent (
  vm: Component,
  el: ?Element,
  hydrating?: boolean
): Component {
  // 将el赋值给vm.$el，此时的el已经是一个DOM元素      
  vm.$el = el
  // 没有render函数会将render函数重置为创建空节点的函数
  // 同时如果有el和template的话，说明el或者template没有被转化为render函数，
  // 说明使用的是runtime-only版本
  if (!vm.$options.render) {
    vm.$options.render = createEmptyVNode
    if (process.env.NODE_ENV !== 'production') {
      /* istanbul ignore if */
      if ((vm.$options.template && vm.$options.template.charAt(0) !== '#') ||
        vm.$options.el || el) {
        warn(
          'You are using the runtime-only build of Vue where the template ' +
          'compiler is not available. Either pre-compile the templates into ' +
          'render functions, or use the compiler-included build.',
          vm
        )
      } else {
        warn(
          'Failed to mount component: template or render function not defined.',
          vm
        )
      }
    }
  }
  // 执行挂载前的生命周期钩子
  callHook(vm, 'beforeMount')

  let updateComponent // 用于更新虚拟DOM并生成真实Dom的函数
  /* istanbul ignore if */
  if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
    updateComponent = () => {
      const name = vm._name
      const id = vm._uid
      const startTag = `vue-perf-start:${id}`
      const endTag = `vue-perf-end:${id}`

      mark(startTag)
      const vnode = vm._render()
      mark(endTag)
      measure(`vue ${name} render`, startTag, endTag)

      mark(startTag)
      vm._update(vnode, hydrating)
      mark(endTag)
      measure(`vue ${name} patch`, startTag, endTag)
    }
  } else {
    updateComponent = () => {
      vm._update(vm._render(), hydrating) // _render生成虚拟DOM，_update生成真实DOM
    }
  }

  // we set this to vm._watcher inside the watcher's constructor
  // since the watcher's initial patch may call $forceUpdate (e.g. inside child
  // component's mounted hook), which relies on vm._watcher being already defined
  // 定义渲染Watcher：vm._watcher，调用$forceUpdate时会依赖渲染watcher
  // 渲染watcher实例化化会执行watcher.get方法，进而执行updateComponent,完成首次渲染
  // 首次渲染会触发依赖的数据的getter函数，进而实现依赖收集
  // 后续的数据更新则会通知渲染watcher更新，实现视图的更新
  new Watcher(vm, updateComponent, noop, {
    before () {
      // 更新前，判断是否已经挂载过，如果挂载过了就执行beforeUpate钩子
      if (vm._isMounted && !vm._isDestroyed) {
        callHook(vm, 'beforeUpdate')
      }
    }
  }, true /* isRenderWatcher */)
  hydrating = false
 
  // manually mounted instance, call mounted on self
  // mounted is called for render-created child components in its inserted hook
  // 将实例标记为已挂载状态，执行挂载完成钩子
  if (vm.$vnode == null) { // 说明是首次挂载
    vm._isMounted = true
    callHook(vm, 'mounted')
  }
  return vm
}

// 更新子组件
export function updateChildComponent (
  vm: Component,
  propsData: ?Object, // 新的父组件传递给子组件的props
  listeners: ?Object, // 新的父组件传递给子组件的事件
  parentVnode: MountedComponentVNode,  // 新的父vnode节点
  renderChildren: ?Array<VNode> // 新的渲染子元素
) {
  if (process.env.NODE_ENV !== 'production') {
    isUpdatingChildComponent = true // 标记为正在更新子组件，用于判断props不能被直接修改的提醒
  }

  // determine whether component has slot children
  // we need to do this before overwriting $options._renderChildren.

  // check if there are dynamic scopedSlots (hand-written or compiled but with
  // dynamic slot names). Static scoped slots compiled from template has the
  // "$stable" marker.
  const newScopedSlots = parentVnode.data.scopedSlots // 新的作用域插槽
  const oldScopedSlots = vm.$scopedSlots // 旧的作用域插槽
  // 是否有动态的作用域插槽
  const hasDynamicScopedSlot = !!(
    (newScopedSlots && !newScopedSlots.$stable) ||
    (oldScopedSlots !== emptyObject && !oldScopedSlots.$stable) ||
    (newScopedSlots && vm.$scopedSlots.$key !== newScopedSlots.$key)
  )

  // Any static slot children from the parent may have changed during parent's
  // update. Dynamic scoped slots may also have changed. In such cases, a forced
  // update is necessary to ensure correctness.
  // 标记是否需要强制更新
  const needsForceUpdate = !!(
    renderChildren ||               // has new static slots
    vm.$options._renderChildren ||  // has old static slots
    hasDynamicScopedSlot
  )

  // 更新父vnode
  vm.$options._parentVnode = parentVnode 
  vm.$vnode = parentVnode // update vm's placeholder node without re-render

  // 有旧的渲染节点，更新其父节点的引用
  if (vm._vnode) { // update child tree's parent
    vm._vnode.parent = parentVnode
  }
  // 更新渲染的子元素
  vm.$options._renderChildren = renderChildren

  // update $attrs and $listeners hash
  // these are also reactive so they may trigger child update if the child
  // used them during render
  // 更新$attrs和$listeners
  vm.$attrs = parentVnode.data.attrs || emptyObject
  vm.$listeners = listeners || emptyObject

  // update props
  // 重新验和计算新的props
  if (propsData && vm.$options.props) {
    toggleObserving(false)
    const props = vm._props
    const propKeys = vm.$options._propKeys || []
    for (let i = 0; i < propKeys.length; i++) {
      const key = propKeys[i]
      const propOptions: any = vm.$options.props // wtf flow?
      props[key] = validateProp(key, propOptions, propsData, vm)
    }
    toggleObserving(true)
    // keep a copy of raw propsData
    vm.$options.propsData = propsData
  }

  // update listeners
  // 更新事件
  listeners = listeners || emptyObject
  const oldListeners = vm.$options._parentListeners
  vm.$options._parentListeners = listeners
  updateComponentListeners(vm, listeners, oldListeners)

  // resolve slots + force update if has children
  // 强制更新
  if (needsForceUpdate) {
    vm.$slots = resolveSlots(renderChildren, parentVnode.context)
    vm.$forceUpdate()
  }

  if (process.env.NODE_ENV !== 'production') {
    isUpdatingChildComponent = false
  }
}

// 判断实例是否处于已经失活的实例树里面
function isInInactiveTree (vm) {
  // 递归查找祖先实例是否已经失活
  while (vm && (vm = vm.$parent)) {
    if (vm._inactive) return true
  }
  return false
}

// 激活组件keep-alive包裹的子组件
export function activateChildComponent (vm: Component, direct?: boolean) {
  if (direct) {
    vm._directInactive = false
    // 在失活的节点树上， 不处理
    if (isInInactiveTree(vm)) {
      return
    }
  } else if (vm._directInactive) {
    return
  }
  // 失活了或者还未设置_inactive
  // _inactive初始化时是null
  if (vm._inactive || vm._inactive === null) {
    vm._inactive = false // 标记_inactive为false
    // 递归激活子元素，此时的direct参数是undefined
    for (let i = 0; i < vm.$children.length; i++) {
      activateChildComponent(vm.$children[i])
    }
    // 执行activated钩子
    callHook(vm, 'activated')
  }
}

// 失活组件
export function deactivateChildComponent (vm: Component, direct?: boolean) {
  if (direct) {
    vm._directInactive = true
    if (isInInactiveTree(vm)) {
      return
    }
  }
  if (!vm._inactive) { // 已经是激活的状态
    vm._inactive = true // 标记为失活状态
    // 递归失活子组件
    for (let i = 0; i < vm.$children.length; i++) {
      deactivateChildComponent(vm.$children[i])
    }
    // 执行deactivated钩子
    callHook(vm, 'deactivated')
  }
}

// 执行钩子的函数
export function callHook (vm: Component, hook: string) {
  // #7573 disable dep collection when invoking lifecycle hooks
  // Dep.target置空处理，该bug的解析见 ./state.js中getData函数的解析
  pushTarget()
  // 获取相应要执行的钩子
  const handlers = vm.$options[hook]
  const info = `${hook} hook`
  // 遍历并执行钩子
  if (handlers) { 
    for (let i = 0, j = handlers.length; i < j; i++) {
      invokeWithErrorHandling(handlers[i], vm, null, vm, info)
    }
  }
  // 如果有hook:event事件回调，则执行对应的hook事件回调
  // 如<modal @hook:mouted="handleMounted" />
  if (vm._hasHookEvent) {
    vm.$emit('hook:' + hook)
  }
  // 恢复Dep.target
  popTarget()
}
