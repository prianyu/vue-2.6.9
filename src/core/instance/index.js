import { initMixin } from './init'
import { stateMixin } from './state'
import { renderMixin } from './render'
import { eventsMixin } from './events'
import { lifecycleMixin } from './lifecycle'
import { warn } from '../util/index'

// Vue构造函数
function Vue (options) {
  if (process.env.NODE_ENV !== 'production' &&
    !(this instanceof Vue)
  ) {
    warn('Vue is a constructor and should be called with the `new` keyword')
  }
  this._init(options)
}
// 以下往Vue.prototype新增各类属性和方法
initMixin(Vue) // 原型新增_init方法
stateMixin(Vue) // $data,$props,$watch,$delete,$set
eventsMixin(Vue) // $on,$once,$off,$emit
lifecycleMixin(Vue) // _update,$forceUpdate,$destroy
renderMixin(Vue) // $nextTick,_render,各类辅助方法（如_s,_t,_o等）

export default Vue
