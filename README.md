
# Vue源码逐行解读

打包入口：**src/platform/web/entry-runtime-with-compiler.js**

```shell
src
├── compiler        # 编译相关 
├── core            # 核心代码 
├── platforms       # 不同平台的支持
├── server          # 服务端渲染
├── sfc             # .vue 文件解析
├── shared          # 共享代码
```
## 主流程
### （一）实例化阶段

1. Vue实例化，会执行`vm._init`方法，会添加`_uid`,`_isVue`,`_self`,`_renderProxy`等属性
2. 进行选项合并，合并过程中会按照子组件合和非子组件做不同的合并策略，得到`vm.$options`属性，合并后的选项具有`components`、`directives`、`filters`、`render`、`_base`等属性
3. 执行`initLifecycle(vm)`，初始化一些与组件生命周期相关的属性和方法，如`$parent`,`$children`,`$root`,`$refs`,`_watcher`,`_inactive`,`_isMounted`,`_isDestroyed`,`_isBeingDestroyed`等
4. 执行`initEvent(vm)`，初始化一些与事件相关的属性，添加`_event`,`_hasHookEvent`属性，子组件会根据父组件上绑定的事件（传递了`vm._parentListeners`），事件列表，对`vm._parentListeners`进行包装
5. 执行`initRender(vm)`，初始化一些与渲染相关的属性和方法，如`$vnode`,`_vnode`,`$slots`,`$scopeSlots`,`staticTress`,`$attrs`,`$listeners`,`$createElement`,`_c`
6. 执行`beforeCreate`生命周期，因为此时还没初始化数据，所以获取不到`data`，`props`等数据
7. 执行`initInjections(vm)`，对`inject`进行初始化，其取值来源于祖先元素的`_provided`属性，`inject`属性会被转为getter属性，不可直接修改
8. 执行`initState(vm)`，添加`_watchers`属性，用于存储观察者。并依次执行`initProps`,`initMethods`,`initData`,`initWatch`,`initComputed`方法，分别对`props`、`methods`、`data`、`watch`、`computed`初始化。其中`data`和`props`会被转为响应式的`_data`和`_props`属性，`computed`也会被转为`setter/getter`，并为计算属性创建了相应的`watcher`对象`_computedWatchers`，所创建的`watcher`是惰性求值的，在依赖的属性变化时会将其标记为`dirty`，更新时重新计算。`watch`选项则被转为间接调用`$watch`方法
9. 执行`initProvide(vm)`，初始化`provide`，其处理的结果会存在实例的`_provided`上，这与子组件实例化`inject`时从`_provided`获取数据是相对应的
10. 执行`created`生命周期，到这一步，基本数据已经都初始化完毕了
11. 判断是否传了`el`，是的话则执行`$mount(el)`，进入挂载阶段；否则等待手动挂载，手动挂载后也会进入挂载阶段
 
### （二）挂载阶段

1. 判断是否有**render函数**，如果没有则进入8，否则进入2
2. 添加`vm.$el`属性存储挂载元素，执行`beforeMount`生命周期
3. 定义**渲染Watcher**，传入`updateComponent`作为`watcher`的getter函数，传入**before钩子**，在watcher更新时执行，如果不是首次渲染会执行`beforeUpdate`钩子，实例化watcher后会执行执行`updateComponent`:
  - 执行`vm._render()`生成虚拟DOM（**VNode**）
  - 执行`vm._update()`生成真实DOM
  - 在这个过程中会递归处理子组件，执行组件的初始化、挂载、更新和生命周期
6. 如果是首次挂载，会执行`mounted`的生命周期，子组件的`mounted`钩子在patch阶段就执行完了，所以挂载的顺序是从子组件到父组件的
7. 挂载完毕，等待更新
8. 如果有`template`选项，取模板为template，否则根据是否有el选项取el.outerHTML作为模板
9. 将模板进行解析并生成render函数
10. 进入2

### （三）更新阶段

