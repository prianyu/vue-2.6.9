/* @flow */

import { namespaceMap } from 'web/util/index'

// 创建DOM节点，并对select元素的multiple属性做了特殊处理
export function createElement (tagName: string, vnode: VNode): Element {
  const elm = document.createElement(tagName)
  if (tagName !== 'select') {
    return elm
  }
  // false or null will remove the attribute but undefined will not
  if (vnode.data && vnode.data.attrs && vnode.data.attrs.multiple !== undefined) {
    elm.setAttribute('multiple', 'multiple')
  }
  return elm
}

// 创建带命名空间的DOM节点，即SVG和Math标签
export function createElementNS (namespace: string, tagName: string): Element {
  return document.createElementNS(namespaceMap[namespace], tagName)
}

// 创建文本标签
export function createTextNode (text: string): Text {
  return document.createTextNode(text)
}

// 创建注释标签
export function createComment (text: string): Comment {
  return document.createComment(text)
}

// 在参照元素的前面插入新的元素
export function insertBefore (parentNode: Node, newNode: Node, referenceNode: Node) {
  parentNode.insertBefore(newNode, referenceNode)
}

// 从一个元素里面删除指定子元素
export function removeChild (node: Node, child: Node) {
  node.removeChild(child)
}

// 添加子元素
export function appendChild (node: Node, child: Node) {
  node.appendChild(child)
}

// 获取元素的父元素
export function parentNode (node: Node): ?Node {
  return node.parentNode
}

// 获取元素的下一个元素
export function nextSibling (node: Node): ?Node {
  return node.nextSibling
}

// 获取元素的标签名
export function tagName (node: Element): string {
  return node.tagName
}

// 修改元素的文本内容
export function setTextContent (node: Node, text: string) {
  node.textContent = text
}

// 设置style scope
export function setStyleScope (node: Element, scopeId: string) {
  node.setAttribute(scopeId, '')
}
