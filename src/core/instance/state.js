/* @flow */

import config from '../config'
import Watcher from '../observer/watcher'
import Dep, { pushTarget, popTarget } from '../observer/dep'
import { isUpdatingChildComponent } from './lifecycle'

import {
  set,
  del,
  observe,
  defineReactive,
  toggleObserving
} from '../observer/index'

import {
  warn,
  bind,
  noop,
  hasOwn,
  hyphenate,
  isReserved,
  handleError,
  nativeWatch,
  validateProp,
  isPlainObject,
  isServerRendering,
  isReservedAttribute
} from '../util/index'

// 属性描述对象
const sharedPropertyDefinition = {
  enumerable: true,
  configurable: true,
  get: noop,
  set: noop
}
// 设置属性代理
// 将target[key]代理至target[sourceKey][key]
export function proxy (target: Object, sourceKey: string, key: string) {
  sharedPropertyDefinition.get = function proxyGetter () {
    return this[sourceKey][key]
  }
  sharedPropertyDefinition.set = function proxySetter (val) {
    this[sourceKey][key] = val
  }
  Object.defineProperty(target, key, sharedPropertyDefinition)
}

// 响应式数据实例化
export function initState (vm: Component) {
  vm._watchers = [] // 存放观察者
  const opts = vm.$options
  // props初始化
  if (opts.props) initProps(vm, opts.props)
  // methods初始化，methods比data先初始化，data可以为函数，也可以调用methods中的函数初始化data
  if (opts.methods) initMethods(vm, opts.methods)
  // data初始化
  if (opts.data) {
    initData(vm)
  } else { // 没有传data直接观察空对象，可以后续动态添加数据
    observe(vm._data = {}, true /* asRootData */)
  }
  // computed初始化，将computed转为setter/getter，并增加计算属性的观察者vm.computedWatchers
  if (opts.computed) initComputed(vm, opts.computed)
  // watch初始化，参数归一化后，转为调用vm.$watch
  if (opts.watch && opts.watch !== nativeWatch) {
    initWatch(vm, opts.watch)
  }
}

// 初始化props
// 在示例上增加_props属性，并将props数据的访问代理到vm._props上
function initProps (vm: Component, propsOptions: Object) {
  const propsData = vm.$options.propsData || {} // 从父组件接收到的props数据
  const props = vm._props = {} // 添加_props属性用于存储props
  // cache prop keys so that future props updates can iterate using Array
  // instead of dynamic object key enumeration.
  // 缓存属性的键，以便将来属性更新时可以使用Array而不是对对象的键进行动态的枚举
  const keys = vm.$options._propKeys = []
  // 根实例标记
  const isRoot = !vm.$parent
  // root instance props should be converted
  // 非根组件下关闭数据观察
  // 子组件的props通常来自父组件的data，data会被转为响应式对象，无需重复观察
  if (!isRoot) {
    toggleObserving(false)
  } 
  for (const key in propsOptions) {
    keys.push(key) // 缓存key
    // 值的合法性检测并获取值
    // 这里会对prop的默认值做计算，也会对prop值的合法性做校验，还会对prop值做数据监听
    const value = validateProp(key, propsOptions, propsData, vm)
    /* istanbul ignore else */
    // 定义响应式的props
    if (process.env.NODE_ENV !== 'production') {
      // 保留属性（key,ref,slot,slot-scope,is及其它自定义的保留属性）检测
      const hyphenatedKey = hyphenate(key)
      if (isReservedAttribute(hyphenatedKey) ||
          config.isReservedAttr(hyphenatedKey)) {
        warn(
          `"${hyphenatedKey}" is a reserved attribute and cannot be used as component prop.`,
          vm
        )
      }
      // 子组件不能修改props
      defineReactive(props, key, value, () => {
        if (!isRoot && !isUpdatingChildComponent) {
          warn(
            `Avoid mutating a prop directly since the value will be ` +
            `overwritten whenever the parent component re-renders. ` +
            `Instead, use a data or computed property based on the prop's ` +
            `value. Prop being mutated: "${key}"`,
            vm
          )
        }
      })
    } else {
      defineReactive(props, key, value)
    }
    // static props are already proxied on the component's prototype
    // during Vue.extend(). We only need to proxy props defined at
    // instantiation here.yjt136202

    // 将vm上对应的属性值代理至vm._props上
    // 使用Vue.extend()创建的子类，其传入的props选项在创建子类时已经被代理到构造函数的原型的_props上
    // 这样可以避免每次实例化子类时都要创建代理，所以这里只需要代理实例化时的props属性就可以了
    // 当实例访问对应的props时，会自动从_props上获取，找不到则从原型链上的_props上获取
    // 由于使用Vue.extend()创建的静态的props属性已经在创建阶段代理至组件的原型
    if (!(key in vm)) {
      proxy(vm, `_props`, key)
    }
  }
  toggleObserving(true)
}


