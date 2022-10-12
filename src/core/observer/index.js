/* @flow */

import Dep from './dep'
import VNode from '../vdom/vnode'
import { arrayMethods } from './array'
import {
  def,
  warn,
  hasOwn,
  hasProto,
  isObject,
  isPlainObject,
  isPrimitive,
  isUndef,
  isValidArrayIndex,
  isServerRendering
} from '../util/index'

// 与Object.keys不同，Object.getOwnPropertyNames会返回可枚举+不可枚举的属性
const arrayKeys = Object.getOwnPropertyNames(arrayMethods) // 数组变异方法的方法名列表

/**
 * In some cases we may want to disable observation inside a component's
 * update computation.
 * 在某些情况下我们可能希望禁用组件的观测 @supense
 */
export let shouldObserve: boolean = true

export function toggleObserving (value: boolean) {
  shouldObserve = value
}

/**
 * Observer class that is attached to each observed
 * object. Once attached, the observer converts the target
 * object's property keys into getter/setters that
 * collect dependencies and dispatch updates.
 * 用于创建附加到每个被观察的对象的观察者类。
 * 观察者会将被观察对象的属性键转换为收集依赖和分发更新的getter/setter
 */
export class Observer {
  value: any;
  dep: Dep;
  vmCount: number; // number of vms that have this object as root $data

  constructor (value: any) {
    this.value = value // 保存原有对象的引用
    this.dep = new Dep() // 创建一个依赖收集器
    this.vmCount = 0 // 初始化的实例应用计数为0，引用计数后期可以用来做观察者实例的销毁
    // 使用属性描述对象，往被观察的对象添加__ob__属性，引用当前创建的观察者实例，
    //__ob__是不可以枚举的
    def(value, '__ob__', this) 
    if (Array.isArray(value)) { 
      // 对于数组，通过重写几个方法来实现监测（7个变异方法）
      // 实现的基本思路是通过方法拦截的方式，arrayMethods是重写的方法的集合
      // 将arrayMethods作为数组的原型，将数组原有的原型作为arrayMethods的原型
      if (hasProto) { // 支持__proto__属性， 将arrayMethods作为__proto__的属性值
        protoAugment(value, arrayMethods)
      } else { 
        //对于不支持__proto__属性的，将重写的方法直接扩展至数组上面，这样就不会通过原型去查找方法了
        copyAugment(value, arrayMethods, arrayKeys)
      }
      // 数组本身的观察只会观察数组本身这个引用值的变化
      // 但是数据里面的每一项也是需要被观察的，所以需要对数组的每一项进行递归调用observe进行观察
      // 由于observe函数只处理引用类型，所以普通类型的数组元素是不会被观察的
      // Observer观察的是键，不是值，因此类似arr[1] = 234的写法是不会触发观察者分发的
      this.observeArray(value) // 数组递归转化
    } else { // 对象，遍历对象属性，添加getter/setter
      this.walk(value)
    }
  }

  /**
   * Walk through all properties and convert them into
   * getter/setters. This method should only be called when
   * value type is Object.
   * 遍历一个对象的属性，并将其所有的属性转为getter/setter
   */
  walk (obj: Object) {
    const keys = Object.keys(obj) // 属性列表
    for (let i = 0; i < keys.length; i++) {
      defineReactive(obj, keys[i]) // 定义setter/getter
    }
  }

  /**
   * Observe a list of Array items.
   * 对数组做遍历递归观察
   */
  observeArray (items: Array<any>) {
    for (let i = 0, l = items.length; i < l; i++) {
      observe(items[i])
    }
  }
}

// helpers

/**
 * Augment a target Object or Array by intercepting
 * the prototype chain using __proto__
 */
function protoAugment (target, src: Object) {
  /* eslint-disable no-proto */
  target.__proto__ = src
  /* eslint-enable no-proto */
}

/**
 * Augment a target Object or Array by defining
 * hidden properties.
 * 属于不支持__proto__的宿主，直接将数组的变异方法定义在数组上
 * 这样不会去原型找对应的方法
 * 这些变异的方法是不可枚举的，因此遍历时也是不可见的
 */
/* istanbul ignore next */
function copyAugment (target: Object, src: Object, keys: Array<string>) {
  for (let i = 0, l = keys.length; i < l; i++) {
    const key = keys[i]
    def(target, key, src[key])
  }
}

