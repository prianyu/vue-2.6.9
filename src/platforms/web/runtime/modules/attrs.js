/* @flow */

import { isIE, isIE9, isEdge } from "core/util/env";

import { extend, isDef, isUndef } from "shared/util";

import {
  isXlink,
  xlinkNS,
  getXlinkProp,
  isBooleanAttr,
  isEnumeratedAttr,
  isFalsyAttrValue,
  convertEnumeratedValue
} from "web/util/index";
// ----------更新同步虚拟节点（VNode）的属性-------------
//-------钩子：create/update------------

// 对比新老节点的属性并设置或更新
// 1. 如果设置了inheritAttrs为false，则不处理属性
// 2. 如果新老节点都没有属性则不处理
// 3. 移除旧节点中不存在于新节点的属性
// 4. 更新或者设置新节点的属性
function updateAttrs(oldVnode: VNodeWithData, vnode: VNodeWithData) {
  const opts = vnode.componentOptions;
  if (isDef(opts) && opts.Ctor.options.inheritAttrs === false) {
    // 不继承属性
    return;
  }
  // 新老节点均没有属性，不做任何操作
  if (isUndef(oldVnode.data.attrs) && isUndef(vnode.data.attrs)) {
    return;
  }
  let key, cur, old;
  const elm = vnode.elm;
  const oldAttrs = oldVnode.data.attrs || {}; // 老节点attrs
  let attrs: any = vnode.data.attrs || {}; // 新节点attrs
  // clone observed objects, as the user probably wants to mutate it
  // 如果attrs有观察者，则克隆后再使用
  // attrs可能被修改，此处是为了减少副作用
  // 由于__ob__是不可枚举的，所以拷贝后的对象也不会有__ob__属性
  if (isDef(attrs.__ob__)) {
    attrs = vnode.data.attrs = extend({}, attrs);
  }

  // 遍历新节点的属性，如果与旧节点的属性不一样则设置（即新增或修改）
  for (key in attrs) {
    cur = attrs[key];
    old = oldAttrs[key];
    if (old !== cur) {
      setAttr(elm, key, cur);
    }
  }
  // #4391: in IE9, setting type can reset value for input[type=radio]
  // #6666: IE/Edge forces progress value down to 1 before setting a max
  /* istanbul ignore if */
  // 对IE和Edge的兼容处理
  // input[radio]，改变type会重置其值
  // <progress> 在没有设置max值之前设置value会被强制设置为1
  if ((isIE || isEdge) && attrs.value !== oldAttrs.value) {
    setAttr(elm, "value", attrs.value);
  }
  // 移除旧属性中不存在于新的属性的部分
  for (key in oldAttrs) {
    if (isUndef(attrs[key])) {
      if (isXlink(key)) {
        elm.removeAttributeNS(xlinkNS, getXlinkProp(key));
      } else if (!isEnumeratedAttr(key)) {
        elm.removeAttribute(key);
      }
    }
  }
}

// 设置单个DOM属性
// 分别处理了自定义组件属性、原生布尔类型属性、命名空间属性、枚举类型属性、其它类型属性的设置和移除
function setAttr(el: Element, key: string, value: any) {
  if (el.tagName.indexOf("-") > -1) { // 自定义组件的属性
    baseSetAttr(el, key, value);
  } else if (isBooleanAttr(key)) {// 原生Boolean类型的属性
    // 如disabled、muted、checked等
    // set attribute for blank value
    // e.g. <option disabled>Select one</option>
    if (isFalsyAttrValue(value)) {
      // 设置为false则移除属性
      el.removeAttribute(key);
    } else {
      // Boolean类型的属性，一般是通过key名来设置，但是allowfullscreen和EMBED需要特殊处理
      // technically allowfullscreen is a boolean attribute for <iframe>,
      // but Flash expects a value of "true" when used on <embed> tag
      value =
        key === "allowfullscreen" && el.tagName === "EMBED" ? "true" : key;
      el.setAttribute(key, value);
    }
  } else if (isEnumeratedAttr(key)) { // 枚举类型的属性（contenteditable,draggable,spellcheck）
    // 转为合法的枚举值
    el.setAttribute(key, convertEnumeratedValue(key, value));
  } else if (isXlink(key)) { // xlink类型的属性
    // xlink
    if (isFalsyAttrValue(value)) { // 从指定命名空间中删除属性
      el.removeAttributeNS(xlinkNS, getXlinkProp(key));
    } else { // 在指定命名空间中设置属性
      el.setAttributeNS(xlinkNS, key, value);
    }
  } else { // 其它值则调用基础设置函数
    baseSetAttr(el, key, value);
  }
}

// 属性的基础设置函数，简单的设置或移除属性
// 当这是的值是falsy时，则移除属性，否则设置属性
// 处理了 IE10+中给textarea设置placeholder时触发input事件的问题
function baseSetAttr(el, key, value) {
  if (isFalsyAttrValue(value)) {
    // false值类型的，移除属性
    el.removeAttribute(key);
  } else {
    // #7138: IE10 & 11 fires input event when setting placeholder on
    // <textarea>... block the first input event and remove the blocker
    // immediately.
    /* istanbul ignore if */
    // IE设置placeholder触发input事件的bug修复
    // 处理方式是阻止第一次input事件的触发，然后再移除这个处理
    if (
      isIE &&
      !isIE9 &&
      el.tagName === "TEXTAREA" &&
      key === "placeholder" &&
      value !== "" &&
      !el.__ieph
    ) {
      const blocker = e => {
        e.stopImmediatePropagation();
        el.removeEventListener("input", blocker);
      };
      el.addEventListener("input", blocker);
      // $flow-disable-line
      el.__ieph = true; /* IE placeholder patched */ // 标记处理
    }
    el.setAttribute(key, value);
  }
}

export default {
  create: updateAttrs,
  update: updateAttrs
};
