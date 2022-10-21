/* @flow */

import he from 'he'
import { parseHTML } from './html-parser'
import { parseText } from './text-parser'
import { parseFilters } from './filter-parser'
import { genAssignmentCode } from '../directives/model'
import { extend, cached, no, camelize, hyphenate } from 'shared/util'
import { isIE, isEdge, isServerRendering } from 'core/util/env'

import {
  addProp,
  addAttr,
  baseWarn,
  addHandler,
  addDirective,
  getBindingAttr,
  getAndRemoveAttr,
  getRawBindingAttr,
  pluckModuleFunction,
  getAndRemoveAttrByRegex
} from '../helpers'

export const onRE = /^@|^v-on:/ // 事件绑定的正则
export const dirRE = process.env.VBIND_PROP_SHORTHAND
  ? /^v-|^@|^:|^\./
  : /^v-|^@|^:/ // 属性绑定的正则
export const forAliasRE = /([\s\S]*?)\s+(?:in|of)\s+([\s\S]*)/ //  v-for值正则表达式
export const forIteratorRE = /,([^,\}\]]*)(?:,([^,\}\]]*))?$/ // v-for迭代器正则表达式
const stripParensRE = /^\(|\)$/g // 匹配括号
const dynamicArgRE = /^\[.*\]$/ // 用于匹配动态指令参数，如v-slot:[name]

const argRE = /:(.*)$/
export const bindRE = /^:|^\.|^v-bind:/ // 绑定属性的正则
const propBindRE = /^\./ // 绑定属性是否为.开头，用于属性的.prop修饰符
const modifierRE = /\.[^.\]]+(?=[^\]]*$)/g // 修饰器的正则

const slotRE = /^v-slot(:|$)|^#/ // 匹配v-slot标签，可以为v-slot、v-slot:xxx, #xxx这几种语法

const lineBreakRE = /[\r\n]/
const whitespaceRE = /\s+/g

