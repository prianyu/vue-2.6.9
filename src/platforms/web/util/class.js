/* @flow */

import { isDef, isObject } from 'shared/util'


// 生成vnode节点的class
// 会合并组件的class，会以当前节点所在的位置，分别往外和往内合并class
// 最终将静态的class和动态的class拼接成字符串
export function genClassForVnode (vnode: VNodeWithData): string {
  let data = vnode.data 
  let parentNode = vnode
  let childNode = vnode
  // 从外往里找，查找子孙组件的class，合并拼接class
  //  以
  // BaseButton: { template: '<div class="base-button">BaseButton</div>' }
  // Button: { template: '<BaseButton  class="button"/>' }
  // Parent: { template: '<Button  class="parent"/>' }
  // <Parent />
  // 为例，渲染Parent组件时，patch阶段从BaseButton到Button最后才到Parent
  // 此时就依次将button合并到base-button，得到"base-button button"，再合并parent，得到"base-button button parent"
  //  debugger
  while (isDef(childNode.componentInstance)) {
    childNode = childNode.componentInstance._vnode
    if (childNode && childNode.data) {
      data = mergeClassData(childNode.data, data)
    }
  }
  // 从里往外找祖先元素的class，合并class
  // 该逻辑通常在组件更新时起作用
  // 通常在嵌套的组件中，通过上方的循环逻辑渲染一个组件时，已经得到了最终正确的的class
  // 但每个组件内部也是可以更新状态的，如上方例子的<base-button>，当其内部的状态发生变化时，就会触发组件重新更新
  // 由于vue是局部更新的，所以内部只会触发<base-button>的patch，如果不增加这个逻辑，那么其最终的样式就无法得到"base-button button parent"
  // 只有base-button
  while (isDef(parentNode = parentNode.parent)) {
    if (parentNode && parentNode.data) {
      data = mergeClassData(data, parentNode.data)
    }
  }
  // 合并静态样式类和动态样式类
  return renderClass(data.staticClass, data.class)
}


// 分别合并staticClass和class并返回
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
// 处理字符串类型、对象类型和数组类型
// 最终转为字符串
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
// 如果对象的值为真就将key作为样式名拼接
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
