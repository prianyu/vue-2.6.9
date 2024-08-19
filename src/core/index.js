import Vue from './instance/index'
import { initGlobalAPI } from './global-api/index'
import { isServerRendering } from 'core/util/env'
import { FunctionalRenderContext } from 'core/vdom/create-functional-component'


/**
* 初始化全局的API
· 0. Vue.config全局配置的定义
  1. delete,set,nextTick,observable等静态方法
  2. util静态属性（含warn,extend,mergeOptions,defineReactive等方法）
  3. options静态属性，{directives,options,components,_base: Vue}，components含内置组件keep-alive
  4. initUse(Vue)：新增use方法，用于插件安装
  5. initMixin(Vue)：新增mixin方法
  6. initExtend(Vue)：新增extend方法
  7. initAssetRegisters(Vue)：新增component,directive,filter等方法
*/
initGlobalAPI(Vue)


/**
 * 添加一些特定属性，如SSR相关的属性
 */

// 检测当前是否处于服务端渲染的只读属性
Object.defineProperty(Vue.prototype, '$isServer', {
  get: isServerRendering
})

// 组件的SSR上下文对象，在服务端渲染时，会传入到render函数中
// 这为数据预取、设置自定义头部、动态更新元信息等功能提供了支持
Object.defineProperty(Vue.prototype, '$ssrContext', {
  get () {
    /* istanbul ignore next */
    return this.$vnode && this.$vnode.ssrContext
  }
})

// expose FunctionalRenderContext for ssr runtime helper installation
// 函数式组件的上下文对象创建方法
// 用于在渲染函数式组件时，提供必要的上下文信息，如props、children、slots等
Object.defineProperty(Vue, 'FunctionalRenderContext', {
  value: FunctionalRenderContext
})

Vue.version = '__VERSION__' // 版本号，构建过程中会被@rollup/plugin-replace插件替换为版本号

export default Vue
