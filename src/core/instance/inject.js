/* @flow */

import { hasOwn } from 'shared/util'
import { warn, hasSymbol } from '../util/index'
import { defineReactive, toggleObserving } from '../observer/index'


// provide初始化
// 提供的provide可以是一个函数，也可以是一个数据
// 最后的结果会存在实例的_provided属性上
// 拥有inject的子组件将会从_provided中获取匹配数据
export function initProvide (vm: Component) {
  const provide = vm.$options.provide
  if (provide) {
    vm._provided = typeof provide === 'function'
      ? provide.call(vm)
      : provide
  }
}


// inject初始化
export function initInjections (vm: Component) {
  // 根据inejct获取provide数据
  const result = resolveInject(vm.$options.inject, vm)
  if (result) {
    // 临时关闭数据观测，减少不必要的开销
    // 1. 很多情况下，依赖注入是配置性的，在整个应用周期中可能不会变化
    // 2. 依赖注入实际是一种“逃生舱”机制，用于解决部分数据流的问题
    // 3. Vue父子组件的数据流是单向的
    toggleObserving(false)
    // 根据得到的provide数据往vm实例上添加响应式的数据
    // inject从provide获取到的数据虽然是响应式的，但是不应该在子组件上被直接修改
    // 因为一旦提供provide的组件重新渲染了，所做的修改就会被覆盖掉
    Object.keys(result).forEach(key => {
      /* istanbul ignore else */
      if (process.env.NODE_ENV !== 'production') {
        defineReactive(vm, key, result[key], () => {
          warn(
            `Avoid mutating an injected value directly since the changes will be ` +
            `overwritten whenever the provided component re-renders. ` +
            `injection being mutated: "${key}"`,
            vm
          )
        })
      } else {  
        defineReactive(vm, key, result[key])
      }
    })
    toggleObserving(true)
  }
}

// 根据inject解析并注入provide
// 会不断从祖先元素中获取
// 如果获取不到会从default中获取
export function resolveInject (inject: any, vm: Component): ?Object {
  if (inject) {
    // inject is :any because flow is not smart enough to figure out cached
    const result = Object.create(null)
    // 获取所有inject的key
    const keys = hasSymbol
      ? Reflect.ownKeys(inject)
      : Object.keys(inject)

    // 遍历获取到的key
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      // #6574 in case the inject object is observed...
      if (key === '__ob__') continue
      const provideKey = inject[key].from
      let source = vm
      while (source) {
        // 不断往祖先元素找到提供的对应的provide，找到了即赋值并停止查找
        if (source._provided && hasOwn(source._provided, provideKey)) {
          result[key] = source._provided[provideKey]
          break
        }
        source = source.$parent
      }
      // 走到这里说明对于所遍历到的inject key，没有找到对应的provide
      if (!source) {
        if ('default' in inject[key]) { // 提供了默认值则使用默认值作为provide
          // 默认值可以提供数据也可以提供返回数据的函数
          const provideDefault = inject[key].default
          result[key] = typeof provideDefault === 'function'
            ? provideDefault.call(vm)
            : provideDefault
        } else if (process.env.NODE_ENV !== 'production') { // 没有默认值则给出警告
          warn(`Injection "${key}" not found`, vm)
        }
      }
    }
    return result
  }
}
