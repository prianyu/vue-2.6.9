/* @flow */

import VNode from './vnode'
import { resolveConstructorOptions } from 'core/instance/init'
import { queueActivatedComponent } from 'core/observer/scheduler'
import { createFunctionalComponent } from './create-functional-component'

import {
  warn,
  isDef,
  isUndef,
  isTrue,
  isObject
} from '../util/index'

import {
  resolveAsyncComponent,
  createAsyncPlaceholder,
  extractPropsFromVNodeData
} from './helpers/index'

import {
  callHook,
  activeInstance,
  updateChildComponent,
  activateChildComponent,
  deactivateChildComponent
} from '../instance/lifecycle'

import {
  isRecyclableComponent,
  renderRecyclableComponentTemplate
} from 'weex/runtime/recycle-list/render-component-template'

// inline hooks to be invoked on component VNodes during patch
// patch期间在组件的VNode上执行的内联钩子
// patch时，在创建元素的时候，会调用createComponent(vnode,...)函数（core/vdom/patch.js）
// 如果是一个子组件，则会执行子组件的init钩子，从而使子组件实现挂载
// 彼处会拿到子组件的componentInstance做后续的处理，如插入钩子等
// 并创建子组件的真实DOM，插入到父元素中
const componentVNodeHooks = {
  // 初始化内联钩子
  // 该钩子执行完会执行组件实例的_init方法，进而执行$mount方法，实现组件的初始化和挂载
  init(vnode: VNodeWithData, hydrating: boolean): ?boolean {
    if (
      vnode.componentInstance &&
      !vnode.componentInstance._isDestroyed &&
      vnode.data.keepAlive
    ) { // 在keep-alive的组件patch时如果已经挂载过了，则调用其prepatch钩子
      // kept-alive components, treat as a patch
      const mountedNode: any = vnode // work around flow
      componentVNodeHooks.prepatch(mountedNode, mountedNode)
    } else { // 子组件初始化
      // createComponentInstanceForVnode会调用 new Ctor(options)，进而会调用实例的_init方法
      // _init方法最后如果判断有$options.el会自动挂载，子组件是没有el的，所以会手动挂载
      // 最后创建的Vue实例会存在占位VNode的.componentInstance属性上面，后续从此处取值渲染
      // componentInstance会与父实例、父占位Vnode绑定父子关系
      // 同时会添加_isComponent: true属性，在_init执行选项合并时会根据该选项，选择内部组件的合并策略
      const child = vnode.componentInstance = createComponentInstanceForVnode(
        vnode,
        activeInstance
      )
      // 手动挂载
      child.$mount(hydrating ? vnode.elm : undefined, hydrating)
    }
  },

  // 父组件重新渲染，patch的过程会执行patchVnode函数，pathchVnode在遇到占位vnode的时候会执行此钩子
  // 此钩子的作用就是更新子组件的各种状态
  prepatch(oldVnode: MountedComponentVNode, vnode: MountedComponentVNode) {
    const options = vnode.componentOptions
    const child = vnode.componentInstance = oldVnode.componentInstance
    updateChildComponent(
      child,
      options.propsData, // updated props，由父组件传递给子组件的props数据
      options.listeners, // updated listeners，有父组件传递给子组件的事件监听
      vnode, // new parent vnode // 新的vnode节点
      options.children // new children // 新的vnode节点的子元素
    )
  },

  // vnode被插入的钩子
  insert(vnode: MountedComponentVNode) {
    const { context, componentInstance } = vnode
    // 初次挂载，标记为mounted状态，并执行mounted钩子
    if (!componentInstance._isMounted) {
      componentInstance._isMounted = true
      callHook(componentInstance, 'mounted')
    }
    // 处于keep-alive的组件挂载
    if (vnode.data.keepAlive) {
      if (context._isMounted) { // 更新
        // vue-router#1212
        // During updates, a kept-alive component's child components may
        // change, so directly walking the tree here may call activated hooks
        // on incorrect children. Instead we push them into a queue which will
        // be processed after the whole patch process ended.
        // 更新的时候，存在keep-alive组件的子元素可能会改变，如果直接激活组件，则可能会激活
        // 不正确的子元素，所以先把他们放入到一个队列中，等到整个树patch完成后再执行
        queueActivatedComponent(componentInstance)
      } else { // 初次挂载，激活，执行activated钩子
        activateChildComponent(componentInstance, true /* direct */)
      }
    }
  },

  // 销毁钩子
  destroy(vnode: MountedComponentVNode) {
    const { componentInstance } = vnode
    if (!componentInstance._isDestroyed) {
      if (!vnode.data.keepAlive) { // 不在keep-alive的组件，执行$destroy
        componentInstance.$destroy()
      } else { // 在keep-alive的组件，执行失活
        deactivateChildComponent(componentInstance, true /* direct */)
      }
    }
  }
}

