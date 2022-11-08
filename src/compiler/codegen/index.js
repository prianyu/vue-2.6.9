/* @flow */

import { genHandlers } from './events'
import baseDirectives from '../directives/index'
import { camelize, no, extend } from 'shared/util'
import { baseWarn, pluckModuleFunction } from '../helpers'
import { emptySlotScopeToken } from '../parser/index'

type TransformFunction = (el: ASTElement, code: string) => string;
type DataGenFunction = (el: ASTElement) => string;
type DirectiveFunction = (el: ASTElement, dir: ASTDirective, warn: Function) => boolean;

export class CodegenState {
  options: CompilerOptions;
  warn: Function;
  transforms: Array<TransformFunction>;
  dataGenFns: Array<DataGenFunction>;
  directives: { [key: string]: DirectiveFunction };
  maybeComponent: (el: ASTElement) => boolean;
  onceId: number;
  staticRenderFns: Array<string>;
  pre: boolean;

  constructor (options: CompilerOptions) {
    this.options = options // 与parseHTML的options一致
    this.warn = options.warn || baseWarn
    this.transforms = pluckModuleFunction(options.modules, 'transformCode') //从modules中提取transformCode函数，这里为空
    this.dataGenFns = pluckModuleFunction(options.modules, 'genData') // 从modules中提取genData函数，这里只有style和class模块有此函数
    // 合并指令，基本的指令为bind、on、cloak、html、text、model指令
    this.directives = extend(extend({}, baseDirectives), options.directives) 
    const isReservedTag = options.isReservedTag || no // 是否html和svg的标签
    this.maybeComponent = (el: ASTElement) => !!el.component || !isReservedTag(el.tag) // 判断是否为一个组件名称
    this.onceId = 0
    this.staticRenderFns = [] // 用于存放静态根节点的render函数
    this.pre = false
  }
}
// generate最终会生成一个包含render和staticRenderFns的对象
export type CodegenResult = {
  render: string,
  staticRenderFns: Array<string>
};

// 将抽象语法树转为render函数的代码字符串
// 将来会通过new Function来执行这段字符串，从而得到render函数
export function generate (
  ast: ASTElement | void, // 抽象语法树
  options: CompilerOptions // 配置选项
): CodegenResult {
  const state = new CodegenState(options) // 代码编译的基础配置等
  // 有ast则创建，无则创建一个空的div元素
  const code = ast ? genElement(ast, state) : '_c("div")' 
  return {
    // 将生成的代码使用with进行包裹后作为render函数
    // 最终会被放到vm.options.render中
    render: `with(this){return ${code}}`, 
    // 最终会被放到vm.options.staticRenderFns中
    staticRenderFns: state.staticRenderFns
  }
}

// 根据AST树生成render函数的代码体
export function genElement (el: ASTElement, state: CodegenState): string {
  // 标记是否在v-pre指令下
  if (el.parent) { 
    el.pre = el.pre || el.parent.pre
  }

  if (el.staticRoot && !el.staticProcessed) { // 拼接静态节点
    return genStatic(el, state)
  } else if (el.once && !el.onceProcessed) { // 拼接v-once节点
    return genOnce(el, state)
  } else if (el.for && !el.forProcessed) { // 拼接v-for
    return genFor(el, state)
  } else if (el.if && !el.ifProcessed) { // 拼接v-if
    return genIf(el, state)
  } else if (el.tag === 'template' && !el.slotTarget && !state.pre) { // template且不是提供给插槽的
    // 会直接处理其子节点作为template标签的父元素的children节点
    return genChildren(el, state) || 'void 0'
  } else if (el.tag === 'slot') { // 拼接slot
    return genSlot(el, state)
  } else { // 其他的标签
    // component or element
    let code
    if (el.component) { // 拼接组件
      code = genComponent(el.component, el, state)
    } else {
      let data
      if (!el.plain || (el.pre && state.maybeComponent(el))) {
        data = genData(el, state) // 拼接data对象
      }

      // 处理完父节点，遍历处理所有的子节点
      const children = el.inlineTemplate ? null : genChildren(el, state, true)
      code = `_c('${el.tag}'${
        data ? `,${data}` : '' // data
      }${
        children ? `,${children}` : '' // children
      })`
    }
    // module transforms 执行transformCode方法，用于对生成的代码进行转换，目前是空的
    for (let i = 0; i < state.transforms.length; i++) {
      code = state.transforms[i](el, code)
    }
    return code
  }
}

