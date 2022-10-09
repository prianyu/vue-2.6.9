/* @flow */

import type VNode from 'core/vdom/vnode'

/**
 * Runtime helper for resolving raw children VNodes into a slot object.
 * 用于将原有的子VNodes解析为一个插槽对象，按照插槽名称做归类处理
 * @suspense
 */
export function resolveSlots (
  children: ?Array<VNode>,
  context: ?Component
): { [key: string]: Array<VNode> } {
  if (!children || !children.length) {
    return {}
  }
  const slots = {}
  for (let i = 0, l = children.length; i < l; i++) {
    const child = children[i]
    const data = child.data
    // remove slot attribute if the node is resolved as a Vue slot node
    // 如果节点被解析为Vue插槽节点，则删除插槽属性
    if (data && data.attrs && data.attrs.slot) {
      delete data.attrs.slot
    }
    // named slots should only be respected if the vnode was rendered in the
    // same context.
    // 命名插槽只有在当vnode出于同一上下文时才考虑处理
    if ((child.context === context || child.fnContext === context) &&
      data && data.slot != null
    ) {// 命名插槽，如slot="header"
      const name = data.slot
      const slot = (slots[name] || (slots[name] = []))
      if (child.tag === 'template') { // slot在template上时将其子元素放进slots
        slot.push.apply(slot, child.children || [])
      } else {
        slot.push(child)
      }
    } else { // 默认插槽
      (slots.default || (slots.default = [])).push(child)
    }
  }
  // ignore slots that contains only whitespace
  // 过滤空白的插槽
  for (const name in slots) {
    if (slots[name].every(isWhitespace)) {
      delete slots[name]
    }
  }
  return slots
}

function isWhitespace (node: VNode): boolean {
  // 异步组件创建的也是空白的占位节点，所以要排除掉
  return (node.isComment && !node.asyncFactory) || node.text === ' '
}
