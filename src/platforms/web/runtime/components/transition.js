/* @flow */

// Provides transition support for a single element/component.
// supports transition mode (out-in / in-out)

import { warn } from 'core/util/index'
import { camelize, extend, isPrimitive } from 'shared/util'
import {
  mergeVNodeHook,
  isAsyncPlaceholder,
  getFirstComponentChild
} from 'core/vdom/helpers/index'

export const transitionProps = {
  name: String, // 动画类名前缀，默认是v
  appear: Boolean, // 是否首次渲染
  css: Boolean, // 是否取消CSS动画
  mode: String, // in-out或者out-in二选一
  type: String, // 显式声明监听transition或者animation
  enterClass: String, // 默认${name}-enter
  leaveClass: String, // 默认${name}-leave
  enterToClass: String,// 默认${name}-enter-to
  leaveToClass: String,// 默认${name}-leave-to
  enterActiveClass: String,// 默认${name}-enter-active
  leaveActiveClass: String,// 默认${name}-leave-active
  appearClass: String,// 首次渲染时进入的
  appearActiveClass: String,// 首次渲染时持续
  appearToClass: String,// 首次渲染时离开
  duration: [Number, String, Object] // 动画的时长
}

// in case the child is also an abstract component, e.g. <keep-alive>
// we want to recursively retrieve the real component to be rendered
// transition的子组件有可能也是抽象组件，递归找到非抽象的组件来应用动画
function getRealChild (vnode: ?VNode): ?VNode {
  const compOptions: ?VNodeComponentOptions = vnode && vnode.componentOptions
  if (compOptions && compOptions.Ctor.options.abstract) { // 抽象组件，递归查找
    return getRealChild(getFirstComponentChild(compOptions.children))
  } else {
    return vnode
  }
}

// 提取动画数据
// 提取propsData和_parentListeners
export function extractTransitionData (comp: Component): Object {
  const data = {}
  const options: ComponentOptions = comp.$options
  // props
  for (const key in options.propsData) {
    data[key] = comp[key]
  }
  // events.
  // extract listeners and pass them directly to the transition methods
  const listeners: ?Object = options._parentListeners
  for (const key in listeners) {
    data[camelize(key)] = listeners[key]
  }
  return data
}

function placeholder (h: Function, rawChild: VNode): ?VNode {
  if (/\d-keep-alive$/.test(rawChild.tag)) {
    return h('keep-alive', {
      props: rawChild.componentOptions.propsData
    })
  }
}

// 判断vnode的祖先元素是否有transition动画
// 判断的依据 是data上有transition属性
// vnode是transition的占位节点
// 占位节点有parent属性说明transition组件是当前父组件的根节点
function hasParentTransition (vnode: VNode): ?boolean {
  while ((vnode = vnode.parent)) {
    // 父组件有transition属性说明了父组件外部也包裹着一层transition
    // 直接返回防止重复添加过渡效果
    if (vnode.data.transition) {
      return true
    }
  }
}

// 只有key和tag相同时才判断为同一个子节点
function isSameChild (child: VNode, oldChild: VNode): boolean {
  return oldChild.key === child.key && oldChild.tag === child.tag
}

const isNotTextNode = (c: VNode) => c.tag || isAsyncPlaceholder(c)

const isVShowDirective = d => d.name === 'show' // 检测是否有v-show指令

