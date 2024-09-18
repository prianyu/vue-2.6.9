/* @flow */

import { getStyle, normalizeStyleBinding } from 'web/util/style'
import { cached, camelize, extend, isDef, isUndef, hyphenate } from 'shared/util'
// style属性处理
//----------------create/update钩子----------
// 1. 规范化动态style
// 2. 将静态是style和动态的style合并
// 3. 合并父子组件（嵌套组件）的样式
// 4. 根据新的style结果删除旧的样式和设置新的样式

const cssVarRE = /^--/ // CSS变量名前缀
const importantRE = /\s*!important$/ // !important样式后缀
// 设置style属性
// 处理css变量
// 处理浏览器属性前缀
// 处理!important的样式声明
const setProp = (el, name, val) => {
  /* istanbul ignore if */
  if (cssVarRE.test(name)) { // css变量设置
    el.style.setProperty(name, val)
  } else if (importantRE.test(val)) { // 含!important的样式设置
    el.style.setProperty(hyphenate(name), val.replace(importantRE, ''), 'important')
  } else {
    const normalizedName = normalize(name) // 属性名规范化，浏览器CSS属性兼容给处理
    if (Array.isArray(val)) { // autoprefixer的样式数组支持
      // Support values array created by autoprefixer, e.g.
      // {display: ["-webkit-box", "-ms-flexbox", "flex"]}
      // Set them one by one, and the browser will only set those it can recognize
      // 具有多个浏览器前缀的样式，一个一个设置
      for (let i = 0, len = val.length; i < len; i++) {
        el.style[normalizedName] = val[i]
      }
    } else {
      el.style[normalizedName] = val
    }
  }
}

// 浏览器前缀
const vendorNames = ['Webkit', 'Moz', 'ms']

let emptyStyle
// 将CSS属性名规范化
// 返回浏览器支持的属性名
const normalize = cached(function (prop) {
  emptyStyle = emptyStyle || document.createElement('div').style // 创建样式对象
  prop = camelize(prop) // 将样式转为驼峰命名
  // 如果样式中存在该属性则说明当前浏览器支持该属性名，不处理
  if (prop !== 'filter' && (prop in emptyStyle)) {
    return prop
  }
  // 走到这里说明浏览器不支持当前CSS属性，则拼接浏览器前缀后再判断
  const capName = prop.charAt(0).toUpperCase() + prop.slice(1) // 转为大驼峰命名用于拼接浏览器前缀
  // 遍历浏览器前缀，判断是否支持，如果支持则返回
  for (let i = 0; i < vendorNames.length; i++) {
    const name = vendorNames[i] + capName
    if (name in emptyStyle) {
      return name
    }
  }
})

// 1. 合并嵌套组件中父子组件的样式
// 2. 将不存在于新 样式中的旧样式置空
// 3. 遍历新的样式修改或设置样式到DOM
function updateStyle(oldVnode: VNodeWithData, vnode: VNodeWithData) {
  const data = vnode.data
  const oldData = oldVnode.data

  // 新老节点均没有style则不处理
  if (isUndef(data.staticStyle) && isUndef(data.style) &&
    isUndef(oldData.staticStyle) && isUndef(oldData.style)
  ) {
    return
  }

  let cur, name
  const el: any = vnode.elm
  const oldStaticStyle: any = oldData.staticStyle // 老节点的静态style
  const oldStyleBinding: any = oldData.normalizedStyle || oldData.style || {} // 老节点的格式化后的动态style

  // if static style exists, stylebinding already merged into it when doing normalizeStyleData
  const oldStyle = oldStaticStyle || oldStyleBinding

  // 将style统一转为对象的格式
  const style = normalizeStyleBinding(vnode.data.style) || {}

  // store normalized style under a different key for next diff
  // make sure to clone it if it's reactive, since the user likely wants
  // to mutate it.
  // 保存格式化后的style，方便下一次比对
  // 如果具有观察者，需要拷贝后再存储
  vnode.data.normalizedStyle = isDef(style.__ob__)
    ? extend({}, style)
    : style

  // 获取新的样式，合并父子组件的样式
  const newStyle = getStyle(vnode, true)

  // 遍历旧的样式，对于不再需要的样式设置为空
  for (name in oldStyle) {
    if (isUndef(newStyle[name])) {
      setProp(el, name, '')
    }
  }
  // 遍历新的样式，添加或者修改样式
  for (name in newStyle) {
    cur = newStyle[name]
    if (cur !== oldStyle[name]) {
      // ie9 setting to null has no effect, must use empty string
      setProp(el, name, cur == null ? '' : cur)
    }
  }
}

export default {
  create: updateStyle,
  update: updateStyle
}