1. 触发`setter`，通知依赖更新更新
2. 将watchers添加到异步更新队列中，等待执行更新
3. 在`nextTick`中刷新队列，执行更新回调
4. 执行`watcher`的`before`钩子，从而执行`beforeUpdate`钩子
5. 执行`watcher.run()`，对`watcher`重新求值。对于渲染`watcher`，即重新执行`_render`和`_update`方法，从而重新生成虚拟DOM和真实DOM，并执行`patch`方法，对新老节点进行比对，生成差异，并更新DOM
6. 执行`keep-alive`组件包裹的`activated`钩子
7. 执行`updated`钩子
                  
## 一、Vue构造函数的定义
### 1. prototype上的属性和方法

**（1）执行各个初始化方法，在原型上添加各类属性和方法**

> 文件位置：[./src/core/instance/index.js](./src/core/instance/index.js)

+ `initMixin(Vue)` ：往原型新增`_init`方法，用于整个Vue实例的实例化
+ `stateMixin(Vue)`：往原型增加`$data`, `$props`属性，其中`$data`会代理至`vm._data`，`$props`会代理至`vm._props`；新增`$watch`, `$delete`, `$set`方法
+ `eventsMixin(Vue)`：往原型增加`$on`, `$once`, `$off`, `$emit`等与事件相关的方法。使用$on绑定的事件会存储在`_events`中，如果事件名是`hook:`开头，则会将`vm._hasHookEvent`标记为`true`，用于优化。其中`$once`只是对`$on`和`$off`的一个包装函数
+ `lifecycleMixin(Vue)`：往原型增加`_update`, `$forceUpdate`, `$destroy`三个方法，其中`_update`方法会调用`__patch__`方法对新老DOM进行对比，最终生成真实DOM。`$forceUpdate`本质则是调用**渲染Watcher**的`update`方法，进行了一次强行的渲染
+ `renderMixin(Vue)`：往原型添加`$nextTick`, `_render`以及各类与渲染相关的**辅助方法**（如`_s`,`_t`,`_o`等），`_render`方法用于生成虚拟节点(VNode)

**（2） 添加与runtime相关的属性和方法**

>[./src/platforms/web/runtime/index.js](./src/platforms/web/runtime/index.js)

+ 浏览器环境下会往原型添加`__patch__`方法，用于DOM Diff
+ 增加web环境下的`$mount`方法，该方法可运行于服务端和客户端，客户端会对此方法进行重写，主要是增加**compiler**

**（3）重写with compiler下的$mount方法**

> 文件位置：[./src/platforms/web/entry-runtime-with-compiler.js](./src/platforms/web/entry-runtime-with-compiler.js)

+ 缓存原有的`$mount`
+ 增加compiler模块，会根据传入的`template`或者`el`选项生成**render函数**
+ 如果传入了`template`，若template是个节点或者以"#"开头的字符串，则会获取该节点，并以节点的innerHTML作为template，生成**render函数**
+ 如果不传`template`但是传了`el`，则会以el的`outerHTML`作为`template`，并生成**render函数**
+ 编译后的**render函数**和**staticRenderFns**会分别赋值给`options.render`和`options.staticRenderFns`
+ 最终会调用缓存的`$mount`

### 2. 静态属性和方法

**（1） 调用`initGlobalAPI(Vue)`，在Vue构造函数上增加全局的各种静态属性和方法。**

> [./src/core/globala-api/index.js](./src/core/globala-api/index.js)

+ `delete`, `set`, `nextTick`, `observable`等静态方法
+ `util`静态属性（含`warn`, `extend`, `mergeOptions`, `defineReactive`等工具方法）
+ `options`静态属性，含{`directives` ,`options`, `components`, `_base` }，`_base`属性会被`Vue.component`方法引用
+ 在`options.components中`增加内置组件`keep-alive`
+ `initUse(Vue)`：新增`use`方法，用于插件安装
+ `initMixin(Vue)`：新增`mixin`方法，传入的选项与`Vue.options`进行合并
+ `initExtend(Vue)`：新增`extend`方法，用于创建子类
+ `initAssetRegisters(Vue)`：新增`component`,`directive`,`filter`静态方法
+ `version`属性，标记Vue的版本

**`Vue.extend(extendOptions)`**

用于创建**Vue子类**，得到**Sub构造函数**