// hoist static sub-trees out
// 提升静态子树
/*
<div id="app"><h1>我是静态的文本节点</h1></div> =>
{
  render: "with(this){return _m(0)}", // 其中0为当前根节点对应的在staticRenderFns中的索引
  staticRenderFns: [`with(this){return _c('div',{attrs:{"id":"app"}},[_c('h1',[_v("我是一个静态的文本")])])}`]
}
以上实例，生成AST后，
0. 调用genElement，此时el.staticRoot && !el.staticProcessed 成立，进入该函数
1. el.staticProcessed标记为true，在最外层即将生成的函数压入了staticRenderFns中
2. 在压入的过程中又调用了genElement，此时的el.staticProcessed为true了，el.staticRoot && !el.staticProcessed 不成立
3. 继续执行调用genData解析属性，再genChildren生成子元素
4. staticRenderFns最终压入的就是genElement生成的代码
*/
function genStatic (el: ASTElement, state: CodegenState): string {
  el.staticProcessed = true // 标记为已处理
  // Some elements (templates) need to behave differently inside of a v-pre
  // node.  All pre nodes are static roots, so we can use this as a location to
  // wrap a state change and reset it upon exiting the pre node.
  // 所有的在pre节点内的节点都是静态的根节点，因此可以在生成代码时，先将state.pre标记为true
  // 在退出这个根节点的时候再恢复到原来的pre
  const originalPreState = state.pre // 记录上一次的state.pre状态
  if (el.pre) {  // 当前根节点是pre，则将state.pre标记为true
    state.pre = el.pre
  }
  // 将genElement的结果压入staticRenderFns
  // 这个地方再条用genElement，此时el.staticProcessed已经标记为true，
  // 所以无法再命中el.staticRoot && !el.staticProcessed这个分支
  // 所以会继续往下走，对属性等进行属性的拼接，遍历children进行代码的拼接
  // 最终生成一串用于执行的代码
  state.staticRenderFns.push(`with(this){return ${genElement(el, state)}}`)
  // 恢复原有的state.pre状态
  state.pre = originalPreState
  // 生成`_m(2, true)`或者`_m(2)`格式的代码并返回
  // 该返回值会被接收作为render的函数体，其中数字代码的是当前节点在staticRenderFns中对应的索引
  return `_m(${
    state.staticRenderFns.length - 1
  }${
    el.staticInFor ? ',true' : ''
  })`
}

// v-once
/*
<div id="app"><h1>genOnce</h1></div> =>
{
  render: `with(this){return _c('div',{attrs:{\"id\":\"app\"}},[_m(0)])}`
  staticRenderFns: [`with(this){return _c('h1',[_v("genOnce")])}`]
}
0. 调用genElement，此时staticRoot为false，会进入最后一个条件分支，创建最外层的div：_c('div',{attrs:{\"id\":\"app\"}},[...])
1. 依次执行genData->genChildren->genNode，此时遇到h1为一个节点，又会调用genELement
2. h1具有v-once指令，进入genOnce函数，即该函数
3. h1满足最后一个条件分支，因此会调用genStatic
4. genStatic执行后会将h1生成的代码压入staticRenderFns，且返回一个`_m(0)`
5. genChildren最终返回的代码会作为子元素传入步骤0创建的div的子元素，得到_c('div',{attrs:{\"id\":\"app\"}},[_m(0)])
**/
function genOnce (el: ASTElement, state: CodegenState): string {
  el.onceProcessed = true // 标记
  if (el.if && !el.ifProcessed) { // 是否有v-if指令
    return genIf(el, state)
  } else if (el.staticInFor) { // 是否在v-for里面
    let key = ''
    let parent = el.parent
    while (parent) { // 找到祖先中的v-for节点，获取key值
      if (parent.for) {
        key = parent.key
        break
      }
      parent = parent.parent
    }
    if (!key) { // 没有key值，给出v-for和v-once结合使用必须有key的提示
      process.env.NODE_ENV !== 'production' && state.warn(
        `v-once can only be used inside v-for that is keyed. `,
        el.rawAttrsMap['v-once']
      )
      // 已经被标记为onceProcessed了，这执行genElement的后续分支
      // 作为非v-once的节点处理
      return genElement(el, state)
    }
    // 生成`_on(code, onceId, key)`的格式
    return `_o(${genElement(el, state)},${state.onceId++},${key})`
  } else { // 生成静态节点代码
    return genStatic(el, state)
  }
}

