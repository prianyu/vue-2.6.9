/* @flow */

import * as nodeOps from 'web/runtime/node-ops' // 各种DOM操作的方法集合
import { createPatchFunction } from 'core/vdom/patch'
import baseModules from 'core/vdom/modules/index'
import platformModules from 'web/runtime/modules/index'

// the directive module should be applied last, after all
// built-in modules have been applied.
// 各种基础内置指令和组件等模块与平台相关的指令、模块合并
// 这些模块就是一些包含了{create, destroy, update,remove, activate}等各种钩子方法的集合
// 其中基础模块有ref, directive
// 平台相关的模块有attrs,class,dom-props,events,style和transition
// 最终将这些模块合并为一个数组
const modules = platformModules.concat(baseModules)
// 创建patch函数并返回
// nodeOps是各种DOM操作的方法集合
export const patch: Function = createPatchFunction({ nodeOps, modules })
