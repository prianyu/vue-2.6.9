/* @flow */

import {
  isPreTag,
  mustUseProp,
  isReservedTag,
  getTagNamespace
} from '../util/index'

import modules from './modules/index'
import directives from './directives/index'
import { genStaticKeys } from 'shared/util'
import { isUnaryTag, canBeLeftOpenTag } from './util'

// 默认的编译选项
export const baseOptions: CompilerOptions = {
  expectHTML: true,
  modules, // 模块：class，style，model
  directives, // v-model, v-text, v-html
  isPreTag, // 用于判断是否为pre标签
  isUnaryTag, // 判断是否为一元标签（自闭合标签）
  mustUseProp,// 检测是否为原生属性，有value|selected|checked|muted
  canBeLeftOpenTag, // 判断是否为可省略闭合标签的标签，如td，li等
  isReservedTag, // 判断是否为保留标签，即svg和html标签集合
  getTagNamespace, // 获取命名空间
  staticKeys: genStaticKeys(modules) // 根据modules生成静态键，即"staticClass,staticStyle"
}
