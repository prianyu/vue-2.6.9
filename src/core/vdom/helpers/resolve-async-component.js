/* @flow */

import {
  warn,
  once,
  isDef,
  isUndef,
  isTrue,
  isObject,
  hasSymbol,
  isPromise,
  remove
} from 'core/util/index'

import { createEmptyVNode } from 'core/vdom/vnode'
import { currentRenderingInstance } from 'core/instance/render'

// 确保组件创建
// 如果传入的组件是个对象，则会使用Vue.extend创建构造器，否则会当作构造器处理
function ensureCtor (comp: any, base) {
  if (
    comp.__esModule ||
    (hasSymbol && comp[Symbol.toStringTag] === 'Module')
  ) {
    comp = comp.default
  }
  return isObject(comp)
    ? base.extend(comp)
    : comp
}

// 创建异步组件的占位节点，保留了原始的所有信息
export function createAsyncPlaceholder (
  factory: Function, 
  data: ?VNodeData,
  context: Component,
  children: ?Array<VNode>,
  tag: ?string
): VNode {
  const node = createEmptyVNode() // 创建一个注释节点
  node.asyncFactory = factory // 异步组件的函数
  node.asyncMeta = { data, context, children, tag } // 原始信息
  return node
}

/**
 * 处理异步组件
 * @param {Function} 异步函数 
 * @param {Component} Vue构造器
 * @returns {undefined | Component}
 * 1. 已经解析了且解析成功了则直接返回解析成功的组件；解析失败了，如果有传入失败的组件，则直接返回失败组件，否则会重新解析
 * 2. 还未解析成功或者解析失败且未传入失败组件：
 * 如果是第一次解析组件则执行以下操作：
 * （1）添加factory.owners属性，用于存放使用到该异步组件的正在渲染的实例
 * （2）将当前的渲染实例（owner）压入owners中
 * （3）初始化一个sync=true标记，用于标记执行的factory是不是一个同步函数
 * （4）当前实例增加一个destroyed钩子监听器，执行后会从owners移owner
 * （5）定义一个强制更新函数forceRender，用于在异步组件解析完毕后，强制更新所有的owners实例
 * （6）定义解析成功回调resolve，将解析成功的结果存储起来，如果此时sync是true，说明factory是同步执行，Vue会自动更新，直接清空owners就可以了；否则执行forceRender，强制更新所有的实例，并清空owners
 * （7）定义解析失败的回调reject，如果有提供了失败组件，则会清空owners增加一个factory.error=true标记，后续解析会直接将解析失败的组件返回
 * （8）执行factory函数，得到执行结果res，如果执行不为空则做如下处理：
 *    （8-1）如果res是Promise，则将resolve和reject作为回调传入给res.then
 *    （8-2）如果res.component是个Promise，resolve和reject作为回调传入给res.component.then，此时的res为一个对象，是可以传入其他配置的。
 *           如果传入了error组件，则将其绑定在factory.errorComp上，在错误回调里可以获取到；
 *           如果传入了loading组件，则将其绑定在factory.loadingComp上，下次解析时可以直接返回loading状态的组件，假如没有传delay配置，则同步设置loading状态，否则会开启一个定时器，在指定时间内，如果未解析完毕，则会展示loading，执行forceRender强制更新实例；
 *           如果传递了timeout，在此时间段内如果未解析完毕，则当作解析出错来处理
 *    （9）最终会根据是否传入loading选择返回loading还是factory.resolved，此结果是可能为undefined的，代表为解析完成，接收的地方会返回一个占位符
 * （9）将sync标记为false，如果factory是同步的，执行factory进入到resolve回调，判断为false，所以factory是异步的
 * 如果不是第一次解析组件，则执行以下操作：
 * （1）factory上会添加owners属性，用于存放使用到该异步组件的正在渲染的实例
 * （2）将当前的渲染实例压入owners中
 * （3）如果组件正在解析的过程中且传入loading组件，则会返回loading组件
 *
 */