const invalidAttributeRE = /[\s"'<>\/=]/

const decodeHTMLCached = cached(he.decode)

export const emptySlotScopeToken = `_empty_` // 用于v-slot:xx指令不传值（非作用域插槽）

// configurable state
export let warn: any
let delimiters
let transforms
let preTransforms
let postTransforms
let platformIsPreTag
let platformMustUseProp
let platformGetTagNamespace
let maybeComponent

// 创建AST元素
export function createASTElement (
  tag: string,
  attrs: Array<ASTAttr>,
  parent: ASTElement | void
): ASTElement {
  return {
    type: 1,
    tag,
    attrsList: attrs, // 属性数组
    attrsMap: makeAttrsMap(attrs), // 将属性数组转为对象
    rawAttrsMap: {}, // 存放原始的属性键值对
    parent, // 父节点
    children: [] // 用于存储子节点
  }
}

/**
 * Convert HTML string to AST.
 * 将HTMLzh转为抽象语法树
 */
export function parse (
  template: string,
  options: CompilerOptions
): ASTElement | void {
  warn = options.warn || baseWarn // 提醒函数

  platformIsPreTag = options.isPreTag || no // 是否为pre标签
  platformMustUseProp = options.mustUseProp || no // 是否为prop属性，如checked
  platformGetTagNamespace = options.getTagNamespace || no // 获取命名空间
  const isReservedTag = options.isReservedTag || no // 是否为保留标签（html+svg标签）
  maybeComponent = (el: ASTElement) => !!el.component || !isReservedTag(el.tag) // 是否为组件

  // 从style、class、model几个modules中提取它们的transformNode、preTransformNode、postTransformNode方法
  transforms = pluckModuleFunction(options.modules, 'transformNode')
  preTransforms = pluckModuleFunction(options.modules, 'preTransformNode')
  postTransforms = pluckModuleFunction(options.modules, 'postTransformNode')

  delimiters = options.delimiters // 插值表达式定界符

  const stack = []
  
  const preserveWhitespace = options.preserveWhitespace !== false // 是否保留空格/换行
  const whitespaceOption = options.whitespace // 空白处理
  let root // 根元素，最终返回根元素所在的树
  let currentParent // 当前父元素
  let inVPre = false
  let inPre = false
  let warned = false

  function warnOnce (msg, range) {
    if (!warned) {
      warned = true
      warn(msg, range)
    }
  }

  // 关闭标签
  function closeElement (element) {
    trimEndingWhitespace(element) // 删除尾部的空白节点
    if (!inVPre && !element.processed) {
      element = processElement(element, options)
    }
    // tree management
    if (!stack.length && element !== root) {
      // allow root elements with v-if, v-else-if and v-else
      if (root.if && (element.elseif || element.else)) {
        if (process.env.NODE_ENV !== 'production') {
          checkRootConstraints(element)
        }
        addIfCondition(root, {
          exp: element.elseif,
          block: element
        })
      } else if (process.env.NODE_ENV !== 'production') {
        warnOnce(
          `Component template should contain exactly one root element. ` +
          `If you are using v-if on multiple elements, ` +
          `use v-else-if to chain them instead.`,
          { start: element.start }
        )
      }
    }
    if (currentParent && !element.forbidden) {
      if (element.elseif || element.else) {
        processIfConditions(element, currentParent)
      } else {
        if (element.slotScope) {
          // scoped slot
          // keep it in the children list so that v-else(-if) conditions can
          // find it as the prev node.
          const name = element.slotTarget || '"default"'
          ;(currentParent.scopedSlots || (currentParent.scopedSlots = {}))[name] = element
        }
        currentParent.children.push(element)
        element.parent = currentParent
      }
    }

    // final children cleanup
    // filter out scoped slots
    element.children = element.children.filter(c => !(c: any).slotScope)
    // remove trailing whitespace node again
    trimEndingWhitespace(element)

    // check pre state
    if (element.pre) {
      inVPre = false
    }
    if (platformIsPreTag(element.tag)) {
      inPre = false
    }
    // apply post-transforms
    for (let i = 0; i < postTransforms.length; i++) {
      postTransforms[i](element, options)
    }
  }

  // 删除尾部空白节点
  function trimEndingWhitespace (el) {
    // remove trailing whitespace node
    // 如果不是在pre标签内，则删除尾部的空白节点
    if (!inPre) {
      let lastNode
      while (
        (lastNode = el.children[el.children.length - 1]) &&
        lastNode.type === 3 &&
        lastNode.text === ' '
      ) {
        el.children.pop()
      }
    }
  }

  // 根元素约束条件检查
  // 主要用于约束多根标签，有slot、template和具有v-for指令的标签
  function checkRootConstraints (el) {
    if (el.tag === 'slot' || el.tag === 'template') {
      warnOnce(
        `Cannot use <${el.tag}> as component root element because it may ` +
        'contain multiple nodes.',
        { start: el.start }
      )
    }
    if (el.attrsMap.hasOwnProperty('v-for')) {
      warnOnce(
        'Cannot use v-for on stateful component root element because ' +
        'it renders multiple elements.',
        el.rawAttrsMap['v-for']
      )
    }
  }

  // 解析HTML
  parseHTML(template, {
    warn,
    expectHTML: options.expectHTML,
    isUnaryTag: options.isUnaryTag,
    canBeLeftOpenTag: options.canBeLeftOpenTag,
    shouldDecodeNewlines: options.shouldDecodeNewlines,
    shouldDecodeNewlinesForHref: options.shouldDecodeNewlinesForHref,
    shouldKeepComment: options.comments,
    outputSourceRange: options.outputSourceRange,
    /**
     * 做了6件事
     * 1. 创建AST对象
     * 2. 处理存在v-model指令的input标签，分别处理type为checkbox、radio、其他的情况
     * 3. 处理标签上的各种指令，如v-pre、v-for、v-if、v-once
     * 4. 如果根节点不存在，则设置当前节点为根节点
     * 5. 如果根节点为非闭合标签，则将自己push到stack中，并记录currentParent，作为接下来处理子元素的父节点
     * 6. 如果当前元素为自闭合标签，则标识该标签要结束了，让自己和父元素产生关系，以及设置自己的子元素
     */
    start (tag, attrs, unary, start, end) {
      // check namespace.
      // inherit parent ns if there is one
      // 从父元素继承命名空间
      const ns = (currentParent && currentParent.ns) || platformGetTagNamespace(tag)

      // handle IE svg bug
      /* istanbul ignore if */
      // IE上svg的bug处理
      if (isIE && ns === 'svg') {
        attrs = guardIESVGBug(attrs)
      }

      // 创建AST对象
      let element: ASTElement = createASTElement(tag, attrs, currentParent)
      // 有命名空间则添加命名空间
      if (ns) {
        element.ns = ns
      }

      if (process.env.NODE_ENV !== 'production') {
        if (options.outputSourceRange) {
          element.start = start
          element.end = end
          element.rawAttrsMap = element.attrsList.reduce((cumulated, attr) => {
            cumulated[attr.name] = attr
            return cumulated
          }, {})
        }
        attrs.forEach(attr => {
          if (invalidAttributeRE.test(attr.name)) {
            warn(
              `Invalid dynamic argument expression: attribute names cannot contain ` +
              `spaces, quotes, <, >, / or =.`,
              {
                start: attr.start + attr.name.indexOf(`[`),
                end: attr.start + attr.name.length
              }
            )
          }
        })
      }

      // style和运行Javascript的script标签
      // style和script标签不会被解析
      if (isForbiddenTag(element) && !isServerRendering()) {
        element.forbidden = true
        process.env.NODE_ENV !== 'production' && warn(
          'Templates should only be responsible for mapping the state to the ' +
          'UI. Avoid placing tags with side-effects in your templates, such as ' +
          `<${tag}>` + ', as they will not be parsed.',
          { start: element.start }
        )
      }

      // apply pre-transforms 执行前置转化
      for (let i = 0; i < preTransforms.length; i++) {
        element = preTransforms[i](element, options) || element
      }

      if (!inVPre) { // 当前不在pre环境下，则解析pre指令
        processPre(element)
        if (element.pre) { // 有v-pre指令则标记inVPre为true
          inVPre = true
        }
      }

      // 判断是否为pre标签，如果是则标记inPre为true
      if (platformIsPreTag(element.tag)) {
        inPre = true
      }
      if (inVPre) { // 具有v-pre指令，则处理原生的属性
        processRawAttrs(element)
      } else if (!element.processed) { // 元素还未处理，则处理各种指令
        // structural directives
        processFor(element) // 处理v-for指令
        processIf(element) // 处理v-if指令
        processOnce(element) // 处理v-once指令 
      }

      // 没有根元素，则将当前解析到的元素作为根元素
      if (!root) {
        root = element
        if (process.env.NODE_ENV !== 'production') {
          // 根元素不能为slot、template和具有v-for指令的标签
          // 因为这些标签可能会渲染多个根节点
          checkRootConstraints(root)
        }
      }

      if (!unary) { // 非自闭合标签，则将当前标签作为下一个节点的父级标签
        currentParent = element
        stack.push(element) // 压入父级标签
      } else {
        // 自闭合标签，关闭标签处理
        closeElement(element)
      }
    },

    end (tag, start, end) {
      const element = stack[stack.length - 1]
      // pop stack
      stack.length -= 1
      currentParent = stack[stack.length - 1]
      if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
        element.end = end
      }
      closeElement(element)
    },

    chars (text: string, start: number, end: number) {
      if (!currentParent) {
        if (process.env.NODE_ENV !== 'production') {
          if (text === template) {
            warnOnce(
              'Component template requires a root element, rather than just text.',
              { start }
            )
          } else if ((text = text.trim())) {
            warnOnce(
              `text "${text}" outside root element will be ignored.`,
              { start }
            )
          }
        }
        return
      }
      // IE textarea placeholder bug
      /* istanbul ignore if */
      if (isIE &&
        currentParent.tag === 'textarea' &&
        currentParent.attrsMap.placeholder === text
      ) {
        return
      }
      const children = currentParent.children
      if (inPre || text.trim()) {
        text = isTextTag(currentParent) ? text : decodeHTMLCached(text)
      } else if (!children.length) {
        // remove the whitespace-only node right after an opening tag
        text = ''
      } else if (whitespaceOption) {
        if (whitespaceOption === 'condense') {
          // in condense mode, remove the whitespace node if it contains
          // line break, otherwise condense to a single space
          text = lineBreakRE.test(text) ? '' : ' '
        } else {
          text = ' '
        }
      } else {
        text = preserveWhitespace ? ' ' : ''
      }
      if (text) {
        if (!inPre && whitespaceOption === 'condense') {
          // condense consecutive whitespaces into single space
          text = text.replace(whitespaceRE, ' ')
        }
        let res
        let child: ?ASTNode
        if (!inVPre && text !== ' ' && (res = parseText(text, delimiters))) {
          child = {
            type: 2,
            expression: res.expression,
            tokens: res.tokens,
            text
          }
        } else if (text !== ' ' || !children.length || children[children.length - 1].text !== ' ') {
          child = {
            type: 3,
            text
          }
        }
        if (child) {
          if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
            child.start = start
            child.end = end
          }
          children.push(child)
        }
      }
    },
    comment (text: string, start, end) { // 注释节点处理
      // adding anyting as a sibling to the root node is forbidden
      // comments should still be allowed, but ignored
      // 将节点压入父节点
      if (currentParent) {
        const child: ASTText = { //注释节点
          type: 3,
          text,
          isComment: true
        }
        if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
          child.start = start
          child.end = end
        }
        currentParent.children.push(child)
      }
    }
  })
  return root
}