+ 所有构造函数都会有一个`cid`标识，用于缓存，Vue构造函数为0，后续每继承一次`cid`的值会加1；这个`cid`会被用来作为构造器的缓存标识。同一个`extendOptions`是可以被用于创建不同的子类构造器的，每创建一个就会根据`cid`缓存至`extendOptions._Ctor[cid]`中
+ **Sub的原型**指向**Vue的原型**，构造函数指向Sub自身（原型继承）
+ 将`extendOptions`和父类的`options`合并得到`新的options`赋值给`Sub.options`
+ 添加`super`属性，指向`Super`
+ 如果`Sub.options`上有`props`和`computed`，在Sub的原型上代理`props`和`getters`，避免后续创建每个实例都调用`defineProperty`，提高性能
+ 将父类的静态方法`mixin`、`use`、`extend`赋给`Sub`，用于实现多重继承
+ 将父类的静态属性`directives`、`filters`、`components`赋给`Sub`
+ 如果有`name`属性，则会开启递归自查，将Sub存放进`Sub.components[name]`。这个是实现递归组件的基本原理，因此递归组件需要有name属性
+ 记录父类的`options（Sub.superOptions）`、当前`extendOptions`记录到`Sub.extendOptions`。会将`Sub.options`给“密封起来”赋值给`Sub.sealedOptions`，这是因为后续`Sub.options`在做选项合并时可能会发生改变，用于比对判断是否发生了改变，重新计算`Sub.extendOptions`
+ 缓存`Sub`至`extendOptions._Ctor[cid]`中并返回`Sub`

**`Vue.component`、`Vue.directive`、`Vue.filter`**

1. 三个方法均接收参数`(id, definition)`
2. 如果不传`definition`，那么返回对应的资源，如`Vue.directive("focus")`会返回`Vue.options.directives['focus']`
3. 对于`Vue.component`，如果`definition`没有name属性，则将id作为name属性
4. 对于`Vue.directive`，`definition`最终都会转为`{ bind: definition, update: definition }`的格式
5. 执行结果是往对应的资源存储定义：`Vue.options[type + 's'][id]` = `definition`

**（2）增加平台相关（runtime）的静态方法和属性**

>[./src/platforms/web/runtime/index.js](./src/platforms/web/runtime/index.js)

+ `Vue.config.mustUseProp`：检测原生dom属性的方法，如`selected`等
+ `Vue.config.isReservedTag`：判断是否为保留标签的方法（原生的`html`和`svg`相关的标签）
+ `Vue.config.isReservedAttr`：判断是否为保留属性的方法（`style`，`class`）
+ `Vue.config.getTagNamespace`：获取命名空间的方法（svg和mathML相关标签，分别返回svg和math)
+ `Vue.config.isUnknownElement`：判断是否为无效的html标签，非浏览器下永远返回true
+ 增加`v-model`、`v-show`指令合并至`Vue.options.directives`和`transition`、`transition-group`组件合并至`Vue.options.components`
  
**（3）增加compiler相关的静态方法**

> 文件位置：[./src/platforms/web/entry-runtime-with-compiler.js](./src/platforms/web/entry-runtime-with-compiler.js)

+ 增加`Vue.compile`，用于将`template`转化为**render函数**

## 二、Vue组件实例化

