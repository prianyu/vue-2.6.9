/* @flow */

import { remove, isDef } from 'shared/util'

// ref模块的各种钩子
export default {
  create (_: any, vnode: VNodeWithData) {
    registerRef(vnode)
  },
  update (oldVnode: VNodeWithData, vnode: VNodeWithData) {
    if (oldVnode.data.ref !== vnode.data.ref) {
      registerRef(oldVnode, true)
      registerRef(vnode)
    }
  },
  destroy (vnode: VNodeWithData) {
    registerRef(vnode, true)
  }
}
// ref的处理
// 1. 对于不处于v-for中的ref，会将其对应的实例或者子元素存在在$refs[key]中
// 2. 对于处于v-for中的ref，会将$refs[key]设置为数组，每一个实例或者元素为其中的一项
// 3. 如果传了isRemoval，则是从$refs中删除对应的ref
export function registerRef (vnode: VNodeWithData, isRemoval: ?boolean) {
  const key = vnode.data.ref
  if (!isDef(key)) return // 没有ref属性，不做任何操作

  const vm = vnode.context
  const ref = vnode.componentInstance || vnode.elm // 实例或者真实元素
  const refs = vm.$refs
  if (isRemoval) {
    if (Array.isArray(refs[key])) {
      remove(refs[key], ref)
    } else if (refs[key] === ref) {
      refs[key] = undefined
    }
  } else {
    if (vnode.data.refInFor) { // ref在for中
      if (!Array.isArray(refs[key])) {
        refs[key] = [ref] // 转为数组存储
      } else if (refs[key].indexOf(ref) < 0) { // 已经转为数组了，往里面压入多一个元素
        // $flow-disable-line
        refs[key].push(ref)
      }
    } else { // 在$refs中存储当前vnode对应的实例或者元素
      refs[key] = ref
    }
  }
}
