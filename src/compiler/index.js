/* @flow */

import { parse } from './parser/index'
import { optimize } from './optimizer'
import { generate } from './codegen/index'
import { createCompilerCreator } from './create-compiler'

// `createCompilerCreator` allows creating compilers that use alternative
// parser/optimizer/codegen, e.g the SSR optimizing compiler.
// Here we just export a default compiler using the default parts.
/**
 * createCompilerCreator会接收baseCompile，baseComile会实现自己的解析器（parser）/优化器（optimizer）/codegen编译器（codegen）、
 * createCompilerCreator会返回一个创建编译器的函数createCompiler(baseOptions)
 * createCompiler中会返回一个包含compile(template, options)函数和compileToFunctions的对象
 * 其中compile函数会闭包引用baseOptions和baseCompile，在执行compile函数时会将baseOptions和options进项选项合并得到finalOptions，
 * 并将template和finalOptions作为参数执行baseCompile，最终将执行结果返回
 */
export const createCompiler = createCompilerCreator(function baseCompile (
  template: string,
  options: CompilerOptions
): CompiledResult {
  // 解析模板得到抽象语法树（AST）
  // options即为合并得到的finalOptions
  const ast = parse(template.trim(), options) 
  if (options.optimize !== false) { // 开启优化
    optimize(ast, options) // 优化抽象语法树
  }
  const code = generate(ast, options) // 将抽象语法树转为render函数等代码块
  return {
    ast, 
    render: code.render, // render函数
    staticRenderFns: code.staticRenderFns
  }
})