// 处理pre属性，如果有v-pre指令就标记为pre
function processPre (el) {
  if (getAndRemoveAttr(el, 'v-pre') != null) {
    el.pre = true
  }
}

// 处理原始的属性
function processRawAttrs (el) {
  const list = el.attrsList
  const len = list.length
  if (len) { // 具有属性，将属性值使用JSON.stringify做处理
    const attrs: Array<ASTAttr> = el.attrs = new Array(len)
    for (let i = 0; i < len; i++) {
      attrs[i] = {
        name: list[i].name,
        value: JSON.stringify(list[i].value)
      }
      if (list[i].start != null) {
        attrs[i].start = list[i].start
        attrs[i].end = list[i].end
      }
    }
  } else if (!el.pre) { // 没有属性列表，也没有v-pre指令，则标记为简单的节点
    // non root node in pre blocks with no attributes
    el.plain = true
  }
}


// 处理元素
export function processElement (
  element: ASTElement,
  options: CompilerOptions
) {
  processKey(element) // 处理key属性

  // determine whether this is a plain element after
  // removing structural attributes
  // 移除完结构性的属性后，判定是否为普通的奥元素
  element.plain = (
    !element.key &&
    !element.scopedSlots &&
    !element.attrsList.length
  )

  processRef(element) // 处理ref属性
  processSlotContent(element) // 处理作为插槽传递给组件的内容
  processSlotOutlet(element) // 元素为slot时，处理它（名称）
  processComponent(element) // 处理is属性、inline-template属性等
  // 后置处理
  // 为 element 对象分别执行 class、style、model 模块中的 transformNode 方法
  // 不过 web 平台只有 class、style 模块有 transformNode 方法，分别用来处理 class 属性和 style 属性
  // 得到 el.staticStyle、 el.styleBinding、el.staticClass、el.classBinding
  // 分别存放静态 style 属性的值、动态 style 属性的值，以及静态 class 属性的值和动态 class 属性的值
  for (let i = 0; i < transforms.length; i++) {
    element = transforms[i](element, options) || element
  }
  // 处理元素上的所有属性
  // v-bind 指令变成：el.attrs 或 el.dynamicAttrs = [{ name, value, start, end, dynamic }, ...]，
  // 或者是必须使用 props 的属性，变成了 el.props = [{ name, value, start, end, dynamic }, ...]
  //  v-on 指令变成：el.events 或 el.nativeEvents = { name: [{ value, start, end, modifiers, dynamic }, ...] }
  //  其它指令：el.directives = [{name, rawName, value, arg, isDynamicArg, modifier, start, end }, ...]
  //  原生属性：el.attrs = [{ name, value, start, end }]，或者一些必须使用 props 的属性，变成了：
  //  el.props = [{ name, value: true, start, end, dynamic }]
  processAttrs(element)
  return element
}

