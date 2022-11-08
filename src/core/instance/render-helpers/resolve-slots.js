/* @flow */

import type VNode from 'core/vdom/vnode'

/**
 * 处理组件的slot内容
 * Runtime helper for resolving raw children VNodes into a slot object.
 * 用于将原有的子VNodes解析为一个插槽对象，按照插槽名称做归类处理
 * children为组件内子节点组成的VNode数组，这个处理主要做几件事：
  1. 删除VNode上的data.attrs.slot属性
  2. 对VNode按照是否命名做了分组处理
  3. 对每一个分组，如果只包含空白的VNode节点，则删除该分支
  4. 最终会返回一个分组后的插槽对象，如{default: [VNode, VNode], footer: [VNode, VNode], header: [VNode]}
 * 实例代码： 
    <div id="app">
      <layout>
        <h1 slot="header">{{title}}</h1>
        <p>{{msg}}</p>
        <p slot="footer">{{footer}}</p>
        <p>{{msg}}</p>
      </layout>
    </div>
    处理结果：
    {
      default: [Vnode...], // 5个VNode，含2个p和三个空白的节点
      footer: [VNode],
      header: [VNode]
    }
 */
export function resolveSlots (
  children: ?Array<VNode>, // 组件的子节点创建的vnode数组
  context: ?Component // 组件所处的上下文, #app
): { [key: string]: Array<VNode> } {
  if (!children || !children.length) {
    return {}
  }
  const slots = {}
  for (let i = 0, l = children.length; i < l; i++) {
    const child = children[i]
    const data = child.data // 获取子节点的data属性
    // remove slot attribute if the node is resolved as a Vue slot node
    // 如果节点被解析为Vue插槽节点，则删除attrs中的slot属性
    // h1处理前的data为{attrs:{slot: "header"}, slot: "header"}
    // 处理后{attrs:{}, slot: "header"}
    if (data && data.attrs && data.attrs.slot) {
      delete data.attrs.slot
    }
    // named slots should only be respected if the vnode was rendered in the
    // same context.
    // 命名插槽只有在当vnode处于同一上下文时才考虑处理
    //  @suspense
    if ((child.context === context || child.fnContext === context) &&
      data && data.slot != null
    ) {// 命名插槽，如slot="header"
      const name = data.slot // 插槽名称
      const slot = (slots[name] || (slots[name] = [])) // 创建存储命名插槽的数组
      if (child.tag === 'template') { // slot在template上时将其子元素放进slots
        slot.push.apply(slot, child.children || [])
      } else { // 不是template标签则将子元素自身放进slot
        slot.push(child)
      }
    } else { // 默认插槽
      (slots.default || (slots.default = [])).push(child)
    }
  }
  // ignore slots that contains only whitespace
  // 过滤只包含空白节点的的插槽
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
