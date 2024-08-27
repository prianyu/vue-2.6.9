/* @flow */

import { toArray } from '../util/index'

// 添加Vue.use方法
export function initUse (Vue: GlobalAPI) {
  Vue.use = function (plugin: Function | Object) {
    // 初始化存储插件的数组
    const installedPlugins = (this._installedPlugins || (this._installedPlugins = []))
    // 已安装的插件不能重复安装
    if (installedPlugins.indexOf(plugin) > -1) {
      return this
    }

    // additional parameters
    // 将参数对象转为数组
    const args = toArray(arguments, 1)
    args.unshift(this) // 在参数前面添加Vue构造函数作为参数
    
    // 插件安装
    if (typeof plugin.install === 'function') { // 包含intall方法的对象
      plugin.install.apply(plugin, args)
    } else if (typeof plugin === 'function') {// 插件本身是个函数
      plugin.apply(null, args)
    }
    installedPlugins.push(plugin) // 存储已安装的插件
    return this // 返回Vue，支持链式调用
  }
}