// 处理key属性
function processKey (el) {
  const exp = getBindingAttr(el, 'key')
  if (exp) {
    // template不能添加key，transition-group不能使用index作为key
    if (process.env.NODE_ENV !== 'production') {
      if (el.tag === 'template') {
        warn(
          `<template> cannot be keyed. Place the key on real elements instead.`,
          getRawBindingAttr(el, 'key')
        )
      }
      if (el.for) {
        const iterator = el.iterator2 || el.iterator1
        const parent = el.parent
        if (iterator && iterator === exp && parent && parent.tag === 'transition-group') {
          warn(
            `Do not use v-for index as key on <transition-group> children, ` +
            `this is the same as not using keys.`,
            getRawBindingAttr(el, 'key'),
            true /* tip */
          )
        }
      }
    }
    el.key = exp
  }
}

// 处理ref属性
function processRef (el) {
  const ref = getBindingAttr(el, 'ref')
  if (ref) {
    el.ref = ref // 引用属性
    el.refInFor = checkInFor(el) // 标记祖先元素是否具有v-for指令
  }
}

// 处理v-for指令
export function processFor (el: ASTElement) {
  let exp // v-for的值
  if ((exp = getAndRemoveAttr(el, 'v-for'))) {
    const res = parseFor(exp) // 解析v-for为对象
    if (res) {
      extend(el, res) // 将v-for解析后的对象拓展至el
    } else if (process.env.NODE_ENV !== 'production') {
      warn(
        `Invalid v-for expression: ${exp}`,
        el.rawAttrsMap['v-for']
      )
    }
  }
}

type ForParseResult = {
  for: string;
  alias: string;
  iterator1?: string;
  iterator2?: string;
};

