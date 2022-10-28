/* @flow */

import { emptyObject } from 'shared/util'
import { parseFilters } from './parser/filter-parser'

type Range = { start?: number, end?: number };

/* eslint-disable no-unused-vars */
export function baseWarn (msg: string, range?: Range) {
  console.error(`[Vue compiler]: ${msg}`)
}
/* eslint-enable no-unused-vars */

// 从modules中提取名称为key的函数并组成数组返回
// [transformNode<Function>, transformNode<Function>]
export function pluckModuleFunction<F: Function> (
  modules: ?Array<Object>,
  key: string
): Array<F> {
  return modules
    ? modules.map(m => m[key]).filter(_ => _)
    : []
}

// 添加property类型的属性并标记为非普通的元素
export function addProp (el: ASTElement, name: string, value: string, range?: Range, dynamic?: boolean) {
  (el.props || (el.props = [])).push(rangeSetItem({ name, value, dynamic }, range))
  el.plain = false
}

// 添加attributes类型的属性并标记为非普通元素
export function addAttr (el: ASTElement, name: string, value: any, range?: Range, dynamic?: boolean) {
  const attrs = dynamic
    ? (el.dynamicAttrs || (el.dynamicAttrs = []))
    : (el.attrs || (el.attrs = []))
  attrs.push(rangeSetItem({ name, value, dynamic }, range))
  el.plain = false
}

// add a raw attr (use this in preTransforms)
export function addRawAttr (el: ASTElement, name: string, value: any, range?: Range) {
  el.attrsMap[name] = value
  el.attrsList.push(rangeSetItem({ name, value }, range))
}

// 给元素添加指令
export function addDirective (
  el: ASTElement,
  name: string,
  rawName: string,
  value: string,
  arg: ?string,
  isDynamicArg: boolean,
  modifiers: ?ASTModifiers,
  range?: Range
) {
  (el.directives || (el.directives = [])).push(rangeSetItem({
    name,
    rawName,
    value,
    arg,
    isDynamicArg,
    modifiers
  }, range))
  el.plain = false
}

// 给事件名增加前缀
function prependModifierMarker (symbol: string, name: string, dynamic?: boolean): string {
  //如果是动态的事件名，则拼接一串可以执行的_p函数的代码，否则，直接在事件名前面添加前缀
  return dynamic
    ? `_p(${name},"${symbol}")`
    : symbol + name // mark the event as captured
}

export function addHandler (
  el: ASTElement, // 元素
  name: string, // 事件名
  value: string, // 事件表达式
  modifiers: ?ASTModifiers, // 事件修饰符
  important?: boolean, // 是否优先执行
  warn?: ?Function,
  range?: Range,
  dynamic?: boolean // 是否动态事件名
) {
  modifiers = modifiers || emptyObject
  // warn prevent and passive modifier
  /* istanbul ignore if */
  // .prevent和.passive修饰符不能同时使用
  if (
    process.env.NODE_ENV !== 'production' && warn &&
    modifiers.prevent && modifiers.passive
  ) {
    warn(
      'passive and prevent can\'t be used together. ' +
      'Passive handler can\'t prevent default event.',
      range
    )
  }

  // normalize click.right and click.middle since they don't actually fire
  // this is technically browser-specific, but at least for now browsers are
  // the only target envs that have right/middle clicks.
  // 规范化右键单击和中键单击事件
  if (modifiers.right) { // 右键
    if (dynamic) { // 动态事件名，设置为执行一段三元运算的代码
      name = `(${name})==='click'?'contextmenu':(${name})`
    } else if (name === 'click') { // 非动态事件名且为右键点击事件，则转为contextmenu事件
      name = 'contextmenu' // 
      delete modifiers.right
    }
  } else if (modifiers.middle) {
    if (dynamic) {
      // 动态事件名，设置为执行一段三元运算的代码
      name = `(${name})==='click'?'mouseup':(${name})`
    } else if (name === 'click') { // 中键点击转为mouseup事件
      name = 'mouseup'
    }
  }

  // check capture modifier
  // 有cature修饰符，事件名前面增加“!”前缀
  if (modifiers.capture) {
    delete modifiers.capture
    name = prependModifierMarker('!', name, dynamic)
  }
  // 有once修饰符，增加~前缀
  if (modifiers.once) {
    delete modifiers.once
    name = prependModifierMarker('~', name, dynamic)
  }
  /* istanbul ignore if */
  // 有passive修饰符，增加“&”前缀
  if (modifiers.passive) {
    delete modifiers.passive
    name = prependModifierMarker('&', name, dynamic)
  }


  // 创建/获取事件存储对象
  // 如果是原生事件取nativeEvents，否则取events
  let events
  if (modifiers.native) {
    delete modifiers.native
    events = el.nativeEvents || (el.nativeEvents = {})
  } else {
    events = el.events || (el.events = {})
  }

  // 创建一个对象，并添加修饰符
  const newHandler: any = rangeSetItem({ value: value.trim(), dynamic }, range)
  if (modifiers !== emptyObject) {
    newHandler.modifiers = modifiers
  }

  // 获取存储事件对象上对应的事件处理
  const handlers = events[name]
  /* istanbul ignore if */
  // 存储事件
  // 如果只有一个事件处理回调，则直接存
  // 如果已经有一个了则转为数组，并根据是否优先执行选择加入头部还是尾部
  // 如果本身已经有多个处理的回调了，则直接根据是否优先执行选择加入头部还是尾部
  if (Array.isArray(handlers)) { // 
    important ? handlers.unshift(newHandler) : handlers.push(newHandler)
  } else if (handlers) {
    events[name] = important ? [newHandler, handlers] : [handlers, newHandler]
  } else {
    events[name] = newHandler
  }

  // 标记为非普通的元素
  el.plain = false
}

