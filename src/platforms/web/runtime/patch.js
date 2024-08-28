/* @flow */

// nodeOps提供了一系列操作DOM节点的方法，如创建元素、删除元素、设置属性等，这些方法与平台（如浏览器）相关
import * as nodeOps from 'web/runtime/node-ops'
//用于生成patch函数的工厂函数，负责将虚拟DOM转为真实DOM，并在必要时更新DOM
import { createPatchFunction } from 'core/vdom/patch'
// 一组核心的模块，包含了虚拟DOM操作的通用功能，包括ref和directives
import baseModules from 'core/vdom/modules/index'
// 一组特定平台（浏览器）相关的模块，处理一些特定平台特殊的需求，包括class，style,dom-props,events,style和transition等
import platformModules from 'web/runtime/modules/index'


// the directive module should be applied last, after all
// built-in modules have been applied.
// 合并基础模块和平台相关的模块，其中指令模块在最后被应用，这是为了保证其它的内置模块都已经应用完成
// 所有的模块就是一些包含了{create, destroy, update,remove, activate}等各种钩子方法的集合
// 最终将这些模块会被合并为一个数组
const modules = platformModules.concat(baseModules)
// 创建patch函数并返回
// nodeOps是各种DOM操作的方法集合
export const patch: Function = createPatchFunction({ nodeOps, modules })
