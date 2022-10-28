/* @flow */

import { cached } from 'shared/util'
import { parseFilters } from './filter-parser'

const defaultTagRE = /\{\{((?:.|\r?\n)+?)\}\}/g // 匹配{{...}}
const regexEscapeRE = /[-.*+?^${}()|[\]\/\\]/g

// 根据定界符创建插值表达式的正则
const buildRegex = cached(delimiters => {
  const open = delimiters[0].replace(regexEscapeRE, '\\$&')
  const close = delimiters[1].replace(regexEscapeRE, '\\$&')
  return new RegExp(open + '((?:.|\\n)+?)' + close, 'g')
})

// 解析后有expresstion和tokens
type TextParseResult = {
  expression: string,
  tokens: Array<string | { '@binding': string }>
}
// 解析模板中的文本以及插值表达式
// 最终返回一段用于执行的代码
export function parseText (
  text: string,
  delimiters?: [string, string]
): TextParseResult | void {
  // 获取正则
  const tagRE = delimiters ? buildRegex(delimiters) : defaultTagRE
  if (!tagRE.test(text)) { // 匹配不到
    return
  }
  const tokens = []
  const rawTokens = []
  let lastIndex = tagRE.lastIndex = 0
  let match, index, tokenValue
  // 以“abc{{name|filter(1,2)}},def{{age}}"，循环第一次为例
  while ((match = tagRE.exec(text))) { // match = ["{{name|filter(1,2)}}","name|filter(1,2)"]
    index = match.index
    // push text token
    if (index > lastIndex) {
      // 截取“{{”之前的内容， 得到"abc"，压入tokens和rawTokens
      rawTokens.push(tokenValue = text.slice(lastIndex, index)) 
      tokens.push(JSON.stringify(tokenValue))  
    }
    // tag token
    // 解析插值表达式
    const exp = parseFilters(match[1].trim()) // 解析过滤器，得到_f("filter")(name,1,2)；解析到age的时候没有过滤器，结果是“age”
    tokens.push(`_s(${exp})`) // 生成执行_s函数的字符串，压入tokens：_s(_f("filter")(name,1,2))
    rawTokens.push({ '@binding': exp }) // 压入{@binding: '_f("filter")(name,1,2)'}
    lastIndex = index + match[0].length // 更新lastIndex
  }
  // 解析完插值表达式，剩下的普通文本也要压入进去
  if (lastIndex < text.length) {
    rawTokens.push(tokenValue = text.slice(lastIndex))
    tokens.push(JSON.stringify(tokenValue))
  }
  return {
    // 最终生成一个可执行的代码，"abc"+_s(_f("filter")(name,1,2))+",def"+_s(age)
    expression: tokens.join('+'), 
    tokens: rawTokens
  }
}