// 生成if语句相关的代码
/**
<div id="app">
  <div v-if="name">a</div>
  <div v-else-if="age">b</div>
  <div v-else>c</div>
</div> =>
{
  render: `with(this){return _c('div',{attrs:{"id":"app"}},[(name)?_c('div',[_v("a")]):(age)?_c('div',[_v("b")]):_c('div',[_v("c")])])}`
}
以上代码生成的AST中el.ifConditions如下：
[
  {exp: "name", block: {type: 1, tag: 'div', ...}},
  {exp: "age", block: {type: 1, tag: 'div', ...}},
  {exp: undefined, block: {type: 1, tag: 'div', ...}}
]
0. 创建外层的div，_c('div', attrs:{id: "app"},[...])
1. 遍历子元素，命中v-if条件，将ifProcessed标记为true，调用genIfConditions函数
2. genIfConditions函数会取出第一个条件，根据条件生成一个三元运算表达式
 */
export function genIf (
  el: any,
  state: CodegenState,
  altGen?: Function,
  altEmpty?: string
): string {
  el.ifProcessed = true // avoid recursion
  return genIfConditions(el.ifConditions.slice(), state, altGen, altEmpty)
}

function genIfConditions (
  conditions: ASTIfConditions,
  state: CodegenState,
  altGen?: Function,
  altEmpty?: string
): string {
  if (!conditions.length) { // 没有条件
    return altEmpty || '_e()'
  }
  const condition = conditions.shift() // 取出第一个条件
  if (condition.exp) { // 具有条件表达式，则生成一个三元运算表达式
    
    return `(${condition.exp})?${
      genTernaryExp(condition.block)
    }:${
      genIfConditions(conditions, state, altGen, altEmpty) // 这里会再次执行genIfConditions，会不断的拼接后续的条件表达式
    }`
  } else { // 没有条件则直接当v-if为true
    return `${genTernaryExp(condition.block)}`
  }

  // v-if with v-once should generate code like (a)?_m(0):_m(1)
  // 目的：对于同时使用了v-if和v-once的节点，需要编译为(a)?_m(0):_m(1)这种格式
  // 如<div v-if="name" v-once>a</div><div v-else-if="age" v-once>b</div><div v-else>c</div> => 
  // (name)?_m(0):(age)?_m(1):_c('div',[_v(\"c\")])
  // 由于在genElement的时候会先命中v-once的条件，会执行genOnce函数，此时onceProcess已经被标记为true，
  // 在genOnce中又会命中if的条件，所以会进入genIf，此时el.ifProcessed被标记为true
  // 当生成三元表达式时，如果再调用genElment，此时无法再命中v-once，那么最终会生成一个普通的创建标签的语句
  // 这样就达不到目的了，因此针对这种情况，不再调用genElment，而是直接调用genOnce来达到目的
  // 所以后续再调用genElement时不会再命中genOnce的条件
  function genTernaryExp (el) {
    return altGen
      ? altGen(el, state)
      : el.once // 有v-once，则调用v-once
        ? genOnce(el, state)
        : genElement(el, state) // 没有v-once调用genElement
  }
}

// 生成v-for代码
/**
  <div id="app"> <h1 v-for="(v, k, index) in list" key="k">{{k}}=>{{v}}</h1></div> =>
  {
    render: `with(this){return _c('div',{attrs:{"id":"app"}},_l((list),function(v,k,index){return _c('h1',{key:"k"},[_v(_s(k)+"=>"+_s(v))])}),0)}`
    staticRenderFns: []
  }
  0. 执行genElement，生成外层的div _c("div", {attrs: {"id": "app"}}, [...])
  1. 遍历子元素，执行到了h1，命中v-for，将h1的forProcessed标记为true
  2. 返回一串用于创建列表的代码，里面会再次调用getElement，但此时forProcessed已为true，不会命中v-for处理条件，会继续往下走，最终创建了h1元素
  2. 迭代器最终生成的代码：_l((list),function(v,k,index){return _c('h1',{key:"k"},[_v(_s(k)+"=>"+_s(v))])})
  3. 将生成的代码拼接到div的子元素中
  4. 由于这个过程中没有静态节点，所以staticRenderFns为空
 */
