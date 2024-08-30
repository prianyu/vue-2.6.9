/* @flow */

import { emptyNode } from "core/vdom/patch";
import { resolveAsset, handleError } from "core/util/index";
import { mergeVNodeHook } from "core/vdom/helpers/index";
// 用于patch过程中处理directives
// 规范化指令为 { name, rawName, def, modifiers }格式
// 从$options.directives解析出定义的指令
// 在适当时间点执行相关指令的钩子
export default {
  create: updateDirectives,
  update: updateDirectives,
  destroy: function unbindDirectives(vnode: VNodeWithData) {
    updateDirectives(vnode, emptyNode);
  }
};

// 更新指令
function updateDirectives(oldVnode: VNodeWithData, vnode: VNodeWithData) {
  if (oldVnode.data.directives || vnode.data.directives) {
    _update(oldVnode, vnode);
  }
}

function _update(oldVnode, vnode) {
  const isCreate = oldVnode === emptyNode; // 标记是否为创建指令
  const isDestroy = vnode === emptyNode; // 标记是否为销毁指令
  // 走到这里，如果vnode上有指令，类似的格式如下： [{name: "focus", rawName: "v-focus"}]
  const oldDirs = normalizeDirectives(
    oldVnode.data.directives,
    oldVnode.context
  ); // 从旧节点中获取规范化后的指令
  const newDirs = normalizeDirectives(vnode.data.directives, vnode.context); // 从新节点中获取规范化后的指令

  // inserted钩子
  // 被绑定元素插入父节点时调用 (仅保证父节点存在，但不一定已被插入文档中)
  const dirsWithInsert = [];
  // componentUpdated钩子
  // 指令所在组件的VNode及其子VNode全部更新后调用
  const dirsWithPostpatch = [];

  let key, oldDir, dir;
  // 遍历所有新的指令
  for (key in newDirs) {
    // 获取新老的指令项
    oldDir = oldDirs[key];
    dir = newDirs[key];
    if (!oldDir) {
      // 老节点没有该指令，进行绑定
      // new directive, bind
      callHook(dir, "bind", vnode, oldVnode); // 执行节点的bind钩子
      if (dir.def && dir.def.inserted) {
        // 存储插入父节点时的钩子
        dirsWithInsert.push(dir);
      }
    } else {
      // 新老指令都有，进行更新
      // existing directive, update
      dir.oldValue = oldDir.value; // 老节点的执行结果
      dir.oldArg = oldDir.arg; // 老节点的执行参数
      callHook(dir, "update", vnode, oldVnode); // 执行update钩子
      // 存储指令所在组件的VNode及其子VNode全部更新后的钩子
      if (dir.def && dir.def.componentUpdated) {
        dirsWithPostpatch.push(dir);
      }
    }
  }

  // 执行inserted钩子处理
  if (dirsWithInsert.length) {
    // inserted钩子执行函数
    const callInsert = () => {
      for (let i = 0; i < dirsWithInsert.length; i++) {
        callHook(dirsWithInsert[i], "inserted", vnode, oldVnode);
      }
    };

    // 首次渲染，则将inserted钩子的执行函数与vnode.data.hook.insert合并
    // 在vnode执行insert钩子时就会执行所有的inserted钩子
    if (isCreate) {
      mergeVNodeHook(vnode, "insert", callInsert);
    } else {
      // 不是初次渲染，则执行所有的inserted钩子
      callInsert();
    }
  }

  // 将componentUpdated钩子合并到vnode.data.hook.postpatch钩子中
  // 使其推迟到指令所在的组件的Vnode及其子Vnode全部更新之后调用
  // 虚拟DOM更新前 会触发 prepatch钩子函数
  // 虚拟DOM更新中 会触发 update钩子函数
  // 虚拟DOM更新后 会触发 postpatch钩子函数
  if (dirsWithPostpatch.length) {
    mergeVNodeHook(vnode, "postpatch", () => {
      for (let i = 0; i < dirsWithPostpatch.length; i++) {
        callHook(dirsWithPostpatch[i], "componentUpdated", vnode, oldVnode);
      }
    });
  }

  // 对于不是新创建的节点，老节点存在新节点不存在的指令上，应该执行其unbind钩子
  if (!isCreate) {
    for (key in oldDirs) {
      if (!newDirs[key]) {
        // no longer present, unbind
        callHook(oldDirs[key], "unbind", oldVnode, oldVnode, isDestroy);
      }
    }
  }
}

const emptyModifiers = Object.create(null);

// 规范化并解析指令
// dirs格式类似：[{name: "focus", rawName: "v-focus", modifiers: {a: true, b: true}}]
// 1. 如果没有指令，则返回空对象
// 2. 对没有修饰器的指令，增加modifiers属性，值为空对象
// 最终会转为以下格式
/**
  {
    "v-focus.a.b": {
      name: 'focus',
      rawName: 'v-focus.a.b',
      modifiers: {
        a: true,
        b: true
      },
      def: {
        inserted: <function>,
        bind: <function>,
        unbind: <function>
        // ...
      }
    }
  }
 */
function normalizeDirectives(
  dirs: ?Array<VNodeDirective>,
  vm: Component
): { [key: string]: VNodeDirective } {
  const res = Object.create(null);
  // 没有，返回空对象
  if (!dirs) {
    // $flow-disable-line
    return res;
  }
  let i, dir;
  for (i = 0; i < dirs.length; i++) {
    dir = dirs[i];
    // 没有修饰器，将修饰器设置为空对象
    if (!dir.modifiers) {
      // $flow-disable-line
      dir.modifiers = emptyModifiers;
    }
    res[getRawDirName(dir)] = dir; // 如v-focus.a.b
    // 从实例的$options.directives或者其原型中解析出对应的指令
    dir.def = resolveAsset(vm.$options, "directives", dir.name, true);
  }
  // $flow-disable-line
  console.log(res);
  return res;
}

// 获取指令的原始名称
// 会对没有原始名称的指令拼接其修饰器得到结果
function getRawDirName(dir: VNodeDirective): string {
  return (
    dir.rawName || `${dir.name}.${Object.keys(dir.modifiers || {}).join(".")}`
  );
}

/**
 * 执行指令的钩子
 * @param {Object} dir 指令
 * @param {String} hook 指令的钩子名称
 * @param {VNode} vnode 新节点
 * @param {VNode} oldVnode 老节点
 * @param {Boolean} isDestroy 是否销毁
 */
function callHook(dir, hook, vnode, oldVnode, isDestroy) {
  const fn = dir.def && dir.def[hook]; // 获取指令中指定的钩子处理回调
  // 如果存在处理钩子则执行
  if (fn) {
    try {
      // 接受参数：指令所绑定的元素、指令对象、VNode、是否销毁
      fn(vnode.elm, dir, vnode, oldVnode, isDestroy);
    } catch (e) {
      handleError(e, vnode.context, `directive ${dir.name} ${hook} hook`);
    }
  }
}