// data初始化
// 1. 获取data并存储在vm._data上
// 2. 方法名、属性名冲突检测
// 3. 在实例上的data属性的访问代理到vm._data上
// 4. 观察data，将data转换为响应式对象
function initData (vm: Component) {
  let data = vm.$options.data
  // data可以为对象也可以为返回对象的函数
  // 获取后不是对象将被置为空对象
  // 存在在vm._data上
  data = vm._data = typeof data === 'function'
    ? getData(data, vm)
    : data || {}
  if (!isPlainObject(data)) {
    data = {}
    process.env.NODE_ENV !== 'production' && warn(
      'data functions should return an object:\n' +
      'https://vuejs.org/v2/guide/components.html#data-Must-Be-a-Function',
      vm
    )
  }
  // proxy data on instance
  // 代理属性及属性名冲突检测
  const keys = Object.keys(data) // 获取所有的key
  const props = vm.$options.props 
  const methods = vm.$options.methods
  let i = keys.length
  while (i--) {
    const key = keys[i]
    // 键名的合法性检测，不能与props，methods
    if (process.env.NODE_ENV !== 'production') {
      if (methods && hasOwn(methods, key)) {
        warn(
          `Method "${key}" has already been defined as a data property.`,
          vm
        )
      }
    }
    if (props && hasOwn(props, key)) {
      process.env.NODE_ENV !== 'production' && warn(
        `The data property "${key}" is already declared as a prop. ` +
        `Use prop default value instead.`,
        vm
      )
    } else if (!isReserved(key)) { // 非_和$开头的属性进行代理
      proxy(vm, `_data`, key) // 将vm实例上对应的属性代理至vm._data
    }
  }
  // observe data
  // 对data进行深度观察
  // 观察后会添加data.__ob__属性
  // 将所有属性转为setter/getter
  observe(data, true /* asRootData */)
}


// 获取data
// data为函数时，传入当前实例执行data，返回值作为data
export function getData (data: Function, vm: Component): any {
  // #7573 disable dep collection when invoking data getters
  /**
   * bug修复的解析
   * bug现象：
   * 当子组件的data写成函数的形式并且函数使用了父组件传递给子组件的props时，如果父组件中传入的props响应式数据
   * 变化时，会触发两次父组件的更新。而且触发两次更新只在数据第一次发生改变时发生，后续就是正常的只触发一次更新
   * 产生bug的原因：
   * 当执行data.call(vm,vm)获取子组件的data时，因为引用了父组件传进来的props数据，会触发其props的getter，造成了
   * props收集依赖。由于数据的初始化的时机是介于beforeCreate和create之间，此时子组件还未进入渲染阶段（即渲染Watcher未生成）
   * 因为渲染Watcher是在挂载时调用mountComponent函数生成的，因此，此时的Dep.target指向的依然是父组件的渲染Watcher。
   * 最终表现就是父组件的数据更新时，正确的触发了一次父组件的渲染Watcher的update，更新子组件的props时，又触发了一次父组件的渲染Watcher的update
   * 在第一次更新以后，后续的依赖收集中，子组件的渲染Watcher已经存在了，所以不会收集到父组件的渲染Watcher。
   * 
   * 这个bug不仅仅存在于此，子组件的beforeCreate，created，beforeMounted这三个生命周期如果用了props的话，都会出现一样的问题，
   * 所以在callHook函数中，也做了一样的Dep.target置空的操作
   * function callHook(vm, hook) {
   *  pushTarget()
   *  ....
   *  popTarget()
   * }
   */
  pushTarget()
  try {
    // data函数是外部定义的，不能保证正确执行，所以需要捕获错误
    return data.call(vm, vm)
  } catch (e) {
    handleError(e, vm, `data()`)
    return {}
  } finally {
    popTarget()
  }
}


// 计算属性的watcher配置，惰性求值的
const computedWatcherOptions = { lazy: true }