export function genFor (
  el: any,
  state: CodegenState,
  altGen?: Function,
  altHelper?: string
): string {
  const exp = el.for // 被迭代的对象：lists
  const alias = el.alias // 迭代项目名称： item
  const iterator1 = el.iterator1 ? `,${el.iterator1}` : '' // key或index：,key
  const iterator2 = el.iterator2 ? `,${el.iterator2}` : ''  // index： ,index

  // for指令需要key的提醒
  if (process.env.NODE_ENV !== 'production' &&
    state.maybeComponent(el) &&
    el.tag !== 'slot' &&
    el.tag !== 'template' &&
    !el.key
  ) {
    state.warn(
      `<${el.tag} v-for="${alias} in ${exp}">: component lists rendered with ` +
      `v-for should have explicit keys. ` +
      `See https://vuejs.org/guide/list.html#key for more info.`,
      el.rawAttrsMap['v-for'],
      true /* tip */
    )
  }

  el.forProcessed = true // avoid recursion
  // _l((list),function(v,k,index){return _c('h1',{key:"k"},[_v(_s(k)+"=>"+_s(v))])})
  return `${altHelper || '_l'}((${exp}),` +
    `function(${alias}${iterator1}${iterator2}){` +
    // 这里再次调用genElemnt，因为el.forProcessed==true，所以不会再命中for的条件，生成创建h1标签的语句
      `return ${(altGen || genElement)(el, state)}` + 
    '})'
}

//生成data对象的代码
export function genData (el: ASTElement, state: CodegenState): string {
  let data = '{'

  // directives first.
  // directives may mutate the el's other properties before they are generated.
  // 优先处理指令，如v-html,v-text,v-bind,v-model等
  // <div v-html="<span>ag</span>" v-focus></div> =>
  //directives:[{name:"focus",rawName:"v-focus"}]
  const dirs = genDirectives(el, state)
  if (dirs) data += dirs + ','

  // key
  if (el.key) {
    data += `key:${el.key},`
  }
  // ref
  if (el.ref) {
    data += `ref:${el.ref},`
  }
  if (el.refInFor) {
    data += `refInFor:true,`
  }
  // pre
  if (el.pre) {
    data += `pre:true,`
  }
  // record original tag name for components using "is" attribute
  if (el.component) {
    data += `tag:"${el.tag}",`
  }
  // module data generation functions 
  // class和style拼接
  for (let i = 0; i < state.dataGenFns.length; i++) {
    data += state.dataGenFns[i](el)
  }
  // attributes
  if (el.attrs) {
    data += `attrs:${genProps(el.attrs)},`
  }
  // DOM props DOM原生属性
  if (el.props) {
    data += `domProps:${genProps(el.props)},`
  }
  // 事件拼接
  // event handlers
  if (el.events) {
    data += `${genHandlers(el.events, false)},`
  }
  if (el.nativeEvents) {
    data += `${genHandlers(el.nativeEvents, true)},`
  }
  // slot target
  // only for non-scoped slots
  if (el.slotTarget && !el.slotScope) {
    data += `slot:${el.slotTarget},`
  }
  // scoped slots
  if (el.scopedSlots) {
    data += `${genScopedSlots(el, el.scopedSlots, state)},`
  }
  // component v-model
  // v-model拼接
  if (el.model) {
    data += `model:{value:${
      el.model.value
    },callback:${
      el.model.callback
    },expression:${
      el.model.expression
    }},`
  }
  // inline-template
  if (el.inlineTemplate) {
    const inlineTemplate = genInlineTemplate(el, state)
    if (inlineTemplate) {
      data += `${inlineTemplate},`
    }
  }
  data = data.replace(/,$/, '') + '}'
  // v-bind dynamic argument wrap
  // v-bind with dynamic arguments must be applied using the same v-bind object
  // merge helper so that class/style/mustUseProp attrs are handled correctly.
  if (el.dynamicAttrs) {
    data = `_b(${data},"${el.tag}",${genProps(el.dynamicAttrs)})`
  }
  // v-bind data wrap
  if (el.wrapData) {
    data = el.wrapData(data)
  }
  // v-on data wrap
  if (el.wrapListeners) {
    data = el.wrapListeners(data)
  }
  return data
}

