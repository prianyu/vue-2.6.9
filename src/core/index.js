import Vue from './instance/index'
import { initGlobalAPI } from './global-api/index'
import { isServerRendering } from 'core/util/env'
import { FunctionalRenderContext } from 'core/vdom/create-functional-component'


/**
* 初始化全局的API
  1. delete,set,nextTick,observable等静态方法
  2. util静态属性（含warn,extend,mergeOptions,defineReactive等方法）
  3. options静态属性，{directives,options,components,_base: Vue}，components含内置组件keep-alive
  4. initUse(Vue)：新增use方法，用于插件安装
  5. initMixin(Vue)：新增mixin方法
  6. initExtend(Vue)：新增extend方法
  7. initAssetRegisters(Vue)：新增component,directive,filter等方法
*/
initGlobalAPI(Vue)

Object.defineProperty(Vue.prototype, '$isServer', {
  get: isServerRendering
})

Object.defineProperty(Vue.prototype, '$ssrContext', {
  get () {
    /* istanbul ignore next */
    return this.$vnode && this.$vnode.ssrContext
  }
})

// expose FunctionalRenderContext for ssr runtime helper installation
Object.defineProperty(Vue, 'FunctionalRenderContext', {
  value: FunctionalRenderContext
})

Vue.version = '__VERSION__'

export default Vue
