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
 */
export default class Watcher {
  vm: Component; // vue实例
  expression: string; // 监听的属性
  cb: Function; // wathcher回调
  id: number; // 唯一标识
  deep: boolean; // 是否深度观测
  user: boolean; // 是否为$watch调用
  lazy: boolean; // 是否惰性计算，用于计算属性
  sync: boolean; // 是否同步执行
  dirty: boolean; // 是否为脏的，用于计算属性，当为脏时会重新计算值
  active: boolean; // 是否可用
  deps: Array<Dep>; // 上一次的依赖收集
  newDeps: Array<Dep>; // 新的的依赖收集
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
    this.vm = vm
    if (isRenderWatcher) { // 渲染watcher单独存放在实例的属性上
      // 当需要强制刷新时可以调用该watcher，是$forceUpdate的核心实现原理
      vm._watcher = this
    }
    vm._watchers.push(this) // 存储所有的watcher
    // options
    if (options) {
      this.deep = !!options.deep // 是否深度监听
      this.user = !!options.user // 是否为$watcherd定义
      this.lazy = !!options.lazy // 是否惰性计算
      this.sync = !!options.sync // 是否同步监听
      this.before = options.before // 执行前的钩子
    } else {
      this.deep = this.user = this.lazy = this.sync = false
    }
    this.cb = cb
    this.id = ++uid // uid for batching
    this.active = true
    this.dirty = this.lazy // for lazy watchers
    this.deps = []
    this.newDeps = []
    this.depIds = new Set()
    this.newDepIds = new Set()
    this.expression = process.env.NODE_ENV !== 'production'
      ? expOrFn.toString()
      : ''
    // parse expression for getter
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
      value = this.getter.call(vm, vm) // 计算值
    } catch (e) {
      if (this.user) {
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
   * 添加dep
   */
  addDep (dep: Dep) {
    const id = dep.id
    // 如果新的dep集合中不包含dep， 则添加给dep，可避免重复收集
    if (!this.newDepIds.has(id)) {
      this.newDepIds.add(id)
      this.newDeps.push(dep)
      if (!this.depIds.has(id)) { // 如果旧的dep中不包含该dep，则在dep里添加该watcher
        dep.addSub(this)
      }
    }
  }

  /**
   * Clean up for dependency collection.
   * 清理deps
   */
  cleanupDeps () {
    let i = this.deps.length
    // 如果上次求值时收集的依赖在当前求值时没有的依赖，则将其移除掉
    while (i--) { 
      const dep = this.deps[i]
      if (!this.newDepIds.has(dep.id)) {
        dep.removeSub(this)
      }
    }

    // 将新的deps赋值给旧deps，清空新的deps
    let tmp = this.depIds
    this.depIds = this.newDepIds 
    this.newDepIds = tmp // 
    this.newDepIds.clear()
    tmp = this.deps
    this.deps = this.newDeps
    this.newDeps = tmp
    this.newDeps.length = 0
  }

  /**
   * Subscriber interface.
   * Will be called when a dependency changes.
   * 当依赖变化时会触发watcher的更新
   */
  update () {
    /* istanbul ignore else */
    if (this.lazy) { // 如果是惰性计算的，则标记为脏的
      this.dirty = true
    } else if (this.sync) { // 同步更新
      this.run()
    } else { // 异步更新
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
   * 重新求值，这个直在惰性求值的watcher中被调用，求值完成后dirty会被置为false
   */
  evaluate () {
    this.value = this.get()
    this.dirty = false
  }

  /**
   * Depend on all deps collected by this watcher.
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

      // 还没销毁，在vm_.watchers中当前watcher
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
