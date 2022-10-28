/* @flow */

/**
 * Expand input[v-model] with dyanmic type bindings into v-if-else chains
 * 用于处理当给给input{v-model]设置动态的type时，将其扩展为v-if-else链
 * 比如以下例子：
 * Turn this:
 *   <input v-model="data[type]" :type="type">
 * into this: 转化为
 *   <input v-if="type === 'checkbox'" type="checkbox" v-model="data[type]">
 *   <input v-else-if="type === 'radio'" type="radio" v-model="data[type]">
 *   <input v-else :type="type" v-model="data[type]">
 */

import {
  addRawAttr,
  getBindingAttr,
  getAndRemoveAttr
} from 'compiler/helpers'

import {
  processFor,
  processElement,
  addIfCondition,
  createASTElement
} from 'compiler/parser/index'


// 对input[v-model]做前置转化
// 具有动态属性的input，最终会被转化为具有if-elseif-else三个条件结合起来的元素
function preTransformNode (el: ASTElement, options: CompilerOptions) {
  if (el.tag === 'input') {
    const map = el.attrsMap
    if (!map['v-model']) { // 没有v-model则不做处理
      return
    }

    // 动态绑定
    let typeBinding
    if (map[':type'] || map['v-bind:type']) {
      typeBinding = getBindingAttr(el, 'type')
    }
    if (!map.type && !typeBinding && map['v-bind']) {
      typeBinding = `(${map['v-bind']}).type`
    }

    if (typeBinding) {
      const ifCondition = getAndRemoveAttr(el, 'v-if', true) // 获取原有的if条件
      const ifConditionExtra = ifCondition ? `&&(${ifCondition})` : `` // 用于拼接条件
      const hasElse = getAndRemoveAttr(el, 'v-else', true) != null // 有没有else条件
      const elseIfCondition = getAndRemoveAttr(el, 'v-else-if', true) // 获取原有的else-if条件
      // 1. checkbox 处理type=checkbox
      const branch0 = cloneASTElement(el) // 拷贝一个元素
      // process for on the main node
      processFor(branch0) // 处理v-for指令
      addRawAttr(branch0, 'type', 'checkbox') // type设置为checkbox
      processElement(branch0, options) // 处理各种属性
      branch0.processed = true // prevent it from double-processed 标记为已处理，避免后续重复处理
      branch0.if = `(${typeBinding})==='checkbox'` + ifConditionExtra // if条件拼接为`type === 'checkbox' && 原始条件`
      addIfCondition(branch0, {
        exp: branch0.if,
        block: branch0
      })
      // 2. add radio else-if condition  处理type=radio
      const branch1 = cloneASTElement(el) // 拷贝元素
      getAndRemoveAttr(branch1, 'v-for', true) // 处理v-for
      addRawAttr(branch1, 'type', 'radio') // 设置type为radio
      processElement(branch1, options) // 处理元素各个属性
      addIfCondition(branch0, {
        exp: `(${typeBinding})==='radio'` + ifConditionExtra, // else-if条件拼接为`type === 'radio' && 原始条件`
        block: branch1
      })
      // 3. other type=其他类型
      const branch2 = cloneASTElement(el) 
      getAndRemoveAttr(branch2, 'v-for', true)
      addRawAttr(branch2, ':type', typeBinding)
      processElement(branch2, options)
      addIfCondition(branch0, {
        exp: ifCondition,
        block: branch2
      })

      if (hasElse) { // 原始的input[v-model]处于else条件，则标记
        branch0.else = true
      } else if (elseIfCondition) { // 元素的input[v-model]处于else-if条件，则标记
        branch0.elseif = elseIfCondition
      }

      return branch0
    }
  }
}

// 拷贝元素
function cloneASTElement (el) {
  return createASTElement(el.tag, el.attrsList.slice(), el.parent)
}

export default {
  preTransformNode
}
