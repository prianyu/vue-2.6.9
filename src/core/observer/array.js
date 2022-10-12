/*
 * not type checking this file because flow doesn't play well with
 * dynamically accessing methods on Array prototype
 */

import { def } from '../util/index'

// 数组变异方法定义
const arrayProto = Array.prototype
export const arrayMethods = Object.create(arrayProto)

const methodsToPatch = [
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse'
]

/**
 * Intercept mutating methods and emit events
 */
methodsToPatch.forEach(function (method) {
  // cache original method
  const original = arrayProto[method] //  缓存原有的方法
  // 使用对象的属性描述对象定义变异方法，该方法不可被枚举
  def(arrayMethods, method, function mutator (...args) {
    // 获取原生的计算结果
    const result = original.apply(this, args)
    // 从获取数组的观察者
    const ob = this.__ob__ 
    let inserted // 用于存储新增项
    switch (method) {
      case 'push':
      case 'unshift':
        inserted = args // 新增了数据项
        break
      case 'splice':
        inserted = args.slice(2) // splice第三个参数开始作为新增项
        break
    }
    // 新增的项需要增加观察
    if (inserted) ob.observeArray(inserted)
    // notify change
    // 数据项发生了修改，则通知依赖触发更新
    ob.dep.notify()
    // 返回原生方法执行的结果
    return result
  })
})