// 解析v-for
export function parseFor (exp: string): ?ForParseResult {
  // 匹配v-for的值
  // item in list => ['item in list', 'item' , 'list']
  // item in list => ['item of list', 'item' , 'list']
  // (val, name, index) of item => ['(val, name, index) of item', '(val, name, index)', 'item']
  const inMatch = exp.match(forAliasRE) 
  if (!inMatch) return // 匹配不到不处理
  const res = {}
  res.for = inMatch[2].trim() // for取被遍历的对象
  const alias = inMatch[1].trim().replace(stripParensRE, '') // 去括号后的迭代器
  // "val, name, index"匹配后得到 [", name, index", " name", " index"]
  const iteratorMatch = alias.match(forIteratorRE) // 提取迭代器
  if (iteratorMatch) {
    // 提取迭代器的别名"val, name, index"处理后得到"val"
    res.alias = alias.replace(forIteratorRE, '').trim()
    res.iterator1 = iteratorMatch[1].trim() // 取迭代器的键
    if (iteratorMatch[2]) { // 如果有，说明遍历的是一个对象，iterator2为对象键的索引
      res.iterator2 = iteratorMatch[2].trim()
    }
  } else { // 匹配不到迭代器，只有别名
    res.alias = alias
  }
  return res
}

// 处理if指令
function processIf (el) {
  const exp = getAndRemoveAttr(el, 'v-if') // 获取if指令的值
  if (exp) {
    el.if = exp
    // 添加条件记录
    addIfCondition(el, {
      exp: exp,
      block: el
    })
  } else {
    if (getAndRemoveAttr(el, 'v-else') != null) {
      el.else = true
    }
    const elseif = getAndRemoveAttr(el, 'v-else-if')
    if (elseif) {
      el.elseif = elseif
    }
  }
}

function processIfConditions (el, parent) {
  const prev = findPrevElement(parent.children)
  if (prev && prev.if) {
    addIfCondition(prev, {
      exp: el.elseif,
      block: el
    })
  } else if (process.env.NODE_ENV !== 'production') {
    warn(
      `v-${el.elseif ? ('else-if="' + el.elseif + '"') : 'else'} ` +
      `used on element <${el.tag}> without corresponding v-if.`,
      el.rawAttrsMap[el.elseif ? 'v-else-if' : 'v-else']
    )
  }
}

function findPrevElement (children: Array<any>): ASTElement | void {
  let i = children.length
  while (i--) {
    if (children[i].type === 1) {
      return children[i]
    } else {
      if (process.env.NODE_ENV !== 'production' && children[i].text !== ' ') {
        warn(
          `text "${children[i].text.trim()}" between v-if and v-else(-if) ` +
          `will be ignored.`,
          children[i]
        )
      }
      children.pop()
    }
  }
}

// 添加条件记录
export function addIfCondition (el: ASTElement, condition: ASTIfCondition) {
  if (!el.ifConditions) {
    el.ifConditions = []
  }
  el.ifConditions.push(condition)
}

// 处理v-once指令
function processOnce (el) {
  const once = getAndRemoveAttr(el, 'v-once')
  if (once != null) {
    el.once = true
  }
}

