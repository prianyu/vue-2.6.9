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

// 全局自增的uid，每一个vm示例都有一个_uid属性，由uid从0开始递增得到
let uid = 0
// 在Vue原型添加_init方法，方法在组件实例化时传入实例化选项调用
// 1. 实例上增加_uid属性，该属性是一个递增自增的属性
// 2. 添加_isVue属性，标记为Vue组件，具有该标记的对象后续不会做响应式数据转换
// 3. 选项合并，子组件和非子组件使用不同的选项合并策略
// 4. 
export function initMixin (Vue: Class<Component>) {
  Vue.prototype._init = function (options?: Object) {
    const vm: Component = this
    vm._uid = uid++ // 每个Vue实例都会有一个uid， 由0开始自增

    // 实例化性能监控
    let startTag, endTag
    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      startTag = `vue-perf-start:${vm._uid}`
      endTag = `vue-perf-end:${vm._uid}`
      mark(startTag)
    }

    vm._isVue = true // 标记为Vue组件，标记后不会被观察

    /* ---选项规范化和选项合并---- */
    if (options && options._isComponent) { // 子组件选项合并
      // optimize internal component instantiation
      // since dynamic options merging is pretty slow, and none of the
      // internal component options needs special treatment.
      // _isComponent是在渲染阶段解析到子组件时内部实例化组件时添加的一个属性
      // 动态合并选项是比较耗时的，所以对于内部创建的组件，做了特别的合并处理
      // 这样可以提高选项合并的性能
      initInternalComponent(vm, options)
    } else { // 非子组件选项合并
      // 将构造函数上的选项、传入的选项进行合并
      // 构造函数可以是Vue，也可以是使用Vue.extend继承生成的构造函数
      // 选项合并后会对props，inject，directives做选项的规范化，
      // 以及对mixins，extends，components、data、methods等都做了合并
      vm.$options = mergeOptions(
         // 处理构造器选项，只有是子类构造函数，且子类或者基类构造函数选项改变了才会重新计算
         // 构造函数上的options会有内置组件（keepAlive，transition等）、指令（v-model、v-show）等
         // 不是子类则直接返回的构造函数的选项
        resolveConstructorOptions(vm.constructor),
        options || {}, // 实例化时的选项
        vm // 组件实例
      )
    }


    /* istanbul ignore else */
    // 添加render函数的作用域代理_renderProxy
    // vm._renderProxy 用于render方法的执行上下文
    // 开发环境下增强vm实例，在支持Proxy环境下，返回一个vm的代理对象
    // 使其支持属性定义的合法性($、_开头)以及未定义变量访问时的检测并给出错误提醒
    if (process.env.NODE_ENV !== 'production') {
      initProxy(vm)// initProxy最终也会在vm上增加一个_renderProxy属性
    } else {
      vm._renderProxy = vm
    }


    // expose real self
    // 暴露实例自身
    vm._self = vm
    // 初始化与声明周期相关的属性和方法
    // 绑定$parent和$children父子关系
    // 初始化$refs,$root,_watcher,_inactive,_isMounted,_isDestroyed,_isBeingDestroyed,_directInactive等属性
    initLifecycle(vm)
    //初始化_events,_hasHookEvent等属性，根据$options._parentListeners更新子组件的事件监听
    initEvents(vm)
    // 初始化_vnode,$vnode,$slots,$scopeSlots,$createElement,_c以及响应式的$listeners,$attrs等属性
    initRender(vm)
    // 执行beforeCreate钩子
    callHook(vm, 'beforeCreate') 
    // 在data和props前处理inject，会逐级遍历祖先元素的provide获取对应inject并注入，inject不是响应式的且不可被修改
    initInjections(vm) // resolve injections before data/props
    // 响应式数据初始化，依次处理props、methods、data、computed、watch
    // props代理至vm._props
    // methods绑定上下文为当前vue实例
    // 响应式数据处理，data转为setter/getter;computed转为setter/getter并添加计算属性观察者;watch做参数归一化后转为调用vm.$watch
    initState(vm)
    // 处理provide，可以为函数，可以为对象,将结果添加到vm._provided属性上
    initProvide(vm) // resolve provide after data/props
    // 组件数据初始化完毕，调用created钩子
    callHook(vm, 'created')

    /* istanbul ignore if */
    // 初始化性能指标
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      vm._name = formatComponentName(vm, false)
      mark(endTag)
      measure(`vue ${vm._name} init`, startTag, endTag)
    }
    
    // 传入了el，自动挂载
    if (vm.$options.el) {
      vm.$mount(vm.$options.el)
    }
  }
}


