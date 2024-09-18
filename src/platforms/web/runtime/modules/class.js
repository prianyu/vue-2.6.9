/* @flow */

import {
  isDef,
  isUndef
} from 'shared/util'

import {
  concat,
  stringifyClass,
  genClassForVnode
} from 'web/util/index'

// 处理class
// --------------钩子：create/update------------

// 对比新老节点更新class到真实DOM上面
// 1. 新老接待你都没有class属性，则不处理
// 2. 规范化动态class，并与静态的class合并
// 3. 合并transition-class
// 4. 将class字符串设置到DOM节点上
function updateClass(oldVnode: any, vnode: any) {
  const el = vnode.elm
  const data: VNodeData = vnode.data
  const oldData: VNodeData = oldVnode.data
  // 新老节点都没有class
  if (
    isUndef(data.staticClass) &&
    isUndef(data.class) && (
      isUndef(oldData) || (
        isUndef(oldData.staticClass) &&
        isUndef(oldData.class)
      )
    )
  ) {
    return
  }

  // 生成class字符串，会将静态的class和动态的class合并
  // 这个过程也会对动态的class的不同格式做一个转换
  let cls = genClassForVnode(vnode)

  // handle transition classes
  // 如果有transition组件的class则拼接
  const transitionClass = el._transitionClasses
  if (isDef(transitionClass)) {
    cls = concat(cls, stringifyClass(transitionClass))
  }

  // set the class
  // 更新并缓存class
  if (cls !== el._prevClass) {
    el.setAttribute('class', cls)
    el._prevClass = cls
  }
}

export default {
  create: updateClass,
  update: updateClass
}
