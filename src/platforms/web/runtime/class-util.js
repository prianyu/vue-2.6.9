/* @flow */

const whitespaceRE = /\s+/

/**
 * Add class with compatibility for SVG since classList is not supported on
 * SVG elements in IE
 * 往样式表添加类名
 * 使用classList添加或者拼接class属性
 */
export function addClass (el: HTMLElement, cls: ?string) {
  /* istanbul ignore if */
  if (!cls || !(cls = cls.trim())) {
    return
  }

  /* istanbul ignore else */
  if (el.classList) {// 支持classList
    if (cls.indexOf(' ') > -1) { // 空格分割的字符串则拆成数组后遍历添加
      cls.split(whitespaceRE).forEach(c => el.classList.add(c))
    } else { // 单个则直接添加
      el.classList.add(cls)
    }
  } else { // 不支持classList
    const cur = ` ${el.getAttribute('class') || ''} ` // 获取class属性（前后加了空格）
    if (cur.indexOf(' ' + cls + ' ') < 0) { // 样式不在样式表，则添加
      el.setAttribute('class', (cur + cls).trim())
    }
  }
}

/**
 * Remove class with compatibility for SVG since classList is not supported on
 * SVG elements in IE
 */
export function removeClass (el: HTMLElement, cls: ?string) {
  /* istanbul ignore if */
  if (!cls || !(cls = cls.trim())) {
    return
  }

  /* istanbul ignore else */
  if (el.classList) { // 支持classList
    // 多个class遍历删除
    if (cls.indexOf(' ') > -1) {
      cls.split(whitespaceRE).forEach(c => el.classList.remove(c))
    } else { // 单个直接删除
      el.classList.remove(cls)
    }
    if (!el.classList.length) {
      el.removeAttribute('class')
    }
  } else { // 不支持classList
    let cur = ` ${el.getAttribute('class') || ''} `
    const tar = ' ' + cls + ' '
    // 遍历替换样式
    while (cur.indexOf(tar) >= 0) {
      cur = cur.replace(tar, ' ')
    }

    // 删除后有剩余样式则重新设置
    cur = cur.trim()
    if (cur) {
      el.setAttribute('class', cur)
    } else {
      el.removeAttribute('class')
    }
  }
}
