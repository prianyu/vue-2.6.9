/* @flow */

import {
  warn,
  remove,
  isObject,
  parsePath,
  _Set as Set,
  handleError,
  noop
} from '../util/index'

import { traverse } from './traverse'
import { queueWatcher } from './scheduler'
import Dep, { pushTarget, popTarget } from './dep'

import type { SimpleSet } from '../util/index'

let uid = 0 // watcher的唯一标识

/**
 * A watcher parses an expression, collects dependencies,
 * and fires callback when the expression value changes.
 * This is used for both the $watch() api and directives.
 * 1. 解析监听的表达式
 * 2. 求值时设置Dep.target为当前watcher，触发依赖收集
 * 3. 
 * 
 * Watcher类，会解析传入的表达式，收集依赖，当依赖的值发生变化时，会触发回调
 * @params vm 实例
 * @params expOrFn 监听的属性表达式，可以是字符串，也可以是函数
 * @params cb 回调函数，表达式求值变化时的回调函数
 * @params options 选项配置
 * @params isRenderWatcher 是否为渲染watcher
 */
export default class Watcher {
  vm: Component; // vue实例
  expression: string; // 监听的属性
  cb: Function; // watcher回调
  id: number; // 唯一标识
  deep: boolean; // 是否深度观测
  user: boolean; // 是否为$watch调用
  lazy: boolean; // 是否惰性计算，用于计算属性
  sync: boolean; // 是否同步执行
  dirty: boolean; // 是否为脏的，用于计算属性，当为脏时会重新计算值
  active: boolean; // 是否可用
  deps: Array<Dep>; // 存储收集了上一次当前watcher的依赖收集器
  newDeps: Array<Dep>; // 存储最新的收集当前watcher的依赖收集器，收集完成后会更新至deps并清空
  depIds: SimpleSet; // 上一次依赖收集的id集合
  newDepIds: SimpleSet; // 新的依赖收集的id集合
  before: ?Function; // 执行前的钩子
  getter: Function; // 取值的getter
  value: any; // watcher的计算结果

  constructor (
    vm: Component, // 实例
    expOrFn: string | Function,// 监听的属性
    cb: Function, //回调函数
    options?: ?Object, // 选项
    isRenderWatcher?: boolean // 是否为渲染watcher
  ) {
    this.vm = vm // 保存当前的实例
    // 将渲染watcher单独存放在实例的属性上
    // 当需要强制刷新时可以调用该watcher，是$forceUpdate的核心实现原理
    if (isRenderWatcher) { 
      vm._watcher = this
    }
    vm._watchers.push(this) // 存储所有的watcher
    // options
    if (options) {
      this.deep = !!options.deep // 是否深度监听
      this.user = !!options.user // 是否为$watch定义（用户自定义）
      this.lazy = !!options.lazy // 是否惰性计算
      this.sync = !!options.sync // 是否同步监听
      this.before = options.before // 执行前的钩子
    } else {
      this.deep = this.user = this.lazy = this.sync = false
    }
    this.cb = cb // 存储回调函数
    this.id = ++uid // uid for batching 唯一的id
    this.active = true // 激活
    this.dirty = this.lazy // for lazy watchers 如果是惰性求值的，首次标记为脏
    this.deps = []
    this.newDeps = []
    this.depIds = new Set()
    this.newDepIds = new Set()
    this.expression = process.env.NODE_ENV !== 'production'
      ? expOrFn.toString()
      : '' // 默认的expression
    // parse expression for getter
    // 解析监听的表达式，得到取值的表达式
    // 如果传入的表达式是函数则直接使用，否则解析属性路径获取属性值的函数
    if (typeof expOrFn === 'function') {
      this.getter = expOrFn
    } else {
      this.getter = parsePath(expOrFn) // 得到一个可以按照路径获取属性值的函数
      if (!this.getter) {
        this.getter = noop
        process.env.NODE_ENV !== 'production' && warn(
          `Failed watching path: "${expOrFn}" ` +
          'Watcher only accepts simple dot-delimited paths. ' +
          'For full control, use a function instead.',
          vm
        )
      }
    }
    // 不是惰性求值的情况下触发一次取值，这样就可以进行依赖收集了
    this.value = this.lazy
      ? undefined
      : this.get()
  }

  /**
   * Evaluate the getter, and re-collect dependencies.
   * 初次求值和后续重新求值都会调用该方法，Dep.target会赋值为当前watcher
   * 因此watcher内部维护了一个deps和depIds用于记录上一次求值时已经执行过的收集的依赖
   */
  get () {
    pushTarget(this) // 将Dep.target赋值为当前watcher，开启依赖收集
    let value
    const vm = this.vm
    try {
      // 计算值，此时会触发vm实例上对应属性访问，从而触发对应属性的getter，进而触发依赖收集
      value = this.getter.call(vm, vm) 
    } catch (e) {
      if (this.user) { // 外部定义的watcher，需要处理错误
        handleError(e, vm, `getter for watcher "${this.expression}"`)
      } else {
        throw e
      }
    } finally {
      // "touch" every property so they are all tracked as
      // dependencies for deep watching
      // 深度监听，通过不断递归访问对象的属性来触发属性的getter实现深度依赖收集
      if (this.deep) { 
        traverse(value)
      }
      // 收集完毕，恢复Dep.target，清理deps
      popTarget()
      this.cleanupDeps()
    }
    return value
  }

