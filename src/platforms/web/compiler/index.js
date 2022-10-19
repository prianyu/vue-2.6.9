/* @flow */

import { baseOptions } from './options'
import { createCompiler } from 'compiler/index'

// 创建
const { compile, compileToFunctions } = createCompiler(baseOptions)

export { compile, compileToFunctions }
