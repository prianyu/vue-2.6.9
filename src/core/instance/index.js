import { initMixin } from './init'
import { stateMixin } from './state'
import { renderMixin } from './render'
import { eventsMixin } from './events'
import { lifecycleMixin } from './lifecycle'
import { warn } from '../util/index'

// Vue构造函数
function Vue(options) {
  if (process.env.NODE_ENV !== 'production' &&
    !(this instanceof Vue)
  ) {
    warn('Vue is a constructor and should be called with the `new` keyword')
  }
  // debugger
  this._init(options)
}
// 以下往Vue.prototype新增各类属性和方法
initMixin(Vue) // 原型新增_init方法
stateMixin(Vue) // 定义$data,$props,$watch,$delete,$set等属性和方法
eventsMixin(Vue) // 定义$on,$once,$off,$emit等方法
lifecycleMixin(Vue) // 定义_update,$forceUpdate,$destroy方法
renderMixin(Vue) // $nextTick,_render以及各类运行时辅助方法（如_s,_t,_o等）

export default Vue
