/* @flow */

import config from 'core/config'
import { warn, cached } from 'core/util/index'
import { mark, measure } from 'core/util/perf'

import Vue from './runtime/index'
import { query } from './util/index'
import { compileToFunctions } from './compiler/index'
import { shouldDecodeNewlines, shouldDecodeNewlinesForHref } from './util/compat'

const idToTemplate = cached(id => {
  const el = query(id)
  return el && el.innerHTML
})

// 重写$mount方法
// 传入el，最终el会被作为挂载元素，自动执行挂载，因此获取的是outerHTML
// 传入的template，最终需要提供一个挂载节点（手动挂载或者传入el自动挂载），因此，其获取的是innerHTML
const mount = Vue.prototype.$mount
Vue.prototype.$mount = function (
  el?: string | Element,
  hydrating?: boolean
): Component {
  
  el = el && query(el) // 获取元素

  /* istanbul ignore if */
  // 不能挂在在body或者html标签下
  if (el === document.body || el === document.documentElement) {
    process.env.NODE_ENV !== 'production' && warn(
      `Do not mount Vue to <html> or <body> - mount to normal elements instead.`
    )
    return this
  }

  const options = this.$options
  // 没有传入render函数，则会将template或者el转为render函数
  if (!options.render) {
    let template = options.template
    if (template) { 
      // template只能是字符串或者DOM类型
      // 传入template且以#开头则会后去对应的id的元素的innerHTML
      // 传入的template为dom节点则直接获取其innerHTML
      if (typeof template === 'string') { 
        if (template.charAt(0) === '#') {
          template = idToTemplate(template)
          /* istanbul ignore if */
          if (process.env.NODE_ENV !== 'production' && !template) {
            warn(
              `Template element not found or is empty: ${options.template}`,
              this
            )
          }
        }
      } else if (template.nodeType) {
        template = template.innerHTML
      } else {
        if (process.env.NODE_ENV !== 'production') {
          warn('invalid template option:' + template, this)
        }
        return this
      }
    } else if (el) { 
      // 没有传入template但传入el则将el的outerHTML赋值给template
      template = getOuterHTML(el)
    }
    // 经过以上转化后template应该为一串html字符串
    if (template) {
      // 将template编译为render函数
      /* istanbul ignore if */
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
        mark('compile')
      }

      // 将template模板编译后会得到render函数和包含静态render的staticRenderFns数组，分别存在vm.$options上面
      const { render, staticRenderFns } = compileToFunctions(template, {
        outputSourceRange: process.env.NODE_ENV !== 'production', // 用于输出错误时输出代码所处的位置的
        shouldDecodeNewlines,  // 是否对属性值的换行符做解码处理
        shouldDecodeNewlinesForHref, // 是否对a标签的href属性值中的换行符做解码处理
        delimiters: options.delimiters, // 插值表达式定界符
        comments: options.comments // 是否保留注释
      }, this)
      options.render = render // 生成的render函数
      options.staticRenderFns = staticRenderFns // 生成静态节点的render函数组成的数组 

      /* istanbul ignore if */
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
        mark('compile end')
        measure(`vue ${this._name} compile`, 'compile', 'compile end')
      }
    }
  }

  // 调用原有的原型上的$mount方法
  return mount.call(this, el, hydrating)
}

/**
 * Get outerHTML of elements, taking care
 * of SVG elements in IE as well.
 */
function getOuterHTML (el: Element): string {
  if (el.outerHTML) {
    return el.outerHTML
  } else {
    const container = document.createElement('div')
    container.appendChild(el.cloneNode(true))
    return container.innerHTML
  }
}

// 增加compile静态方法
Vue.compile = compileToFunctions

export default Vue