// handle content being passed to a component as slot,
// e.g. <template slot="xxx">, <div slot-scope="xxx">
// 处理作为插槽传递给组件的内容
function processSlotContent (el) {
  // 处理旧的slot-scope和scope指令语法
  let slotScope
  if (el.tag === 'template') {
    slotScope = getAndRemoveAttr(el, 'scope') // 旧语法<template slot="xxx">
    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && slotScope) {
      warn(
        `the "scope" attribute for scoped slots have been deprecated and ` +
        `replaced by "slot-scope" since 2.5. The new "slot-scope" attribute ` +
        `can also be used on plain elements in addition to <template> to ` +
        `denote scoped slots.`,
        el.rawAttrsMap['scope'],
        true
      )
    }
    el.slotScope = slotScope || getAndRemoveAttr(el, 'slot-scope') // 获取template的slot-scoped指令的内容
  } else if ((slotScope = getAndRemoveAttr(el, 'slot-scope'))) { // 非template元素
    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && el.attrsMap['v-for']) {
      warn(
        `Ambiguous combined usage of slot-scope and v-for on <${el.tag}> ` +
        `(v-for takes higher priority). Use a wrapper <template> for the ` +
        `scoped slot to make it clearer.`,
        el.rawAttrsMap['slot-scope'],
        true
      )
    }
    el.slotScope = slotScope // 非template元素的sltot-scope指令的内容
  }

  // slot="xxx"
  // 旧语法中的slot属性
  const slotTarget = getBindingAttr(el, 'slot') // 获取slot绑定属性的值
  if (slotTarget) {
    el.slotTarget = slotTarget === '""' ? '"default"' : slotTarget
    el.slotTargetDynamic = !!(el.attrsMap[':slot'] || el.attrsMap['v-bind:slot'])// 标记是否有动态的slot绑定属性
    // preserve slot as an attribute for native shadow DOM compat
    // only for non-scoped slots.
    //仅为非作用域插槽保留slot作为本地阴影DOM compat的属性。
    if (el.tag !== 'template' && !el.slotScope) {
      addAttr(el, 'slot', slotTarget, getRawBindingAttr(el, 'slot'))
    }
  }

  // 2.6 v-slot syntax
  // 2.6+ slot新语法的处理
  if (process.env.NEW_SLOT_SYNTAX) {
    if (el.tag === 'template') { // template上的v-slot指令
      // v-slot on <template>
      // 删除并返回为slot指令的属性，有v-slot、v-slot:xxx, #xx三种语法
      const slotBinding = getAndRemoveAttrByRegex(el, slotRE)
      if (slotBinding) {
        if (process.env.NODE_ENV !== 'production') {
          if (el.slotTarget || el.slotScope) { // 混用了新旧语法的slot指令
            warn(
              `Unexpected mixed usage of different slot syntaxes.`,
              el
            )
          }
          // v-slot只能作为组件的第一级元素使用
          if (el.parent && !maybeComponent(el.parent)) {
            warn(
              `<template v-slot> can only appear at the root level inside ` +
              `the receiving the component`,
              el
            )
          }
        }
        const { name, dynamic } = getSlotName(slotBinding) // 获取名称
        el.slotTarget = name // 名称
        el.slotTargetDynamic = dynamic // 是否为动态指令参数
        // 指令传了值则作为作用域插槽
        el.slotScope = slotBinding.value || emptySlotScopeToken // force it into a scoped slot for perf
      }
    } else { // 非template标签
      // v-slot on component, denotes default slot
      // 组件上的v-slot表示默认插槽
      // v-slot是只能用在template标签上的，但是有一种情况例外，就是插槽里只有默认插槽一个
      // 那么可以把v-slot放在组件上
      const slotBinding = getAndRemoveAttrByRegex(el, slotRE)
      if (slotBinding) {
        if (process.env.NODE_ENV !== 'production') {
          if (!maybeComponent(el)) {
            warn(
              `v-slot can only be used on components or <template>.`,
              slotBinding
            )
          }
          if (el.slotScope || el.slotTarget) {
            warn(
              `Unexpected mixed usage of different slot syntaxes.`,
              el
            )
          }
          if (el.scopedSlots) {
            warn(
              `To avoid scope ambiguity, the default slot should also use ` +
              `<template> syntax when there are other named slots.`,
              slotBinding
            )
          }
        }
        // add the component's children to its default slot
        // 将component的内容添加至其默认插槽
        const slots = el.scopedSlots || (el.scopedSlots = {})
        const { name, dynamic } = getSlotName(slotBinding) // 名称
        const slotContainer = slots[name] = createASTElement('template', [], el) // 创建template的Ast
        slotContainer.slotTarget = name 
        slotContainer.slotTargetDynamic = dynamic
        // 绑定父子关系
        slotContainer.children = el.children.filter((c: any) => {
          if (!c.slotScope) {
            c.parent = slotContainer
            return true
          }
        })
        slotContainer.slotScope = slotBinding.value || emptySlotScopeToken // 作用域插槽
        // remove children as they are returned from scopedSlots now
        el.children = [] // 将children移除，因为可以从scopedSlots获取了
        // mark el non-plain so data gets generated
        el.plain = false // 标记为非普通元素
      }
    }
  }
}

// 获取v-slot的名称，可能是动态名称也可能是普通的名称
function getSlotName (binding) {
  let name = binding.name.replace(slotRE, '') // 提取v-slot的name
  if (!name) {
    if (binding.name[0] !== '#') { // 提取不到，且不是只传了#,则name默认为default
      name = 'default'
    } else if (process.env.NODE_ENV !== 'production') { // #xxx这种短语法中，xxx是不能省略的
      warn(
        `v-slot shorthand syntax requires a slot name.`,
        binding
      )
    }
  }
  return dynamicArgRE.test(name) // 是否为动态指令参数，如v-slot:[name]
    // dynamic [name]
    ? { name: name.slice(1, -1), dynamic: true } // 截取名称，标记为动态指令参数
    // static name
    : { name: `"${name}"`, dynamic: false } // 非动态指令参数
}

// handle <slot/> outlets
// 处理slot元素
function processSlotOutlet (el) {
  if (el.tag === 'slot') {
    el.slotName = getBindingAttr(el, 'name') // 获取名称
    // 插槽不能有key
    if (process.env.NODE_ENV !== 'production' && el.key) {
      warn(
        `\`key\` does not work on <slot> because slots are abstract outlets ` +
        `and can possibly expand into multiple elements. ` +
        `Use the key on a wrapping element instead.`,
        getRawBindingAttr(el, 'key')
      )
    }
  }
}

