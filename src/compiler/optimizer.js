/* @flow */

import { makeMap, isBuiltInTag, cached, no } from 'shared/util'

let isStaticKey
let isPlatformReservedTag

const genStaticKeysCached = cached(genStaticKeys)

/**
 * Goal of the optimizer: walk the generated template AST tree
 * and detect sub-trees that are purely static, i.e. parts of
 * the DOM that never needs to change.
 *
 * Once we detect these sub-trees, we can:
 *
 * 1. Hoist them into constants, so that we no longer need to
 *    create fresh nodes for them on each re-render;
 * 2. Completely skip them in the patching process.
 * 语法树优化的目标是检测子树中的静态节点，比如那些在DOM中永远不会改变的节点。
 * 优化后
 * 1. 可以将它们提升为常量，这样子就不需要在每一次render时创建新的节点
 * 2. 在patch阶段可以跳过这些节点的处理
 */
export function optimize (root: ?ASTElement, options: CompilerOptions) {
  if (!root) return
  isStaticKey = genStaticKeysCached(options.staticKeys || '') // 用于判断是否为静态属性的函数
  isPlatformReservedTag = options.isReservedTag || no
  // first pass: mark all non-static nodes.
  // 标记所有的静态节点
  markStatic(root)
  // second pass: mark static roots.
  // 标记所有的静态根节点
  markStaticRoots(root, false)
}

function genStaticKeys (keys: string): Function {
  return makeMap(
    'type,tag,attrsList,attrsMap,plain,parent,children,attrs,start,end,rawAttrsMap' +
    (keys ? ',' + keys : '')
  )
}
// 标记静态节点
function markStatic (node: ASTNode) {
  node.static = isStatic(node) // 标记是否为静态的节点
  if (node.type === 1) {
    // do not make component slot content static. this avoids
    // 1. components not able to mutate slot nodes
    // 2. static slot content fails for hot-reloading
    //
    if (
      !isPlatformReservedTag(node.tag) && // 不是html和svg标签
      node.tag !== 'slot' && // 不是slot标签
      node.attrsMap['inline-template'] == null // 不是内联模板
    ) {
      return
    }
    // 子元素递归执行
    // 如果子元素不是静态节点的话父元素也应该标记为非静态的
    for (let i = 0, l = node.children.length; i < l; i++) {
      const child = node.children[i]
      markStatic(child)
      if (!child.static) { 
        node.static = false
      }
    }
    // elseif和else是不在children上的，需要遍历ifConditions
    // 遍历ifConditions递归标记
    // 如果存在非静态节点的条件语句，则标记为非静态的
    if (node.ifConditions) {
      for (let i = 1, l = node.ifConditions.length; i < l; i++) {
        const block = node.ifConditions[i].block
        markStatic(block)
        if (!block.static) {
          node.static = false
        }
      }
    }
  }
}

// 标记静态根节点
function markStaticRoots (node: ASTNode, isInFor: boolean) {
  if (node.type === 1) {
    if (node.static || node.once) { // staticInFor
      node.staticInFor = isInFor
    }
    // For a node to qualify as a static root, it should have children that
    // are not just static text. Otherwise the cost of hoisting out will
    // outweigh the benefits and it's better off to just always render it fresh.
    // 对于静态根节点，要求本身必须要为一个静态节点，同时应该拥有children，
    // 且children不能仅仅是一个文本节点
    // 否则将其标记为静态根的收益就比较小
    if (node.static && node.children.length && !(
      node.children.length === 1 &&
      node.children[0].type === 3
    )) {
      node.staticRoot = true
      return
    } else {
      node.staticRoot = false
    }
    // 遍历子节点，递归标记
    if (node.children) { 
      for (let i = 0, l = node.children.length; i < l; i++) {
        markStaticRoots(node.children[i], isInFor || !!node.for)
      }
    }
    // 遍历ifConditions子节点，递归标记
    if (node.ifConditions) {
      for (let i = 1, l = node.ifConditions.length; i < l; i++) {
        markStaticRoots(node.ifConditions[i].block, isInFor)
      }
    }
  }
}

// 判断是否为静态节点
function isStatic (node: ASTNode): boolean {
  if (node.type === 2) { // expression 表达式不是静态节点
    return false
  }
  if (node.type === 3) { // text 纯文本为静态节点
    return true
  }
  return !!(node.pre || ( // 具有v-pre，则为静态的，否则满足以下的条件组合才判定为静态节点
    !node.hasBindings && // no dynamic bindings // 没有绑定属性
    !node.if && !node.for && // not v-if or v-for or v-else // 没有使用v-for和v-if
    !isBuiltInTag(node.tag) && // not a built-in // 不是slot和component内置组件
    isPlatformReservedTag(node.tag) && // not a component // 不是一个组件
    !isDirectChildOfTemplateFor(node) && // 不是带有v-for的template标签的直接子节点
    Object.keys(node).every(isStaticKey) // node下所有的key都为静态key
  ))
}

// 判断节点是否为template和for节点的直接节点
function isDirectChildOfTemplateFor (node: ASTElement): boolean {
  while (node.parent) { 
    node = node.parent 
    // 只要有不是template的祖先节点，则返回false
    if (node.tag !== 'template') { 
      return false
    }
    // 是template且有v-for指令则返回true
    if (node.for) {
      return true
    }
  }
  // 说明祖先节点都是template且都没有v-for属性
  return false
}
