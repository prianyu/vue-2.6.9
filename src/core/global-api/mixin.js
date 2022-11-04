/* @flow */

import { mergeOptions } from '../util/index'

// 定义Vue.mixin静态方法，支持链式调用
// 将传入的mixin与Vue上的的options合并
export function initMixin (Vue: GlobalAPI) {
  Vue.mixin = function (mixin: Object) {
    this.options = mergeOptions(this.options, mixin)
    return this
  }
}
