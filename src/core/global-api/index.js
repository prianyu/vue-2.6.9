/* @flow */

import config from '../config'
import { initUse } from './use'
import { initMixin } from './mixin'
import { initExtend } from './extend'
import { initAssetRegisters } from './assets'
import { set, del } from '../observer/index'
import { ASSET_TYPES } from 'shared/constants'
import builtInComponents from '../components/index'
import { observe } from 'core/observer/index'

import {
  warn,
  extend,
  nextTick,
  mergeOptions,
  defineReactive
} from '../util/index'

// 初始化全局API的函数
export function initGlobalAPI (Vue: GlobalAPI) {
  // Vue.config全局配置
  // Vue.config是不允许被整体赋值的，只能修改内部的属性
  const configDef = {}
  configDef.get = () => config
  if (process.env.NODE_ENV !== 'production') {
    configDef.set = () => {
      warn(
        'Do not replace the Vue.config object, set individual fields instead.'
      )
    }
  }
  Object.defineProperty(Vue, 'config', configDef)

  // exposed util methods.
  // NOTE: these are not considered part of the public API - avoid relying on
  // them unless you are aware of the risk.
  // Vue向外保留的工具函数，这些函数可能在后续的版本会移除，所以使用时应该注意风险
  Vue.util = {
    warn,
    extend,
    mergeOptions,
    defineReactive
  }

  // 全局的API
  Vue.set = set
  Vue.delete = del
  Vue.nextTick = nextTick

  // 2.6 explicit observable API
  // 响应式数据转化的API
  Vue.observable = (object) => {
    observe(obj)
    return obj
  }

  // 常见filters,directives,components，用于存放对应的资源类型定义
  Vue.options = Object.create(null)
  ASSET_TYPES.forEach(type => {
    Vue.options[type + 's'] = Object.create(null)
  })

  // this is used to identify the "base" constructor to extend all plain-object
  // components with in Weex's multi-instance scenarios.
  // 用于标识在Weex多实例场景中扩展普通对象组件的基本构造函数
  // 也会被用于子类构造函数的创建，在子类构造函数中，会获取到_base进行实例化
  // 该标识还被用于在选项合并（mergeOptions）阶段判断选项是否做过合并，因为选项合并时会将父类和子类的选项
  // 进行合并，合并后的新对象就会有_base属性，反之，没有_base属性，则说明没有做过合并
  Vue.options._base = Vue

  // keepAlive组件
  extend(Vue.options.components, builtInComponents)

  initUse(Vue) // 定义Vue.use
  initMixin(Vue) // 定义Vue.mixin
  initExtend(Vue) // 定义Vue.extend
  initAssetRegisters(Vue) // 定义Vue.directive, Vue.component, Vue.filter
}



