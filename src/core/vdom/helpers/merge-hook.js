/* @flow */

import VNode from "../vnode";
import { createFnInvoker } from "./update-listeners";
import { remove, isDef, isUndef, isTrue } from "shared/util";

// 作用是把一个钩子函数与vnode节点上现有的钩子函数进行合并
// 目的是让所需要执行的钩子延迟到被绑定元素相应的周期去执行
// 比如在自定义指令中，inserted钩子处理函数，需要等待节点被插入到DOM后执行
// 就会将inserted钩子列表合并到vnode.data.hook.insert钩子中，等待期插入后执行
export function mergeVNodeHook(def: Object, hookKey: string, hook: Function) {
  // 传入的是vnode则从vnode中提取hook，提取不到则为空对象
  if (def instanceof VNode) {
    def = def.data.hook || (def.data.hook = {});
  }
  let invoker;
  const oldHook = def[hookKey]; // 获取对应的hook，如vnode.data.hook.insert

  // 包装hook，保证其只执行一次
  function wrappedHook() {
    hook.apply(this, arguments); // 执行hook函数
    // important: remove merged hook to ensure it's called only once
    // and prevent memory leak
    // 执行后移除，确保只执行一次
    remove(invoker.fns, wrappedHook);
  }

  // 创建事件调用者
  if (isUndef(oldHook)) {
    // hook不存在
    // no existing hook
    invoker = createFnInvoker([wrappedHook]);
  } else {
    // hook存在
    /* istanbul ignore if */
    if (isDef(oldHook.fns) && isTrue(oldHook.merged)) {
      // 已经合并过
      // already a merged invoker
      invoker = oldHook; // 直接取合并后的调用者
      invoker.fns.push(wrappedHook); // 将新的钩子压入调用者函数执行列表
    } else {
      // 未合并且存在普通的钩子
      // existing plain hook
      invoker = createFnInvoker([oldHook, wrappedHook]);
    }
  }

  invoker.merged = true; // 标记未已合并
  def[hookKey] = invoker; // 缓存创建的调用者
}