export function getRawBindingAttr (
  el: ASTElement,
  name: string
) {
  return el.rawAttrsMap[':' + name] ||
    el.rawAttrsMap['v-bind:' + name] ||
    el.rawAttrsMap[name]
}

// 获取绑定属性
export function getBindingAttr (
  el: ASTElement,
  name: string,
  getStatic?: boolean
): ?string {
  // 获取并移除动态属性的值
  const dynamicValue =
    getAndRemoveAttr(el, ':' + name) ||
    getAndRemoveAttr(el, 'v-bind:' + name)
  if (dynamicValue != null) {
    return parseFilters(dynamicValue)
  } else if (getStatic !== false) {
    const staticValue = getAndRemoveAttr(el, name) // 获取属性值
    if (staticValue != null) {
      return JSON.stringify(staticValue) // 返回字符串格式化后的值
    }
  }
}

// note: this only removes the attr from the Array (attrsList) so that it
// doesn't get processed by processAttrs.
// By default it does NOT remove it from the map (attrsMap) because the map is
// needed during codegen.
// 获取并移除属性
// 处理后该属性就不会被processAttrs处理
// 默认情况下，该属性仅移除attrsList中的项，不会移除attrsMap中的属性，因为在生成代码的时候需要用到attrsMap中的属性
export function getAndRemoveAttr (
  el: ASTElement,
  name: string,
  removeFromMap?: boolean
): ?string {
  let val
  if ((val = el.attrsMap[name]) != null) {
    const list = el.attrsList
    // 从el.attrsList中移除属性
    for (let i = 0, l = list.length; i < l; i++) {
      if (list[i].name === name) {
        list.splice(i, 1)
        break
      }
    }
  }
  // 是否需要同时从attrsMap中将其移除
  if (removeFromMap) {
    delete el.attrsMap[name]
  }
  // 返回被移除的属性值
  return val
}
// 根据指定的正则，删除并返回指定的属性
export function getAndRemoveAttrByRegex (
  el: ASTElement,
  name: RegExp
) {
  const list = el.attrsList
  for (let i = 0, l = list.length; i < l; i++) {
    const attr = list[i]
    if (name.test(attr.name)) {
      list.splice(i, 1)
      return attr
    }
  }
}

function rangeSetItem (
  item: any,
  range?: { start?: number, end?: number }
) {
  if (range) {
    if (range.start != null) {
      item.start = range.start
    }
    if (range.end != null) {
      item.end = range.end
    }
  }
  return item
}
