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
 * 在某些情况下我们可能希望禁用组件的观测的
 * 比如子组件的props本身通常是来自于父组件的data，当然也可以是其他的来源，比如直接指定一个对象或者其他数据
 * 由于props是不能被直接修改的，因此我们也无需对传进来的props进行深度观测
 * 但是在初始化props时会调用defineReactive函数将vm._props上的数据进行getter/setter的转换，
 * defineReactive执行时会执行let childOb = !shallow && observe(val)，对属性值进行递归检测，此时就会触发val被深度观测，
 * 通过全局的一个shouldObserve来标记当前数据是否需要被观测，在适当的时机关闭观测，在observe中新增一个条件可以达到此目的
 * 除了props外，像inject的实例化也是相似的道理，因为inject通常来源于父组件的data
 * 对于在data中已经深度观测的数据，传到props中时，依然是响应式的
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
    // 初始化的实例应用计数为0，vmCount > 0，$set 方法不进行处理
    // 只有根数据才会增加vmCount计数，根数据实例化后不允许被直接替换
    this.vmCount = 0 
    // 使用属性描述对象，往被观察的对象添加__ob__属性，引用当前创建的观察者实例，
    //__ob__是不可以枚举的
    def(value, '__ob__', this) 
    if (Array.isArray(value)) { 
      // 对于数组，通过重写几个方法来实现监测（7个变异方法）
      // 实现的基本思路是通过方法拦截的方式，arrayMethods是重写的方法的集合
      // 将arrayMethods作为数组的原型，将数组原有的原型作为arrayMethods的原型
      if (hasProto) { // 支持__proto__属性， 将arrayMethods作为__proto__的属性值，这样就不需要为每一个数组对象都增加属性
        protoAugment(value, arrayMethods)
      } else { 
        //对于不支持__proto__属性的，将重写的方法直接扩展至数组上面，这样就不会通过原型去查找方法了
        copyAugment(value, arrayMethods, arrayKeys)
      }
      // 数组本身的观察只会观察数组本身这个引用值的变化
      // 但是数据里面的每一项也是需要被观察的，所以需要对数组的每一项进行递归调用observe进行观察
      // 由于observe函数只处理引用类型，所以普通类型的数组元素是不会被观察的
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
      // #mark-0
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
 * 如果已经创建过则返回旧的监测器，否则返回创建的监测器
 * 创建后的数据会有一个__ob__属性
 * __ob__里会有一个dep对象属性用于收集依赖
 */
export function observe (value: any, asRootData: ?boolean): Observer | void {

  // 只观察非VNode类型的对象
  if (!isObject(value) || value instanceof VNode) {
    return
  }
  let ob: Observer | void
  // 已经观测
  if (hasOwn(value, '__ob__') && value.__ob__ instanceof Observer) { 
    ob = value.__ob__
  } else if (
    shouldObserve && // 需要被观察
    !isServerRendering() && // 非服务端渲染
    (Array.isArray(value) || isPlainObject(value)) && // 数组或者纯对象
    Object.isExtensible(value) && // 对象可扩展的（可添加属性），Object.freeze/Object.seal等处理的对象是不可扩展的
    !value._isVue // 非Vue实例
  ) {
    ob = new Observer(value) // 创建Observer实例，创建后的实例会存在value.__ob__中
  }
  if (asRootData && ob) { // 实例的根数据，则ob的实例引用数+1
    // vmCount大于0则说明其为组件的根数据，在操作上会有一些限制
    // Vue.set和Vue.del方法会判断vmCount是否大于0，来决定是否处理
    // 也就是Vue.set和Vue.del是无法直接对根数据的key进行处理的
    ob.vmCount++
  }
  return ob
}

/**
 * Define a reactive property on an Object.
 * 将一个对象定义为响应式的getter/setter，并定义依赖收集器
 * 对于数组，不会执行Observer的walk方法，进而不会调用defineReactive函数，
 * 但是数组中的项如果是引用类型，会递归调用observe
 * 因此数组中的项如果是原始类型，则不会有getter和setter，也就不会有dep的引用；
 * 而引用类型的项里都会有__ob__，也就有__ob__.dep
 * 举例：
 * obj = {
 *    __ob__: Observer // 对象会有一个__ob__属性，__ob__.dep保存着obj的Dep 
 *     a: {
 *        // 这里会有一个闭包的dep也引用着a的dep
 *        __ob__: Observer // 同样只要是引用类型就会有__ob__，其__ob__.dep就会保存其dep
 *        aa: 123, // 不是引用类型，所以只有闭包引用的dep
 *     },
 *     b: 345 // 不是引用类型，所以只有闭包引用的dep,
 *     
 *     arr: [
 *        __ob__: Observer, // arr会有一个闭包的dep，而arr又是对象，所以会有__ob__.dep
 *        // 基本类型的数组成员是没有dep的，也没有闭包的dep，所以arr[1] = 2这里写法不能触发更新
 *        1,2,3,4,5
 *        // 引用类型的成员有__ob__.dep，但是没有闭包的dep引用
 *        {
 *          item: 'item',
 *          __ob__: Observer // 是引用类型，所以有__ob__.dep的引用
 *        }
 *     ]
 * }
 */
export function defineReactive (
  obj: Object,
  key: string,
  val: any,
  customSetter?: ?Function,
  shallow?: boolean
) {
  // 被属性闭包引用的依赖收集器
  const dep = new Dep()

  // 获取属性的属性描述符
  const property = Object.getOwnPropertyDescriptor(obj, key)
  if (property && property.configurable === false) { // 属性不可被删除或者修改，不作处理
    return
  }

  // cater for pre-defined getter/setters
  const getter = property && property.get // 属性上已经定义的getter
  const setter = property && property.set // 属性上已经定义的setter
  /**
   * 功能：如果没有显式的设置val的值，则进行设置
   * 条件等同于(!getter || setter && getter) && arguments.length === 2
   * 此处的条件与下方#mark-2处是对称的，用于处理同一个bug
   * Bug分析：
   * 1. 最初的时候，Vue在Observer的walk方法（见上方#mark-0)是这样调用的：
   * defineReactive(obj, keys[i], obj[keys[i]])
   * 也就是传了第三个参数，即在进行观测之前获取了对象属性的值，这将导致一个bug，见（issues #7280）：
   * 即当obj[key]本身具有getter时，在获取值的时候就会触发getter函数，而getter函数本身是由用户定义的，
   * 我们是无法预知用户是如何定义这个函数的，可能会导致一些意想不到的事情（比如搞了弹窗、其他副作用之类的事），
   * 出于避免这种不可预见的行为的考虑，在walk函数中调用改为了defineReactive(obj, keys[i])，即不先获取值
   * 然后在defineReactive函数中，添加if (!getter && arguments.length === 2) 这个条件，表示
   * 当不传第三个参数且没有用户定义的getter时，才去获取这个值赋给val，这样对于有getter的obj[key]就不会触发getter了
   * 而没有getter的将会按照原本传递第三个参数的行为正常工作
   * 2. 然而修复以上问题后，又带来了另一个问题:
   * 当没有getter时，我们会求值得到val并对其进行深度观测，观测后val就有了getter和setter，这里记为（1）
   * 当val改变时，会触发setter，在setter中会对新的值进行重新观测
   * childOb = !shallow && observe(newVal)
   * 此时调用defineReactive时，发现getter是存在的，那么又会跳过newVal的观测
   * 这就造成了前后不一致的结果
   * 由于在（1）中，观测后会同时拥有setter和getter，因此，我们可以补充一个条件，就是当同时拥有getter和setter时也需要进行深度观测
   * 于是条件变为了if ((!getter || setter) && arguments.length === 2)
   * 这样的话，如果初始化的情况就已经有setter和getter，也会执行，那么情景1的bug其实还是会存在
   * 3. 见下方#mark-2如果obj[val]只有getter没有setter时，说明只是访问器属性，但是后续使用Object.defineProperty又定义了setter，
   * 同时对新值又做了深度观测，这个是不合逻辑的，因此，在set中又增加了一个if (getter && !setter) return的条件
   * 
  */
  // #mark-1
  // 如果只有getter，就不会走这个逻辑，此时val为undefined，即val不会被深度监测
  if ((!getter || setter) && arguments.length === 2) {
    val = obj[key]
  }

  // 递归观测val
  // 对val进行深度观测，得到的值为childOb，即为val.__ob__, childOb会被闭包引用
  // 由于observe方法又会调用defineReactive,所以本质上这里是个递归
  // 最终子属性都会被转为getter/setter
  let childOb = !shallow && observe(val)

  Object.defineProperty(obj, key, {
    enumerable: true, // 可枚举
    configurable: true, // 可删除
    get: function reactiveGetter () {
      const value = getter ? getter.call(obj) : val // 优先从getter取值
      if (Dep.target) { // 收集当前watcher
       // dep.depend()会调用Dep.target.addDep(Dep.target)，将dep反向收集到watcher中
       // Dep.target.addDep(Dep.target)又会调用dep的addSub方法，会将Dep.target添加至dep.subs中，从而实现依赖的收集
       // 调用完毕后Dep.target的deps也存放着dep列表，这个反向收集的dep列表，在watcher被销毁时，可以清空dep
       // 闭包的dep收集一次依赖，这样当obj[key]直接变化时可以触发依赖的更新
        dep.depend() 
        if (childOb) {
          // 走到这里说明获取到的值是一个引用类型，其__ob__.dep也会收集一次当前的watcher
          // 为什么这里需要重复收集呢？因为当前对于obj[key]的依赖收集是在闭包的dep上
          // 当obj[key]是个对象时，如果后续我们动态的往obj[key]新增一个属性，我们会使用vm.$set方法来实现
          // 但是vm.$set方法是无法获取到当前闭包的dep的，即无法获取依赖，也就无法触发watcher的更新
          // 而obj[key].__ob__本身也具有一个dep，因此，可以借助这个dep来动态的实现属性的更新
          // 如 obj = {a: 1, b: 2} , <div>{{obj}}</div>
          // 在渲染时读取obj时会触发obj，obj.a,obj.b的getter，三者的闭包的dep都会收集当前的渲染watcher
          // 假如没有以下语句，则 vm.$set(obj, 'c', 3)无法触发渲染watcher更新
          childOb.dep.depend() // 收集子dep
          // 如果是数组，则通过数据项的__ob__.dep.depend收集依赖
          // 由于数据的项是没有闭包的dep的，对于项如果是引用类型的话，同理也是需要将watcher收集到每一项的__ob__.dep里面，
          // 用于后续动态新增属性
          // 对于vm.$delete也是同样的道理
          if (Array.isArray(value)) { 
            dependArray(value)
          }
        }
      }
      return value
    },
    set: function reactiveSetter (newVal) {
      const value = getter ? getter.call(obj) : val // 获取旧值
      /* eslint-disable no-self-compare */
      // 值没有改变，或者前后的值为NaN，则不做处理
      if (newVal === value || (newVal !== newVal && value !== value)) {
        return
      }
      /* eslint-enable no-self-compare */

      // customSetter是自定义的setter，在$listens, $attrs,props,inject都传了这个参数
      // 用于做一些操作的提醒，只在非生产环境下有效
      if (process.env.NODE_ENV !== 'production' && customSetter) {
        customSetter()
      }
      // #7981: for accessor properties without setter
      // #mark-2 访问器属性不做深度观测
      if (getter && !setter) return


      if (setter) { // 本身具有setter则调用
        setter.call(obj, newVal)
      } else { // 修改val值为新的值
        val = newVal
      }
      // 新设置的值是一个object，需要重新观测
      childOb = !shallow && observe(newVal)
      // 通知依赖，触发watcher更新
      dep.notify()
    }
  })
}

/**
 * Set a property on an object. Adds the new property and
 * triggers change notification if the property doesn't
 * already exist.
 */
// vm.$set, Vue.set方法定义
// 1. 非对象类型、vm实例以及根data是不允许被设置属性的
// 2. 对于数组，使用数组的splice方法设置对应索引的上的元素
// 3. 对于对象，如果设置对象上本身已经存在的值或者如果原本不存在但对象本身不是响应式的则会直接修改，否则会新增响应式属性并通知更新
export function set (target: Array<any> | Object, key: any, val: any): any {
  // 只能在对象上设置属性
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot set reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  // 如果是数组，且key是有效的index，则调用数组上的splice方法即可完成替换
  // 需要更新数组的长度确保设置的元素的索引正确
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.length = Math.max(target.length, key)
    target.splice(key, 1, val)
    return val
  }
  // 如果key在对象自身中已经存在，则直接赋值即可，避免重复做响应式数据的转换
  if (key in target && !(key in Object.prototype)) {
    target[key] = val
    return val
  }
  const ob = (target: any).__ob__

  // 不能直接设置vue实例或者根data上的属性
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid adding reactive properties to a Vue instance or its root $data ' +
      'at runtime - declare it upfront in the data option.'
    )
    return val
  }

  // 如果目标对象本身就不是响应式的，则新增的属性也没必要转为响应式的数据
  if (!ob) {
    target[key] = val
    return val
  }
  // 如果对象是响应式的，在响应式对象上添加新的属性
  defineReactive(ob.value, key, val)
  // 对象变化了，触发通知更新
  // 这里也是为什么对于obj[key].__ob__.dep要重复收集一次依赖的原因
  ob.dep.notify()
  // 返回设置的值
  return val
}

