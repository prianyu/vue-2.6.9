/* @flow */

import { extend } from 'shared/util'
import { detectErrors } from './error-detector'
import { createCompileToFunctionFn } from './to-function'


/**
 * 编译器函数的创建者的创建者
 * @param {*} baseCompile 自定义编译器，里面实现了一套解析器、优化器和代码编译器
 * @returns  { compile, compileToFunctions}
 * createCompilerCreator接收baseCompile，由baseCompile来定义自己的解析器（parser）/优化器（optimizer）/codegen编译器（codegen），
 * 比如服务端渲染和浏览器渲染可以用自己不同的baseCompile，这也意味着如果我们有自己的编译平台，我们就可以通过实现一个自己的baseCompile
 * 来定制自己的编译器，多端构建就是基于这个基本原理来实现的
 */
export function createCompilerCreator (baseCompile: Function): Function {
  // baseCompile和baseOptions被createCompiler中的compile函数闭包引用
  return function createCompiler (baseOptions: CompilerOptions) {

    // 编译函数：结果为{render: ..., staticRenderFns: [...], ast, errors: ..., tips:...}
    function compile (
      template: string,
      options?: CompilerOptions
    ): CompiledResult {
      const finalOptions = Object.create(baseOptions)
      const errors = []
      const tips = []

      let warn = (msg, range, tip) => {
        (tip ? tips : errors).push(msg)
      }

      // 选线合并
      if (options) {
        if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
          // $flow-disable-line
          const leadingSpaceLength = template.match(/^\s*/)[0].length

          warn = (msg, range, tip) => {
            const data: WarningMessage = { msg }
            if (range) {
              if (range.start != null) {
                data.start = range.start + leadingSpaceLength
              }
              if (range.end != null) {
                data.end = range.end + leadingSpaceLength
              }
            }
            (tip ? tips : errors).push(data)
          }
        }
        // merge custom modules 合并modules
        // 讲baseOptions.modules和options.modules合并
        if (options.modules) { // 
          finalOptions.modules =
            (baseOptions.modules || []).concat(options.modules)
        }
        // merge custom directives 合并指令
        // 将baseOptions.directives和options.directives合并
        if (options.directives) {
          finalOptions.directives = extend(
            Object.create(baseOptions.directives || null),
            options.directives
          )
        }
        // copy other options
        // 将除modules和directives以外的选项拷贝至finalOptions
        for (const key in options) {
          if (key !== 'modules' && key !== 'directives') {
            finalOptions[key] = options[key]
          }
        }
      }

      finalOptions.warn = warn

      // 将最终得到的选项作为基础的编译器函数的选项
      // 解析得到抽象语法树，再转为render函数的代码字符串
      // {render: ..., staticRenderFns: [...], ast}
      const compiled = baseCompile(template.trim(), finalOptions) 
      if (process.env.NODE_ENV !== 'production') {
        // 检查抽象语法树是否有不合法的地方
        // 最终会将错误或者提醒存储在errors和tips上
        // 主要检查了：v-on、v-for属性值、表达式等合法性
        // 比如事件名不能为delete、typeof等一元操作符
        // 表达式不能为javascript保留关键字等
        detectErrors(compiled.ast, warn) //
      }
      // 将错误和提示信息做为编译器函数的执行结果属性返回
      compiled.errors = errors 
      compiled.tips = tips
      return compiled
    }

    return {
      compile,
      // 将render函数字符串转化为可执行的render函数
      compileToFunctions: createCompileToFunctionFn(compile)
    }
  }
}
