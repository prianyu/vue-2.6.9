/* @flow */

import { _Set as Set, isObject } from '../util/index'
import type { SimpleSet } from '../util/index'
import VNode from '../vdom/vnode'

const seenObjects = new Set()

/**
 * Recursively traverse an object to evoke all converted
 * getters, so that every nested property inside the object
 * is collected as a "deep" dependency.
 * 专门用于深度观测的
 * 通过递归访问对象的属性，触发属性对应的getter来实现依赖的收集
 */
export function traverse (val: any) {
  _traverse(val, seenObjects)
  seenObjects.clear()
}

  /**
   * 示例：
   * obj = {
   *    __ob__: { dep: {id: 1} }
   *    klass: '一班',
   *    teacher: {
   *      __ob__ : { dep: {id: 2} },
   *      name: 'zhangsan'
   *    },
   *    students: [
   *      __ob__: { dep: {id: 2} }
   *      // ...
   *    ]
   * }
   */
function _traverse (val: any, seen: SimpleSet) {
  let i, keys
  const isA = Array.isArray(val)
  // 非对象、数组以及冻结的对象、VNode都无需进行深度观测
  if ((!isA && !isObject(val)) || Object.isFrozen(val) || val instanceof VNode) {
    return
  }
  // 对象是可能存在循环引用的，在深度遍历的过程中，如果访问到了已经转为了深度观测的对象
  // 则不做处理避免陷入死循环
  if (val.__ob__) { // 已经有__ob__则说明是一个响应式对象
    const depId = val.__ob__.dep.id // 获取该响应式对象的标识
    if (seen.has(depId)) { // 如果seen上面有了，则说明已经做过依赖的处理了
      return
    }
    seen.add(depId) // 处理完的依赖将其添加到seen中，用于循环依赖的判断
  }
  if (isA) { // 对于数组，遍历它，读取val[i]的时候会触发其getter
    i = val.length
    while (i--) _traverse(val[i], seen)
  } else { // 对于对象，获取所有key然后遍历它，读取val[keys[i]]的时候会触发其getter
    keys = Object.keys(val)
    i = keys.length
    while (i--) _traverse(val[keys[i]], seen)
  }
}
