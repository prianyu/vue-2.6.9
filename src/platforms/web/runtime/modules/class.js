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

function updateClass (oldVnode: any, vnode: any) {
  const el = vnode.elm
  const data: VNodeData = vnode.data
  const oldData: VNodeData = oldVnode.data
  // 没有class
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
