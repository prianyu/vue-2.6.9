/* @flow */

import { remove, isDef } from "shared/util";

// ref模块的各种钩子
// 这个模块用来处理组件和DOM节点上的ref属性
// 在patch的时候，当解析到对应的节点，会在适当的时间点执行对应的钩子
// 实现对ref的管理
export default {
  // vnode创建，则将在$refs上添加元素
  create(_: any, vnode: VNodeWithData) {
    registerRef(vnode);
  },
  // vnode更新，则判断ref是否发生了变化，如果发生了变化，则移除旧的元素引用，添加新的元素引用
  update(oldVnode: VNodeWithData, vnode: VNodeWithData) {
    if (oldVnode.data.ref !== vnode.data.ref) {
      registerRef(oldVnode, true);
      registerRef(vnode);
    }
  },
  // vnode销毁，则将对应的ref从$refs中移除
  destroy(vnode: VNodeWithData) {
    registerRef(vnode, true);
  }
};
// ref的处理
// 1. 对于不处于v-for中的ref，会将其对应的实例或者子元素存在在$refs[key]中
// 2. 对于处于v-for中的ref，会将$refs[key]设置为数组，每一个实例或者元素为其中的一项
// 3. 如果传了isRemoval，则是从$refs中删除对应的ref
export function registerRef(vnode: VNodeWithData, isRemoval: ?boolean) {
  const key = vnode.data.ref; // 传入的ref属性
  if (!isDef(key)) return; // 没有ref属性，不做任何操作

  const vm = vnode.context;
  const ref = vnode.componentInstance || vnode.elm; // 组件实例或者真实元素
  const refs = vm.$refs; // 实例$refs属性的引用
  if (isRemoval) {
    // 删除元素引用
    if (Array.isArray(refs[key])) {
      // 列表，从列表中移除
      remove(refs[key], ref);
    } else if (refs[key] === ref) {
      // 不是列表则删除
      refs[key] = undefined;
    }
  } else {
    if (vnode.data.refInFor) {
      // ref在for中
      if (!Array.isArray(refs[key])) {
        refs[key] = [ref]; // 转为数组存储
      } else if (refs[key].indexOf(ref) < 0) {
        // 已经转为数组了，往里面压入多一个元素
        // $flow-disable-line
        refs[key].push(ref);
      }
    } else {
      // 在$refs中存储当前vnode对应的实例或者元素
      refs[key] = ref;
    }
  }
}
