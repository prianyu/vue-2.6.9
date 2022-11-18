/* @flow */

import { getStyle, normalizeStyleBinding } from 'web/util/style'
import { cached, camelize, extend, isDef, isUndef, hyphenate } from 'shared/util'

const cssVarRE = /^--/
const importantRE = /\s*!important$/
// 设置style属性
const setProp = (el, name, val) => {
  /* istanbul ignore if */
  if (cssVarRE.test(name)) { // css变量设置
    el.style.setProperty(name, val)
  } else if (importantRE.test(val)) { // 含!important的样式设置
    el.style.setProperty(hyphenate(name), val.replace(importantRE, ''), 'important')
  } else {
    const normalizedName = normalize(name) // 属性名规范化
    if (Array.isArray(val)) {
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
const normalize = cached(function (prop) {
  emptyStyle = emptyStyle || document.createElement('div').style
  prop = camelize(prop)
  if (prop !== 'filter' && (prop in emptyStyle)) {
    return prop
  }
  const capName = prop.charAt(0).toUpperCase() + prop.slice(1)
  for (let i = 0; i < vendorNames.length; i++) {
    const name = vendorNames[i] + capName
    if (name in emptyStyle) {
      return name
    }
  }
})

function updateStyle (oldVnode: VNodeWithData, vnode: VNodeWithData) {
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

  // 获取新的样式
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
