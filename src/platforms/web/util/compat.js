/* @flow */

// 浏览器兼容性处理

import { inBrowser } from 'core/util/index'

// check whether current browser encodes a char inside attribute values
//检查当前浏览器是否在属性值中编码字符
/**
 * 某些浏览器中，在使用innerHTML获取内容的时候，换行符和制表符会分别被转换成&#10和&#9
 * IE浏览器中，不仅仅href属性值，任何的属性值都会做如上处理
 * 这个特性将会影响Vue编译器在对模板进行编译的结果，为了避免这些问题，Vue需要知道什么时候
 * 要做兼容工作
 * shouldDecodeNewlines为true时，意味着需要对属性值重点换行符和制表符做兼容工作
 * shouldDecodeNewlinesForHref为true时，意味着需要对a标签的href属性中的换行符和制表符做兼容处理
 * 在IE中以下代码被转换后会导致Vue解析出错
 * 
 <div
    :style="{
      'color': 'red'
    }"
  >
    Hello
  </div>
转换后：
 <div :style="{&#10;    'color': 'red'&#10;   }"  >
    Hello
  </div>
  这个属性值在Vue解析模板时会当作无效的表达式来处理
 */


let div
function getShouldDecode (href: boolean): boolean {
  div = div || document.createElement('div')
  div.innerHTML = href ? `<a href="\n"/>` : `<div a="\n"/>`
  return div.innerHTML.indexOf('&#10;') > 0
}

// #3663: IE encodes newlines inside attribute values while other browsers don't
export const shouldDecodeNewlines = inBrowser ? getShouldDecode(false) : false
// #6828: chrome encodes content in a[href]
export const shouldDecodeNewlinesForHref = inBrowser ? getShouldDecode(true) : false
