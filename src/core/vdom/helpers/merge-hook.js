/* @flow */

import VNode from "../vnode";
import { createFnInvoker } from "./update-listeners";
import { remove, isDef, isUndef, isTrue } from "shared/util";

// 作用是把一个钩子函数与vnode节点上现有的钩子函数进行合并
// 目的是让所需要执行的钩子延迟到被绑定元素相应的周期去执行
// 比如在自定义指令中，inserted钩子处理函数，需要等待节点被插入到DOM后执行
// 就会将inserted钩子列表合并到vnode.data.hook.insert钩子中，等待期插入后执行
/**
 * 
 * @param {VNode} def 要合并钩子的vnode
 * @param {string} hookKey 钩子名称，如insert
 * @param {Function} hook 钩子回调函数
 */
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

  // 创建或修改函数调用者
  // createFnInvoker执行后返回一个具有fns属性的调用函数invoker
  // fns存储着所有的处理函数，调用invoker后会遍历fns，依次执行
  if (isUndef(oldHook)) {
    // data.hook[hookKey]不存在，则创建函数的调用者
    // no existing hook
    invoker = createFnInvoker([wrappedHook]);
  } else {
    // // data.hook[hookKey]存在
    /* istanbul ignore if */
    if (isDef(oldHook.fns) && isTrue(oldHook.merged)) {
      // 已经合并过，则修改调用者，将新的钩子处理函数压入处理队列
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
  def[hookKey] = invoker; // 保存创建的调用者到data.hook[hookKey]上
}
