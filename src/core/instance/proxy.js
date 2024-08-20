/* not type checking this file because flow doesn't play well with Proxy */

import config from 'core/config'
import { warn, makeMap, isNative } from '../util/index'

// 开发环境下的Vue实例代理，在渲染阶段会使用Vue实例作为上下文进行渲染
// 开发环境下，为Vue实例增强一些功能，可以通过代理捕获和处理渲染期间的一些错误，提供更好的调试支持
// 通过集中式的管理渲染过程中的额外的处理逻辑，更加便于维护和扩展
let initProxy

// 只在非生产环境（开发、测试）下定义initProxy
if (process.env.NODE_ENV !== 'production') {
  // 定义允许使用的全局变量
  const allowedGlobals = makeMap(
    'Infinity,undefined,NaN,isFinite,isNaN,' +
    'parseFloat,parseInt,decodeURI,decodeURIComponent,encodeURI,encodeURIComponent,' +
    'Math,Number,Date,Array,Object,Boolean,String,RegExp,Map,Set,JSON,Intl,' +
    'require' // for Webpack/Browserify
  )

  // 渲染时用到了不存在的属性或者方法的提醒
  const warnNonPresent = (target, key) => {
    warn(
      `Property or method "${key}" is not defined on the instance but ` +
      'referenced during render. Make sure that this property is reactive, ' +
      'either in the data option, or for class-based components, by ' +
      'initializing the property. ' +
      'See: https://vuejs.org/v2/guide/reactivity.html#Declaring-Reactive-Properties.',
      target
    )
  }

  // 保留前缀的警告，当属性使用$或者_开头时给出警告
  // Vue内部的属性和方法都是使用_和$开头的，为了避免定义的属性和方法跟这些内部的属性方法产生混淆和冲突
  // 这些属性和方法在实例化时不会被代理到vm实例上
  // 因此无法使用vm[key]的方式访问，但是可以使用vm.$data[key]访问
  // 如：
  // var vm = new Vue({data: {_a: 1}})
  // vm._a // undefined
  // vm.$data._a = 1
  const warnReservedPrefix = (target, key) => {
    warn(
      `Property "${key}" must be accessed with "$data.${key}" because ` +
      'properties starting with "$" or "_" are not proxied in the Vue instance to ' +
      'prevent conflicts with Vue internals' +
      'See: https://vuejs.org/v2/api/#data',
      target
    )
  }

  // 是否支持Proxy
  const hasProxy =
    typeof Proxy !== 'undefined' && isNative(Proxy)

  // 如果支持Proxy，则代理config.keyCodes的设置
  // 对于内置的修饰符不允许修改
  if (hasProxy) {
    const isBuiltInModifier = makeMap('stop,prevent,self,ctrl,shift,alt,meta,exact') // 内置的修饰符
    config.keyCodes = new Proxy(config.keyCodes, {
      set (target, key, value) {
        if (isBuiltInModifier(key)) {
          warn(`Avoid overwriting built-in modifier in config.keyCodes: .${key}`)
          return false
        } else {
          target[key] = value
          return true
        }
      }
    })
  }

  // in操作符拦截器
  // 拦截in检查、with检查、Reflect.has、继承属性查询等
  const hasHandler = {
    has (target, key) {
      const has = key in target // 属性是否在target中
      // 允许访问：指定的全局变量以及_开头且不存在于$data上的属性
      const isAllowed = allowedGlobals(key) ||
        (typeof key === 'string' && key.charAt(0) === '_' && !(key in target.$data))

      // target上没有该属性、不是指定全局变量
      // 以_开头且在$data上、不以_开头且不在$data上的属性
      if (!has && !isAllowed) {
        if (key in target.$data) warnReservedPrefix(target, key) // 以$开头、以_开头且存在于$data上的属性
        // 属性没有定义
        else warnNonPresent(target, key)
      }
      return has || !isAllowed
    }
  }

  // 属性读取操作拦截器
  // 如果实例上有对于的属性则返回该属性
  // 如果不存在该属性，但是属性在$data中存在，则给出属性以_和$开头的提醒，否则给出属性不存在的提醒
  const getHandler = {
    get (target, key) {
      if (typeof key === 'string' && !(key in target)) {
        if (key in target.$data) warnReservedPrefix(target, key)
        else warnNonPresent(target, key)
      }
      return target[key]
    }
  }

  // 定义渲染函数的作用域代理vm._renderProxy
  initProxy = function initProxy (vm) {
    if (hasProxy) { // 支持Proxy
      // 根据_withStripped属性来决定使用哪一个代理处理程序
      // _withStripped属性是vue-loader将vue单文件组件模板转为render函数后默认添加的一个属性
      // 此时template被编译成了不使用with语句包裹的遵循严格模式的Javascript代码
      // 在不使用with语句包裹时，访问变量都是通过属性访问的的(this.name，this['name'])，因此不会触发has拦截
      // 而如果不是经过vue-loader编译的模板，会被转为使用with语句包裹的代码（/src/compiler/codegen/index.js），
      // 因此会触发has拦截
      // 对于手写的render函数，没有经过compiler转换也没有_withStripped，所以其会使用has拦截器，
      // 因此单纯的访问不合法的属性不会触发警告，如果要触发警告需要手动将_withStripped设置为true
      // determine which proxy handler to use
      const options = vm.$options
      const handlers = options.render && options.render._withStripped
        ? getHandler
        : hasHandler
      vm._renderProxy = new Proxy(vm, handlers)
    } else { // 不支持Proxy则直接返回vm
      vm._renderProxy = vm
    }
  }
}

export { initProxy }