/**
 * Attempt to create an observer instance for a value,
 * returns the new observer if successfully observed,
 * or the existing observer if the value already has one.
 * 为一个数据创建一个数据监测器（只有引用类型的数据才会创建）
 * 如果已经创建过则返回旧的监测器
 * 否则返回创建的监测器
 */
export function observe (value: any, asRootData: ?boolean): Observer | void {
  // 基本类型和VNode是不创建的
  if (!isObject(value) || value instanceof VNode) {
    return
  }
  let ob: Observer | void
  if (hasOwn(value, '__ob__') && value.__ob__ instanceof Observer) { // 已经创建过
    ob = value.__ob__
  } else if (
    shouldObserve && // 需要被观察
    !isServerRendering() && // 非服务端渲染
    (Array.isArray(value) || isPlainObject(value)) && // 数组或者纯对象
    Object.isExtensible(value) && // 对象可扩展的（可添加属性）
    !value._isVue // 非Vue实例
  ) {
    ob = new Observer(value) // 创建Observer实例，创建后的实例会存在value.__ob__中
  }
  if (asRootData && ob) { // 实例的根数据，则ob的实例引用数+1
    ob.vmCount++
  }
  return ob
}

/**
 * Define a reactive property on an Object.
 * 将一个对象定义为响应式的
 */
export function defineReactive (
  obj: Object,
  key: string,
  val: any,
  customSetter?: ?Function,
  shallow?: boolean
) {
  const dep = new Dep()

  // 获取属性的属性描述符
  const property = Object.getOwnPropertyDescriptor(obj, key)
  if (property && property.configurable === false) { // 属性不可被删除或者修改，不作处理
    return
  }

  // cater for pre-defined getter/setters
  const getter = property && property.get // 属性上已经定义的getter
  const setter = property && property.set // 属性上已经定义的setter
  // @suspense
  if ((!getter || setter) && arguments.length === 2) {
    val = obj[key]
  }

  let childOb = !shallow && observe(val)
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    get: function reactiveGetter () {
      const value = getter ? getter.call(obj) : val
      if (Dep.target) {
        dep.depend()
        if (childOb) {
          childOb.dep.depend()
          if (Array.isArray(value)) {
            dependArray(value)
          }
        }
      }
      return value
    },
    set: function reactiveSetter (newVal) {
      const value = getter ? getter.call(obj) : val
      /* eslint-disable no-self-compare */
      if (newVal === value || (newVal !== newVal && value !== value)) {
        return
      }
      /* eslint-enable no-self-compare */
      if (process.env.NODE_ENV !== 'production' && customSetter) {
        customSetter()
      }
      // #7981: for accessor properties without setter
      if (getter && !setter) return
      if (setter) {
        setter.call(obj, newVal)
      } else {
        val = newVal
      }
      childOb = !shallow && observe(newVal)
      dep.notify()
    }
  })
}

/**
 * Set a property on an object. Adds the new property and
 * triggers change notification if the property doesn't
 * already exist.
 */
export function set (target: Array<any> | Object, key: any, val: any): any {
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot set reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.length = Math.max(target.length, key)
    target.splice(key, 1, val)
    return val
  }
  if (key in target && !(key in Object.prototype)) {
    target[key] = val
    return val
  }
  const ob = (target: any).__ob__
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid adding reactive properties to a Vue instance or its root $data ' +
      'at runtime - declare it upfront in the data option.'
    )
    return val
  }
  if (!ob) {
    target[key] = val
    return val
  }
  defineReactive(ob.value, key, val)
  ob.dep.notify()
  return val
}

/**
 * Delete a property and trigger change if necessary.
 */
export function del (target: Array<any> | Object, key: any) {
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot delete reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.splice(key, 1)
    return
  }
  const ob = (target: any).__ob__
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid deleting properties on a Vue instance or its root $data ' +
      '- just set it to null.'
    )
    return
  }
  if (!hasOwn(target, key)) {
    return
  }
  delete target[key]
  if (!ob) {
    return
  }
  ob.dep.notify()
}

/**
 * Collect dependencies on array elements when the array is touched, since
 * we cannot intercept array element access like property getters.
 */
function dependArray (value: Array<any>) {
  for (let e, i = 0, l = value.length; i < l; i++) {
    e = value[i]
    e && e.__ob__ && e.__ob__.dep.depend()
    if (Array.isArray(e)) {
      dependArray(e)
    }
  }
}
