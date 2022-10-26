/* @flow */

const validDivisionCharRE = /[\w).+\-_$\]]/

// 解析过滤器
// 以name|filter(1,2)为例
export function parseFilters (exp: string): string {
  let inSingle = false // 是否在单引号内'
  let inDouble = false // 是否在双引号内"
  let inTemplateString = false // 是否在模板字符串内`
  let inRegex = false // 是否在正则表达式内
  let curly = 0
  let square = 0
  let paren = 0
  let lastFilterIndex = 0
  let c, prev, i, expression, filters
  for (i = 0; i < exp.length; i++) {
    prev = c
    c = exp.charCodeAt(i)
    if (inSingle) {// 在单引号内'
      // c为单引号，且上一个字符不为\\，说明引号关闭了，将inSingle标记为false
      if (c === 0x27 && prev !== 0x5C) inSingle = false
    } else if (inDouble) { // 在双引号内"
      // c为双引号，且上一个字符不为\\，说明引号关闭了，将inDouble标记为false
      if (c === 0x22 && prev !== 0x5C) inDouble = false
    } else if (inTemplateString) { // 在模板字符串内
      // c为反引号`，且上一个字符不为\\，说明模板字符串关闭了，将inTemplateString标记为false
      if (c === 0x60 && prev !== 0x5C) inTemplateString = false
    } else if (inRegex) { // 在正则表达式内
      // 如果c为/，且上一个字符不为\，则是正则表达式的结束标记，将inRegex置为false
      if (c === 0x2f && prev !== 0x5C) inRegex = false
    } else if (
      c === 0x7C && // 管道符
      exp.charCodeAt(i + 1) !== 0x7C && // 前面不是管道符
      exp.charCodeAt(i - 1) !== 0x7C && // 后面不是管道符
      !curly && !square && !paren // 不在花括弧、方括弧、小括弧内
    ) {
      if (expression === undefined) { // 首次解析
        // first filter, end of expression
        lastFilterIndex = i + 1 // 往前跳一位
        expression = exp.slice(0, i).trim() // 截取exp，得到name
      } else {// 解析到过滤器，压入过滤器
        // 每解析到一个就会根据lastFilterIndex和i截取得到一个过滤器
        pushFilter()
      }
    } else {
      switch (c) {
        case 0x22: inDouble = true; break         // 匹配到"
        case 0x27: inSingle = true; break         // 匹配到'
        case 0x60: inTemplateString = true; break // 匹配到` 
        case 0x28: paren++; break                 // 匹配到(，paren计数+1
        case 0x29: paren--; break                 // 匹配到)，paren计数-1
        case 0x5B: square++; break                // 匹配到[，square计数+1
        case 0x5D: square--; break                // 匹配到]，square计数-1
        case 0x7B: curly++; break                 // 匹配到{，curly计数+1
        case 0x7D: curly--; break                 // 匹配到}，curly计数-1
      }
      if (c === 0x2f) { // 匹配到/符
        let j = i - 1
        let p
        // find first non-whitespace prev char
        // 一直往前找到第一个非空白的字符
        for (; j >= 0; j--) {
          p = exp.charAt(j)
          if (p !== ' ') break
        }
        if (!p || !validDivisionCharRE.test(p)) { // 标记为正则表达式内
          inRegex = true
        }
      }
    }
  }

  if (expression === undefined) { // 说明没有解析过滤器
    expression = exp.slice(0, i).trim()
  } else if (lastFilterIndex !== 0) {
    pushFilter()
  }

  // 添加过滤器
  function pushFilter () {
    // 以当次解析的开始字符到当前解析到的管道符位置，截取得到过滤器
    (filters || (filters = [])).push(exp.slice(lastFilterIndex, i).trim())
    lastFilterIndex = i + 1
  }

  if (filters) { // 有过滤器
    // 不断迭代过滤器，生成执行过滤器的代码
    for (i = 0; i < filters.length; i++) {
      expression = wrapFilter(expression, filters[i])
    }
  }

  return expression
}

function wrapFilter (exp: string, filter: string): string {
  const i = filter.indexOf('(') // 是否带参数
  if (i < 0) { // 不带参数
    // _f: resolveFilter
    // 生成执行过滤器的代码
    return `_f("${filter}")(${exp})`
  } else { // 生成带参数的过滤器的代码
    const name = filter.slice(0, i) // 截取过滤器名称
    const args = filter.slice(i + 1) // 截取参数列表
    // 可能为空的列表参数如，name | filter()，这种情况直接拼接")"即可
    return `_f("${name}")(${exp}${args !== ')' ? ',' + args : args}`
  }
}