执行`this._init(options)`后
+ 添加`_uid`,`_self`,`_isVue`等属性
+ 选项合并
  - 据当`options._isComponent`属性判断是否为子组件（内部创建）
  - 子组件调用[initInternalComponent(vm, options)](#initinternalcomponent函数)做选项合并，合并后的`option`s会有`_parentNode`、`_parentListeners`、`propsData`等属性
  - 非子组件调用[mergeOptions(resolveConstructorOptions(vm.constructor),options || {},vm)](#mergeoptions函数)做合并
+ `initLifecycle(vm)`：初始化`$parent`和`$children`并绑定父子关系，初始化`$refs`,`$root`,`_watcher`,`_inactive`,`_isMounted`,`_isDestroyed`,`_isBeingDestroyed`,`_directInactive`等属性
+ `initEvents(vm)`：初始化`_events`,`_hasHookEvent`等属性，更新`$options._parentListeners`
+ `initRender(vm)`：初始化`_vnode`,`$vnode`,`$slots`,`$scopedSlots`,`$createElement`,`_c`以及响应式的`$listeners`,`$attrs`等属性
+ `callHook(vm, 'beforeCreate')`：执行beforeCreate钩子
+ `initInjections(vm)`： 在`data`和`props`前处理`inject`，会逐级遍历祖先元素的`_provided`属性获取对应`inject`并注入，`inject`不可被修改
+ `initState(vm)`：依次处理`props`、`methods`、`data`、`computed`、`watch`选项
  - 实例增加`_watchers`对象属性，用于存放所有的观察者
  - 将传入的`props`赋值给`_props`属性，将`props`转为响应式的，并将vm上对应的属性代理至`vm._props`，`props`不可直接修改
  - 将`methods`传入的方法挂在`vm`上，绑定在vm上作为上下文
  - 将传入的`data`赋值给`_data`属性，并将`vm`上对应的属性代理至`vm._data`，调用`observe`函数，将`data`转为可观测对象
  - 初始化`computed`：实例新增计算属性观察者`_computedWatchers`，将`computed`转为可观测且具备缓存能力的响应式对象
  - 初始化`watch`：遍历`watch`选项，规范化参数后调用`vm.$watch`
+ `initProvide(vm) `：在`data`和`props`处理后处理`provide`，`provide`可以为函数可以为对象，默认`provide`是非响应式的（除非传入的`provide`本身是响应式）
+` callHook(vm, 'created')`：执行`created`钩子
+ 如果传入了`el`，则调用`vm.$mount`进行挂载，进入挂载阶段
  - 调用`mountComponent`函数开始挂载

### （一） 选项规范化与选项合并

Vue实例化时会根据传入的`options`参数初始化实例。在`options`的各个选项中，Vue是支持不同的参数格式的，同时，Vue也提供了`mixin`、`use`、`extend`等方法来对组件实例进行扩展。因此，在实例真正初始化之前需要对`options`的选项进行规范化与选择适当合并策略进行合并

由于选项的规范化和合并是一个比较耗时的处理，Vue会根据会`options`是否有`_isComponent`属性选择不同的合并策略来合并选项。

```js
  if (options && options._isComponent) {
    initInternalComponent(vm, options)
  } else { 
    vm.$options = mergeOptions(
      resolveConstructorOptions(vm.constructor),
      options || {},
      vm
    )
  }
```

`_isComponent`是在渲染阶段解析到子组件时由内部实例化组件时添加的一个属性。所创建的实例是由`Vue.extend`创建的子类构造器实例化过来的，在创建子类构造器时已经对选项进行了一次合并，因此后续使用该子类构造器实例化的组件无需再进行选项的遍历和规范化合并处理，仅需要添加组件实例特有的一些实例属性即可。其它的属性（如`directives`、`filters`、生命周期钩子等）从`vm.$options.__proto__`中获取，这样可以提供选项合并的性能。

#### 1. mergeOptions函数
> 文件位置：[src/core/util/options.js](./src/core/util/options.js)

参数: `(parent,child,vm)`

`mergeOptions`函数会对`props`、`inject`、`directives`等选项进行规范化，规范化后对不同的选项选择相应的合并策略进行合并。

**（1）props规范化**

将`props`名称统一转为驼峰命名，并统一转为`{name: {type: null, default?: defaultValue}}`的对象格式

```js
// 1. 情况一
{
  props: ['age', 'name']
}
// 规范化后
{
  props: {
    age: {type: null}
    name: {type: null}
  }
}
// 情况二
{
  props: {
    age: {
      type: [Number, String],
    },
    name: String,
    gender: {
      type: String,
      default: "男"
    }
  }
}
// 规范化后
{
  props: {
    age: {
      type: [Number, String]
    },
    name: {
      type: String
    },
    gender: {
      type: String,
      default: '男'
    }
  }
}
```

**（2）inject规范化**

- 数组类型统一转为`{ key: {from: key} }`
- 对象类型统一转为`{ key: { from :key, ...val} }`格式

```javascript
// 情况一
{
  inject: ['age', 'name']
}
// 规范化后
{
  inject: {
    age: { from: 'age'},
    name: { from: 'name'}
  }
}
// 情况二
{
  inject: {
    age: 'myAge',
    name: {
      from: 'fullname',
      default: '张三',
      //...others
    },
    gender: {
      default: '男'
    }
  }
}
// 规范化后
{
  inject: {
    age: { from: 'myAge' },
    name: {
      from: 'fullname',
      default: '张三',
      // ...others
    },
    gender: {
      from: 'gender',
      default: '男'
    }
  }
}
```

**（3）directives规范化**

对于函数形式的directive转为`{bind: def, update: def}`的格式

```js
{
  directives: {
    'my-directive': function (a, b) {}
  }
}
// 规范化后
{
  directives: {
    'my-directive': {
      bind: function (a, b) {},
      update: function (a, b) {}
    }
  }
}

```
**（4）递归合并extends和mixins选项**

如果`child`上有`mixins`和`extends`选项，会递归调用`mergeOptions(parent, child.extends)`和`mergeOptions(parent, child.mixins)`进行选项合并。

***（5）按照合并策略合并选项**
不同的选项具有不同的合并策略，对于自定义选项可以使用`Vue.config.optionMergeStrategies`来定义，未定义的则使用默认的合并策略（覆盖的方式），对于非自定义选项，合并策略为：

- `data`: 递归合并，将data转成一个合并函数，函数调用时会合并`child.data`和`parent.data`，以`child.data`为主，将`parent.data`中不存在于`child.data`的属性使用`set`函数设置
- ` props`、`methods`、`inject`、`computed`：调用`extend`函数，采用后值覆盖前值的方式合并选项
- `watch`：合并为数组
- `directives`,`components`,`filters`：合并转为原型链的形式， 比如`vm.$options.components.__proto__ = {KeepAlive, Transition, TransitionGroup}`
- `生命周期钩子`：合并成数组并去重

#### 2. initInternalComponent函数
参数: (vm, options)

+ 子类构造器的`options`作为`vm.$options`的原型，所有子组件访问的选项都从原型中获取
+ 从**占位vnode**中提取各种实例属性添加到实例的`$options`中
  ```javascript

  const parentVnode = options._parentVnode // 组件的占位符vnode
  opts.parent = options.parent // 父组件实例
  opts._parentVnode = parentVnode 
  
  const vnodeComponentOptions = parentVnode.componentOptions // 创建子组件的vnode的options
  opts.propsData = vnodeComponentOptions.propsData
  opts._parentListeners = vnodeComponentOptions.listeners
  opts._renderChildren = vnodeComponentOptions.children
  opts._componentTag = vnodeComponentOptions.tag

  if (options.render) { // 渲染函数
    opts.render = options.render
    opts.staticRenderFns = options.staticRenderFns
  }
  ```
+ 合并render方法和staticRenderFn方法

### （二）initLifecycle

> 文件位置：[src/core/instance/lifecycle.js](./src/core/instance/lifecycle.js)

与生命周期相关的属性的初始化：
+ 增加$parent和$children属性，绑定父子关系，如果当前实例不是抽象的，则会将自身push至离自己最近的非抽象祖先组件的children中
+ 添加$root的属性指向根元素，如果本身就是根元素则指向自身
+ 增加$refs属性
+ 增加_watcher（存放渲染Watcher）、_inactive（组件是否处于keepAlive）、_directInactive、_isMounted（是否已挂载）、_isDestroyed（是否已销毁）、_isBeingDestroyed（标记组件是否出于正在销毁的阶段）等属性

### （三）initEvents
> 文件位置：[src/core/instance/events.js](./src/core/instance/lifecycle.js)

与事件相关的属性的初始化：
+ 增加_events,_hasHookEvent，分别用于存放事件和标记是否有`hook:`事件
+ 获取vm.$options._parentListeners，即父组件传递给子组件的事件，对子组件的事件进行更新，本质上是对vm.$options._parentListeners的新老事件（初始化时老事件为空）做了合并和封装，会对每一个事件创建一个调用者(invoker)，真实的回调则是放在了invoker.fns上，最后在vm上调用$on,$once,$off等绑定或者卸载事件。

> 创建的调用者在下次更新事件时，如果同一个事件已经创建过调用者了，则只更新新事件的引用；旧事件如果再更新时已经不存在了，则会卸载掉旧事件

### （四）initRender
> 文件位置：[src/core/instance/render.js](./src/core/instance/lifecycle.js)

初始化与渲染相关的一些属性和方法：
+ 初始化_vnode,$vnode，$vnode = options._parentVnode
+ 处理插槽，增加$slots和$scopedSlots属性，组件内的子节点会被按照slot名称分类，结果赋值给$slots，$scopedSlots为空对象，在执行vm._render时会进行具体的处理
+ 增加$createElement,_c方法，分别用于内部组件创建的render函数和用户render函数
+ 初始化响应式的$listeners,$attrs等属性

```html
    <layout>
      <h1 v-slot:header="param">{{title}}</h1>
      <p>{{msg}}</p>
      <p slot="footer">{{footer}}</p>
      <p>{{msg}}</p>
    </layout>
```
```javascript 
Vue.component('Layout', {
  template: `<div class="container">
                  <header>
                      <slot name="header">默认header</slot>
                  </header>
                  <main>
                      <slot>默认main</slot>
                  </main>
                  <footer>
                      <slot name="footer">默认footer</slot>
                  </footer>
              </div>`
})

const app = new Vue({
  el: "#app",
  data() {
    return {
      title: "这里是标题",
      msg: "这里是内容",
      footer: "这里是footer"      
    }
  }
})
```
layout实例初始化后
```javascript
vm.$slots = {
  default: [VNode, VNode, VNode, VNode, Vnode], // 两个p标签，三个空白节点（换行产生）
  header: [VNode], // h1标签
  footer: [VNode] // p标签
}
```

### （五）initInjections
> 文件位置：[src/core/instance/inject.js](./src/core/instance/lifecycle.js)

初始化实例的inject：
+ 会获取当前inject的key，并从祖先元素中寻找对应的provide
+ 如果找不到，会使用inject的default值作为provide
+ 最终会是defineReactive将找到的provide定义在vm实例上
+ inject是由祖先提供的，所以在子组件不应该直接修改，因为其修改在祖先元素重新渲染后会被覆盖
  
### （六）initState
> 文件位置：[src/core/instance/state.js](./src/core/instance/lifecycle.js)

+ 添加vm._watchers属性，用于存放所有的观察者
+ 依次处理props、methods、data、computed、watch，Vue响应式系统一般指这一部分的内容。

**1. initProps**

处理$options.props，转为响应式的数据：
+ 增加_props用于存储props的属性，增加_propKeys用于存储所有props的key，方便后续遍历使用
+ 遍历$options.props，将其key存储到_propKeys中，在_props上定义对应的key的响应式数据，props是不允许直接修改的
+ 定义_props[key]时，会从propsData中获取数据并校验，如果合法则会从中取值并赋值。这个过程中还会做默认值的设置以及数据的观测
+ 将vm[key]代理至vm._props[key]
  
**2. initMethods**

处理$options.methods：
+ 检测是否存在同名的prop以及方法名是否为保留名称（_和$开头）
+ 将method添加到vm上并绑定上下文为vm

**3. initData**

处理$options.data，转为响应式的data：
+ 获取data的值（可能为函数，需要执行函数获取），获取后data为一个普通对象
+ 检测是否存在同名的prop和method属性
+ 调用observe方法，对data进行观测
  - 如果没有__ob__属性，会添加ob = new Observe(data)，实例化时会在data上增加__ob__属性引用ob
  - 如果作为根数据观测，则会执行ob.vmCount++，用于Vue.del和Vue.set的相关逻辑的条件判断
  - 最后返回ob
  
**4. initComputed**

处理计算属性$options.computed：
+ 增加vm.__computedWatchers对象属性，用于存放所有计算属性的watcher
+ 遍历$options.computed创建惰性求值（{lazy: true}）的watcher并存至vm.__computedWatchers
  ```javascript
  const computedWatcherOptions = { lazy: true }
  const watchers = vm.__computedWatchers
  const useDef = computed[key]
  const getter = typeof userDef === 'function' ? userDef : userDef.get
  watchers[key] = new Watcher(
    vm,
    getter || noop,
    noop,
    computedWatcherOptions // 计算属性的wather是懒加载的
  )
  ```
+ 在vm上添加对应的computed属性
  - 解析得到setter和getter，定义描述对象，getter会根据是否缓存定义不同，如果无需缓存则将定义的回调的上下文绑定到vm既可；如果有缓存则会根据值是否改变从watcher中计算得到值，在这里会进行渲染watcher的依赖收集。
  - 并在使用Object.defineProperty在vm上添加对应的computed属性
  - 如果没有setter，则会设置默认的setter，在改变computed的值会给出不可直接修改的提醒
+ 检测是否有同名的data和prop属性

**5. initWatch**

初始化$options.watch：
+ 遍历watch，根据配置执行createWacher函数，如果是数组则会遍历执行createWacher，最终按顺序执行watcher
+ createWacher会执行vm.$watch
+ $watch最终会调用`new Watcher(...)`创建用户watcher，如果是立即执行的则会立即执行回调
+ 创建后会返回一个取消检测的方法unwatchFn，用于取消监测

### （七）initProvide
> 文件位置：[src/core/instance/inject.js](./src/core/instance/lifecycle.js)
处理$options.provide：
+ 会根据provide为函数获取provide值
+ 将获取的值放到vm._provide属性上

## 三、组件挂载

> 文件位置：[src/core/instance/lifecycle.js](./src/core/instance/lifecycle.js)
调用`mountComponent(vm, el)`函数：
+ 将el赋值给vm.$el，此时vm.$el为原始的DOM节点
+ 如果没有找到render函数，但是传了template或者el，给出使用runtime-only的编译版本的提示，同时会将render赋值为创建空节点函数
+ callHook(vm, 'beforeMount')：执行beforeMount钩子
+ 定义了updateComponent函数用于更新组件
  - 执行vm._update(vm._render(), hydrating)，即先生成虚拟DOM，再更新成真实的DOM
+ 实例化渲染Watcher，new Watcher(vm, updateComponent, noop, {before () {...}}, true /* isRenderWatcher */)
  - watcher的before钩子里会判断组件是否被挂载过，如果挂在过则执行beforeUpdate钩子
  - watcher在初始化和数据变化时会执行回调函数
+ 将组件标记为已挂在（vm._isMounted=true），并执行mounted钩子

### （一）. prototype._render

作用：将组件实例渲染成一个VNode

+ 获取$options上的render函数和_parentVnode
+ 规范化作用域插槽，在initRender的时候$slots已经按名称了做了归类，$scopedSlots则为空对象，经过_render处理，$slots和$scopedSlots均包含了所有的插槽（作用插槽和普通插槽）,其中$scopedSlots是使用函数的形式的存储，同时具有$hasNormal、$stable、$key，_normalize等属性
+ vm.$vnode指向_parentVnode，这样提供了一个让render函数访问占位节点的上下文环境
+ 调用render函数生成虚拟DOM，接收的参数为vm.$createElement函数，将虚拟DOM结果赋值给vnode（渲染失败会返回vm._vnode，即上一次生成的虚拟节点）
+ vnode.parent = _parentNode，绑定父子关系，vnode.parent = vm.$vnode
+ 返回最终的vnode，vm._vnode = vnode
  
_render过程中添加的vm.$vnode、_update过程中添加的vm._vnode、vm.$options._parentVnode有如下关系。

```javascript
vm.$options._parentNode === vm.$vnode
vm.$vnode === vm._vnode.parent
```
其中`vm._vnode`就是render函数的执行结果

例子：

```javascript
Vue.component("custom", {
  template: "<div>text</div>"
})

// 实例化的结果
vm = {
  $vnode: {
    tag: "vue-component-1-custom",
    // ...
  }, 
  $options: {
    _parentVnode: {
      tag: "vue-component-1-custom",
    // ...
    }
  },
  _vnode: {
    tag: "div",
    children: [
      {tag: undefined, text: "text"} 
    ],
    parent: {
      tag: "vue-component-1-custom",
      // ...
    }, 

  }
}
```

### （二）vm._update





