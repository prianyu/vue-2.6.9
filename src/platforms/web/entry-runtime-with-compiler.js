/* @flow */

import config from 'core/config'
import { warn, cached } from 'core/util/index'
import { mark, measure } from 'core/util/perf'

import Vue from './runtime/index'
import { query } from './util/index'
import { compileToFunctions } from './compiler/index'
import { shouldDecodeNewlines, shouldDecodeNewlinesForHref } from './util/compat'

// 根据id获取元素的innerHTML
const idToTemplate = cached(id => {
  const el = query(id) // 获取元素
  return el && el.innerHTML // 获取innerHTML
})

// 重写Vue原型上的$mount方法，用于挂载元素
// 挂载方法会优先使用render函数，其次是template，最后才是el
// 如果没有render函数，则会将template转为render函数
// 如果template也没有，则会通过el获取template再转为render函数
// 当使用template时，如果template传入的是id选择器或者DOM节点，使用的是该节点的innerHTML作为template，
// 因为此时节点被当作是存放模板的元素，可能是一个不可渲染的元素，如<script type="x-template" id="template"></script>
// 另外使用template后应用需要手动挂载到指定的el上
// 而当使用的是el，获取的是outerHTML，这是因为el本身在挂在时会被作为挂在点，在实例化后也会进行自动执行挂载
const mount = Vue.prototype.$mount
Vue.prototype.$mount = function (
  el?: string | Element, // 挂载元素
  hydrating?: boolean // 是否为服务端渲染
): Component {
  // debugger
  el = el && query(el) // 获取元素

  /* istanbul ignore if */
  // 不能挂载在body或者html标签下
  if (el === document.body || el === document.documentElement) {
    process.env.NODE_ENV !== 'production' && warn(
      `Do not mount Vue to <html> or <body> - mount to normal elements instead.`
    )
    return this
  }

  const options = this.$options // 配置选项
  // 没有传入render函数，则会将template或者el转为render函数
  if (!options.render) {
    let template = options.template
    if (template) {  // 传入template
      if (typeof template === 'string') {
        // 当template是以#开头时，被用作选择符，提取其innerHTML作为模板
        // 通常这么使用<script type="x-template" id="app"></script>，所以实际的模板内容是innerHTML
        if (template.charAt(0) === '#') {
          template = idToTemplate(template)
          /* istanbul ignore if */
          if (process.env.NODE_ENV !== 'production' && !template) { // 没找到元素或者元素为空
            warn(
              `Template element not found or is empty: ${options.template}`,
              this
            )
          }
        }
      } else if (template.nodeType) {
        // template为DOM节点，认为是一个存放模板的元素，也是获取其innerHTML
        template = template.innerHTML
      } else { // 不是DOM也不是字符串
        if (process.env.NODE_ENV !== 'production') {
          warn('invalid template option:' + template, this)
        }
        return this
      }
    } else if (el) {
      // 没有传入template但是传入了el
      template = getOuterHTML(el) // 将template设置为元素的outerHTML
    }
    // 经过以上转化后template应该为一串html字符串或者空字符串
    // 如果不为空将template编译为render函数
    if (template) {
      /* istanbul ignore if */
      // 开始编译的性能统计开始标识
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
      // 模板编译结束的性能统计结束标识
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
 * 获取元素的outerHTML
 * 如果元素没有outerHTML方法，则创建一个div元素将元素作为其子元素
 * 并返回div的innerHTML
 * Get outerHTML of elements, taking care
 * of SVG elements in IE as well.
 */
function getOuterHTML(el: Element): string {
  if (el.outerHTML) {
    return el.outerHTML
  } else {
    const container = document.createElement('div')
    container.appendChild(el.cloneNode(true))
    return container.innerHTML
  }
}

// 在Vue构造函数上增加compile静态方法
Vue.compile = compileToFunctions

export default Vue
