/* @flow */

import { ASSET_TYPES } from 'shared/constants'
import { isPlainObject, validateComponentName } from '../util/index'

export function initAssetRegisters (Vue: GlobalAPI) {
  /**
   * Create asset registration methods.
   */
  //  获取或者生成Vue.direcitve,Vue.filter, Vue.component
  ASSET_TYPES.forEach(type => {
    Vue[type] = function (
      id: string,
      definition: Function | Object
    ): Function | Object | void {
      if (!definition) { // 第二个参数未传则是获取对应的方法
        return this.options[type + 's'][id]
      } else {
        // 传了第二个参数则是定义对应的方法
        /* istanbul ignore if */
        if (process.env.NODE_ENV !== 'production' && type === 'component') {
          validateComponentName(id)
        }
        /** 组件定义方法
          * 对于组件定义，其定义为一个对象，如果组件没有name属性，则将组件名称做为其name属性
          * Vue.component最终会调用Vue.extend方法
        */
        if (type === 'component' && isPlainObject(definition)) {
          definition.name = definition.name || id // 没传name则将第一个参数作为name
          definition = this.options._base.extend(definition)
        }
        /**
         * 指令定义方法Vue.directive
         * 指令会统一转为{bind: def, update: def}的格式
         */
        if (type === 'directive' && typeof definition === 'function') {
          definition = { bind: definition, update: definition }
        }
        // 处理完将最后的方法绑定在Vue.options对应的资源类型上
        this.options[type + 's'][id] = definition
        return definition
      }
    }
  })
}