// 所有钩子的key
const hooksToMerge = Object.keys(componentVNodeHooks)


/**
 * 创建元素（组件 | 普通元素）
 * @param {*} Ctor 子组件构造器，可以是一个组件对象，也可以是一个函数（异步组件）
 * @param {*} data 创建组件的data，可能为空
 * @param {*} context 组件实例上下文，一般为render函数所在的vm实例
 * @param {*} children // 子元素
 * @param {*} tag 标签名，可能为空
 * @returns VNode | Array<VNode> | undefined
 * 1. 解析子组件构造器，对于Ctor是构造器对象的，会使用Vue.extend转为构造器。解析后的结果必须为一个函数（有没cid属性的，为异步组件）
 * 2. 对于异步组件，在组件解析完毕之前会返回一个占位的注释VNode节点，节点中保留了节点的各种信息，包括异步的工厂函数
 */
export function createComponent(
  Ctor: Class<Component> | Function | Object | void,
  data: ?VNodeData,
  context: Component,
  children: ?Array<VNode>,
  tag?: string
): VNode | Array<VNode> | void {
  if (isUndef(Ctor)) {
    return
  }

  const baseCtor = context.$options._base // 最顶级的Vue构造函数，在选项合并的时候，从Vue.options._base合并而来

  // plain options object: turn it into a constructor
  if (isObject(Ctor)) { // 如果组件选项是个对象，则使用Vue.extend将其转为构造函数
    Ctor = baseCtor.extend(Ctor)
  }

  // if at this stage it's not a constructor or an async component factory,
  // reject.
  // 经过转化后，最终的Ctor必须为一个函数，否则创建失败
  if (typeof Ctor !== 'function') {
    if (process.env.NODE_ENV !== 'production') {
      warn(`Invalid Component definition: ${String(Ctor)}`, context)
    }
    return
  }

  // async component
  /**
   * 异步组件处理
   * 因为同步组件都经过了Vue.extend做了处理，所以都会有cid静态属性，如果没有，说明
   * Ctor为一个没经过转化后的函数，此时即为异步组件
   * Vue.component("example", function(resolve, reject) => {
   *    setTimout(() => {
   *        resolve({template: "<div>I am async</div>"})
   *    }) 
   * })
   * 异步组件解析后，在解析完成之前，返回值为undefined，此时会渲染一个占位的注释节点
   * 如果已经解析完成了（可能执行时是同步的，或者已经解析过了），则会返回一个构造函数
  */

  let asyncFactory
  if (isUndef(Ctor.cid)) {
    asyncFactory = Ctor
    Ctor = resolveAsyncComponent(asyncFactory, baseCtor) // 解析异步组件
    if (Ctor === undefined) {
      // 组件还没解析完成时，Ctor即为undefined
      // 此时返回一个占位的节点（注释节点），该节点保留了所有的原始信息
      // return a placeholder node for async component, which is rendered
      // as a comment node but preserves all the raw information for the node.
      // the information will be used for async server-rendering and hydration.
      return createAsyncPlaceholder(
        asyncFactory,
        data,
        context,
        children,
        tag
      )
    }
  }

  data = data || {}

  // resolve constructor options in case global mixins are applied after
  // component constructor creation
  // 选项合并，用于合并在构造器被创建以后应用的全局mixins
  resolveConstructorOptions(Ctor)

  // transform component v-model data into props & events
  // 转换v-model的配置，处理成prop+event的形式
  if (isDef(data.model)) {
    transformModel(Ctor.options, data)
  }

  // extract props
  // 提取由父组件传递进来的props
  // 会先从props中获取，没有的话再从attrs中获取
  // 获取后会作为componentOptions中的propsData属性传递给VNode构造函数
  const propsData = extractPropsFromVNodeData(data, Ctor, tag)

  // 函数式组件的创建
  if (isTrue(Ctor.options.functional)) {
    return createFunctionalComponent(Ctor, propsData, data, context, children)
  }

  // extract listeners, since these needs to be treated as
  // child component listeners instead of DOM listeners
  // 提取listeners
  const listeners = data.on
  // replace with listeners with .native modifier
  // so it gets processed during parent component patch.

  data.on = data.nativeOn

  // 抽象组件只保留props、listeners、slot
  if (isTrue(Ctor.options.abstract)) {
    // abstract components do not keep anything
    // other than props & listeners & slot

    // 获取slot
    const slot = data.slot
    // 清空data
    data = {}
    if (slot) { // 将slot保留
      data.slot = slot
    }
  }

  // install component management hooks onto the placeholder node
  // 安装patch时的相关钩子，会将componentVNodeHooks与data.hook做合并处理
  // 这些钩子安装后，在patch阶段，会在对应的时机进行调用
  installComponentHooks(data)

  // return a placeholder vnode
  // 最后将获取和提取到的各种信息作为componentOptions传递给VNode构造函数，返回一个占位vnode
  /**VNode(
   *  tag?: string, // 标签
      data?: VNodeData, // data
      children?: ?Array<VNode>, // 子元素
      text?: string, // 内容
      elm?: Node, // 元素
      context?: Component, // 上下文
      componentOptions?: VNodeComponentOptions, // componentOptions
      asyncFactory?: Function // 异步组件函数
    )
   */
  // 创建的这个vnode是没有children的
  const name = Ctor.options.name || tag
  const vnode = new VNode(
    `vue-component-${Ctor.cid}${name ? `-${name}` : ''}`, // 占位节点的标签名
    // 占位节点不传children，text，elm
    data, undefined, undefined, undefined, context,
    // 但是其componentOptions保存着children以及其他props、events等信息
    { Ctor, propsData, listeners, tag, children },
    // 异步组件才有这个
    asyncFactory
  )

  // Weex specific: invoke recycle-list optimized @render function for
  // extracting cell-slot template.
  // https://github.com/Hanks10100/weex-native-directive/tree/master/component
  /* istanbul ignore if */
  if (__WEEX__ && isRecyclableComponent(vnode)) {
    return renderRecyclableComponentTemplate(vnode)
  }

  // 返回创建的节点
  return vnode
}