// 初始化computed，添加计算属性观察者并将计算属性转为getter/setter
function initComputed (vm: Component, computed: Object) {
  // $flow-disable-line
  const watchers = vm._computedWatchers = Object.create(null) // 创建计算属性的watcher对象
  // computed properties are just getters during SSR
  const isSSR = isServerRendering()
  for (const key in computed) {
    // computed可以是函数，也可以是有getter和setter的对象
    const userDef = computed[key]
    const getter = typeof userDef === 'function' ? userDef : userDef.get
    if (process.env.NODE_ENV !== 'production' && getter == null) {
      warn(
        `Getter is missing for computed property "${key}".`,
        vm
      )
    }


    // 创建计算属性的watcher
    if (!isSSR) {
      // create internal watcher for the computed property.
      watchers[key] = new Watcher(
        vm,
        getter || noop,
        noop,
        computedWatcherOptions // 计算属性的watcher是惰性求值的
      )
    }

    // component-defined computed properties are already defined on the
    // component prototype. We only need to define computed properties defined
    // at instantiation here.
    // 使用Vue.extend创建的子类构造函数传入的computed选项已经定义在了原型上，无需重复定义
    if (!(key in vm)) { 
      // 遍历实例上的计算属性，computed名称不能与data、props、methods已经内置的一些属性同名
      defineComputed(vm, key, userDef)
    } else if (process.env.NODE_ENV !== 'production') {
      if (key in vm.$data) { // 与data的属性同名
        warn(`The computed property "${key}" is already defined in data.`, vm)
      } else if (vm.$options.props && key in vm.$options.props) { // 与props的属性同名
        warn(`The computed property "${key}" is already defined as a prop.`, vm)
      }
    }
  }
}


// 在实例上定义计算属性
// 计算属性会被转为getter/setter
export function defineComputed (
  target: any,
  key: string,
  userDef: Object | Function
) {
  const shouldCache = !isServerRendering() // 非服务端渲染时候才缓存
  if (typeof userDef === 'function') {
    // 定义的属性为函数的话，没有setter
    sharedPropertyDefinition.get = shouldCache
      ? createComputedGetter(key) // 创建具有缓存的作用的计算属性getter方法
      : createGetterInvoker(userDef) // 创建不具有缓存的计算属性getter方法
    sharedPropertyDefinition.set = noop
  } else { 
    // 定义的属性为对象，从中解析出setter和getter
    sharedPropertyDefinition.get = userDef.get
      ? shouldCache && userDef.cache !== false
        ? createComputedGetter(key) // 没有配置禁用缓存且不是服务端渲染则创建具有缓存的计算属性触发器
        : createGetterInvoker(userDef.get) // 创建计算属性的调用者
      : noop
    sharedPropertyDefinition.set = userDef.set || noop
  }

  // 没有显式声明setter的话，计算属性是不能被手动赋值的
  if (process.env.NODE_ENV !== 'production' &&
      sharedPropertyDefinition.set === noop) {
    sharedPropertyDefinition.set = function () {
      warn(
        `Computed property "${key}" was assigned to but it has no setter.`,
        this
      )
    }
  }
  // 在实例上定义计算属性的setter和getter函数
  Object.defineProperty(target, key, sharedPropertyDefinition)
}


// 创建具有缓存作用的计算属性的getter函数
function createComputedGetter (key) {
  return function computedGetter () {
    // 获取对应计算属性的watcher
    const watcher = this._computedWatchers && this._computedWatchers[key]
    if (watcher) {
      // 如果计算属性依赖的数据没有变化，dirty为false，不会再重新计算，得到的是缓存的值
      // 如果依赖的数据变化了dirty又会被置为true，会重新计算
      // 正因如此，计算属性是有缓存作用的
      if (watcher.dirty) {  // 依赖的数据变化了或者是初次获取值
        watcher.evaluate()
      }
      // 这里本质是增加渲染watcher的依赖收集
      // 当进行render的时候会创建一个渲染Watcher，此时Dep.target即为该渲染Watcher
      // render过程中遇到需要依赖的数据，会触发数据的get函数，此时Dep.target不为空就可以进行依赖收集
      // 有一种情况就是：渲染的模板中只依赖的了计算属性，没有依赖data数据，而计算属性又依赖data时，
      // 如 computed: { msg: function() { return this.a + 1}}, <div>{{msg}}</div>
      // 当读取到计算属性时，会触发计算属性的getter，getter执行，会通过watcher.evaluate求值，
      // 此时Dep.target为计算属性watcher，计算属性的watcher会被正常收集到依赖，
      // 收集完执行popTarget()，Dep.target被恢复为渲染Watcher。
      // 如果不进行下方的依赖收集的操作，那么意味着渲染Watcher收集不到a的依赖
      // 下次a更新了，msg会正常更新，但是视图无法更新
      // 这就是为什么这里需要执行以下watcher.depend()
      if (Dep.target) { // 依赖收集
        watcher.depend()
      }
      return watcher.value // 返回计算的值
    }
  }
}


// 服务端渲染的计算属性getter方法
function createGetterInvoker(fn) {
  return function computedGetter () {
    // 假如这里依赖data或者prop，执行时候会触发其get方法，进行依赖收集
    // 这里与createComputedGetter不同，不需要再执行watcher.depend()
    // 因为每一次都会求值，执行属性依赖的getter时，会触发依赖收集，由于此时没有执行watcher.evaluate，
    // 那么Dep.target就不会被设置为计算属性的watcher，也就能够正常的完成渲染watcher的依赖收集
    return fn.call(this, this)
  }
}


