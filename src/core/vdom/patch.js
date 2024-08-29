/**
 * Virtual DOM patching algorithm based on Snabbdom by
 * Simon Friis Vindum (@paldepind)
 * Licensed under the MIT License
 * https://github.com/paldepind/snabbdom/blob/master/LICENSE
 *
 * modified by Evan You (@yyx990803)
 *
 * Not type-checking this because this file is perf-critical and the cost
 * of making flow understand it is not worth it.
 */
// 虚拟DOM补丁算法

import VNode, { cloneVNode } from "./vnode";
import config from "../config";
import { SSR_ATTR } from "shared/constants";
import { registerRef } from "./modules/ref";
import { traverse } from "../observer/traverse";
import { activeInstance } from "../instance/lifecycle";
import { isTextInputType } from "web/util/element";

import {
  warn,
  isDef,
  isUndef,
  isTrue,
  makeMap,
  isRegExp,
  isPrimitive
} from "../util/index";

export const emptyNode = new VNode("", {}, []); // 空白虚拟节点

// 各种钩子
const hooks = ["create", "activate", "update", "remove", "destroy"];

// 判断是否为相同的虚拟节点
// 相同需同时满足以下条件之一：
// 1. key相同、isComment相同、data都不为空、如果是input标签则需要是相同的input虚拟节点
// 2. 异步组件、相同的工厂函数、新节点的工厂函数没有错误
function sameVnode(a, b) {
  return (
    a.key === b.key &&
    ((a.tag === b.tag &&
      a.isComment === b.isComment &&
      isDef(a.data) === isDef(b.data) &&
      sameInputType(a, b)) ||
      (isTrue(a.isAsyncPlaceholder) &&
        a.asyncFactory === b.asyncFactory &&
        isUndef(b.asyncFactory.error)))
  );
}

// 判断两个vnode是否相同的input vnode
function sameInputType(a, b) {
  if (a.tag !== "input") return true;
  let i;
  const typeA = isDef((i = a.data)) && isDef((i = i.attrs)) && i.type;
  const typeB = isDef((i = b.data)) && isDef((i = i.attrs)) && i.type;
  return typeA === typeB || (isTextInputType(typeA) && isTextInputType(typeB));
}

// 按照节点的key值创建key与index的映射关系
// 如<div key="id" v-for="item in list"></div> 转换后类似
// {xx: 0, yy: 1. zz: 2, aa: 3}
function createKeyToOldIdx(children, beginIdx, endIdx) {
  let i, key;
  const map = {};
  for (i = beginIdx; i <= endIdx; ++i) {
    key = children[i].key;
    if (isDef(key)) map[key] = i;
  }
  return map;
}

// 创建patch函数的工厂函数
// 解析平台的所有模块及其钩子，将所有的钩子按照钩子名称分组后按顺序存储
// 返回一个patch函数
/**
 * patch函数
 * @param {VNode} oldVnode 旧的虚拟DOM
 * @param {VNode} vnode 新的的虚拟DOM
 * @param {Boolean} hydrating 是否为服务端渲染
 * @param {Boolean} removeOnly 是否
 * @returns
 */
