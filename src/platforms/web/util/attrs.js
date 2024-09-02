/* @flow */

import { makeMap } from 'shared/util'

// these are reserved for web because they are directly compiled away
// during template compilation
// 检测是否为保留属性，这里只有style和class两个属性
export const isReservedAttr = makeMap('style,class')

// attributes that should be using props for binding
// 具有value属性的标签
const acceptValue = makeMap('input,textarea,option,select,progress')

// 检测是否为原生属性，有value|selected|checked|muted
export const mustUseProp = (tag: string, type: ?string, attr: string): boolean => {
  return (
    (attr === 'value' && acceptValue(tag)) && type !== 'button' ||
    (attr === 'selected' && tag === 'option') ||
    (attr === 'checked' && tag === 'input') ||
    (attr === 'muted' && tag === 'video')
  )
}

// HTML全局枚举属性
export const isEnumeratedAttr = makeMap('contenteditable,draggable,spellcheck')

// 合法的contenteditable属性值
const isValidContentEditableValue = makeMap('events,caret,typing,plaintext-only')


// 将全局枚举属性转为合法的值
export const convertEnumeratedValue = (key: string, value: any) => {
  return isFalsyAttrValue(value) || value === 'false'
    ? 'false'
    // allow arbitrary string value for contenteditable
    : key === 'contenteditable' && isValidContentEditableValue(value)
      ? value
      : 'true'
}

// 检测属性是否为布尔类型的属性
export const isBooleanAttr = makeMap(
  'allowfullscreen,async,autofocus,autoplay,checked,compact,controls,declare,' +
  'default,defaultchecked,defaultmuted,defaultselected,defer,disabled,' +
  'enabled,formnovalidate,hidden,indeterminate,inert,ismap,itemscope,loop,multiple,' +
  'muted,nohref,noresize,noshade,novalidate,nowrap,open,pauseonexit,readonly,' +
  'required,reversed,scoped,seamless,selected,sortable,translate,' +
  'truespeed,typemustmatch,visible'
)

// xlink命名空间
export const xlinkNS = 'http://www.w3.org/1999/xlink'

// 判断属性名是否以xlink:开头，如xlink:href,xlink:type
export const isXlink = (name: string): boolean => {
  return name.charAt(5) === ':' && name.slice(0, 5) === 'xlink'
}

// 获取xlink:后面的属性名,如xlink:href => href
export const getXlinkProp = (name: string): string => {
  return isXlink(name) ? name.slice(6, name.length) : ''
}

// 判断某个值是否为falsy值：null、undefined、false
export const isFalsyAttrValue = (val: any): boolean => {
  return val == null || val === false
}