// 处理component
function processComponent (el) {
  let binding
  if ((binding = getBindingAttr(el, 'is'))) { // 是否有is属性，有的话添加component属性执行对应的组件名称
    el.component = binding
  }
  // 是否为内联模板
  // 组件将会使用其里面的内容作为模板，而不是将其作为被分发的内容
  // 父组件中定义子组件的模板、但是模板里的数据是从子组件获取的
  if (getAndRemoveAttr(el, 'inline-template') != null) {
    el.inlineTemplate = true
  }
}

// 处理属性
/**
 * v-bind
 */
function processAttrs (el) {
  const list = el.attrsList
  let i, l, name, rawName, value, modifiers, syncGen, isDynamic
  for (i = 0, l = list.length; i < l; i++) {
    name = rawName = list[i].name
    value = list[i].value
    if (dirRE.test(name)) { // 匹配到了绑定属性，如@click，v-，：，说明该属性是一个指令
      // mark element as dynamic
      el.hasBindings = true // 标记为动态元素
      // modifiers
      modifiers = parseModifiers(name.replace(dirRE, '')) // 解析修饰符，得到类似{prevent: true, stop:true}之类的格式
      // v-bind指令是可以为属性传递修复符的，如.camel，.prop，.sync
      // v-bind的属性默认都是被添加至元素的attibutes属性的，因此访问DOM时，需要从其attributes中获取到对应的属性
      // .prop修饰符则是改变这种默认行为，使属性直接绑定到DOM上，可以通过DOM直接访问属性，如<div v-bind:name.prop="test">
      // Vue针对.prop修饰符的属性提供了一种简写的方式，即直接以“.”开头，如<div .name="test">
      // support .foo shorthand syntax for the .prop modifier
      // 提供.foo这种简写的方式来使用.prop修饰符
      if (process.env.VBIND_PROP_SHORTHAND && propBindRE.test(name)) { // .开头
        (modifiers || (modifiers = {})).prop = true  // 将prop标记为true
        name = `.` + name.slice(1).replace(modifierRE, '') // 移除后续的修复符得到干净的name
      } else if (modifiers) {
        name = name.replace(modifierRE, '')// 去除修饰符，得到干净的属性名，如@click.stop.once得到@click
      }
      // v-bind处理
      if (bindRE.test(name)) { // v-bind
        name = name.replace(bindRE, '') // 解析属性名称
        value = parseFilters(value)
        isDynamic = dynamicArgRE.test(name) // 是否为动态参数如v-bind:[name]="test"
        if (isDynamic) { 
          name = name.slice(1, -1) // 去除“[]”,得到真正的name
        }
        // 空的属性值表达式
        if (
          process.env.NODE_ENV !== 'production' &&
          value.trim().length === 0
        ) {
          warn(
            `The value for a v-bind expression cannot be empty. Found in "v-bind:${name}"`
          )
        }

        // 处理属性修饰符
        if (modifiers) {
          if (modifiers.prop && !isDynamic) { // 使用.prop修饰符
            name = camelize(name) // 转为驼峰
            if (name === 'innerHtml') name = 'innerHTML'
          }
          if (modifiers.camel && !isDynamic) { // 使用.camel修饰符，转为驼峰
            name = camelize(name)
          }
          if (modifiers.sync) { // sync修饰符
            // @suspense
            syncGen = genAssignmentCode(value, `$event`)
            if (!isDynamic) {
              addHandler(
                el,
                `update:${camelize(name)}`,
                syncGen,
                null,
                false,
                warn,
                list[i]
              )
              if (hyphenate(name) !== camelize(name)) {
                addHandler(
                  el,
                  `update:${hyphenate(name)}`,
                  syncGen,
                  null,
                  false,
                  warn,
                  list[i]
                )
              }
            } else {
              // handler w/ dynamic event name
              addHandler(
                el,
                `"update:"+(${name})`,
                syncGen,
                null,
                false,
                warn,
                list[i],
                true // dynamic
              )
            }
          }
        }
        // 如果是原生的DOM property或使用了.prop修饰符，则给el.props添加属性
        // 否则给el.attrs添加属性
        if ((modifiers && modifiers.prop) || (
          !el.component && platformMustUseProp(el.tag, el.attrsMap.type, name)
        )) {
          addProp(el, name, value, list[i], isDynamic)
        } else {
          addAttr(el, name, value, list[i], isDynamic)
        }
      } else if (onRE.test(name)) { // v-on 处理v-on
        name = name.replace(onRE, '') // 事件名 
        isDynamic = dynamicArgRE.test(name) // 是否为动态的事件名
        if (isDynamic) { // 动态事件名，截取名称
          name = name.slice(1, -1)
        }
        // 添加事件处理
        addHandler(el, name, value, modifiers, false, warn, list[i], isDynamic)
      } else { // normal directives 其他普通的指令，如v-focus，v-model
        name = name.replace(dirRE, '') // 指令名称，如focus
        // parse arg
        // 解析指令参数，如v-demo:foo得到foo
        const argMatch = name.match(argRE)
        let arg = argMatch && argMatch[1]
        isDynamic = false
        if (arg) {
          name = name.slice(0, -(arg.length + 1)) // 获取真实的指令名字
          if (dynamicArgRE.test(arg)) { // 是动态指令参数
            arg = arg.slice(1, -1) // 截取参数名
            isDynamic = true
          }
        }
        addDirective(el, name, rawName, value, arg, isDynamic, modifiers, list[i])
        // 处理将v-for迭代器变量直接作为v-model的值绑定的情况
        if (process.env.NODE_ENV !== 'production' && name === 'model') {
          checkForAliasModel(el, value)
        }
      }
    } else {
      // literal attribute
      if (process.env.NODE_ENV !== 'production') {
        const res = parseText(value, delimiters)
        if (res) {
          warn(
            `${name}="${value}": ` +
            'Interpolation inside attributes has been removed. ' +
            'Use v-bind or the colon shorthand instead. For example, ' +
            'instead of <div id="{{ val }}">, use <div :id="val">.',
            list[i]
          )
        }
      }
      addAttr(el, name, JSON.stringify(value), list[i])
      // #6887 firefox doesn't update muted state if set via attribute
      // even immediately after element creation
      if (!el.component &&
          name === 'muted' &&
          platformMustUseProp(el.tag, el.attrsMap.type, name)) {
        addProp(el, name, 'true', list[i])
      }
    }
  }
}