// 生成指令属性代码
//  <div v-html="<span>ag</span>" v-focus></div> =>
// directives:[{name:"focus",rawName:"v-focus"}]
function genDirectives (el: ASTElement, state: CodegenState): string | void {
  const dirs = el.directives
  if (!dirs) return
  let res = 'directives:[' // 指令是一个数组
  let hasRuntime = false
  let i, l, dir, needRuntime
  for (i = 0, l = dirs.length; i < l; i++) {
    dir = dirs[i] // 获取指令
    needRuntime = true
    const gen: DirectiveFunction = state.directives[dir.name]
    if (gen) { // 如果在state中有对应的指令
      // compile-time directive that manipulates AST.
      // returns true if it also needs a runtime counterpart.
      needRuntime = !!gen(el, dir, state.warn)
    }
    if (needRuntime) {
      hasRuntime = true
      res += `{name:"${dir.name}",rawName:"${dir.rawName}"${
        dir.value ? `,value:(${dir.value}),expression:${JSON.stringify(dir.value)}` : ''
      }${
        dir.arg ? `,arg:${dir.isDynamicArg ? dir.arg : `"${dir.arg}"`}` : ''
      }${
        dir.modifiers ? `,modifiers:${JSON.stringify(dir.modifiers)}` : ''
      }},`
    }
  }
  if (hasRuntime) {
    return res.slice(0, -1) + ']'
  }
}


// 生成inline-template代码
// `inlineTemplate: {
//   render: function(){...},
//   staticRenderFns: [fn, fn, fn]
// }`
function genInlineTemplate (el: ASTElement, state: CodegenState): ?string {
  const ast = el.children[0]
  if (process.env.NODE_ENV !== 'production' && (
    el.children.length !== 1 || ast.type !== 1
  )) {
    state.warn(
      'Inline-template components must have exactly one child element.',
      { start: el.start }
    )
  }
  // 对内容进行generate得到render和staticRenderFns
  if (ast && ast.type === 1) {
    const inlineRenderFns = generate(ast, state.options)
    return `inlineTemplate:{render:function(){${
      inlineRenderFns.render
    }},staticRenderFns:[${
      inlineRenderFns.staticRenderFns.map(code => `function(){${code}}`).join(',')
    }]}`
  }
}

function genScopedSlots (
  el: ASTElement,
  slots: { [key: string]: ASTElement },
  state: CodegenState
): string {
  // by default scoped slots are considered "stable", this allows child
  // components with only scoped slots to skip forced updates from parent.
  // but in some cases we have to bail-out of this optimization
  // for example if the slot contains dynamic names, has v-if or v-for on them...
  let needsForceUpdate = el.for || Object.keys(slots).some(key => {
    const slot = slots[key]
    return (
      slot.slotTargetDynamic ||
      slot.if ||
      slot.for ||
      containsSlotChild(slot) // is passing down slot from parent which may be dynamic
    )
  })

  // #9534: if a component with scoped slots is inside a conditional branch,
  // it's possible for the same component to be reused but with different
  // compiled slot content. To avoid that, we generate a unique key based on
  // the generated code of all the slot contents.
  let needsKey = !!el.if

  // OR when it is inside another scoped slot or v-for (the reactivity may be
  // disconnected due to the intermediate scope variable)
  // #9438, #9506
  // TODO: this can be further optimized by properly analyzing in-scope bindings
  // and skip force updating ones that do not actually use scope variables.
  if (!needsForceUpdate) {
    let parent = el.parent
    while (parent) {
      if (
        (parent.slotScope && parent.slotScope !== emptySlotScopeToken) ||
        parent.for
      ) {
        needsForceUpdate = true
        break
      }
      if (parent.if) {
        needsKey = true
      }
      parent = parent.parent
    }
  }

  const generatedSlots = Object.keys(slots)
    .map(key => genScopedSlot(slots[key], state))
    .join(',')

  return `scopedSlots:_u([${generatedSlots}]${
    needsForceUpdate ? `,null,true` : ``
  }${
    !needsForceUpdate && needsKey ? `,null,false,${hash(generatedSlots)}` : ``
  })`
}

