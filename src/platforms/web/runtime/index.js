/* @flow */

import Vue from 'core/index'
import config from 'core/config'
import { extend, noop } from 'shared/util'
import { mountComponent } from 'core/instance/lifecycle'
import { devtools, inBrowser } from 'core/util/index'

import {
  query,
  mustUseProp,
  isReservedTag,
  isReservedAttr,
  getTagNamespace,
  isUnknownElement
} from 'web/util/index'

import { patch } from './patch'
import platformDirectives from './directives/index'
import platformComponents from './components/index'

// install platform specific utils
Vue.config.mustUseProp = mustUseProp // 检测原生dom属性的方法，如option标签的selected属性、input等标签的value属性
Vue.config.isReservedTag = isReservedTag // 判断是否为保留标签的方法（原生的html和svg相关的标签）
Vue.config.isReservedAttr = isReservedAttr // 判断是否为保留属性的方法（style，class）
Vue.config.getTagNamespace = getTagNamespace // 获取命名空间的方法（svg和mathML相关标签，分别返回svg和math)
Vue.config.isUnknownElement = isUnknownElement // 判断是否为无效的html标签，非浏览器下永远返回true

// install platform runtime directives & components
extend(Vue.options.directives, platformDirectives) // 增加v-model、v-show指令
extend(Vue.options.components, platformComponents) // 添加transition、transition-group组件

// 浏览器环境下添加__patch__方法
Vue.prototype.__patch__ = inBrowser ? patch : noop

// 与端（客户端、服务端）无关的$mount方法
// 该方法无compiler，在有compiler的环境下，会被重写
Vue.prototype.$mount = function (
  el?: string | Element, // 挂载元素
  hydrating?: boolean // 是否为服务端渲染
): Component {
  el = el && inBrowser ? query(el) : undefined // 在浏览器环境下获取元素
  return mountComponent(this, el, hydrating) // 执行挂载
}

// devtools以及生产环境部署相关的提示
// devtools global hook
/* istanbul ignore next */
if (inBrowser) {
  setTimeout(() => {
    if (config.devtools) {
      if (devtools) { // 安装了devtools，则触发devtools的init事件
        devtools.emit('init', Vue)
      } else if ( 
        process.env.NODE_ENV !== 'production' &&
        process.env.NODE_ENV !== 'test'
      ) { // 没有安装devtools，则在开发环境下给出安装devtool的提醒
        console[console.info ? 'info' : 'log'](
          'Download the Vue Devtools extension for a better development experience:\n' +
          'https://github.com/vuejs/vue-devtools'
        )
      }
    }
    if (process.env.NODE_ENV !== 'production' && // 不是生产环境
      process.env.NODE_ENV !== 'test' && // 不是测试环境
      config.productionTip !== false && // 没有关闭生产环境提示
      typeof console !== 'undefined' // 存在console
    ) {
      console[console.info ? 'info' : 'log'](
        `You are running Vue in development mode.\n` +
        `Make sure to turn on production mode when deploying for production.\n` +
        `See more tips at https://vuejs.org/guide/deployment.html`
      )
    }
  }, 0)
}

export default Vue