export function createPatchFunction(backend) {
  let i, j;
  const cbs = {}; // 用于存放各种钩子回调
  // nodeOps为各种DOM操作方法的集合、modules是内置的模块和指令模块
  const { modules, nodeOps } = backend;

  // 从modules提取各种钩子，并存储
  // 这些钩子会在合适的时间点被调用
  for (i = 0; i < hooks.length; ++i) {
    cbs[hooks[i]] = [];
    for (j = 0; j < modules.length; ++j) {
      if (isDef(modules[j][hooks[i]])) {
        cbs[hooks[i]].push(modules[j][hooks[i]]);
      }
    }
  }

  // 将真实的DOM转为空的VNode（有tag和elm）
  function emptyNodeAt(elm) {
    return new VNode(
      nodeOps.tagName(elm).toLowerCase(),
      {},
      [],
      undefined,
      elm
    );
  }

  // 创建remove钩子的回调
  // 返回一个用于执行remove钩子的函数
  // 函数上有静态属性listeners，用于记录需要执行的remove相关钩子的计数
  // 每执行一次该函数，计数器会减一，直到计数器为0了就会执行节点的移除函数
  /**
   *
   * @param {Element} childElm ：将来要被移除的元素
   * @param {String} listeners ：初始化时的计数器，后续会增加或减少
   * @returns {Function} 用于增加或者减少计数器，最终执行移除元素的函数
   */
  function createRmCb(childElm, listeners) {
    function remove() {
      if (--remove.listeners === 0) {
        // 如果只有一个事件的计数器，则直接移除节点
        removeNode(childElm);
      }
    }
    // 记录事件的计数器
    remove.listeners = listeners;
    return remove;
  }

  // 将el从父元素中移除
  function removeNode(el) {
    const parent = nodeOps.parentNode(el);
    // element may have already been removed due to v-html / v-text
    if (isDef(parent)) {
      nodeOps.removeChild(parent, el);
    }
  }

  // 判断是否为未知的自定义元素
  function isUnknownElement(vnode, inVPre) {
    return (
      !inVPre &&
      !vnode.ns &&
      !(
        config.ignoredElements.length &&
        config.ignoredElements.some(ignore => {
          return isRegExp(ignore)
            ? ignore.test(vnode.tag)
            : ignore === vnode.tag;
        })
      ) &&
      config.isUnknownElement(vnode.tag)
    );
  }

  let creatingElmInVPre = 0;

  // 创建元素，存在vnode.elm中
  // 如果传递了parentElm则会将创建的元素插入到DOM中
  // 执行vnode和modules的create钩子，如果vnode有insert钩子
  // 会将vnode压入insertedVnodeQueue中
  /**
   *
   * @param {VNode} vnode 虚拟节点
   * @param {Array} insertedVnodeQueue 插入的虚拟节点队列
   * @param {HTMLElement} parentElm 父级真实DOM元素
   * @param {HTMLElement} refElm 参照DOM节点，用于插入的位置参考
   * @param {Boolean} nested 是否为嵌套节点，只在transition-group中有用
   * @param {Array} ownerArray 所有者数组，用于处理克隆节点
   * @param {Number} index 当前节点在所有者数组中的索引
   * @returns
   */
  function createElm(
    vnode,
    insertedVnodeQueue,
    parentElm,
    refElm,
    nested,
    ownerArray,
    index
  ) {
    // @suspense
    if (isDef(vnode.elm) && isDef(ownerArray)) {
      // 组件被渲染过了，用于组件复用
      // This vnode was used in a previous render!
      // now it's used as a new node, overwriting its elm would cause
      // potential patch errors down the road when it's used as an insertion
      // reference node. Instead, we clone the node on-demand before creating
      // associated DOM element for it.
      // 此vnode在以前的渲染中使用过
      // 现在，它被用作一个新节点，当它被用作插入参考节点时，覆盖它的elm会导致潜在的补丁错误。
      // 相反，我们在为节点创建关联的DOM元素之前按需克隆节点。

      vnode = ownerArray[index] = cloneVNode(vnode);
    }

    vnode.isRootInsert = !nested; // for transition enter check
    // 创建子组件，如果是子组件的话，创建后子组件的DOM已经插入到父元素了，最后会返回一个true
    // 组件创建时会自行处理其内部的节点的创建和插入，所以无需再处理后面的流程了
    if (createComponent(vnode, insertedVnodeQueue, parentElm, refElm)) {
      return;
    }
    // 走到这里说明是创建普通的元素（非子组件）
    const data = vnode.data;
    const children = vnode.children;
    const tag = vnode.tag;
    if (isDef(tag)) {
      // 创建的是个普通的html标签，创建该标签元素
      if (process.env.NODE_ENV !== "production") {
        if (data && data.pre) {
          creatingElmInVPre++;
        }
        if (isUnknownElement(vnode, creatingElmInVPre)) {
          // 创建了未知的html元素
          warn(
            "Unknown custom element: <" +
              tag +
              "> - did you " +
              "register the component correctly? For recursive components, " +
              'make sure to provide the "name" option.',
            vnode.context
          );
        }
      }
      // 创建元素，vnode.ns是命名空间，svg和math标签是有命名空间的
      // 此处创建的DOM是真实节点
      vnode.elm = vnode.ns
        ? nodeOps.createElementNS(vnode.ns, tag)
        : nodeOps.createElement(tag, vnode);
      // 设置CSS作用域
      setScope(vnode);

      /* istanbul ignore if */
      if (__WEEX__) {
        // in Weex, the default insertion order is parent-first.
        // List items can be optimized to use children-first insertion
        // with append="tree".
        const appendAsTree = isDef(data) && isTrue(data.appendAsTree);
        if (!appendAsTree) {
          if (isDef(data)) {
            invokeCreateHooks(vnode, insertedVnodeQueue);
          }
          insert(parentElm, vnode.elm, refElm);
        }
        createChildren(vnode, children, insertedVnodeQueue);
        if (appendAsTree) {
          if (isDef(data)) {
            invokeCreateHooks(vnode, insertedVnodeQueue);
          }
          insert(parentElm, vnode.elm, refElm);
        }
      } else {
        // 递归创建子元素
        // vnode.elm会作为子元素的parentElm传入，从而实现将子元素插入到父元素的DOM中
        // 当子元素是文本节点则创建文本节点，否则递归创建子元素
        createChildren(vnode, children, insertedVnodeQueue);
        if (isDef(data)) {
          // 执行模块和vnode的created钩子
          // 如果vnode有insert钩子会将vnode push到insertedVnodeQueue中
          invokeCreateHooks(vnode, insertedVnodeQueue);
        }
        // 插入元素，将元素插入到refElm前面或者parentElm最后面
        insert(parentElm, vnode.elm, refElm);
      }

      if (process.env.NODE_ENV !== "production" && data && data.pre) {
        creatingElmInVPre--;
      }
    } else if (isTrue(vnode.isComment)) {
      // 注释标签，创建注释标签
      // 创建注释标签，并插入到对应的位置
      vnode.elm = nodeOps.createComment(vnode.text);
      // 创建后插入节点
      insert(parentElm, vnode.elm, refElm);
    } else {
      // 创建的是纯文本节点，则创建文本节点并插入到父节点中
      vnode.elm = nodeOps.createTextNode(vnode.text);
      insert(parentElm, vnode.elm, refElm);
    }
  }

  // 创建组件
  // 1. 如果vnode是一个组件，则会执行其init钩子，创建组件实例并挂载
  // 然后为组件执行各个模块的create钩子
  // 如果组件被keep-alive包裹，则会激活组件
  // 最终会返回true
  // 2. 如果vnode只是一个普通元素，则什么不会做，返回值为undefined

  function createComponent(vnode, insertedVnodeQueue, parentElm, refElm) {
    let i = vnode.data;
    if (isDef(i)) {
      // 组件实例是否已经存在且被keep-alive包裹
      // componentInstance是子组件实例化的时候往vnode身上添加的Vue实例属性，
      // 即执行了子组件的init钩子后就会有
      const isReactivated = isDef(vnode.componentInstance) && i.keepAlive;
      // 如果当前vnode是一个组件，则调用组件init钩子
      // init的钩子是在调用createElement生成vnode时，调用installComponentHooks合并钩子时得到的
      // 如果组件是被keep-alive包裹的组件：则再执行prepatch钩子，用vnode上的各个属性更新oldVnode上的相关属性
      // 如果组件没有被keep-alive包裹或首次渲染，则初始化组件，并进入挂载阶段
      // 此步完成后子组件就完成了实例挂载
      if (isDef((i = i.hook)) && isDef((i = i.init))) {
        i(vnode, false /* hydrating */);
      }
      // after calling the init hook, if the vnode is a child component
      // it should've created a child instance and mounted it. the child
      // component also has set the placeholder vnode's elm.
      // in that case we can just return the element and be done.
      // 在调用init钩子之后，如果vnode是子组件，它应该创建了一个子Vue实例并挂载了它。
      // 此时vnode上就会有componentInstance属性（Vue实例）
      // 调用initComponent之后，子组件设置了占位符vnode的elm。
      // 在这种情况下，说明我们创建了一个子组件，可以可以返回元素并完成。
      if (isDef(vnode.componentInstance)) {
        // 组件实例
        // 设置占位vnode的elm
        // 执行组件各个模块的create钩子
        initComponent(vnode, insertedVnodeQueue);
        // 将子组件生成的DOM插入到父元素
        insert(parentElm, vnode.elm, refElm);
        if (isTrue(isReactivated)) {
          //组件被keep-alive包裹了，且不是首次渲染则激活组件
          reactivateComponent(vnode, insertedVnodeQueue, parentElm, refElm);
        }
        // 创建了子组件并插入到DOM中了
        return true;
      }
    }
  }

  // 初始化组件
  // 1. 获取钩子
  // 2. 从vnode.componentInstance.$el获取真实节点给vnode.elm
  function initComponent(vnode, insertedVnodeQueue) {
    if (isDef(vnode.data.pendingInsert)) {
      // 获取被延迟执行的insert钩子，压入insertedVnodeQueue
      insertedVnodeQueue.push.apply(
        insertedVnodeQueue,
        vnode.data.pendingInsert
      );
      vnode.data.pendingInsert = null;
    }
    vnode.elm = vnode.componentInstance.$el; // 获取组件实例的真实根节点，赋值给elm
    if (isPatchable(vnode)) {
      // 执行create钩子，如果有insert钩子，会将vnode压入insertedVnodeQueue中
      invokeCreateHooks(vnode, insertedVnodeQueue);
      setScope(vnode); // 设置CSS作用域
    } else {
      // empty component root.
      // skip all element-related modules except for ref (#3455)
      // 处理<child ref="child"></child>
      // child: { template: '<div v-if="false"></div>'}
      // 这类空根节点的情况，这种情况下只处理ref属性，忽略其他的modules处理
      registerRef(vnode);
      // make sure to invoke the insert hook
      insertedVnodeQueue.push(vnode);
    }
  }

  // 激活组件
  // 这里主要是对transition下钩子执行的问题做了处理
  // 后续的insert语句应该属于多余的操作？
  function reactivateComponent(vnode, insertedVnodeQueue, parentElm, refElm) {
    let i;
    // hack for #4339: a reactivated component with inner transition
    // does not trigger because the inner node's created hooks are not called
    // again. It's not ideal to involve module-specific logic in here but
    // there doesn't seem to be a better way to do it.
    // 处理transition动画不触发的问题
    // keep-alive里组件的created钩子不再触发
    let innerNode = vnode;
    while (innerNode.componentInstance) {
      innerNode = innerNode.componentInstance._vnode;
      if (isDef((i = innerNode.data)) && isDef((i = i.transition))) {
        for (i = 0; i < cbs.activate.length; ++i) {
          cbs.activate[i](emptyNode, innerNode);
        }
        insertedVnodeQueue.push(innerNode);
        break;
      }
    }
    // unlike a newly created component,
    // a reactivated keep-alive component doesn't insert itself
    // 在调用reactivateComponent之前就执行了insert，所以该条语句应该是多余的？
    // @suspense
    insert(parentElm, vnode.elm, refElm);
  }

  // 在父元素中插入子元素
  //将元素插入到父元素的后面或者参照元素的前面
  function insert(parent, elm, ref) {
    if (isDef(parent)) {
      if (isDef(ref)) {
        // 如果有参照的元素且参照元素的父元素为与被插入的元素的父元素一致，则将元素插入到参照元素之前
        if (nodeOps.parentNode(ref) === parent) {
          nodeOps.insertBefore(parent, elm, ref);
        }
      } else {
        // 否则将元素插入到父元素最后一个子元素后面
        nodeOps.appendChild(parent, elm);
      }
    }
  }

  /**
   * 递归创建子元素
   * 如果子元素是文本节点则直接在父元素添加文本节点
   * 如果子元素是节点列表，则遍历后递归创建子元素
   */
  function createChildren(vnode, children, insertedVnodeQueue) {
    // 子元素为标签或者组件
    if (Array.isArray(children)) {
      // 兄弟元素同名key的检验
      if (process.env.NODE_ENV !== "production") {
        checkDuplicateKeys(children);
      }
      for (let i = 0; i < children.length; ++i) {
        // 递归创建
        createElm(
          children[i], // 元素vnode
          insertedVnodeQueue, // 要插入的vnode队列
          vnode.elm, // 父元素
          null, // 参考节点
          true, // 嵌套标记
          children, // 创建的节点vnode所属的数组
          i // 当前节点在所属数组中的索引
        );
      }
    } else if (isPrimitive(vnode.text)) {
      // 文本节点，在父节点后面插入文本节点
      nodeOps.appendChild(
        vnode.elm,
        nodeOps.createTextNode(String(vnode.text))
      );
    }
  }

  // 是否可patch的节点
  // 找到最深层的_vnode节点，返回其tag值
  // 这种情况下找到最深层的的组件
  function isPatchable(vnode) {
    while (vnode.componentInstance) {
      vnode = vnode.componentInstance._vnode;
    }
    return isDef(vnode.tag);
  }

  // 执行create钩子
  // 1. 执行modules中的create钩子
  // 2. 执行vnode上的create钩子
  // 3. 将vnode上的添加到insertedVnodeQueue中
  function invokeCreateHooks(vnode, insertedVnodeQueue) {
    // 遍历modules中所有的create钩子
    for (let i = 0; i < cbs.create.length; ++i) {
      cbs.create[i](emptyNode, vnode);
    }
    i = vnode.data.hook; // Reuse variable
    if (isDef(i)) {
      // vnode上的create钩子和insert钩子
      if (isDef(i.create)) i.create(emptyNode, vnode); // create钩子直接执行
      if (isDef(i.insert)) insertedVnodeQueue.push(vnode); // 将有insert钩子的vnode push到insertedVnodeQueue中
    }
  }

  // set scope id attribute for scoped CSS.
  // this is implemented as a special case to avoid the overhead
  // of going through the normal attribute patching process.
  // 设置作用域CSS的作用域id
  function setScope(vnode) {
    let i;
    if (isDef((i = vnode.fnScopeId))) {
      nodeOps.setStyleScope(vnode.elm, i);
    } else {
      let ancestor = vnode;
      while (ancestor) {
        if (isDef((i = ancestor.context)) && isDef((i = i.$options._scopeId))) {
          nodeOps.setStyleScope(vnode.elm, i);
        }
        ancestor = ancestor.parent;
      }
    }
    // for slot content they should also get the scopeId from the host instance.
    if (
      isDef((i = activeInstance)) &&
      i !== vnode.context &&
      i !== vnode.fnContext &&
      isDef((i = i.$options._scopeId))
    ) {
      nodeOps.setStyleScope(vnode.elm, i);
    }
  }
  // 从vnodes中截取节点并创建添加至所在的DOM节点中
  function addVnodes(
    parentElm,
    refElm,
    vnodes,
    startIdx,
    endIdx,
    insertedVnodeQueue
  ) {
    for (; startIdx <= endIdx; ++startIdx) {
      createElm(
        vnodes[startIdx],
        insertedVnodeQueue,
        parentElm,
        refElm,
        false,
        vnodes,
        startIdx
      );
    }
  }

  // 递归执行虚拟节点的destroy钩子
  // 包含vnode上的destroy钩子和模块中的destroy钩子
  function invokeDestroyHook(vnode) {
    let i, j;
    const data = vnode.data;
    if (isDef(data)) {
      if (isDef((i = data.hook)) && isDef((i = i.destroy))) i(vnode); // vnode上的destroy钩子
      for (i = 0; i < cbs.destroy.length; ++i) cbs.destroy[i](vnode); // modules中的destroy钩子
    }
    if (isDef((i = vnode.children))) {
      // 递归执行
      for (j = 0; j < vnode.children.length; ++j) {
        invokeDestroyHook(vnode.children[j]);
      }
    }
  }

  // 删除节点，文本节点就直接移除vnodes中指定范围内的节点
  /// 非文本节点删除后会执行相应的钩子
  function removeVnodes(parentElm, vnodes, startIdx, endIdx) {
    for (; startIdx <= endIdx; ++startIdx) {
      const ch = vnodes[startIdx];
      if (isDef(ch)) {
        if (isDef(ch.tag)) {
          // 非文本节点
          // 非文本节点，执行remove和destroy钩子
          removeAndInvokeRemoveHook(ch); // 执行remove钩子并移除元素
          invokeDestroyHook(ch); // 递归执行destroy钩子
        } else {
          // Text node 文本节点，直接移除
          removeNode(ch.elm);
        }
      }
    }
  }
  // 删除非文本节点元素 并执行remove钩子以及destroy钩子
  // vnode是嵌套的，在删除节点之前，会递归执行子元素的相关的钩子
  // 直到所有的钩子都执行完毕了，就会将节点从DOM上移除
  // 因此，内部维护了一个listeners用于记录需要执行的钩子的次数，
  // 直到计数为0了，就会将节点一次性移除
  function removeAndInvokeRemoveHook(vnode, rm) {
    if (isDef(rm) || isDef(vnode.data)) {
      let i;
      // modules上的remove钩子，以及节点自身的remove钩子都需要执行，所以计数要+1
      // 递归执行的过程需要这个计数来判断是否执行完毕了，再最后删除整个vnode节点
      const listeners = cbs.remove.length + 1;
      if (isDef(rm)) {
        // 传了rm，说明是递归执行的，计数累加
        // we have a recursively passed down rm callback
        // increase the listeners count
        rm.listeners += listeners;
      } else {
        // 最外层节点，则创建这个remove包装函数，并添加remove.listeners用于记录钩子的计数器
        // rm每执行一次listeners会减少一个计数，直到计数为0了则会移除节点
        // directly removing
        rm = createRmCb(vnode.elm, listeners);
      }
      // recursively invoke hooks on child component root node
      // 递归执行实例上的销毁钩子， 会传入创建好的remove
      if (
        isDef((i = vnode.componentInstance)) &&
        isDef((i = i._vnode)) &&
        isDef(i.data)
      ) {
        removeAndInvokeRemoveHook(i, rm);
      }
      // 执行模块上的remove钩子
      for (i = 0; i < cbs.remove.length; ++i) {
        cbs.remove[i](vnode, rm); // rm作为参数传递进去，被执行后会让计数-1
      }
      // 执行节点上的remove钩子
      if (isDef((i = vnode.data.hook)) && isDef((i = i.remove))) {
        i(vnode, rm); // rm作为参数传递进去，被执行后会让计数-1
      } else {
        // 条件不成立也要执行一次rm函数，让计数-1
        rm();
      }
    } else {
      // 移除元素
      removeNode(vnode.elm);
    }
  }

  /**
   * 子元素列表Diff
   * @param {*} parentElm 父DOM节点
   * @param {*} oldCh 老的子元素列表
   * @param {*} newCh  新的子元素列表
   * @param {*} insertedVnodeQueue
   * @param {*} removeOnly 特殊标识
   * Diff的过程如下：
   * 1. 分别为oldCh和newCh各初始化两个头尾指针
   * 2. 遍历新老节点列表，各自的头尾指针分别向中间靠拢，不断的比较新老节点，直到其中一个遍历结束，边Diff边为DOM做补丁
   * 打补丁的过程会做出几种假设：
   * 1. 新的头节点与老的头节点相同，则对这两个节点递归patch，复用老的节点，新老节点头尾指针向中间靠拢
   * 2. 新的尾节点与老的尾节点相同，则对这两个节点递归patch，复用老节点，新老节点头尾指针向中间靠拢
   * 3. 新的头节点与老的尾节点相同，则将旧尾节点插入到旧头节点的前面，老的尾指针向左移，新的头指针向右移
   * 4. 新的尾节点与老的头节点相同，则将旧头节点插入到旧尾节点的前面，老的头指针右移，新的尾指针左移
   * 若以上假设均不成立，则通过key来查找
   * 1. 如果新的头节点设置了key，则从老节点列表中找到具有相同的key的节点在列表中的索引；
   * 否则，遍历老节点剩下的未比较的节点，找到与新头节点相同的节点的索引
   * 2. 如果找到了这个索引，则获取其对应的vnode，与新头节点比较是否为相同节点，如果是则递归调用patchVnode，
   * 并将老节点对应的节点位置设置为undefined，后续循环就会跳过该节点的比较；
   * 除去这些情况，就把新的头节点当作新节点对待了，创建新的节点并插入DOM中
   * 处理完这些新的头指针需要向右移一位
   *
   * 循环结束后，新的节点列表或者旧的节点列表可能还有没有比对的Vnode节点，对其作剩下的处理
   * 1. 如果老的节点有剩余，则删除去这些节点
   * 2. 如果新的节点有剩余，则获取应该要插入的位置，将剩下的节点创建后并插入到对用的位置
   */
  function updateChildren(
    parentElm,
    oldCh,
    newCh,
    insertedVnodeQueue,
    removeOnly
  ) {
    let oldStartIdx = 0; // 老节点所有子元素开始的索引
    let newStartIdx = 0; // 新节点所有子元素开始的索引
    let oldEndIdx = oldCh.length - 1; // 老节点所有子元素结束的索引
    let oldStartVnode = oldCh[0]; // 老节点第一个子元素
    let oldEndVnode = oldCh[oldEndIdx]; // 老节点最后一个子元素
    let newEndIdx = newCh.length - 1; // 新节点最后所有子元素的结束索引
    let newStartVnode = newCh[0]; // 新节点第一个子元素
    let newEndVnode = newCh[newEndIdx]; // 新节点最后一个子元素
    let oldKeyToIdx, idxInOld, vnodeToMove, refElm;

    // removeOnly is a special flag used only by <transition-group>
    // to ensure removed elements stay in correct relative positions
    // during leaving transitions
    // /removeOnly是一个特殊标志，仅由＜transition group＞使用，
    // 以确保在离开过渡期间被移除的元素保持在正确的相对位置
    const canMove = !removeOnly;

    // 检查新子节点列表是否有重复的key
    if (process.env.NODE_ENV !== "production") {
      checkDuplicateKeys(newCh);
    }

    // 开始进行DOM Diff
    while (oldStartIdx <= oldEndIdx && newStartIdx <= newEndIdx) {
      if (isUndef(oldStartVnode)) {
        // 当前位置的节点被移走了，直接跳过
        oldStartVnode = oldCh[++oldStartIdx]; // Vnode has been moved left
      } else if (isUndef(oldEndVnode)) {
        // 当前位置的节点被一走了，直接跳过
        oldEndVnode = oldCh[--oldEndIdx];
      } else if (sameVnode(oldStartVnode, newStartVnode)) {
        // 两个开始节点是相同的节点，则进行节点的递归patch
        patchVnode(
          oldStartVnode,
          newStartVnode,
          insertedVnodeQueue,
          newCh,
          newStartIdx
        );
        // 新老开始节点都向右移一位
        oldStartVnode = oldCh[++oldStartIdx];
        newStartVnode = newCh[++newStartIdx];
      } else if (sameVnode(oldEndVnode, newEndVnode)) {
        //两个结束节点是相同的节点，则进行节点的递归patch
        patchVnode(
          oldEndVnode,
          newEndVnode,
          insertedVnodeQueue,
          newCh,
          newEndIdx
        );
        // 新老结束节点都向左移一位
        oldEndVnode = oldCh[--oldEndIdx];
        newEndVnode = newCh[--newEndIdx];
      } else if (sameVnode(oldStartVnode, newEndVnode)) {
        //老节点的开始节点和新节点的结束节点相同
        // Vnode moved right
        // 对这两个节点进行递归的patch
        patchVnode(
          oldStartVnode,
          newEndVnode,
          insertedVnodeQueue,
          newCh,
          newEndIdx
        );
        // 将老节点的开始节点插入到DOM中正在比较的结束节点的前面，复用老节点
        canMove &&
          nodeOps.insertBefore(
            parentElm,
            oldStartVnode.elm,
            nodeOps.nextSibling(oldEndVnode.elm)
          );
        // 老节点的开始节点再向右移动一位
        oldStartVnode = oldCh[++oldStartIdx];
        // 新节点的结束节点向左移动一位
        newEndVnode = newCh[--newEndIdx];
      } else if (sameVnode(oldEndVnode, newStartVnode)) {
        // 老节点的结束节点与新节点的开始节点相同
        // Vnode moved left
        // 对这两个节点进行递归patch
        patchVnode(
          oldEndVnode,
          newStartVnode,
          insertedVnodeQueue,
          newCh,
          newStartIdx
        );
        // 将老节点插入到DOM中正在比较的开始节点的开始节点的前面
        canMove &&
          nodeOps.insertBefore(parentElm, oldEndVnode.elm, oldStartVnode.elm);
        // 老节点结束节点向左移动一位
        oldEndVnode = oldCh[--oldEndIdx];
        // 新节点的开始节点向右移动一位
        newStartVnode = newCh[++newStartIdx];
      } else {
        // 走到这里说明4种假设条件均不成立，通过key值来复用节点

        // 创建key与index的映射关系
        if (isUndef(oldKeyToIdx))
          oldKeyToIdx = createKeyToOldIdx(oldCh, oldStartIdx, oldEndIdx);
        idxInOld = isDef(newStartVnode.key) // 新的开始节点有key
          ? oldKeyToIdx[newStartVnode.key] // 取该key在旧节点中的index
          : // 新节点没有key，那么就从旧节点中剩余的子节点找到相同的节点
            // 由于这里又会对旧节点进行一次遍历和比较，因此，使用key是可以提高性能的，可以避免这个遍历
            findIdxInOld(newStartVnode, oldCh, oldStartIdx, oldEndIdx);

        // 找不到旧的相同的元素，那么就当当前比较的新节点是个新元素
        if (isUndef(idxInOld)) {
          // New element
          // 创建新元素并插入到DOM中，插入的位置为比较的老开始节点的后面
          createElm(
            newStartVnode,
            insertedVnodeQueue,
            parentElm,
            oldStartVnode.elm,
            false,
            newCh,
            newStartIdx
          );
        } else {
          // 找到了具有相同key的老节点或者相同的老节点所在的索引
          vnodeToMove = oldCh[idxInOld]; // 获取老节点
          if (sameVnode(vnodeToMove, newStartVnode)) {
            // 如果是同一个节点，则进行递归patch
            patchVnode(
              vnodeToMove,
              newStartVnode,
              insertedVnodeQueue,
              newCh,
              newStartIdx
            );
            // 当前的节点会被移动到相应的位置，做置空处理，避免后续重复比较
            oldCh[idxInOld] = undefined;
            // 将当前节点插入到DOM中老节点的开始节点的所在位置的前面
            canMove &&
              nodeOps.insertBefore(
                parentElm,
                vnodeToMove.elm,
                oldStartVnode.elm
              );
          } else {
            // 虽然有相同的key但是不是相同节点，则也当作新的节点来处理
            // same key but different element. treat as new element
            createElm(
              newStartVnode,
              insertedVnodeQueue,
              parentElm,
              oldStartVnode.elm,
              false,
              newCh,
              newStartIdx
            );
          }
        }
        // 处理完了新节点的开始节点，节点的开始指针往右移动一位
        newStartVnode = newCh[++newStartIdx];
      }
    }
    // 遍历完了，新老子节点列表可能有一个存在没有遍历完的情况

    if (oldStartIdx > oldEndIdx) {
      // 说明老节点遍历完了，新节点没有遍历完
      // 插入的参考点
      // 如果新节点的结束指针停留在最后，则直接将剩下的节点插入到后面就可以了
      // 否则则插入到已处理的结束节点的前一个位置上
      refElm = isUndef(newCh[newEndIdx + 1]) ? null : newCh[newEndIdx + 1].elm;
      addVnodes(
        parentElm,
        refElm,
        newCh,
        newStartIdx,
        newEndIdx,
        insertedVnodeQueue
      );
    } else if (newStartIdx > newEndIdx) {
      // 说明新节点遍历完了，老节点没遍历完
      // 将老节点上剩余的节点删除
      removeVnodes(parentElm, oldCh, oldStartIdx, oldEndIdx);
    }
  }

  // 用于监测兄弟元素之间是否有重复的key
  function checkDuplicateKeys(children) {
    const seenKeys = {};
    for (let i = 0; i < children.length; i++) {
      const vnode = children[i];
      const key = vnode.key;
      if (isDef(key)) {
        if (seenKeys[key]) {
          warn(
            `Duplicate keys detected: '${key}'. This may cause an update error.`,
            vnode.context
          );
        } else {
          seenKeys[key] = true;
        }
      }
    }
  }

  // 在旧的节点子节点列表中，在其start~end范围内找到新节点相同的节点所在的索引
  function findIdxInOld(node, oldCh, start, end) {
    for (let i = start; i < end; i++) {
      const c = oldCh[i];
      if (isDef(c) && sameVnode(node, c)) return i;
    }
  }

  /**
   * diff算法
   */
  function patchVnode(
    oldVnode, // 老节点
    vnode, // 新节点
    insertedVnodeQueue, // 将要被插入的vnode队列
    ownerArray, // vnode所属的数组
    index, // vnode在ownerArray中的索引
    removeOnly // 特殊的标识，仅transition有用
  ) {
    if (oldVnode === vnode) {
      // 新旧节点是同一个节点，无需比对
      return;
    }

    // @suspense
    if (isDef(vnode.elm) && isDef(ownerArray)) {
      // clone reused vnode
      vnode = ownerArray[index] = cloneVNode(vnode);
    }

    const elm = (vnode.elm = oldVnode.elm); // 老节点的真实DOM节点

    // @suspense
    if (isTrue(oldVnode.isAsyncPlaceholder)) {
      // 如果是异步组件
      if (isDef(vnode.asyncFactory.resolved)) {
        hydrate(oldVnode.elm, vnode, insertedVnodeQueue);
      } else {
        vnode.isAsyncPlaceholder = true;
      }
      return;
    }

    // reuse element for static trees.
    // note we only do this if the vnode is cloned -
    // if the new node is not cloned it means the render functions have been
    // reset by the hot-reload-api and we need to do a proper re-render.
    // 复用组件
    // 新老节点都是静态节点、key相同、vnode是clone得到的或者vnode是v-once节点
    if (
      isTrue(vnode.isStatic) && // 新老节点都是静态节点
      isTrue(oldVnode.isStatic) &&
      vnode.key === oldVnode.key && // 新老节点的key相同
      (isTrue(vnode.isCloned) || isTrue(vnode.isOnce))
    ) {
      vnode.componentInstance = oldVnode.componentInstance;
      return;
    }

    let i;
    const data = vnode.data;
    // patch之前，执行prepatch钩子
    if (isDef(data) && isDef((i = data.hook)) && isDef((i = i.prepatch))) {
      i(oldVnode, vnode);
    }

    const oldCh = oldVnode.children; // 老节点的子节点列表
    const ch = vnode.children; // 新节点的子节点列表
    // 执行update钩子
    if (isDef(data) && isPatchable(vnode)) {
      for (i = 0; i < cbs.update.length; ++i) cbs.update[i](oldVnode, vnode);
      if (isDef((i = data.hook)) && isDef((i = i.update))) i(oldVnode, vnode);
    }
    if (isUndef(vnode.text)) {
      // 新节点不是文本
      if (isDef(oldCh) && isDef(ch)) {
        // 新老节点都有子节点，则进行diff
        // 此处为Diff算法的核心
        if (oldCh !== ch)
          updateChildren(elm, oldCh, ch, insertedVnodeQueue, removeOnly);
      } else if (isDef(ch)) {
        //  只有新节点有子节点
        if (process.env.NODE_ENV !== "production") {
          // 检查新节点子节点是否有重复的key
          checkDuplicateKeys(ch);
        }
        if (isDef(oldVnode.text)) nodeOps.setTextContent(elm, ""); // 如果老节点是个文本节点，则将内容置空
        addVnodes(elm, null, ch, 0, ch.length - 1, insertedVnodeQueue); // 创建新的子节点列表
      } else if (isDef(oldCh)) {
        // 新节点没有子节点，老节点有子节点
        removeVnodes(elm, oldCh, 0, oldCh.length - 1); // 移除DOM上的子节点
      } else if (isDef(oldVnode.text)) {
        // 新老节点都没有子节点且老节点是文本节点
        nodeOps.setTextContent(elm, ""); // 将文本置空
      }
    } else if (oldVnode.text !== vnode.text) {
      // 新老节点都是文本节点，则更新文本内容
      nodeOps.setTextContent(elm, vnode.text);
    }
    // patch完毕，执行postpatch钩子
    if (isDef(data)) {
      if (isDef((i = data.hook)) && isDef((i = i.postpatch)))
        i(oldVnode, vnode);
    }
  }

  // 调用插入节点的insert钩子
  function invokeInsertHook(vnode, queue, initial) {
    // delay insert hooks for component root nodes, invoke them after the
    // element is really inserted
    // 这时候子组件还没被真正插入到DOM中
    // 延迟组件根节点的insert钩子，在元素真实的DOM被插入后再调用它们
    // 如果是初始插入且组件有父节点（本身不是根节点），
    // 则将queue添加到父节点的data.pendingInsert中
    if (isTrue(initial) && isDef(vnode.parent)) {
      vnode.parent.data.pendingInsert = queue;
    } else {
      // 非延迟插入的情况，则立即执行钩子
      for (let i = 0; i < queue.length; ++i) {
        // 直接执行insert hook
        queue[i].data.hook.insert(queue[i]);
      }
    }
  }

  let hydrationBailed = false;
  // list of modules that can skip create hook during hydration because they
  // are already rendered on the client or has no need for initialization
  // Note: style is excluded because it relies on initial clone for future
  // deep updates (#7063).
  // 可以跳过create钩子的模块
  const isRenderedModule = makeMap("attrs,class,staticClass,staticStyle,key");

  // Note: this is a browser-only function so we can assume elms are DOM nodes.
  /**
   * 水合（激活）函数
   * @param {HTMLElement} elm 真实的DOM节点
   * @param {VNode} vnode 虚拟DOM节点
   * @param {Array} insertedVnodeQueue 要插入的VNode队列
   * @param {Boolean} inVPre 是否在v-pre环境下
   * @returns 是否激活成功
   */
  function hydrate(elm, vnode, insertedVnodeQueue, inVPre) {
    // 从vnode中获取各种所需的属性
    let i;
    const { tag, data, children } = vnode;
    inVPre = inVPre || (data && data.pre);
    vnode.elm = elm; // 设置vnode的elm属性为真实DOM节点

    // 如果虚拟节点是注释节点且定义了异步工厂函数，则将其标记为异步占位符并返回true
    if (isTrue(vnode.isComment) && isDef(vnode.asyncFactory)) {
      vnode.isAsyncPlaceholder = true;
      return true;
    }
    // assert node match
    if (process.env.NODE_ENV !== "production") {
      if (!assertNodeMatch(elm, vnode, inVPre)) {
        return false;
      }
    }
    if (isDef(data)) {
      if (isDef((i = data.hook)) && isDef((i = i.init)))
        i(vnode, true /* hydrating */);
      if (isDef((i = vnode.componentInstance))) {
        // child component. it should have hydrated its own tree.
        initComponent(vnode, insertedVnodeQueue);
        return true;
      }
    }
    if (isDef(tag)) {
      if (isDef(children)) {
        // empty element, allow client to pick up and populate children
        if (!elm.hasChildNodes()) {
          createChildren(vnode, children, insertedVnodeQueue);
        } else {
          // v-html and domProps: innerHTML
          if (
            isDef((i = data)) &&
            isDef((i = i.domProps)) &&
            isDef((i = i.innerHTML))
          ) {
            if (i !== elm.innerHTML) {
              /* istanbul ignore if */
              if (
                process.env.NODE_ENV !== "production" &&
                typeof console !== "undefined" &&
                !hydrationBailed
              ) {
                hydrationBailed = true;
                console.warn("Parent: ", elm);
                console.warn("server innerHTML: ", i);
                console.warn("client innerHTML: ", elm.innerHTML);
              }
              return false;
            }
          } else {
            // iterate and compare children lists
            let childrenMatch = true;
            let childNode = elm.firstChild;
            for (let i = 0; i < children.length; i++) {
              if (
                !childNode ||
                !hydrate(childNode, children[i], insertedVnodeQueue, inVPre)
              ) {
                childrenMatch = false;
                break;
              }
              childNode = childNode.nextSibling;
            }
            // if childNode is not null, it means the actual childNodes list is
            // longer than the virtual children list.
            if (!childrenMatch || childNode) {
              /* istanbul ignore if */
              if (
                process.env.NODE_ENV !== "production" &&
                typeof console !== "undefined" &&
                !hydrationBailed
              ) {
                hydrationBailed = true;
                console.warn("Parent: ", elm);
                console.warn(
                  "Mismatching childNodes vs. VNodes: ",
                  elm.childNodes,
                  children
                );
              }
              return false;
            }
          }
        }
      }
      if (isDef(data)) {
        let fullInvoke = false;
        for (const key in data) {
          if (!isRenderedModule(key)) {
            fullInvoke = true;
            invokeCreateHooks(vnode, insertedVnodeQueue);
            break;
          }
        }
        if (!fullInvoke && data["class"]) {
          // ensure collecting deps for deep class bindings for future updates
          traverse(data["class"]);
        }
      }
    } else if (elm.data !== vnode.text) {
      elm.data = vnode.text;
    }
    return true;
  }

  function assertNodeMatch(node, vnode, inVPre) {
    if (isDef(vnode.tag)) {
      return (
        vnode.tag.indexOf("vue-component") === 0 ||
        (!isUnknownElement(vnode, inVPre) &&
          vnode.tag.toLowerCase() ===
            (node.tagName && node.tagName.toLowerCase()))
      );
    } else {
      return node.nodeType === (vnode.isComment ? 8 : 3);
    }
  }
  // 返回patch函数
  /**
   * patch函数
   * @param {VNode} oldVnode 老节点
   * @param {VNode} vnode 新节点
   * @param {Boolean} hydrating 是否为服务端渲染
   * @param {Boolean} removeOnly 仅用于transition相关的标识
   * @returns {VNode} 真实DOM
   * 1. 如果新节点不存在且老节点存在，则销毁老节点，执行老节点的相关钩子
   * 2. 如果有新的节点但是没有老节点，则创建一个新的元素，这种情况通常是子组件的初次渲染
   * 3. 如果新老节点同时存在
   *    3.1 老节点不是真实DOM（根元素首次挂载）或新老节点是相同的节点（根节点没被替换），则进行新旧节点的diff算法，生成新的DOM
   *    3.2 老节点是真实DOM，说明是首次根元素挂载，将真实DOM转为空的VNode，并直接将自身作为空VNode的elem属性
   * 4.
   *
   */
  return function patch(oldVnode, vnode, hydrating, removeOnly) {
    // 新节点为空，且有老节点则销毁老节点
    if (isUndef(vnode)) {
      if (isDef(oldVnode)) invokeDestroyHook(oldVnode); // 老节点上执行销毁的钩子
      return;
    }

    let isInitialPatch = false; // 是否为初次patch，初次patch的子组件执行insert钩子时需要延迟到其被真实插入到DOM树中
    const insertedVnodeQueue = []; // 用于收集插入的虚拟节点，以便后续调用挂载的钩子

    if (isUndef(oldVnode)) {
      // 有新节点，没有老节点，则创建一个新的根节点
      // 这种情况下一般是子组件初次挂载的时候，也就是没有挂载的根节点，只是生成组件的根节点元素
      // 比如<div id="app"><Child /></div>
      // Child组件的初次渲染就会走到这里
      // empty mount (likely as component), create new root element
      // 标记为初次渲染
      isInitialPatch = true;
      // 创建新的根节点，由于这里没有传其他参数，因此创建节点后不会被马上插入到DOM中
      createElm(vnode, insertedVnodeQueue);
    } else {
      // 新老节点都存在
      // 是否为真实的DOM，初次渲染时，传入的oldVnode是根节点的真实DOM
      const isRealElement = isDef(oldVnode.nodeType);
      if (!isRealElement && sameVnode(oldVnode, vnode)) {
        // 说明是更新阶段
        // 新老节点都是vnode节点，且新老节点相同，则是更新阶段，进行新老节点的patch
        // patch existing root node
        patchVnode(oldVnode, vnode, insertedVnodeQueue, null, null, removeOnly);
      } else {
        // 说明是首次挂载阶段或者根节点被替换了的阶段（如v-if）
        if (isRealElement) {
          // 是真实的DOM节点，说明首次渲染
          // 说明是将vnode挂载到一个真实的DOM节点
          // mounting to a real element
          // check if this is server-rendered content and if we can perform
          // a successful hydration.
          // ----------------服务端渲染start
          // 如果旧节点是一个DOM元素节点且具有data-server-rendered属性，说明是服务端渲染的DOM节点
          // 此时移除data-server-rendered属性，同时将hydrating置为true，标记当前为服务端渲染返回的根节点
          if (oldVnode.nodeType === 1 && oldVnode.hasAttribute(SSR_ATTR)) {
            oldVnode.removeAttribute(SSR_ATTR);
            hydrating = true;
          }
          // 旧节点是服务端渲染返回的根节点，则将vnode的elem属性设置为oldVnode
          if (isTrue(hydrating)) {
            // 服务端渲染
            if (hydrate(oldVnode, vnode, insertedVnodeQueue)) {
              invokeInsertHook(vnode, insertedVnodeQueue, true);
              return oldVnode;
            } else if (process.env.NODE_ENV !== "production") {
              warn(
                "The client-side rendered virtual DOM tree is not matching " +
                  "server-rendered content. This is likely caused by incorrect " +
                  "HTML markup, for example nesting block-level elements inside " +
                  "<p>, or missing <tbody>. Bailing hydration and performing " +
                  "full client-side render."
              );
            }
          }
          // ---------服务端渲染end
          // either not server-rendered, or hydration failed.
          // create an empty node and replace it
          // 非服务端渲染或服务端渲染处理失败
          // 将oldVnode这个真实的DOM转为空的VNode节点，转化后oldVnode.elm引用着原始的真实DOM
          // 如：{tag: "div",data: {}, elm: HTMLElement, children: []}
          oldVnode = emptyNodeAt(oldVnode);
        }

        // replacing existing element
        // 替换存在的真实DOM
        const oldElm = oldVnode.elm; // 获取老节点的真实的DOM
        const parentElm = nodeOps.parentNode(oldElm); // 获取老节点父元素，比如body元素

        // 创建一个新的真实DOM，并插入到老节点的后面
        // 这时候页面会存在新老两个节点真实的DOM节点
        // debugger;
        createElm(
          vnode,
          insertedVnodeQueue,
          // extremely rare edge case: do not insert if old element is in a
          // leaving transition. Only happens when combining transition +
          // keep-alive + HOCs. (#4590)
          // 极端情况的处理，结合使用transition+keep-alive+HOC时会出现的现象
          // 当老节点处理离开的过度节点，则不插入节点
          oldElm._leaveCb ? null : parentElm,
          nodeOps.nextSibling(oldElm) // DOM节点的下一个节点
        );

        // update parent placeholder node element, recursively
        // 如果根节点被替换（如v-if），递归遍历更新父级占位节点
        if (isDef(vnode.parent)) {
          let ancestor = vnode.parent;
          const patchable = isPatchable(vnode);
          while (ancestor) {
            for (let i = 0; i < cbs.destroy.length; ++i) {
              // 递归执行销毁钩子
              cbs.destroy[i](ancestor);
            }
            ancestor.elm = vnode.elm; // 更新为新的DOM节点
            if (patchable) {
              for (let i = 0; i < cbs.create.length; ++i) {
                cbs.create[i](emptyNode, ancestor);
              }
              // #6513
              // invoke insert hooks that may have been merged by create hooks.
              // e.g. for directives that uses the "inserted" hook.
              const insert = ancestor.data.hook.insert;
              if (insert.merged) {
                // start at index 1 to avoid re-invoking component mounted hook
                for (let i = 1; i < insert.fns.length; i++) {
                  insert.fns[i]();
                }
              }
            } else {
              registerRef(ancestor);
            }
            ancestor = ancestor.parent;
          }
        }

        // destroy old node
        if (isDef(parentElm)) {
          // 如果父节点存在，则从父节点移除旧的真实DOM
          // 走到这一步，老节点对应的DOM就会被移除，并且会执行老节点的销毁钩子以及父节点的remove钩子
          removeVnodes(parentElm, [oldVnode], 0, 0);
        } else if (isDef(oldVnode.tag)) {
          // 不存在父真实节点，则直接执行销毁的钩子
          invokeDestroyHook(oldVnode);
        }
      }
    }
    // patch完会调用插入的节点的insert钩子
    // 每一个根组件都有一个insertedVnodeQueue和isInitialPatch
    // 在这里执行的时候，子组件可能还没有被真正的插入到DOM中（只是插入到父组件的DOM中）
    // 所以子组件的insert钩子需要延迟到其被真实插入到DOM树中才执行
    invokeInsertHook(vnode, insertedVnodeQueue, isInitialPatch);
    // 返回创建的真实DOM元素
    return vnode.elm;
  };
}