function hash(str) {
  let hash = 5381
  let i = str.length
  while(i) {
    hash = (hash * 33) ^ str.charCodeAt(--i)
  }
  return hash >>> 0
}

function containsSlotChild (el: ASTNode): boolean {
  if (el.type === 1) {
    if (el.tag === 'slot') {
      return true
    }
    return el.children.some(containsSlotChild)
  }
  return false
}

function genScopedSlot (
  el: ASTElement,
  state: CodegenState
): string {
  const isLegacySyntax = el.attrsMap['slot-scope']
  if (el.if && !el.ifProcessed && !isLegacySyntax) {
    return genIf(el, state, genScopedSlot, `null`)
  }
  if (el.for && !el.forProcessed) {
    return genFor(el, state, genScopedSlot)
  }
  const slotScope = el.slotScope === emptySlotScopeToken
    ? ``
    : String(el.slotScope)
  const fn = `function(${slotScope}){` +
    `return ${el.tag === 'template'
      ? el.if && isLegacySyntax
        ? `(${el.if})?${genChildren(el, state) || 'undefined'}:undefined`
        : genChildren(el, state) || 'undefined'
      : genElement(el, state)
    }}`
  // reverse proxy v-slot without scope on this.$slots
  const reverseProxy = slotScope ? `` : `,proxy:true`
  debugger
  return `{key:${el.slotTarget || `"default"`},fn:${fn}${reverseProxy}}`
}

// 生成子节点的代码
export function genChildren (
  el: ASTElement,
  state: CodegenState,
  checkSkip?: boolean,
  altGenElement?: Function,
  altGenNode?: Function
): string | void {
  const children = el.children
  if (children.length) {
    const el: any = children[0]
    // optimize single v-for
    // 对于含有v-for指令的非template和slot元素且只有一个子元素的元素
    if (children.length === 1 &&
      el.for &&
      el.tag !== 'template' &&
      el.tag !== 'slot'
    ) {
      // 将规范化类型设置为0或者1
      const normalizationType = checkSkip
        ? state.maybeComponent(el) ? `,1` : `,0`
        : ``
      return `${(altGenElement || genElement)(el, state)}${normalizationType}`
    }
    // 获取规范化的类型
    const normalizationType = checkSkip
      ? getNormalizationType(children, state.maybeComponent)
      : 0
    const gen = altGenNode || genNode // 得到生成节点代码的函数
    // 遍历children并生成代码，最终拼接为数组
    return `[${children.map(c => gen(c, state)).join(',')}]${
      normalizationType ? `,${normalizationType}` : ''
    }`
  }
}

// 确定children所需的规范化类型，用于在render函数中对children做规范化
// determine the normalization needed for the children array.
// 0: no normalization needed 不需要规范化：非节点
// 1: simple normalization needed (possible 1-level deep nested array)简单的规范化： 组件或者条件语句中有组件的
// 2: full normalization needed 完全规范化：自身或者条件语句中带有v-for的template或者slot标签的
function getNormalizationType (
  children: Array<ASTNode>,
  maybeComponent: (el: ASTElement) => boolean
): number {
  let res = 0
  for (let i = 0; i < children.length; i++) {
    const el: ASTNode = children[i]
    if (el.type !== 1) {
      continue
    }
    if (needsNormalization(el) || // 带有v-for的template或者slot标签
        (el.ifConditions && el.ifConditions.some(c => needsNormalization(c.block)))) {// 条件子元素中有 带有v-for的template或者slot标签
      res = 2
      break
    }
    if (maybeComponent(el) || // 组件或if条件中有组件
        (el.ifConditions && el.ifConditions.some(c => maybeComponent(c.block)))) {
      res = 1
    }
  }
  return res
}

// 判断是否为有v-for质量的template或者slot标签
function needsNormalization (el: ASTElement): boolean {
  return el.for !== undefined || el.tag === 'template' || el.tag === 'slot'
}