// methods初始化，将method的上下文绑定为当前vue实例
function initMethods (vm: Component, methods: Object) {
  const props = vm.$options.props
  for (const key in methods) {
    // 合法性检测
    // 检测函数名是否与props和Vue内置的方法同名已经值类型是否为函数类型
    if (process.env.NODE_ENV !== 'production') {
      if (typeof methods[key] !== 'function') {
        warn(
          `Method "${key}" has type "${typeof methods[key]}" in the component definition. ` +
          `Did you reference the function correctly?`,
          vm
        )
      }
      if (props && hasOwn(props, key)) {
        warn(
          `Method "${key}" has already been defined as a prop.`,
          vm
        )
      }
      if ((key in vm) && isReserved(key)) { // 实例上存在以_开头或者$开头的同名属性
        warn(
          `Method "${key}" conflicts with an existing Vue instance method. ` +
          `Avoid defining component methods that start with _ or $.`
        )
      }
    }
    // 将配置的函数放在vm实例上面，并绑定其this为当前的实例
    // 不是函数类型的配置项将被重置为空函数
    vm[key] = typeof methods[key] !== 'function' ? noop : bind(methods[key], vm)
  }
}


// watch初始化
// watcher是可以为数组的，多个watcher会按顺序被调用
function initWatch (vm: Component, watch: Object) {
  for (const key in watch) {
    const handler = watch[key]
    if (Array.isArray(handler)) { // watcher是数组，遍历后定义
      for (let i = 0; i < handler.length; i++) {
        createWatcher(vm, key, handler[i])
      }
    } else { // 不是数组
      createWatcher(vm, key, handler)
    }
  }
}

// 创建watcher
// watcher可以是一个函数，也可以是一个带有handler属性对象，也可以是methods上的函数名字符串
// 以上会被转化为统一的格式，最终调用实例上的$watch方法创建watcher
function createWatcher (
  vm: Component,
  expOrFn: string | Function,
  handler: any,
  options?: Object
) {
  // handle是对象，则取handler.handle属性作为回调函数
  if (isPlainObject(handler)) { 
    options = handler // 选项重载
    handler = handler.handler
  }
  if (typeof handler === 'string') { // 字符串，则取methods上的方法
    handler = vm[handler]
  }
  return vm.$watch(expOrFn, handler, options)
}


// 与状态相关的一些属性和方法定义
// 添加$data和$props分别代理至_data和_props
// 添加$set、$delete和$watch方法
export function stateMixin (Vue: Class<Component>) {
  // flow somehow has problems with directly declared definition object
  // when using Object.defineProperty, so we have to procedurally build up
  // the object here.
  const dataDef = {}
  dataDef.get = function () { return this._data }
  const propsDef = {}
  propsDef.get = function () { return this._props }
  if (process.env.NODE_ENV !== 'production') {
    dataDef.set = function () { // data根数据不能直接替换
      warn(
        'Avoid replacing instance root $data. ' +
        'Use nested data properties instead.',
        this
      )
    }
    propsDef.set = function () { // props是只读的
      warn(`$props is readonly.`, this)
    }
  }

  // 添加$props和$data
  Object.defineProperty(Vue.prototype, '$data', dataDef)
  Object.defineProperty(Vue.prototype, '$props', propsDef)

  // 添加$set、$delete和$watch方法
  Vue.prototype.$set = set
  Vue.prototype.$delete = del

  // 添加$watch方法，返回一个取消观察的函数
  Vue.prototype.$watch = function (
    expOrFn: string | Function,
    cb: any,
    options?: Object
  ): Function {
    const vm: Component = this
    // cb是对象，则使用crreateWatcher方法创建watcher
    // craeteWatcher会先规范化参数后再调用vm.$watch方法创建watcher
    // 最终等价于vm.$watch(expOrFn, cb.handler, cb)
    if (isPlainObject(cb)) { 
      return createWatcher(vm, expOrFn, cb, options)
    }
    options = options || {}
    options.user = true // 用于标记是用户侧定义的watcher
    const watcher = new Watcher(vm, expOrFn, cb, options) // 创建watcher
    if (options.immediate) { // 如果是立即执行的watcher
      try {
        cb.call(vm, watcher.value) // 立即执行
      } catch (error) {
        handleError(error, vm, `callback for immediate watcher "${watcher.expression}"`)
      }
    }
    // 返回一个卸载watcher的函数
    return function unwatchFn () {
      watcher.teardown()
    }
  }
}
