/* @flow */

import { isIE, isIE9, isEdge } from 'core/util/env'

import {
  extend,
  isDef,
  isUndef
} from 'shared/util'

import {
  isXlink,
  xlinkNS,
  getXlinkProp,
  isBooleanAttr,
  isEnumeratedAttr,
  isFalsyAttrValue,
  convertEnumeratedValue
} from 'web/util/index'

function updateAttrs (oldVnode: VNodeWithData, vnode: VNodeWithData) {
  const opts = vnode.componentOptions
  if (isDef(opts) && opts.Ctor.options.inheritAttrs === false) { // 不继承属性
    return
  }
  // 新老节点均没有属性
  if (isUndef(oldVnode.data.attrs) && isUndef(vnode.data.attrs)) {
    return
  }
  let key, cur, old
  const elm = vnode.elm
  const oldAttrs = oldVnode.data.attrs || {} // 老节点attrs
  let attrs: any = vnode.data.attrs || {} // 新节点attrs
  // clone observed objects, as the user probably wants to mutate it
  // 如果attrs有观察者，则克隆后再使用
  if (isDef(attrs.__ob__)) {
    attrs = vnode.data.attrs = extend({}, attrs)
  }

  // 遍历新老节点的属性，如果属性改变了则修改
  for (key in attrs) {
    cur = attrs[key]
    old = oldAttrs[key]
    if (old !== cur) {
      setAttr(elm, key, cur)
    }
  }
  // #4391: in IE9, setting type can reset value for input[type=radio]
  // #6666: IE/Edge forces progress value down to 1 before setting a max
  /* istanbul ignore if */
  // 对IE和Edge的兼容处理
  // input[radio]，改变type会重置其值
  // <progress> 在没有设置max值之前设置value会被强制设置为1
  if ((isIE || isEdge) && attrs.value !== oldAttrs.value) {
    setAttr(elm, 'value', attrs.value)
  }
  // 新属性里没有设置的旧属性移除
  for (key in oldAttrs) {
    if (isUndef(attrs[key])) {
      if (isXlink(key)) {
        elm.removeAttributeNS(xlinkNS, getXlinkProp(key))
      } else if (!isEnumeratedAttr(key)) {
        elm.removeAttribute(key)
      }
    }
  }
}

// 设置属性
function setAttr (el: Element, key: string, value: any) {
  if (el.tagName.indexOf('-') > -1) {
    baseSetAttr(el, key, value)
  } else if (isBooleanAttr(key)) { // Boolean类型的属性
    // set attribute for blank value
    // e.g. <option disabled>Select one</option>
    if (isFalsyAttrValue(value)) { // 设置为false则移除属性
      el.removeAttribute(key)
    } else { // 设置属性，一般是以key名一样，除了allowfullscreen和EMBED
      // technically allowfullscreen is a boolean attribute for <iframe>,
      // but Flash expects a value of "true" when used on <embed> tag
      value = key === 'allowfullscreen' && el.tagName === 'EMBED'
        ? 'true'
        : key
      el.setAttribute(key, value)
    }
  } else if (isEnumeratedAttr(key)) { // 枚举值的类型
    el.setAttribute(key, convertEnumeratedValue(key, value))
  } else if (isXlink(key)) { // xlink
    if (isFalsyAttrValue(value)) {
      el.removeAttributeNS(xlinkNS, getXlinkProp(key))
    } else {
      el.setAttributeNS(xlinkNS, key, value)
    }
  } else {
    baseSetAttr(el, key, value)
  }
}

function baseSetAttr (el, key, value) {
  if (isFalsyAttrValue(value)) { // false值类型的，移除属性
    el.removeAttribute(key)
  } else {
    // #7138: IE10 & 11 fires input event when setting placeholder on
    // <textarea>... block the first input event and remove the blocker
    // immediately.
    /* istanbul ignore if */
    // IE设置placeholder触发input事件的bug修复
    // 处理方式是阻止第一次input事件的触发，然后再移除这个处理
    if (
      isIE && !isIE9 &&
      el.tagName === 'TEXTAREA' &&
      key === 'placeholder' && value !== '' && !el.__ieph
    ) {
      const blocker = e => {
        e.stopImmediatePropagation()
        el.removeEventListener('input', blocker)
      }
      el.addEventListener('input', blocker)
      // $flow-disable-line
      el.__ieph = true /* IE placeholder patched */
    }
    el.setAttribute(key, value)
  }
}

export default {
  create: updateAttrs,
  update: updateAttrs
}