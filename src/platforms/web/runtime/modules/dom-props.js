/* @flow */

import { isDef, isUndef, extend, toNumber } from 'shared/util'
import { isSVG } from 'web/util/index'

// 更新原生DOM属性的钩子

let svgContainer

// 用于更新原生的prop属性
function updateDOMProps (oldVnode: VNodeWithData, vnode: VNodeWithData) {
  // 新老节点均没有DOMProps
  if (isUndef(oldVnode.data.domProps) && isUndef(vnode.data.domProps)) {
    return
  }
  let key, cur
  const elm: any = vnode.elm
  const oldProps = oldVnode.data.domProps || {} // 旧节点的DOMProps
  let props = vnode.data.domProps || {} // 新节点的DOMProps
  // clone observed objects, as the user probably wants to mutate it
  // 具有观察者的对象，则拷贝后再使用，以避免修改原始对象
  if (isDef(props.__ob__)) {
    props = vnode.data.domProps = extend({}, props)
  }

  // 移除不再需要的旧DOMProps
  for (key in oldProps) {
    if (isUndef(props[key])) {
      elm[key] = ''
    }
  }
  // 遍历新的DOM属性并设置
  for (key in props) {
    cur = props[key]
    // ignore children if the node has textContent or innerHTML,
    // as these will throw away existing DOM nodes and cause removal errors
    // on subsequent patches (#3360)
    // 处理textContent/innerHTML的边界条件
    // 当元素的domProps上有textContent或innerHTML属性，则忽略其子节点，避免后续更新时出错
    if (key === 'textContent' || key === 'innerHTML') {
      if (vnode.children) vnode.children.length = 0
      if (cur === oldProps[key]) continue
      // #6601 work around Chrome version <= 55 bug where single textNode
      // replaced by innerHTML/textContent retains its parentNode property
      // Chrome55及以下的八本，当一个包含单个文件节点的元素的innerHTML或textContent被替换时，
      // 这个当个的文本节点仍然保留着其parentNode属性
      // 为了确保正确的更新，需要先移除这个唯一的文件节点
      if (elm.childNodes.length === 1) {
        elm.removeChild(elm.childNodes[0])
      }
    }

    if (key === 'value' && elm.tagName !== 'PROGRESS') {
      // 修改value属性且不是progress元素
      // 将value字符串后并判断是否满足更新的条件
      // store value as _value as well since
      // non-string values will be stringified
      elm._value = cur
      // avoid resetting cursor position when value is the same
      // 避免值相同时重置光标
      const strCur = isUndef(cur) ? '' : String(cur)
      if (shouldUpdateValue(elm, strCur)) {
        elm.value = strCur
      }
    } else if (key === 'innerHTML' && isSVG(elm.tagName) && isUndef(elm.innerHTML)) {
      // IE doesn't support innerHTML for SVG elements
      // IE 的SVG元素不支持innerHTML
      // 使用一个临时容器来存储svg的内容
      // 通过循环逐个删除原始的svg的子元素，再通过循环遍历新的svg的子元素逐个添加到svg元素内
      svgContainer = svgContainer || document.createElement('div')
      svgContainer.innerHTML = `<svg>${cur}</svg>`
      const svg = svgContainer.firstChild
      while (elm.firstChild) {
        elm.removeChild(elm.firstChild)
      }
      while (svg.firstChild) {
        elm.appendChild(svg.firstChild)
      }
    } else if (
      // 其它的属性则比较新旧值是否相同
      // skip the update if old and new VDOM state is the same.
      // `value` is handled separately because the DOM value may be temporarily
      // out of sync with VDOM state due to focus, composition and modifiers.
      // This  #4521 by skipping the unnecesarry `checked` update.
      cur !== oldProps[key]
    ) {
      // some property updates can throw
      // e.g. `value` on <progress> w/ non-finite value
      // 有些属性的更新可能会抛出异常，比如对<progress>的value值设置非有限值的值
      try {
        elm[key] = cur
      } catch (e) {}
    }
  }
}

// check platforms/web/util/attrs.js acceptValue
type acceptValueElm = HTMLInputElement | HTMLSelectElement | HTMLOptionElement;

// 判断是否应该更新特定的DOM元素的value属性
// 解决光标重置的问题
function shouldUpdateValue (elm: acceptValueElm, checkVal: string): boolean {
  return (!elm.composing && ( // 处于合成状态下则不更新
    elm.tagName === 'OPTION' || // option直接更新，因为不会影响用户交互状态
    isNotInFocusAndDirty(elm, checkVal) || // 失去焦点且新旧值不相同则更新
    isDirtyWithModifiers(elm, checkVal) // 存在number或trim修饰符转换后新旧值不相同
  ))
}

// 判断元素是否处于失焦状态且新旧之不相同
function isNotInFocusAndDirty (elm: acceptValueElm, checkVal: string): boolean {
  // return true when textbox (.number and .trim) loses focus and its value is
  // not equal to the updated value
  let notInFocus = true
  // #6157
  // work around IE bug when accessing document.activeElement in an iframe
  try { notInFocus = document.activeElement !== elm } catch (e) {}
  return notInFocus && elm.value !== checkVal
}

// 具有number或者trim修饰符的值格式化后比较
function isDirtyWithModifiers (elm: any, newVal: string): boolean {
  const value = elm.value
  const modifiers = elm._vModifiers // injected by v-model runtime
  if (isDef(modifiers)) { // number修饰符，转为数字后比较
    if (modifiers.number) {
      return toNumber(value) !== toNumber(newVal)
    }
    if (modifiers.trim) { // trim修饰符，转换后比较
      return value.trim() !== newVal.trim()
    }
  }
  return value !== newVal
}

export default {
  create: updateDOMProps,
  update: updateDOMProps
}