export function resolveAsyncComponent (
  factory: Function, 
  baseCtor: Class<Component> 
): Class<Component> | void {

  // 已经解析失败了且传了失败组件，则返回解析失败渲染的组件
  if (isTrue(factory.error) && isDef(factory.errorComp)) {
    return factory.errorComp
  }

  // 已经解析成功了，则直接返回缓存的resolved组件
  if (isDef(factory.resolved)) {
    return factory.resolved
  }

  const owner = currentRenderingInstance // 当前正在渲染的实例

  // 走到这里，说明组件还没被解析成功（可能解析失败了但没传解析失败的组件）
  // 所有渲染的实例都会被放到factory.owners中
  if (owner && isDef(factory.owners) && factory.owners.indexOf(owner) === -1) {
    // already pending
    factory.owners.push(owner)
  }

  // 如果组件正在解析中，且传了loading组件，则返回loading组件
  if (isTrue(factory.loading) && isDef(factory.loadingComp)) {
    return factory.loadingComp
  }

  // 第一次解析该组件或者owners已被清空后才会执行以下处理
  if (owner && !isDef(factory.owners)) {

    //为factory创建owners属性，用于存储所有的渲染实例
    const owners = factory.owners = [owner]
    let sync = true // 标记为同步解析

    // 渲染实例销毁时，从owners中移除实例
    ;(owner: any).$on('hook:destroyed', () => remove(owners, owner))


    // 定义拥有该异步组件的实例强制更新的函数
    const forceRender = (renderCompleted: boolean) => {
      for (let i = 0, l = owners.length; i < l; i++) {
        (owners[i]: any).$forceUpdate()
      }

      // 如果组件已经解析完毕了，强制更新后会清空owners
      // loading阶段也会调用该函数，彼时组件还没解析完毕，所以不能清空
      if (renderCompleted) {
        owners.length = 0
      }
    }

    // resolve回调
    const resolve = once((res: Object | Class<Component>) => {
      // 获得异步组件，并缓存在resolved中
      factory.resolved = ensureCtor(res, baseCtor)
      // invoke callbacks only if this is not a synchronous resolve
      // (async resolves are shimmed as synchronous during SSR)
      if (!sync) { // 非同步解析的时，执行强制更新实例的回调
        forceRender(true)
      } else { // 同步更新时直接清空owners
        owners.length = 0
      }
    })

    // reject回调
    const reject = once(reason => {
      process.env.NODE_ENV !== 'production' && warn(
        `Failed to resolve async component: ${String(factory)}` +
        (reason ? `\nReason: ${reason}` : '')
      )
      if (isDef(factory.errorComp)) { // 解析失败且有失败渲染的组件则渲染该失败组件
        factory.error = true // 标记为解析失败
        forceRender(true) // 强制更新并清空owners
      }
    })

    // 执行函数
    const res = factory(resolve, reject)

    /**
     * 函数可以返回一个如下格式的对象 
     * {
     *    component: import("./MyComponent.vue"), // 需要加载的组件 (应该是一个 `Promise` 对象)
     *    loading: LoadingComponent, // 异步组件加载时使用的组件
     *    error: ErrorComponent, // 加载失败时使用的组件
     *    delay: 200, // 展示加载时组件的延时时间。默认值是 200 (毫秒)
     *    timeout: 3000 // 如果提供了超时时间且组件加载也超时了，则使用加载失败时使用的组件。默认值是：`Infinity`
     * }
     */
  
    if (isObject(res)) {
      if (isPromise(res)) { // 结果是promise且factory还未resolved
        // () => Promise
        if (isUndef(factory.resolved)) {
          res.then(resolve, reject)
        }
      } else if (isPromise(res.component)) { // component为一个promise
        res.component.then(resolve, reject)

        if (isDef(res.error)) { // 传递了error，将其绑定在errorComp属性上
          factory.errorComp = ensureCtor(res.error, baseCtor)
        }

        if (isDef(res.loading)) { // 传递了loading，将其绑定在loadingComp上
          factory.loadingComp = ensureCtor(res.loading, baseCtor)
          if (res.delay === 0) { // 加载组件不延时，直接标记为正在loading
            factory.loading = true
          } else { // 传递了delay
            setTimeout(() => {
               // delay时间到了factory还未解决，此时标记为正在加载
              if (isUndef(factory.resolved) && isUndef(factory.error)) {
                factory.loading = true // 标记为loading
                forceRender(false) // 强制更新组件
              }
            }, res.delay || 200)
          }
        }

        // 组件加载超时
        if (isDef(res.timeout)) {
          setTimeout(() => {
            if (isUndef(factory.resolved)) { // timeout时间内，没有resolved，说明加载超时了
              reject(
                process.env.NODE_ENV !== 'production'
                  ? `timeout (${res.timeout}ms)`
                  : null
              )
            }
          }, res.timeout)
        }
      }
    }

    sync = false
    // return in case resolved synchronously
    return factory.loading
      ? factory.loadingComp
      : factory.resolved
  }
}
