/* @flow */

import type Watcher from './watcher'
import { remove } from '../util/index'
import config from '../config'

let uid = 0

/**
 * A dep is an observable that can have multiple
 * directives subscribing to it.
 * 依赖收集器
 * 一个收集器可以存放都多个订阅者
 * 收集器中的订阅者为Wathcer实例
 */
export default class Dep {
  static target: ?Watcher; // 静态属性，用于记录当前的Watcher
  id: number;
  subs: Array<Watcher>;

  constructor () {
    this.id = uid++ // dep的唯一标识
    this.subs = [] // 用于存放订阅者
  }

  // 添加订阅者
  addSub (sub: Watcher) {
    this.subs.push(sub)
  }

  // 删除订阅
  removeSub (sub: Watcher) {
    remove(this.subs, sub)
  }

  // 收集依赖，在当前Wathcer中反向记录当前的依赖收集器
  depend () {
    if (Dep.target) {
      Dep.target.addDep(this)
    }
  }

  // 通知更新
  notify () {
    // stabilize the subscriber list first
    const subs = this.subs.slice() // 这个过程中，subs是可能会变的，所以先拷贝一份
    if (process.env.NODE_ENV !== 'production' && !config.async) {
      // subs aren't sorted in scheduler if not running async
      // we need to sort them now to make sure they fire in correct
      // order
      subs.sort((a, b) => a.id - b.id)
    }
    // 遍历订阅者，执行其update方法
    for (let i = 0, l = subs.length; i < l; i++) {
      subs[i].update()
    }
  }
}

// The current target watcher being evaluated.
// This is globally unique because only one watcher
// can be evaluated at a time.
// 当前正在计算的watcher，这个watcher是全局的watcher公用的
// 在一个时间点，正在计算的watcher仅有一个
Dep.target = null
const targetStack = [] // 用于存放计算的watcher队列
// 使用栈的原因：当前的Dep.target存在，会收集依赖，假如想在Dep.target存在时执行某一段代码的过程中，
// 不需要进行依赖收集，那么可以往栈里压入一个null，变成[watcher, null]，这时Dep.target被临时置为了null
// 也就不会进行依赖收集。代码执行完后再把null弹出，Dep.target恢复，后续的代码又可以进行依赖收集了
// 场景：比如在props的初始化阶段

// 将正在计算的watcher先放入队列后，再将当前计算的watcher设置为指定的watcher
// 后续调用popTarget时，会恢复到原来的watcher
export function pushTarget (target: ?Watcher) {
  targetStack.push(target)
  Dep.target = target
}

// 恢复到原来的watcher
export function popTarget () {
  targetStack.pop()
  Dep.target = targetStack[targetStack.length - 1]
}
