/* @flow */

import { ASSET_TYPES } from 'shared/constants'
import { defineComputed, proxy } from '../instance/state'
import { extend, mergeOptions, validateComponentName } from '../util/index'

// 定义Vue.extend方法，用于子类构造器的创建
// 这个方法时Vue的核心静态方法，在子组件实例化时都是用的此方法
export function initExtend (Vue: GlobalAPI) {
  /**
   * Each instance constructor, including Vue, has a unique
   * cid. This enables us to create wrapped "child
   * constructors" for prototypal inheritance and cache them.
   */
  // 每一个构造函数都会有一个唯一的cid，从Vue最顶级的构造函数开始，从0开始递增
  // 每一个构造器都是通过原型继承的方式来实现的
  // 有了这个cid，我们就可以通过这个cid来缓存包装成的子类构造器
  Vue.cid = 0
  let cid = 1

  /**
   * Class inheritance
   * 基于Vue这个基类创建子类构造器
   */
  Vue.extend = function (extendOptions: Object): Function {
    extendOptions = extendOptions || {} // 子类构造器选项
    const Super = this // 当前被继承父类
    const SuperId = Super.cid // 父类的cid
    // 构造器选项中会添加一个_Ctor属性，会缓存基于当前父类继承的子类构造器
    // 如果缓存中已经存在则直接返回构造器
    // 也就是同一个基类，同一个构造器选项只会被执行一次
    // 也就是extendOptions是可以被用于多次创建子类构造器的，因此，在后续的处理中，需要将
    // extendOptions选项直接合并至最终的子类构造器选项，而不是简单的引用这个extendOptions
    const cachedCtors = extendOptions._Ctor || (extendOptions._Ctor = {})
    if (cachedCtors[SuperId]) {
      return cachedCtors[SuperId]
    }

    // 传了name，会被作为组件实例的name
    const name = extendOptions.name || Super.options.name 
    if (process.env.NODE_ENV !== 'production' && name) {
      validateComponentName(name)
    }

    // 定义子类构造器，所有的子类构造器实例化时都会调用_init方法
    const Sub = function VueComponent (options) {
      this._init(options)
    }
    Sub.prototype = Object.create(Super.prototype) // 原型继承，与Vue.prototype是同一个引用
    Sub.prototype.constructor = Sub // 原型继承中构造函数修正
    Sub.cid = cid++ // 标记构造器的唯一id
    // 将父类与当前构造器选项合并作为子类构造器的静态options
    // 这里的options返回的是一个新的options，所以同一个extendOptions支持被多次用于创建子类
    Sub.options = mergeOptions(
      Super.options,
      extendOptions
    )
    Sub['super'] = Super // 缓存基类，在实例化时选项合并阶段会通过此属性来查找父类

    // For props and computed properties, we define the proxy getters on
    // the Vue instances at extension time, on the extended prototype. This
    // avoids Object.defineProperty calls for each instance created.
    // 如果构造器选项中传递了props和computed，则将其访问代理设置到原型上，
    //这样可以避免后续为每一个组件实例的创建都调用Object.defineProperty
    if (Sub.options.props) {
      initProps(Sub)
    }
 
    if (Sub.options.computed) {
      initComputed(Sub)
    }

    // 增加各种静态方法
    // allow further extension/mixin/plugin usage
    // 为子类增加以下三个静态方法，用于多级继承
    Sub.extend = Super.extend
    Sub.mixin = Super.mixin
    Sub.use = Super.use

    // create asset registers, so extended classes
    // can have their private assets too.
    // 增加directive,filter,component静态方法
    ASSET_TYPES.forEach(function (type) {
      Sub[type] = Super[type]
    })
    // enable recursive self-lookup
    // 如果有name属性则增加自查属性
    // 可以通过options.components找到构造器本身
    // 这个是实现递归组件的基本原理，因此递归组件最基本的要求是要组件具备name属性
    if (name) {
      Sub.options.components[name] = Sub
    }

    // keep a reference to the super options at extension time.
    // later at instantiation we can check if Super's options have
    // been updated.
    // 引用基类构造器选项和当前的构造器选项，后续实例化做选项合并时可以获取并检测其是否已经改变
    // 如果已经改变了则需要重新合并选项
    Sub.superOptions = Super.options // 对父类options的引用
    Sub.extendOptions = extendOptions // 定义构造函数时的构造器选项的引用
    // 由于Sub.options后期可能会改变，通过跟sealedOptions比对，确认是否改变，然后重新计算extendOptions
    Sub.sealedOptions = extend({}, Sub.options) // 封装定义子类时的构造器选项，用于后续检测是否改变

    // 缓存构造器
    // cache constructor
    cachedCtors[SuperId] = Sub
    return Sub
  }
}

function initProps (Comp) {
  const props = Comp.options.props
  for (const key in props) {
    // 原型上的属性访问代理至_props
    proxy(Comp.prototype, `_props`, key)
  }
}

// 在原型上定义计算属性
function initComputed (Comp) {
  const computed = Comp.options.computed
  for (const key in computed) {
    defineComputed(Comp.prototype, key, computed[key])
  }
}