// 创建VNode的组件实例
export function createComponentInstanceForVnode(
  vnode: any, // we know it's MountedComponentVNode but flow doesn't
  parent: any, // activeInstance in lifecycle state，activeInstance是一个全局变量，引用着激活的实例
): Component {
  // 子组件内部options，用于实例化时做标记
  // 在Vue实例上调用_init方法时，会做选项合并，在做选项合并时对不同的实例会采用不同的合并策略
  // 彼处的options._isComponent为true时就为子组件，其定义就是在此处
  const options: InternalComponentOptions = {
    _isComponent: true, // 始终为true
    _parentVnode: vnode, // 对vnode的引用，跟vm.$vnode是同一个引用，是占位vnode
    parent
  }
  // check inline-template render functions
  // 内联组件模板的render相关函数是存在inlineTemplate上的，不是在组件自身
  const inlineTemplate = vnode.data.inlineTemplate
  if (isDef(inlineTemplate)) {
    options.render = inlineTemplate.render
    options.staticRenderFns = inlineTemplate.staticRenderFns
  }
  // 使用Ctor实例化，Ctor可能是异步组件，也可能指Vue.extend继承过来的构造器
  return new vnode.componentOptions.Ctor(options)
}

// 组件的钩子合并
function installComponentHooks(data: VNodeData) {
  const hooks = data.hook || (data.hook = {})
  //hooksToMerge = ['init'、'prepatch'、'insert'、'destroy']，所有钩子的key
  for (let i = 0; i < hooksToMerge.length; i++) {
    const key = hooksToMerge[i]
    const existing = hooks[key]
    const toMerge = componentVNodeHooks[key]
    if (existing !== toMerge && !(existing && existing._merged)) {
      hooks[key] = existing ? mergeHook(toMerge, existing) : toMerge
    }
  }
}

// 合并钩子
// 最终会返回一个新的函数，新的函数执行所有的钩子函数
// 合并后返回的函数会有_merged标记
function mergeHook(f1: any, f2: any): Function {
  const merged = (a, b) => {
    // flow complains about extra args which is why we use any
    f1(a, b)
    f2(a, b)
  }
  merged._merged = true
  return merged
}

// transform component v-model info (value and callback) into
// prop and event handler respectively.
// 将v-model的信息转化为prop和event的格式
// 处理后的prop放在data.attrs上，处理后的event放置在data.on上
// 对于event，如果本身已经有该事件的回调，则会合并事件回调
function transformModel(options, data: any) {
  const prop = (options.model && options.model.prop) || 'value'
  const event = (options.model && options.model.event) || 'input'
    ; (data.attrs || (data.attrs = {}))[prop] = data.model.value
  const on = data.on || (data.on = {})
  const existing = on[event]
  const callback = data.model.callback
  if (isDef(existing)) {
    if (
      Array.isArray(existing)
        ? existing.indexOf(callback) === -1
        : existing !== callback
    ) {
      on[event] = [callback].concat(existing)
    }
  } else {
    on[event] = callback
  }
}
