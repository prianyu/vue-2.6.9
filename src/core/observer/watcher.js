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
    this.value = this.lazy
      ? undefined
      : this.get()
  }

  /**
   * Evaluate the getter, and re-collect dependencies.
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
      if (this.deep) { // 深度监听
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
    // 如果新的dep集合中不包含dep， 则添加给dep
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
    while (i--) { // 清除在新的deps中不存在的旧的dep
      const dep = this.deps[i]
      if (!this.newDepIds.has(dep.id)) {
        dep.removeSub(this)
      }
    }

    // 将新的deps赋值给旧deps，移除新的deps
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
    } else if (this.sync) { // 
      this.run()
    } else {
      queueWatcher(this)
    }
  }

  /**
   * Scheduler job interface.
   * Will be called by the scheduler.
   */
  run () {
    if (this.active) {
      const value = this.get()
      if (
        value !== this.value ||
        // Deep watchers and watchers on Object/Arrays should fire even
        // when the value is the same, because the value may
        // have mutated.
        isObject(value) ||
        this.deep
      ) {
        // set new value
        const oldValue = this.value
        this.value = value
        if (this.user) {
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
   */
  teardown () {
    if (this.active) {
      // remove self from vm's watcher list
      // this is a somewhat expensive operation so we skip it
      // if the vm is being destroyed.
      if (!this.vm._isBeingDestroyed) {
        remove(this.vm._watchers, this)
      }
      let i = this.deps.length
      while (i--) {
        this.deps[i].removeSub(this)
      }
      this.active = false
    }
  }
}