/**
 * Delete a property and trigger change if necessary.
 */
// Vue.delete, vm.$delete方法定义
// 1. 非对象类型、vm实例以及根data是不允许删除属性的
// 2. 对于数组，使用数组的splice方法删除对应索引的上的元素
// 3. 对于对象，如果设置对象不存在属性则不处理，存在则删除并通知更新
export function del (target: Array<any> | Object, key: any) {
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot delete reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  // 如果是数组，调用splice方法删除即可
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.splice(key, 1)
    return
  }

  // 根元素和vue实例不允许此操作
  const ob = (target: any).__ob__
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid deleting properties on a Vue instance or its root $data ' +
      '- just set it to null.'
    )
    return
  }
  // 没有要删除的属性，不处理
  if (!hasOwn(target, key)) {
    return
  }
  delete target[key] // 删除属性
  // 本身不是响应式的，则不需要处理
  if (!ob) {
    return
  }
  // target是响应式的，通知更新
  ob.dep.notify()
}

/**
 * 数组类型的数据的依赖收集
 * Collect dependencies on array elements when the array is touched, since
 * we cannot intercept array element access like property getters.
 * 数组可以借助变异方法实现拦截，数组的项是没有闭包的dep的，
 * 因此我们不能像对象那样对属性进行拦截访问。
 * 对于引用类型的数组项，虽然其没有闭包的dep，但是有__ob__.dep
 * 可以通过数据项存储的__ob__来获取到dep进行依赖收集，
 * 这样在后续如果有为数组的项进行动态新增属性或者和删除属性时，我们就可以通过__ob__.dep上收集到的依赖来触发依赖的更新
 */
function dependArray (value: Array<any>) {
  // 遍历数组
  for (let e, i = 0, l = value.length; i < l; i++) {
    e = value[i]
    e && e.__ob__ && e.__ob__.dep.depend() // 如果数据项是对象类型的，则收集依赖
    if (Array.isArray(e)) { // 如果数据项是数组，递归收集
      dependArray(e)
    }
  }
}