// 判断ref是否在v-for内
function checkInFor (el: ASTElement): boolean {
  let parent = el
  while (parent) {
    if (parent.for !== undefined) {
      return true
    }
    parent = parent.parent
  }
  return false
}

// 解析修饰符
function parseModifiers (name: string): Object | void {
  const match = name.match(modifierRE) // [".stop", ".prevent"]
  if (match) {
    const ret = {}
    // 将对应修饰符属性标记为true
    match.forEach(m => { ret[m.slice(1)] = true })
    return ret
  }
}

// 将属性数组转为对象
function makeAttrsMap (attrs: Array<Object>): Object {
  const map = {}
  for (let i = 0, l = attrs.length; i < l; i++) {
    if (
      process.env.NODE_ENV !== 'production' &&
      map[attrs[i].name] && !isIE && !isEdge // 属性重复
    ) {
      warn('duplicate attribute: ' + attrs[i].name, attrs[i])
    }
    map[attrs[i].name] = attrs[i].value
  }
  return map
}

// for script (e.g. type="x/template") or style, do not decode content
function isTextTag (el): boolean {
  return el.tag === 'script' || el.tag === 'style'
}

// 禁止的元素
// style和运行Java script的script标签
function isForbiddenTag (el): boolean {
  return (
    el.tag === 'style' ||
    (el.tag === 'script' && (
      !el.attrsMap.type ||
      el.attrsMap.type === 'text/javascript'
    ))
  )
}

const ieNSBug = /^xmlns:NS\d+/
const ieNSPrefix = /^NS\d+:/

/* istanbul ignore next */
function guardIESVGBug (attrs) {
  const res = []
  for (let i = 0; i < attrs.length; i++) {
    const attr = attrs[i]
    if (!ieNSBug.test(attr.name)) {
      attr.name = attr.name.replace(ieNSPrefix, '')
      res.push(attr)
    }
  }
  return res
}

// 用于处理将v-for迭代器变量直接作为v-model的值绑定，如
//<div v-for="teacher in teachers"><input v-model="teacher" /></div>
// 因为此时修改的是个局部变量，是不会修改源数据的
function checkForAliasModel (el, value) {
  let _el = el
  while (_el) {
    if (_el.for && _el.alias === value) {
      warn(
        `<${el.tag} v-model="${value}">: ` +
        `You are binding v-model directly to a v-for iteration alias. ` +
        `This will not be able to modify the v-for source array because ` +
        `writing to the alias is like modifying a function local variable. ` +
        `Consider using an array of objects and use v-model on an object property instead.`,
        el.rawAttrsMap['v-model']
      )
    }
    _el = _el.parent
  }
}
