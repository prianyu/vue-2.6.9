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
const conditionalComment = /^<!\[/ // 匹配downlevel-revealed非规范写法的条件注释

// Special Elements (can contain anything)
export const isPlainTextElement = makeMap('script,style,textarea', true) // 判断是否为纯文本标签
const reCache = {} // 缓存匹配纯文本标签内容和结束标签的正则

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
// 因为一些历史原因，有些元素具有超出了内容模型限制的额外限制
// 比如pre和textarea两个标签是允许以一个空行开头的，但是它应该被忽略，不应该影响pre和textarea的解析，如下两个写法是等效的：
// <pre>test</pre>和
//<pre>
//   test
// </pre>
// 详细见此规范：https://html.spec.whatwg.org/multipage/syntax.html#element-restrictions
// 如果标签本身内容想以换行符开头，那么需要输入两个换行符才可以
// 但是Vue一开始在处理时并没有遵循这个规范，所以会导致页面闪烁（加载时浏览器会忽略第一行，高度低，vue解析后没有忽略第一行，高度高）
// 因此，针对textarea和pre标签，需要忽略第一个空白行
// 由于浏览器其实在加载时就做了处理，Vue此处应该只对SSR做处理才对，但Vue针对浏览器的情况也做了这个处理，所以这里其实还是一个bug
const isIgnoreNewlineTag = makeMap('pre,textarea', true)
const shouldIgnoreFirstNewline = (tag, html) => tag && isIgnoreNewlineTag(tag) && html[0] === '\n' //是否忽略第一行空白行
function decodeAttr (value, shouldDecodeNewlines) {
  const re = shouldDecodeNewlines ? encodedAttrWithNewLines : encodedAttr
  return value.replace(re, match => decodingMap[match])
}

// 解析html
export function parseHTML (html, options) {
  const stack = [] // 用于存放解析的开发标签
  const expectHTML = options.expectHTML
  const isUnaryTag = options.isUnaryTag || no // 判断是否为自闭合标签
  const canBeLeftOpenTag = options.canBeLeftOpenTag || no // 判断是否为可省略闭合标签
  let index = 0 // 当前解析的html所在的位置
  let last, lastTag
  while (html) { 
    last = html // 将当前html记录起来，用于后续比较
    // Make sure we're not in a plaintext content element like script/style/textarea
    // 确保当前的解析不是在一个纯文本的标签环境内，如script/style/textarea标签
    if (!lastTag || !isPlainTextElement(lastTag)) {
       // 获取<所在的位置，也是普通文本结束的位置（如“鸡你太美<span>蔡徐坤</span>”，得到的是<span>标签的开始位置）
      let textEnd = html.indexOf('<')
      if (textEnd === 0) { // 所在位置为0，则为一个标签的开始
        // Comment: 注释节点，如果配置了保留就保留，否则就删除掉
        if (comment.test(html)) { // 注释节点开始标记 <!--
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
        /**
         * IE的条件注释
         * 条件注释是由两种语法的
         * 1. downlevel-hidden <!--[if expression]> HTML <![endif]--> ，叫下层隐藏
         *    这种语法，在支持的浏览器会正常判断并决定是否渲染，在不支持的浏览器会当作普通注释，内容不会被识别到永远不会展示
         * 2 . downlevel-revealed <![if expression]> HTML <![endif]>，叫下层展示
         *    这种语法，在支持的浏览器上会正常判断并决定是否渲染，在不支持的浏览器下可以正常识别内容，并将其当作普通的html解析展示
         *    （如大于IE9或非IE）
         *    这种其实是一种不符合规范的写法，其规范写法为<!--[if expression]>-->HTML<!--<![endif]-->
         * 等价于：<!--[if expression]><!-->HTML<!--<![endif]-->
         */ 
        /**
         * 另外，IE注释节点在浏览器加载的时候就执行了，也就是Vue还没执行时就已经执行
         * 直到Vue开始解析时，在支持条件注释的IE浏览器相应的注释部分将会被替换为真实的HTML，
         * 如<!-- if gt IE 8]><span>test</span><![endif]-->会被替换为<span>test</span>
         * 按照以上规则，对于downlevel-hidden以及downlevel-revealed的规范写法的条件注释，不支持的浏览器已经被作为普通注释节点解析了
         * 以下逻辑则是专门处理downlevel-revealed的非规范写法，如果解析到了，则说明当下不支持条件注释，则直接移除条件注释语法并保留
         * 其内容就可以了
         */
        if (conditionalComment.test(html)) { // <![
          const conditionalEnd = html.indexOf(']>') // ]>

          // 删除整个条件节点，直接调整html和index，继续遍历
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
        // 走到这一步，说明解析的不是注释节点、doctype节点和IE的条件注释节点


        // 解析结束标签（结束标签解析时只有以结束标签标记开头才可以解析到）
        // 如 html = "<span></span></div><div>...</div>"这个时候匹配到的endTagMatch为null
        // html = "</div><div>...</div>"这时候就可以匹配到</div>这个结束标签
        // End tag: 会关闭标签并从stack中移除开始标签的记录，也会处理br标签
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
        // 匹配开始标签，含有标签名和属性集合 {tagName, attrs, start, end}
        const startTagMatch = parseStartTag() 
        if (startTagMatch) {
          // 进一步处理上一步得到结果，主要是对属性值做一些编码解码处理以及对不可相互嵌套的标签做处理，
          // 最后调用 options.start 方法生成AST并处理AST，抽象语法树的工作都是在这个 start 方法中做的
          handleStartTag(startTagMatch)
          if (shouldIgnoreFirstNewline(startTagMatch.tagName, html)) { // 对于pre，忽略第一个空白行
            advance(1)
          }
          continue
        }
      }
      // 走到这里说明没匹配到注释、doctype、开始标签、结束标签、条件注释等情况，
      // 那么剩下的当作普通文本处理
      // 以下解析裸漏的普通文本
      let text, rest, next
      if (textEnd >= 0) {
        // 走到这里，说明html中虽然匹配到了<xx，但不属于上述的情况，它就是只是一个普通的文本，如`<我是普通文本 a="test" :b="test2"`
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
          // 只要剩余的html开头匹配不到这些情况
        ) {
          // < in plain text, be forgiving and treat it as text
         
          next = rest.indexOf('<', 1) // 找到下一个<的位置
          if (next < 0) break // 没有找到<，则直接结束循环，认为后续的所有的内容都是普通文本
          // 走到这里，说明在后续的字符串中找到了<，更新textEnd的位置为下一个<所在的位置，继续找下一个<
          textEnd += next
          // 截取html字符串模板textEnd之后的内容赋值给rest，继续判断后续字符串是否存在标签
          rest = html.slice(textEnd)
        }
        // 走到这里说明遍历结束，有两种情况，一种是<之后就是一段纯文本，要么就是后续找到了标签
        // 截取textEnd前面的内容作为text
        text = html.substring(0, textEnd)
      }

      if (textEnd < 0) { // 找不到<,说明剩下的html就是一段纯文本，如template: "abcd"，template: "<div>纯文字"
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
      let endTagLength = 0 // 闭合标签的长度
      const stackedTag = lastTag.toLowerCase() // 获取上一次的标签名
      // 用于匹配纯文本标签的内容和结束标签的正则
      const reStackedTag = reCache[stackedTag] || (reCache[stackedTag] = new RegExp('([\\s\\S]*?)(</' + stackedTag + '[^>]*>)', 'i'))
      const rest = html.replace(reStackedTag, function (all, text, endTag) {
        // 如"alert(1)</script>"匹配的结果为
        // all: "alert(1)</script>", "alert(1)", "</script>"
        endTagLength = endTag.length // 得到结束标签的长度
        // @suspense
        if (!isPlainTextElement(stackedTag) && stackedTag !== 'noscript') {// 存在lastTag，但是不是纯文本标签
          text = text
            .replace(/<!\--([\s\S]*?)-->/g, '$1') // #7298
            .replace(/<!\[CDATA\[([\s\S]*?)]]>/g, '$1')
        }
        if (shouldIgnoreFirstNewline(stackedTag, text)) { // 对于textarea，忽略第一个空白行
          text = text.slice(1)
        }
        if (options.chars) {
          options.chars(text)
        }
        return ''
      })
      //调整htnml和index
      index += html.length - rest.length
      html = rest
      parseEndTag(stackedTag, index - endTagLength, index)
    }

    // 处理结束了，html和last相等，说明经历完以上的逻辑后，html并没有发生任何的改变
    // 此时就将整段html当作纯文本来处理，如0<1<2，经过以上处理后html和last都会变为<2，这一部分则会被当作普通文本处理
    if (html === last) {
      // 剩下的当作普通文本处理
      options.chars && options.chars(html)
      if (process.env.NODE_ENV !== 'production' && !stack.length && options.warn) {
        // 这是一种极端情况，用于处理不合法的html
        // stack为空，说明了stack清理完了或者还没有压入根标签
        // 走到这里了说明html === last是成立的，但是没有配到注释、标签、结束标签，同时text应该为空
        // 以下代码都会触发此逻辑
        // 1. template: "<1", 此时textEnd为0，stack为空，经过以上处理后html没有任何变化
        // 2. template："<",此时textEnd为0，stack为空，经过以上处理后html没有任何变化
        // 3. template: '<div></div><1', 此时stack被正常清空了，剩下的<1同情况1
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
  // 1. 匹配到开始标签
  // 2. 提取标签内所有的属性
  // 3. 标签完整则返回标签描述对象（含标签名、属性集合等）
  // 4. 标签不完整返回undefined

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
      // 这里由于只有end能匹配到时才可以正常返回标签节点，如果匹配不到则返回undefined
      //，所以parseHTML函数中调用完无法执行coutinue继续下一次循环，会走到普通文本的处理
      // 同时，由于在以上的循环中解析属性时已经对html进行了截取，所以再处理普通文本时已经丢失了这一部分的内容
      // 这个处理与浏览器处理HTML的方式并不一致，浏览器的处理方式则是这一部分解析不到完整结束标签的内容会被
      // 当作普通文本来处理，所以这个是Vue的一个bug？
      // 举例：
      // template: `<div a="1" b="c"`Vue会解析为空标签，浏览器则会解析为没有内容标签放到html中
      if (end) {
        match.unarySlash = end[1] // 如果是/>，此时为/
        advance(end[0].length) // 重新调整html和index至开始标签结束的位置
        match.end = index //标记结束位置
        return match // 返回解析出来的开始标签的各个属性
      }
    }
  }

  // 处理解析出来的开始标签
  // 1. 判断是否在p标签内且不能包含在p标签内，是的话则将上一次解析到的p标签关闭
  // 2. 判断是否为不能互相直接嵌套的元素（如li，td）,是则关闭上一个元素
  // 3. 对属性进行编码处理
  // 4. 将非自闭合标签的开标签压入stack，并赋值给lastTag
  // 5. 执行start回调，创建AST和处理AST对象的各种指令等（v-if,v-for...)
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

    // 遍历属性并处理
    const l = match.attrs.length
    const attrs = new Array(l)
    for (let i = 0; i < l; i++) {
      const args = match.attrs[i]
      const value = args[3] || args[4] || args[5] || '' // 获取属性值，默认是''，也就是只要存在属性就不会为undefined或者null
      // 判断是否解码属性内的换行符
      const shouldDecodeNewlines = tagName === 'a' && args[1] === 'href'
        ? options.shouldDecodeNewlinesForHref
        : options.shouldDecodeNewlines
      attrs[i] = {
        name: args[1], // 属性名
        value: decodeAttr(value, shouldDecodeNewlines) // 属性值进行解码
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
  // 1. 查找出开始标签，如果找出来的开始标签不在stack最后一个，说明该标签内部存在未闭合的标签，给出提示
  // 2. 所有未闭合的标签和当前解析到的标签执行end回调，做关闭处理
  // 3. 已经闭合的标签会从stack中移除
  // 4. 处理了</br>和独立的</p>标签，这两个本质上被当作换行标签处理，其中</p>会被处理成<p></p>，</br>被处理成<br>
  function parseEndTag (tagName, start, end) {
    let pos, lowerCasedTagName
    if (start == null) start = index
    if (end == null) end = index

    // Find the closest opened tag of the same type
    // 倒序遍历stack数组，查找第一个与当前结束标签同名的标签，该标签就是结束标签对应的开始标签的描述对象
    // 理论上，不出意外的话，stack数组中最后一个元素就是当前结束标签的开始标签的描述对象
    if (tagName) {
      lowerCasedTagName = tagName.toLowerCase() // 将标签名转为小写
      for (pos = stack.length - 1; pos >= 0; pos--) {
        if (stack[pos].lowerCasedTag === lowerCasedTagName) {
          break
        }
      }
    } else { // 没有提供tagName，说明调用方不是从解析到结束标签过来的，本质是用来清理stack里剩余的标签
      // If no tag name is provided, clean shop
      pos = 0
    }
    
    // 如果找到同名的标签，pos>=0或者tagName为空，否则pos = -1
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
        if (options.end) { // 处理所有的结束标签
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
      if (options.start) { // 补充一个<p>开始标签
        options.start(tagName, [], false, start, end)
      }
      if (options.end) { // 关闭p标签
        options.end(tagName, start, end)
      }
    }
  }
}
