/* @flow */

import { cached, extend, toObject } from 'shared/util'
// 解析style字符串，转为对象形式
// 如 ”border: 1px solid red; color: red;"转为
// {border: "1px solid red", color: 'red'}
export const parseStyleText = cached(function (cssText) {
  const res = {}
  const listDelimiter = /;(?![^(]*\))/g
  const propertyDelimiter = /:(.+)/
  // 将style拆分成数组后再转成数组
  cssText.split(listDelimiter).forEach(function (item) {
    if (item) {
      const tmp = item.split(propertyDelimiter)
      tmp.length > 1 && (res[tmp[0].trim()] = tmp[1].trim())
    }
  })
  return res
})

// merge static and dynamic style data on the same vnode
// 将静态的style和动态的style合并
function normalizeStyleData(data: VNodeData): ?Object {
  const style = normalizeStyleBinding(data.style)
  // static style is pre-processed into an object during compilation
  // and is always a fresh object, so it's safe to merge into it
  return data.staticStyle
    ? extend(data.staticStyle, style)
    : style
}

// normalize possible array / string values into Object
// 将数组和字符串格式的style转为对象格式
export function normalizeStyleBinding(bindingStyle: any): ?Object {
  if (Array.isArray(bindingStyle)) { // 数组转对象
    return toObject(bindingStyle)
  }
  if (typeof bindingStyle === 'string') { // 字符串转对象
    return parseStyleText(bindingStyle)
  }
  return bindingStyle
}

/**
 * 父子组件的样式合并
 * parent component style should be after child's
 * so that parent component's style could override it
 * 父组件的样式会优先与子组件
 * 如
 * Foo: {template: '<div style="border: 1px solid red;"></div>'}
 * Bar: {template: '<foo style="border: 1px solid yellow;" />'}
 * Baz: {template: '<bar style="border: 1px solid blue "/>}
 * <baz style="border: 1px solid green" />
 * 以上在处理div的元素时，处理的顺序是red->yellow->blue->green
 * 所以最后是最外层的baz样式会覆盖最里层定义的div的样式，结果为：1px solid green
 */
export function getStyle(vnode: VNodeWithData, checkChild: boolean): Object {
  const res = {}
  let styleData
  // 嵌套组件合并子组件的样式
  if (checkChild) {
    let childNode = vnode
    while (childNode.componentInstance) {
      childNode = childNode.componentInstance._vnode
      if (
        childNode && childNode.data &&
        (styleData = normalizeStyleData(childNode.data))
      ) {
        extend(res, styleData)
      }
    }
  }

  // 合并静态和动态的style
  if ((styleData = normalizeStyleData(vnode.data))) {
    extend(res, styleData)
  }

  // 合并嵌套的祖先组件的style
  let parentNode = vnode
  while ((parentNode = parentNode.parent)) {
    if (parentNode.data && (styleData = normalizeStyleData(parentNode.data))) {
      extend(res, styleData)
    }
  }
  return res
}
