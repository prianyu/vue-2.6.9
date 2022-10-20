/**
 * Not type-checking this file because it's mostly vendor code.
 */

/*!
 * HTML Parser By John Resig (ejohn.org)
 * Modified by Juriy "kangax" Zaytsev
 * Original code by Erik Arvidsson, Mozilla Public License
 * http://erik.eae.net/simplehtmlparser/simplehtmlparser.js
 */

import { makeMap, no } from 'shared/util'
import { isNonPhrasingTag } from 'web/compiler/util'
import { unicodeRegExp } from 'core/util/lang'

// Regular Expressions for parsing tags and attributes
const attribute = /^\s*([^\s"'<>\/=]+)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/ // 标签属性正则
const dynamicArgAttribute = /^\s*((?:v-[\w-]+:|@|:|#)\[[^=]+\][^\s"'<>\/=]*)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/ // 标签动态属性正则
const ncname = `[a-zA-Z_][\\-\\.0-9_a-zA-Z${unicodeRegExp.source}]*` //合法的标签名
const qnameCapture = `((?:${ncname}\\:)?${ncname})` // 标签名
const startTagOpen = new RegExp(`^<${qnameCapture}`) // 起始标签的开标签
const startTagClose = /^\s*(\/?)>/ // 开始标签的闭合部分（含自闭合标签）
const endTag = new RegExp(`^<\\/${qnameCapture}[^>]*>`)// 闭合标签
const doctype = /^<!DOCTYPE [^>]+>/i // 匹配doctye标签
// #7298: escape - to avoid being pased as HTML comment when inlined in page
const comment = /^<!\--/ // 匹配注释节点开始标记的正则
const conditionalComment = /^<!\[/ // 匹配条件注释开始的正则

// Special Elements (can contain anything)
export const isPlainTextElement = makeMap('script,style,textarea', true)
const reCache = {}

const decodingMap = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&amp;': '&',
  '&#10;': '\n',
  '&#9;': '\t',
  '&#39;': "'"
}
const encodedAttr = /&(?:lt|gt|quot|amp|#39);/g
const encodedAttrWithNewLines = /&(?:lt|gt|quot|amp|#39|#10|#9);/g

// #5992
const isIgnoreNewlineTag = makeMap('pre,textarea', true)
const shouldIgnoreFirstNewline = (tag, html) => tag && isIgnoreNewlineTag(tag) && html[0] === '\n'

function decodeAttr (value, shouldDecodeNewlines) {
  const re = shouldDecodeNewlines ? encodedAttrWithNewLines : encodedAttr
  return value.replace(re, match => decodingMap[match])
}

// 解析html
export function parseHTML (html, options) {
  const stack = []
  const expectHTML = options.expectHTML
  const isUnaryTag = options.isUnaryTag || no // 判断是否为自闭合标签
  const canBeLeftOpenTag = options.canBeLeftOpenTag || no // 判断是否为可省略闭合标签
  let index = 0 // 当前解析的html所在的位置
  let last, lastTag
  while (html) { 
    last = html
    // Make sure we're not in a plaintext content element like script/style/textarea
    // 确保当前的解析不是在一个纯文本的标签环境内，如script/style标签
    if (!lastTag || !isPlainTextElement(lastTag)) {
      let textEnd = html.indexOf('<') // 也是获取<所在的位置，也是普通文本结束的位置（如“鸡你太美<span>蔡徐坤</span>”）
      if (textEnd === 0) { // 所在位置为0，则为一个标签的开始
        // Comment:
        if (comment.test(html)) { // 注释节点开始标记
          const commentEnd = html.indexOf('-->') // 查找注释节点的结束标记

          if (commentEnd >= 0) { // 找到了注释节点的结束标记
            if (options.shouldKeepComment) { // 需要保留注释节点
              // 获取注释节点的内容，处理注释节点（将注释节点压入父节点）
              options.comment(html.substring(4, commentEnd), index, index + commentEnd + 3)
            }
            // 截取html到注释节点的下一个位置
            advance(commentEnd + 3)
            continue // 继续遍历
          }
        }

        // http://en.wikipedia.org/wiki/Conditional_comment#Downlevel-revealed_conditional_comment
        // IE的条件注释节点
        if (conditionalComment.test(html)) {
          const conditionalEnd = html.indexOf(']>') // 查找条件注释的结束标记

          // 调整html和index，继续遍历
          if (conditionalEnd >= 0) { 
            advance(conditionalEnd + 2)
            continue
          }
        }

        // Doctype:
        // doctype，调整index和html
        const doctypeMatch = html.match(doctype)
        if (doctypeMatch) {
          advance(doctypeMatch[0].length)
          continue
        }
        // 走到这一步，说明解析的不是注释节点、doctype节点合IE的条件注释节点
        // 开始解析结束标签
        // End tag:
        const endTagMatch = html.match(endTag) // 匹配结束标签
        if (endTagMatch) {
          const curIndex = index // 记录当前的index
          advance(endTagMatch[0].length) // 将index和html调整至结束标签结束的位置
          //
          // 参数分别为结束标签名、当前index、结束标签所在的index
          parseEndTag(endTagMatch[1], curIndex, index)
          continue
        }

        // Start tag: 处理开始标签
        const startTagMatch = parseStartTag()
        if (startTagMatch) {
          // 进一步处理上一步得到结果，并最后调用 options.start 方法
          // 真正的解析工作都是在这个 start 方法中做的
          handleStartTag(startTagMatch)
          if (shouldIgnoreFirstNewline(startTagMatch.tagName, html)) {
            advance(1)
          }
          continue
        }
      }

      let text, rest, next
      if (textEnd >= 0) {
        // 走到这里，说明html中虽然匹配到了<xx，但不属于上述的情况，它就是只是一个普通的文本，如“<我是普通文本”
        // 于是从html中找到下一个<，直到<xx是上述的几种情况的标签，则结束
        // 在这个过程中，一直在调整textEnd的值，作为html中下一个有效标签的开始位置

        rest = html.slice(textEnd) // 截取html模板字符串中textEnd之后的内容，rest = <xx
        // 这个while就是处理<xx之后的纯文本的情况
        // 截取文本内容，并找到有效的标签的开始位置（textEnd)
        while (
          !endTag.test(rest) &&
          !startTagOpen.test(rest) &&
          !comment.test(rest) &&
          !conditionalComment.test(rest)
        ) {
          // < in plain text, be forgiving and treat it as text
         
          next = rest.indexOf('<', 1)
          if (next < 0) break // 没有找到<，则直接结束循环
          // 走到这里，说明在后续的字符串中找到了<，索引的位置为textEnd
          textEnd += next
          // 截取html字符串模板textEnd之后的内容赋值给rest，继续判断后续字符串是否存在标签
          rest = html.slice(textEnd)
        }
        // 走到这里说明遍历结束，有两种情况，一种是<之后就是一段纯文本，要么就是后续找到了标签
        // 截取textEnd前面的内容作为text
        text = html.substring(0, textEnd)
      }

      if (textEnd < 0) { // 找不到<,说明html就是一段纯文本
        text = html
      }

      // 将纯文本从html截取出来，更新html和index的位置
      if (text) {
        advance(text.length) 
      }

      // 处理纯文本，基于文本生成ast对象，然后将ast对象放到它的父元素的里
      if (options.chars && text) {
        options.chars(text, index - text.length, index)
      }
    } else {// 处理textarea\style\script等纯文本标签
      let endTagLength = 0
      const stackedTag = lastTag.toLowerCase()
      const reStackedTag = reCache[stackedTag] || (reCache[stackedTag] = new RegExp('([\\s\\S]*?)(</' + stackedTag + '[^>]*>)', 'i'))
      const rest = html.replace(reStackedTag, function (all, text, endTag) {
        endTagLength = endTag.length
        if (!isPlainTextElement(stackedTag) && stackedTag !== 'noscript') {
          text = text
            .replace(/<!\--([\s\S]*?)-->/g, '$1') // #7298
            .replace(/<!\[CDATA\[([\s\S]*?)]]>/g, '$1')
        }
        if (shouldIgnoreFirstNewline(stackedTag, text)) {
          text = text.slice(1)
        }
        if (options.chars) {
          options.chars(text)
        }
        return ''
      })
      index += html.length - rest.length
      html = rest
      parseEndTag(stackedTag, index - endTagLength, index)
    }

    if (html === last) {
      options.chars && options.chars(html)
      if (process.env.NODE_ENV !== 'production' && !stack.length && options.warn) {
        options.warn(`Mal-formatted tag at end of template: "${html}"`, { start: index + html.length })
      }
      break
    }
  }

  // Clean up any remaining tags
  // 走到这里，结束标签其实已经解析完了，但是stack里面可能还有未闭合的开始标签，对其做一次清理
  parseEndTag()

  // 截取html到指定位置
  function advance (n) {
    index += n
    html = html.substring(n)
  }

  // 解析开始标签
  function parseStartTag () {
    // 匹配，得到类似['<div', 'div', index: 0, length: 2]的结构
    const start = html.match(startTagOpen) 
    if (start) {
      const match = {
        tagName: start[1], // 标签名
        attrs: [], // 属性占位符
        start: index // 标签的开始位置
      }
      advance(start[0].length) // 调整index和html到开始标签的结束位置

      // 处理开始标签内的各个属性，并将这些属性放到match.attrs中
      let end, attr
      // 不断匹配，直到匹配到开始标签的结束位置，匹配出动态的属性和普通属性
      // 如html = `<div class="one two" @click="handler" v-on:hover="hover" :name="name"></div>`
      // 经过以上处理后会变成` class="one two" @click="handler" v-on:hover="hover" :name="name"></div>`
      // 再经过以下，match.attrs会变成如下结构：
      /**
       * {
       *   tagName: "div",
       *   start: 0,
       *   attrs: [
       *      [' class="one two"', 'class', '=', 'one two', undefined, undefined, index: 0, start: 4, end: 20],
       *      [' @click="handler"', '@click', '=', 'handler', undefined, undefined, index: 0, start: 20, end: 37],
       *      [' v-on:hover="hover"', 'v-on:hover', '=', 'hover', undefined, undefined, index: 0, start: 37, end: 56],
       *      [' :name="name"', ':name', '=', 'name', undefined, undefined, index: 0,  start: 56, end: 69]
       *   ]
       * }
       * 以上为undefined的分组是因为属性值的可以包裹在双引号、单引号和不包裹三种情况，因此匹配出来会有两个undefined
       */
      while (!(end = html.match(startTagClose)) && (attr = html.match(dynamicArgAttribute) || html.match(attribute))) {
        attr.start = index
        advance(attr[0].length)
        attr.end = index
        match.attrs.push(attr)
      }
      // 走到这里为开始标签匹配结束，此时如果有闭合的话，end可能为>或/>
      if (end) {
        match.unarySlash = end[1] // 如果是/>，此时为/
        advance(end[0].length) // 重新调整html和index至开始标签结束的位置
        match.end = index //标记结束位置
        return match // 返回解析出来的开始标签的各个属性
      }
    }
  }

  // 处理解析出来的开始标签
  function handleStartTag (match) {
    const tagName = match.tagName // 标签名
    const unarySlash = match.unarySlash // 开始标签结束的 /

    if (expectHTML) {
      // 上一次的开始标签如果是p，则按照段落内容模型来判断当前的元素是否可以放置在p元素内
      // 此处判断了不能放置在p元素，则直接将p元素关闭（另外p元素在html中是可以省略闭合标签的）
      if (lastTag === 'p' && isNonPhrasingTag(tagName)) {
        parseEndTag(lastTag)
      }
      // 除p元素外，像li，dd等标签也是可以省略闭合标签的
      // 同时li、dd、dt、td等是不能直接嵌套的
      // 如果判断到上一个元素和当前的元素是同名的，且可以省略闭合标签的，则直接关闭上一个元素
      if (canBeLeftOpenTag(tagName) && lastTag === tagName) {
        parseEndTag(tagName)
      }
    }

    // 自闭合标签，如input、br或者已经自闭合
    const unary = isUnaryTag(tagName) || !!unarySlash

    // 遍历属性
    const l = match.attrs.length
    const attrs = new Array(l)
    for (let i = 0; i < l; i++) {
      const args = match.attrs[i]
      const value = args[3] || args[4] || args[5] || '' // 获取属性值
      const shouldDecodeNewlines = tagName === 'a' && args[1] === 'href'
        ? options.shouldDecodeNewlinesForHref
        : options.shouldDecodeNewlines
      attrs[i] = {
        name: args[1], // 属性名
        value: decodeAttr(value, shouldDecodeNewlines) // 属性值
      }
      if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
        attrs[i].start = args.start + args[0].match(/^\s*/).length
        attrs[i].end = args.end
      }
    }
    // 不是自闭合标签，则将标签描述对象压入stack，用于下次匹配结束标签
    // 自闭合标签就不需要压入stack了，直接处理
    if (!unary) { 
      stack.push({ tag: tagName, lowerCasedTag: tagName.toLowerCase(), attrs: attrs, start: match.start, end: match.end })
      lastTag = tagName // 标记正在解析的开始标签
    }

    // 执行开始标签处理函数
    /**
     * 做了6件事
     * 1. 创建AST对象
     * 2. 处理存在v-model指令的input标签，分别处理type为checkbox、radio、其他的情况
     * 3. 处理标签上的各种指令，如v-pre、v-for、v-if、v-once
     * 4. 如果根节点不存在，则设置当前节点为根节点
     * 5. 如果根节点为非闭合标签，则将自己push到stack中，并记录currentParent，作为接下来处理子元素的父节点
     * 6. 如果当前元素为自闭合标签，则标识该标签要结束了，让自己和父元素产生关系，以及设置自己的子元素
     */
    if (options.start) {
      options.start(tagName, attrs, unary, match.start, match.end)
    }
  }

  // 解析结束标签
  function parseEndTag (tagName, start, end) {
    let pos, lowerCasedTagName
    if (start == null) start = index
    if (end == null) end = index

    // Find the closest opened tag of the same type
    // 倒序遍历stack数组，查找第一个与当前结束标签同名的标签，该标签就是结束标签对应的开始标签的描述对象
    // 理论上，不出意外的画，stack数组中最后一个元素就是当前结束标签的开始标签的描述对象
    if (tagName) {
      lowerCasedTagName = tagName.toLowerCase() // 将标签名转为小写
      for (pos = stack.length - 1; pos >= 0; pos--) {
        if (stack[pos].lowerCasedTag === lowerCasedTagName) {
          break
        }
      }
    } else {
      // If no tag name is provided, clean shop
      pos = 0
    }
    
    // 走到这一步，如果找到同名的标签，pos>=0,否则就是找不到
    if (pos >= 0) { // 当前处理的元素为普通的元素
      // Close all the open elements, up the stack
      // 这个循环主要是为了将stack数组中，索引>=pos的所有标签给关闭了
      // 在正常的情况下，stack的最后一个元素就是我们要找的开始标签
      // 但是有一些异常情况，就是有一些元素在模板中没有提供结束标签，比如stack = ['span', 'div', 'span', 'h1']
      // 如果当前处理的元素是</div>，则此时匹配到的div为所在的pos为1，而span和h1则是没有提供结束标签的，
      // 此时我们在关闭div的同时，将span和h1给关闭了并给出没有提供结束标签的提示
      for (let i = stack.length - 1; i >= pos; i--) {
        if (process.env.NODE_ENV !== 'production' &&
          (i > pos || !tagName) && // 找到的pos小于i，说明有未闭合的标签，给出提示
          options.warn
        ) {
          options.warn(
            `tag <${stack[i].tag}> has no matching end tag.`,
            { start: stack[i].start, end: stack[i].end }
          )
        }
        if (options.end) { // 处理结束标签
          options.end(stack[i].tag, start, end)
        }
      }

      // Remove the open elements from the stack
      // 关闭后需要从stack中将对应的元素移除掉
      stack.length = pos
      lastTag = pos && stack[pos - 1].tag // 记录stack中未处理的最后一个开始标签
    } else if (lowerCasedTagName === 'br') {// 当前处理的标签是br元素
      if (options.start) {
        options.start(tagName, [], true, start, end)
      }
    } else if (lowerCasedTagName === 'p') { // 处理的是p标签，则处理</p>标签
      if (options.start) {
        options.start(tagName, [], false, start, end)
      }
      if (options.end) {
        options.end(tagName, start, end)
      }
    }
  }
}
