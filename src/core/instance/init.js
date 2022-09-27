/* @flow */

import config from '../config'
import { initProxy } from './proxy'
import { initState } from './state'
import { initRender } from './render'
import { initEvents } from './events'
import { mark, measure } from '../util/perf'
import { initLifecycle, callHook } from './lifecycle'
import { initProvide, initInjections } from './inject'
import { extend, mergeOptions, formatComponentName } from '../util/index'

let uid = 0

export function initMixin (Vue: Class<Component>) {
  Vue.prototype._init = function (options?: Object) {
    const vm: Component = this
    // 每个Vue实例都会有一个uid， 由0开始自增
    vm._uid = uid++

    let startTag, endTag
    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      startTag = `vue-perf-start:${vm._uid}`
      endTag = `vue-perf-end:${vm._uid}`
      mark(startTag)
    }

    // 标记为Vue组件，标记后不会被观察
    vm._isVue = true
    // 选项规范化和选项合并
    if (options && options._isComponent) { // 子组件选项合并
      // optimize internal component instantiation
      // since dynamic options merging is pretty slow, and none of the
      // internal component options needs special treatment.
      // 选项合并是比较耗时的，所以对于内部的创建的组件，做了特别的合并处理
      // 这样可以提高选项合并的性能
      initInternalComponent(vm, options)
    } else { // 非子组件选项合并
      // 将构造函数上的选项、传入的选项进行合并
      // 构造函数可以是Vue，也可以是使用Vue.extend继承生成的构造函数
      vm.$options = mergeOptions(
        resolveConstructorOptions(vm.constructor),
        options || {},
        vm
      )
    }
    /* istanbul ignore else */
    if (process.env.NODE_ENV !== 'production') {
      initProxy(vm)
    } else {
      vm._renderProxy = vm
    }
    // expose real self
    vm._self = vm
    //初始化$parent和$children并绑定父子关系，初始化$refs,$root,_watcher,_inactive,_isMounted,_isDestroyed,_isBeingDestroyed,_directInactive等属性
    initLifecycle(vm)
    //初始化_events,_hasHookEvent等属性，更新$options._parentListeners
    initEvents(vm)
    // 初始化_vnode,$vnode,$slots,$scopeSlots,$createElement,_c以及响应式的$listeners,$attrs等属性
    initRender(vm)
    // 执行beforeCreate钩子
    callHook(vm, 'beforeCreate') 
    // 在data和props前处理inject，会逐级遍历父元素获取对应inject并注入，inject是响应式的，但是不可被修改
    initInjections(vm) // resolve injections before data/props
    // 依次处理props、methods、data、computed、watch
    initState(vm)
    // 处理provide，可以为函数，可以为对象
    initProvide(vm) // resolve provide after data/props
    callHook(vm, 'created')

    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      vm._name = formatComponentName(vm, false)
      mark(endTag)
      measure(`vue ${vm._name} init`, startTag, endTag)
    }

    if (vm.$options.el) {
      vm.$mount(vm.$options.el)
    }
  }
}

export function initInternalComponent (vm: Component, options: InternalComponentOptions) {
  // 改变$options的原型指向
  const opts = vm.$options = Object.create(vm.constructor.options)
  // doing this because it's faster than dynamic enumeration.
  // 同步原型的属性，提高查找速度
  const parentVnode = options._parentVnode
  opts.parent = options.parent
  opts._parentVnode = parentVnode

  const vnodeComponentOptions = parentVnode.componentOptions
  opts.propsData = vnodeComponentOptions.propsData
  opts._parentListeners = vnodeComponentOptions.listeners
  opts._renderChildren = vnodeComponentOptions.children
  opts._componentTag = vnodeComponentOptions.tag

  if (options.render) {
    opts.render = options.render
    opts.staticRenderFns = options.staticRenderFns
  }
}

export function resolveConstructorOptions (Ctor: Class<Component>) {
  let options = Ctor.options // 选项引用
  if (Ctor.super) {
    // 递归合并
    const superOptions = resolveConstructorOptions(Ctor.super)
    const cachedSuperOptions = Ctor.superOptions // 获取缓存的基类构造器选项
    if (superOptions !== cachedSuperOptions) {
      // 说明父类的options改变了，此时需要重新处理
      // super option changed,
      // need to resolve new options.
      Ctor.superOptions = superOptions // 将新的基类options重新赋值给superOptions
      // check if there are any late-modified/attached options (#4976)
      // 获取修改或者新增的属性集合
      const modifiedOptions = resolveModifiedOptions(Ctor)
      // update base extend options
      // 将得到的属性集合扩展至extendOptions的引用
      if (modifiedOptions) {
        extend(Ctor.extendOptions, modifiedOptions)
      }
      // 合并得到新的options
      options = Ctor.options = mergeOptions(superOptions, Ctor.extendOptions)
      if (options.name) { // 如果有name属性，增加自查找属性
        options.components[options.name] = Ctor
      }
    }
  }
  return options
}

// 用于获取构造器选项修改
function resolveModifiedOptions (Ctor: Class<Component>): ?Object {
  let modified
  const latest = Ctor.options // 获取现在的构造器选项
  const sealed = Ctor.sealedOptions // 获取创建子类构造器那一刻的构造器选项
  // 遍历新的现在的构造器选项
  // 如果在定义时的封装选项里找不到，则说明是新增或者改变过的属性，将其压入modified
  for (const key in latest) {
    if (latest[key] !== sealed[key]) {
      if (!modified) modified = {}
      modified[key] = latest[key]
    }
  }
  // 返回所有改边的属性集合
  return modified
}