export default {
  name: 'transition',
  props: transitionProps, // 接受的props
  abstract: true, // 抽象组件

  render (h: Function) {
    let children: any = this.$slots.default // 获取默认的插槽内节点
    if (!children) { // 空节点不做任何处理
      return
    }

    // 过滤空白节点
    // filter out text nodes (possible whitespaces)
    children = children.filter(isNotTextNode)
    /* istanbul ignore if */
    if (!children.length) {
      return
    }

    // warn multiple elements
    // 多子节点
    if (process.env.NODE_ENV !== 'production' && children.length > 1) {
      warn(
        '<transition> can only be used on a single element. Use ' +
        '<transition-group> for lists.',
        this.$parent
      )
    }

    const mode: string = this.mode // 过渡模式

    // warn invalid mode
    if (process.env.NODE_ENV !== 'production' &&
      mode && mode !== 'in-out' && mode !== 'out-in'
    ) {
      warn(
        'invalid <transition> mode: ' + mode,
        this.$parent
      )
    }

    const rawChild: VNode = children[0] // 获取第一个子元素

    // if this is a component root node and the component's
    // parent container node also has transition, skip.
    // transition作为组件的根组件且其祖先元素已经有动画则忽略
    // 处理外层的动画即可
    if (hasParentTransition(this.$vnode)) {
      return rawChild
    }

    // apply transition data to child
    // use getRealChild() to ignore abstract components e.g. keep-alive
    const child: ?VNode = getRealChild(rawChild) // 获取真实的子元素（子元素可能被包裹在抽象组件里）
    /* istanbul ignore if */
    if (!child) { // 获取不到则直接返回子节点
      return rawChild
    }

    // @suspense
    if (this._leaving) {
      return placeholder(h, rawChild)
    }

    // ensure a key that is unique to the vnode type and to this transition
    // component instance. This key will be used to remove pending leaving nodes
    // during entering.
    // 生成一个key
    const id: string = `__transition-${this._uid}-`
    child.key = child.key == null
      ? child.isComment
        ? id + 'comment'
        : id + child.tag
      : isPrimitive(child.key)
        ? (String(child.key).indexOf(id) === 0 ? child.key : id + child.key)
        : child.key

    // 给子元素添加transition属性，值为从transition组件中提取到的propsData和_parentListeners
    // 即是将transition组件绑定的属性和事件给了真实的子节点
    // 包括自定义类名、事件(如before-enter enter leave等)
    const data: Object = (child.data || (child.data = {})).transition = extractTransitionData(this)
    const oldRawChild: VNode = this._vnode // transition组件的根节点
    const oldChild: VNode = getRealChild(oldRawChild) //老的真实子节点

    // mark v-show
    // so that the transition module can hand over the control to the directive
    // 有v-show指令的，transition模块将控制权移交给指令
    // 添加一个show:true属性
    if (child.data.directives && child.data.directives.some(isVShowDirective)) {
      child.data.show = true
    }

    if (
      oldChild &&
      oldChild.data &&
      !isSameChild(child, oldChild) && // 不是同一个子节点
      !isAsyncPlaceholder(oldChild) && // 非异步组件
      // #6687 component root is a comment node
      !(oldChild.componentInstance && oldChild.componentInstance._vnode.isComment) // 非注释节点
    ) {
      // replace old child transition data with fresh one
      // important for dynamic transitions!
      const oldData: Object = oldChild.data.transition = extend({}, data) // 更新旧节点的数据
      // handle transition mode
      // 过渡模式，用于处理多个元素动画之间不协调的问题
      if (mode === 'out-in') { // 先出后进模式，将当前元素标记为_leaving状态
        // return placeholder node and queue update when leave finishes
        this._leaving = true
        // 增加afterLeave钩子
        mergeVNodeHook(oldData, 'afterLeave', () => {
          this._leaving = false // 离开后取消_leaving标记
          this.$forceUpdate()
        })
        return placeholder(h, rawChild)
      } else if (mode === 'in-out') { // 先进后出
        if (isAsyncPlaceholder(child)) {
          return oldRawChild
        }
        let delayedLeave
        const performLeave = () => { delayedLeave() }
        // 新增几个钩子
        mergeVNodeHook(data, 'afterEnter', performLeave)
        mergeVNodeHook(data, 'enterCancelled', performLeave)
        mergeVNodeHook(oldData, 'delayLeave', leave => { delayedLeave = leave })
      }
    }

    return rawChild
  }
}