  /**
   * Add a dependency to this directive.
   * 双向添加依赖收集器
   * 将当前watcher添加到依赖收集其中，数据更新时可以触发更新
   * 将依赖收集器添加到当前watcher中，重新求值时可以更新依赖收集
   */
  addDep (dep: Dep) {                
    const id = dep.id
    // 如果新的dep集合中不包含dep， 则添加给dep，可避免重复收集
    if (!this.newDepIds.has(id)) {
      this.newDepIds.add(id)
      this.newDeps.push(dep)
      // 如果旧的dep中不包含该dep，说明当前watcher还没有被添加到对应的dep中
      // 则在dep里添加该watcher
      if (!this.depIds.has(id)) { 
        dep.addSub(this)
      }
    }
  }

  /**
   * Clean up for dependency collection.
   * 清理deps
   * 更新当前的deps，从旧的deps中移除当前的watcher
   * 并清空newDeps和newDepIds，用于后续收集
   */
  cleanupDeps () {
    let i = this.deps.length
    // 找出上一次中收集了该watcher且本次不收集当前watcher的dep
    // 然后将当前watcher从这些dep中移除
    while (i--) { 
      const dep = this.deps[i]
      if (!this.newDepIds.has(dep.id)) {
        dep.removeSub(this)
      }
    }

    // 更新收集了该watcher实例的depIds，并清空newDepIds用于下次收集
    let tmp = this.depIds
    this.depIds = this.newDepIds 
    this.newDepIds = tmp 
    this.newDepIds.clear()
    // 更新收集了该watcher实例的deps，并清空newDeps用于下次收集
    tmp = this.deps
    this.deps = this.newDeps
    this.newDeps = tmp
    this.newDeps.length = 0
  }

  /**
   * Subscriber interface.
   * Will be called when a dependency changes.
   * 当依赖变化时会触发watcher的更新
   * 1. 惰性求值的标记为脏
   * 2. 同步更新的则重新求值，调用监听回调
   * 3. 异步更新的则通过任务调度来实现
   */
  update () {
    /* istanbul ignore else */
    if (this.lazy) { // 如果是惰性计算的，则标记为脏的
      this.dirty = true
    } else if (this.sync) { // 同步更新
      this.run()
    } else { // 异步更新，通过任务调度来实现
      // 维护一个任务队列，在刷新期间只会执行一次
      // 新的watcher会插入到队列中的合适位置
      // 任务中会异步执行watcher.run方法求值，更新依赖
      queueWatcher(this)
    }
  }

  /**
   * Scheduler job interface.
   * Will be called by the scheduler.
   */
  run () {
    if (this.active) {
      const value = this.get() // 重新求值
      // 值改变了，或者新值是对象（有可能引用的对象值已经发生了变化）时执行
      if (
        value !== this.value ||
        // Deep watchers and watchers on Object/Arrays should fire even
        // when the value is the same, because the value may
        // have mutated.
        isObject(value) ||
        this.deep
      ) {
        // set new value
        // 当返回值是引用类型时，由于可能仅仅是对象的值发生了变化，对象引用并没有改变，所以oldValue和value可能同一个对象
        // 因此，在监听回调中获取这两个值时，实际上获取到的是同一个值
        const oldValue = this.value // 获取旧值
        this.value = value // 获取新值

        // 执行监听的回调函数
        if (this.user) { // 用户自定义的watcher需要捕获一下错误
          try {
            this.cb.call(this.vm, value, oldValue)
          } catch (e) {
            handleError(e, this.vm, `callback for watcher "${this.expression}"`)
          }
        } else {
          this.cb.call(this.vm, value, oldValue)
        }
      }
    }
  }

  /**
   * Evaluate the value of the watcher.
   * This only gets called for lazy watchers.
   * 重新求值，这个只在惰性求值的watcher中被调用，求值完成后dirty会被置为false
   */
  evaluate () {
    this.value = this.get()
    this.dirty = false
  }

  /**
   * Depend on all deps collected by this watcher.     
   * 收集该watcher的所有依赖  
   */
  depend () { 
    let i = this.deps.length
    while (i--) {
      this.deps[i].depend()
    }
  }

  /**
   * Remove self from all dependencies' subscriber list.
   * 从所有依赖的订阅列表中卸载掉当前的watcher
   */
  teardown () {
    if (this.active) { // 还没失活
      // remove self from vm's watcher list
      // this is a somewhat expensive operation so we skip it
      // if the vm is being destroyed.
      // 在实例vm中删除watcher的依赖是一个昂贵的操作，如果vm已经已经被销毁了就跳过

      // 组件还没销毁则在vm_.watchers中移除当前watcher
      if (!this.vm._isBeingDestroyed) {
        remove(this.vm._watchers, this)
      }

      // 移除当前watcher中所有的订阅
      let i = this.deps.length
      while (i--) {
        this.deps[i].removeSub(this)
      }
      this.active = false
    }
  }
}
