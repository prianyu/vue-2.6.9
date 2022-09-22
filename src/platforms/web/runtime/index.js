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
Vue.config.mustUseProp = mustUseProp // 原生dom属性，如selected等
Vue.config.isReservedTag = isReservedTag // 判断是否为保留标签的方法（原生html和svg标签）
Vue.config.isReservedAttr = isReservedAttr // 判断是否为保留属性的方法（style，class）
Vue.config.getTagNamespace = getTagNamespace // 获取命名空间的方法（svg和mathML，分别返回svg和math)
Vue.config.isUnknownElement = isUnknownElement // 判断是否为无效的html标签，非浏览器下永远返回true

// install platform runtime directives & components
extend(Vue.options.directives, platformDirectives) // 增加v-model、v-show指令
extend(Vue.options.components, platformComponents) // 添加transition、transition-group组件

// 浏览器环境下添加__patch__方法
Vue.prototype.__patch__ = inBrowser ? patch : noop

// 与平台无关的$mount方法
Vue.prototype.$mount = function (
  el?: string | Element,
  hydrating?: boolean
): Component {
  el = el && inBrowser ? query(el) : undefined
  return mountComponent(this, el, hydrating)
}

// devtools global hook
/* istanbul ignore next */
if (inBrowser) {
  setTimeout(() => {
    if (config.devtools) {
      if (devtools) {
        devtools.emit('init', Vue)
      } else if (
        process.env.NODE_ENV !== 'production' &&
        process.env.NODE_ENV !== 'test'
      ) {
        console[console.info ? 'info' : 'log'](
          'Download the Vue Devtools extension for a better development experience:\n' +
          'https://github.com/vuejs/vue-devtools'
        )
      }
    }
    if (process.env.NODE_ENV !== 'production' &&
      process.env.NODE_ENV !== 'test' &&
      config.productionTip !== false &&
      typeof console !== 'undefined'
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