// 创建注释、文本、Vnode
function genNode (node: ASTNode, state: CodegenState): string {
  if (node.type === 1) { // 如果是一个节点则需要递归创建
    return genElement(node, state)
  } else if (node.type === 3 && node.isComment) { // 注释节点则创建注释节点
    return genComment(node)
  } else { // 创建普通文本节点
    return genText(node)
  }
}

// 创建文本节点的代码 `_v(...)`
export function genText (text: ASTText | ASTExpression): string {
  return `_v(${text.type === 2
    ? text.expression // no need for () because already wrapped in _s()
    : transformSpecialNewlines(JSON.stringify(text.text))
  })`
}

// 创建注释节点的代码
// `_e(content)`
export function genComment (comment: ASTText): string {
  return `_e(${JSON.stringify(comment.text)})`
}

// 生成slot元素的代码
/**
<div id="app">
  <slot name="header" :param="123">
    <div>default1</div>
    <div>default2</div>
  </slot> 
</div>
=>`_c('div',{attrs:{"id":"app"}},[_t("header",[_c('div',[_v("default1")]),_v(" "),_c('div',[_v("default2")])],{"param":123})],2)`
 */
function genSlot (el: ASTElement, state: CodegenState): string {
  const slotName = el.slotName || '"default"' // slot的名称
  // 获取其子元素生成的代码
  // 得到[_c('div',[_v("default1")]),_v(" "),_c('div',[_v("default2")])]
  const children = genChildren(el, state) 
  // 将子元素生成的代码使用_t函数包裹，得到
  // _t("header",[_c('div',[_v("default1")]),_v(" "),_c('div',[_v("default2")])]
  // 如果没有children则结果为_t("header"
  let res = `_t(${slotName}${children ? `,${children}` : ''}`

  // 处理属性（含动态属性）
  // 结果`{"param":123}`
  const attrs = el.attrs || el.dynamicAttrs 
    ? genProps((el.attrs || []).concat(el.dynamicAttrs || []).map(attr => ({
        // slot props are camelized
        name: camelize(attr.name),
        value: attr.value,
        dynamic: attr.dynamic
      })))
    : null
    //@suspense
  const bind = el.attrsMap['v-bind']
  if ((attrs || bind) && !children) { // 有属性，但是没有children
    // 得到_t("header",null
    res += `,null`
  }
  if (attrs) { // 拼接属性
    // 结果_t("header",[_c('div',[_v("default1")]),_v(" "),_c('div',[_v("default2")])],{"param":123}
    res += `,${attrs}`
  }
  if (bind) { // 拼接bind
    res += `${attrs ? '' : ',null'},${bind}`
  }
  //_t("header",[_c('div',[_v("default1")]),_v(" "),_c('div',[_v("default2")])],{"param":123})
  return res + ')'
}

// 创建一个组件的代码
// `_c(Name, data{...}, [...])`
// componentName is el.component, take it as argument to shun flow's pessimistic refinement
function genComponent (
  componentName: string,
  el: ASTElement,
  state: CodegenState
): string {
  const children = el.inlineTemplate ? null : genChildren(el, state, true)
  return `_c(${componentName},${genData(el, state)}${
    children ? `,${children}` : ''
  })`
}

// 属性拼接
// <div :[name]="test" :age="age" class="person" a="a"></div> => "_d({},[name,test])" 与`{"age":age,"a":"a"}`
function genProps (props: Array<ASTAttr>): string {
  let staticProps = ``
  let dynamicProps = ``
  for (let i = 0; i < props.length; i++) {
    const prop = props[i]
    const value = __WEEX__
      ? generateValue(prop.value)
      : transformSpecialNewlines(prop.value)
    if (prop.dynamic) {
      dynamicProps += `${prop.name},${value},`
    } else {
      staticProps += `"${prop.name}":${value},`
    }
  }
  staticProps = `{${staticProps.slice(0, -1)}}`
  if (dynamicProps) {
    return `_d(${staticProps},[${dynamicProps.slice(0, -1)}])`
  } else {
    return staticProps
  }
}

/* istanbul ignore next */
// 处理字符串的特殊结束符、将非字符串使用JSON.stringify转换
function generateValue (value) {
  if (typeof value === 'string') {
    return transformSpecialNewlines(value)
  }
  return JSON.stringify(value)
}

// #3895, #4268 处理两个特殊的结束符
function transformSpecialNewlines (text: string): string {
  return text
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}
