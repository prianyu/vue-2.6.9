/* @flow */

import { isDef, isObject } from 'shared/util'


// 生成vnode节点的class
// 会合并组件的class，会以当前节点所在的位置，分别往外和往内合并class
// 最终将静态的class和动态的class拼接成字符串
export function genClassForVnode (vnode: VNodeWithData): string {
  let data = vnode.data
  let parentNode = vnode
  let childNode = vnode
  while (isDef(childNode.componentInstance)) { // 从外往里找，拼接class
    childNode = childNode.componentInstance._vnode
    if (childNode && childNode.data) {
      data = mergeClassData(childNode.data, data)
    }
  }
  while (isDef(parentNode = parentNode.parent)) { // 从里往外找，拼接class
    if (parentNode && parentNode.data) {
      data = mergeClassData(data, parentNode.data)
    }
  }
  return renderClass(data.staticClass, data.class)
}


// 分别合并staticClass和class
function mergeClassData (child: VNodeData, parent: VNodeData): {
  staticClass: string,
  class: any
} {
  return {
    staticClass: concat(child.staticClass, parent.staticClass), // 拼接staticClass
    class: isDef(child.class)
      ? [child.class, parent.class] // 动态的class有多个时先转为数组格式，后续会转为字符串
      : parent.class
  }
}

// 将staticClass和class合并
export function renderClass (
  staticClass: ?string,
  dynamicClass: any
): string {
  if (isDef(staticClass) || isDef(dynamicClass)) {
    return concat(staticClass, stringifyClass(dynamicClass))
  }
  /* istanbul ignore next */
  return ''
}

// 拼接两个class
export function concat (a: ?string, b: ?string): string {
  return a ? b ? (a + ' ' + b) : a : (b || '')
}

// 格式化class，将动态的class转化为字符串
export function stringifyClass (value: any): string {
  if (Array.isArray(value)) { // 数组格式的
    return stringifyArray(value)
  }
  if (isObject(value)) { // 对象格式的
    return stringifyObject(value)
  }
  if (typeof value === 'string') { // 字符串格式
    return value
  }
  /* istanbul ignore next */
  return ''
}

// 将数组格式的class转为字符串 会递归调用stringifyClass
function stringifyArray (value: Array<any>): string {
  let res = ''
  let stringified
  for (let i = 0, l = value.length; i < l; i++) {
    if (isDef(stringified = stringifyClass(value[i])) && stringified !== '') {
      if (res) res += ' '
      res += stringified
    }
  }
  return res
}

// 将对象格式的class转为字符串
function stringifyObject (value: Object): string {
  let res = ''
  for (const key in value) {
    if (value[key]) { // 如果值为真就拼接
      if (res) res += ' '
      res += key
    }
  }
  return res
}
