/* @flow */

import { dirRE, onRE } from './parser/index'

type Range = { start?: number, end?: number };

// these keywords should not appear inside expressions, but operators like
// typeof, instanceof and in are allowed
// javascript保留关键词
const prohibitedKeywordRE = new RegExp('\\b' + (
  'do,if,for,let,new,try,var,case,else,with,await,break,catch,class,const,' +
  'super,throw,while,yield,delete,export,import,return,switch,default,' +
  'extends,finally,continue,debugger,function,arguments'
).split(',').join('\\b|\\b') + '\\b')

// these unary operators should not be used as property/method names
// 一元操作符不能被使用作为函数名和属性名，有delete,typeof和void
const unaryOperatorsRE = new RegExp('\\b' + (
  'delete,typeof,void'
).split(',').join('\\s*\\([^\\)]*\\)|\\b') + '\\s*\\([^\\)]*\\)')

// strip strings in expressions
// 匹配'', "", ``, `${}`
const stripStringRE = /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*\$\{|\}(?:[^`\\]|\\.)*`|`(?:[^`\\]|\\.)*`/g

// detect problematic expressions in a template
//检查AST树的错误
export function detectErrors (ast: ?ASTNode, warn: Function) {
  if (ast) {
    checkNode(ast, warn)
  }
}

function checkNode (node: ASTNode, warn: Function) {
  if (node.type === 1) {
    for (const name in node.attrsMap) { // 检查属性集合
      if (dirRE.test(name)) { // 指令
        const value = node.attrsMap[name]
        if (value) {
          const range = node.rawAttrsMap[name]
          if (name === 'v-for') { // 检查v-for
            checkFor(node, `v-for="${value}"`, warn, range)
          } else if (onRE.test(name)) { // 检查v-on
            checkEvent(value, `${name}="${value}"`, warn, range)
          } else { // 检查其他指令
            checkExpression(value, `${name}="${value}"`, warn, range)
          }
        }
      }
    }
    if (node.children) { // 递归检查
      for (let i = 0; i < node.children.length; i++) {
        checkNode(node.children[i], warn)
      }
    }
  } else if (node.type === 2) { // 检查表达式
    checkExpression(node.expression, node.text, warn, node)
  }
}

// 检查v-on
function checkEvent (exp: string, text: string, warn: Function, range?: Range) {
  const stipped = exp.replace(stripStringRE, '')
  const keywordMatch: any = stipped.match(unaryOperatorsRE)
  // 一元操作符不能作为事件名
  if (keywordMatch && stipped.charAt(keywordMatch.index - 1) !== '$') {
    warn(
      `avoid using JavaScript unary operator as property name: ` +
      `"${keywordMatch[0]}" in expression ${text.trim()}`,
      range
    )
  }
  // 检查表达式
  checkExpression(exp, text, warn, range)
}

// 检查v-for
function checkFor (node: ASTElement, text: string, warn: Function, range?: Range) {
  checkExpression(node.for || '', text, warn, range) // 检查表达式
  checkIdentifier(node.alias, 'v-for alias', text, warn, range) //检查v-for的迭代选项名称
  checkIdentifier(node.iterator1, 'v-for iterator', text, warn, range) // 检查v-for的迭代key/index名称
  checkIdentifier(node.iterator2, 'v-for iterator', text, warn, range) // 检查v-for的index
}

// 检查标识是否合法
function checkIdentifier (
  ident: ?string,
  type: string,
  text: string,
  warn: Function,
  range?: Range
) {
  if (typeof ident === 'string') {
    try {
      new Function(`var ${ident}=_`)
    } catch (e) {
      warn(`invalid ${type} "${ident}" in expression: ${text.trim()}`, range)
    }
  }
}

// 检查表达式是否合法
function checkExpression (exp: string, text: string, warn: Function, range?: Range) {
  try {
    // 尝试执行表达式
    new Function(`return ${exp}`)
  } catch (e) {
    const keywordMatch = exp.replace(stripStringRE, '').match(prohibitedKeywordRE)
    if (keywordMatch) {
      warn(
        `avoid using JavaScript keyword as property name: ` +
        `"${keywordMatch[0]}"\n  Raw expression: ${text.trim()}`,
        range
      )
    } else {
      warn(
        `invalid expression: ${e.message} in\n\n` +
        `    ${exp}\n\n` +
        `  Raw expression: ${text.trim()}\n`,
        range
      )
    }
  }
}
