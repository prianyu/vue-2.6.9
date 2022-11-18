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
// patch时，在创建元素的时候，会调用createComponent(vnode,...)函数
// 如果是一个子组件，则会执行子组件的init钩子，从而时子组件实现挂载
// 彼处会拿到子组件的componentInstance做后续的处理，如插入钩子等
// 并创建子组件的真实DOM，插入到父元素中
const componentVNodeHooks = {
  init (vnode: VNodeWithData, hydrating: boolean): ?boolean {
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
  prepatch (oldVnode: MountedComponentVNode, vnode: MountedComponentVNode) {
    const options = vnode.componentOptions
    const child = vnode.componentInstance = oldVnode.componentInstance
    updateChildComponent(
      child,
      options.propsData, // updated props，由父组件传递给子组件的props数据
      options.listeners, // updated listeners
      vnode, // new parent vnode
      options.children // new children
    )
  },

  insert (vnode: MountedComponentVNode) {
    const { context, componentInstance } = vnode
    if (!componentInstance._isMounted) {
      componentInstance._isMounted = true
      callHook(componentInstance, 'mounted')
    }
    if (vnode.data.keepAlive) {
      if (context._isMounted) {
        // vue-router#1212
        // During updates, a kept-alive component's child components may
        // change, so directly walking the tree here may call activated hooks
        // on incorrect children. Instead we push them into a queue which will
        // be processed after the whole patch process ended.
        queueActivatedComponent(componentInstance)
      } else {
        activateChildComponent(componentInstance, true /* direct */)
      }
    }
  },

  destroy (vnode: MountedComponentVNode) {
    const { componentInstance } = vnode
    if (!componentInstance._isDestroyed) {
      if (!vnode.data.keepAlive) {
        componentInstance.$destroy()
      } else {
        deactivateChildComponent(componentInstance, true /* direct */)
      }
    }
  }
}

const hooksToMerge = Object.keys(componentVNodeHooks)

export function createComponent (
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
  // 格式化v-model的配置
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
    `vue-component-${Ctor.cid}${name ? `-${name}` : ''}`,
    data, undefined, undefined, undefined, context,
    { Ctor, propsData, listeners, tag, children },
    asyncFactory
  )

  // Weex specific: invoke recycle-list optimized @render function for
  // extracting cell-slot template.
  // https://github.com/Hanks10100/weex-native-directive/tree/master/component
  /* istanbul ignore if */
  if (__WEEX__ && isRecyclableComponent(vnode)) {
    return renderRecyclableComponentTemplate(vnode)
  }

  return vnode
}

// 创建VNode的组件实例
export function createComponentInstanceForVnode (
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
  // @suspense
  const inlineTemplate = vnode.data.inlineTemplate
  if (isDef(inlineTemplate)) {
    options.render = inlineTemplate.render
    options.staticRenderFns = inlineTemplate.staticRenderFns
  }
  // 使用Ctor实例化，Ctor可能是异步组件，也可能指Vue.extend继承过来的构造器
  return new vnode.componentOptions.Ctor(options)
}

// 组件的钩子合并
function installComponentHooks (data: VNodeData) {
  const hooks = data.hook || (data.hook = {})
  //hooksToMerge = ['init'、'prepatch'、'insert'、'destroy']
  for (let i = 0; i < hooksToMerge.length; i++) {
    const key = hooksToMerge[i]
    const existing = hooks[key]
    const toMerge = componentVNodeHooks[key]
    if (existing !== toMerge && !(existing && existing._merged)) {
      hooks[key] = existing ? mergeHook(toMerge, existing) : toMerge
    }
  }
}

function mergeHook (f1: any, f2: any): Function {
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
function transformModel (options, data: any) {
  const prop = (options.model && options.model.prop) || 'value'
  const event = (options.model && options.model.event) || 'input'
  ;(data.attrs || (data.attrs = {}))[prop] = data.model.value
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
