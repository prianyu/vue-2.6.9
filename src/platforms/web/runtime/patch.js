/* @flow */

import * as nodeOps from 'web/runtime/node-ops' // 各种DOM操作的方法集合
import { createPatchFunction } from 'core/vdom/patch'
import baseModules from 'core/vdom/modules/index'
import platformModules from 'web/runtime/modules/index'

// the directive module should be applied last, after all
// built-in modules have been applied.
// 各种内置指令和组件等模块
const modules = platformModules.concat(baseModules)
// 创建patch函数并返回
export const patch: Function = createPatchFunction({ nodeOps, modules })