// 子组件选项合并
export function initInternalComponent (vm: Component, options: InternalComponentOptions) {
  // $options以构造器的options作为原型
  const opts = vm.$options = Object.create(vm.constructor.options)
  // doing this because it's faster than dynamic enumeration.
  // 同步原型的属性，提高查找速度
  const parentVnode = options._parentVnode // 与vm.$vnode是同一个引用，是子组件的占位vnode
  opts.parent = options.parent // 父组件实例引用
  opts._parentVnode = parentVnode // 占位节点的引用，当前组件实例在父组件中的VNode表示

  const vnodeComponentOptions = parentVnode.componentOptions // 创建占位vnode时保存的选项信息，如propsData,children等
  opts.propsData = vnodeComponentOptions.propsData //提取propsData，即父组件传递给子组件的props
  opts._parentListeners = vnodeComponentOptions.listeners //提取父组件传递给子组件的事件，是data.on的别名
  opts._renderChildren = vnodeComponentOptions.children // 实际要渲染的内容，是一个vnode数组，在render时由createElement创建而来
  opts._componentTag = vnodeComponentOptions.tag // 当前组件实例的标签名

  // 保存渲染函数
  if (options.render) {
    opts.render = options.render
    opts.staticRenderFns = options.staticRenderFns
  }
}


// 解析处理构造函数的选项
// const Sub = Vue.extend(extendOptions)
// const Sub2 = Sub.extend(extendOptions2)
// 1. 获取构造函数的options
// 2. 如果构造函数是个子类，则递归获取基类的options
// 3. 如果基类的options改变了，则需要更新superOptions(实例化时可能已改变)
// 4. 如果创建子类构造函数的options改变了，则更新extendOptions
// 5. 合并superOptions和extendOptions，作为构造函数的最终选项
// 6. 增加组件的自查找属性，可以通过类的名称获取到组件的构造函数

export function resolveConstructorOptions (Ctor: Class<Component>) {
  let options = Ctor.options // 选项引用
  if (Ctor.super) { // 有super说明是个子类构造器
    const superOptions = resolveConstructorOptions(Ctor.super) // 递归合并
    const cachedSuperOptions = Ctor.superOptions // 获取之前缓存起来的基类的构造器选项
    if (superOptions !== cachedSuperOptions) {
      // super option changed,
      // need to resolve new options.
      // 说明父类的options改变了，此时需要重新处理
      Ctor.superOptions = superOptions // 将新的基类options重新赋值给superOptions
      // check if there are any late-modified/attached options (#4976)
      // 获取构造器修改或者新增的属性集合
      const modifiedOptions = resolveModifiedOptions(Ctor)
      // update base extend options
      // 将得到的更改过或者新增的属性集合扩展至Ctor.extendOptions
      if (modifiedOptions) {
        extend(Ctor.extendOptions, modifiedOptions)
      }
      // 合并基类选项和子类选项得到新的options
      options = Ctor.options = mergeOptions(superOptions, Ctor.extendOptions)
      if (options.name) { // 如果有name属性，增加自查找属性
        options.components[options.name] = Ctor
      }
    }
  }
  return options
}

// 用于获取子类构造函数被修改或者新增的选项集合
function resolveModifiedOptions (Ctor: Class<Component>): ?Object {
  let modified
  const latest = Ctor.options // 获取现在的构造器选项
  const sealed = Ctor.sealedOptions // 获取创建子类构造函数冻结的选项（创建子类那一刻的构造器选项）
  // 遍历新的现在的构造器选项
  // 如果在定义时的冻结选项里找不到，则说明是新增或者改变过的属性，将其压入modified
  for (const key in latest) {
    if (latest[key] !== sealed[key]) {
      if (!modified) modified = {}
      modified[key] = latest[key]
    }
  }
  // 返回所有修改或者新增的属性集合
  return modified
}
