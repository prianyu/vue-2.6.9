
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

> [./src/core/global-api/index.js](./src/core/globala-api/index.js)

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
      from: 'fullName',
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
      from: 'fullName',
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
+ 增加`$parent`和`$children`属性，绑定父子关系，如果当前实例不是抽象的，则会将自身push至离自己最近的非抽象祖先组件的`$children`中，并将当前实例的`$parent`指向该父实例
+ 添加`$root`的属性指向根元素，如果本身就是根元素则指向自身
+ 增加`$refs`属性，初始值为空对象
+ 初始化其它与生命周期相关的属性：
  -  `_watcher`：存放渲染Watcher
  - `inactive`：组件是否处于keepAlive
  - `_directInactive`：组件是否被直接设置成失活状态
  - `_isMounted`：是否已挂载
  - `_isDestroyed`：是否已销毁
  - `_isBeingDestroyed`：标记组件是否出于正在销毁的阶段

### （三）initEvents
> 文件位置：[src/core/instance/events.js](./src/core/instance/lifecycle.js)

与事件相关的属性的初始化：
+ 初始化`_events`,`_hasHookEvent`，分别用于存放事件和标记是否有`hook:`事件
+ 获取`vm.$options._parentListeners`，即父组件传递给子组件的事件，对子组件的事件进行更新，本质上是对`vm.$options._parentListeners`的新老事件（初始化时老事件为空）做了合并和封装，会对每一个事件创建一个调用者(`invoker`)，真实的回调则是放在了`invoker.fns`上

> 创建的调用者在下次更新事件时，如果同一个事件已经创建过调用者了，则只更新新事件的引用；旧事件如果再更新时已经不存在了，则会卸载掉旧事件

### （四）initRender
> 文件位置：[src/core/instance/render.js](./src/core/instance/render.js)

初始化与渲染相关的一些属性和方法：
- 初始化`_vnode`：初始值为`null`，用于存放组件树根节点
- 初始化`_staticTrees`：，初始值为`null`，用于存放静态树的根节点，用于缓存，减少dom操作，`v-once`指令标记的节点会使用该静态树
- `$vnode`：与`options._parentVnode`同一个指向，是组件的占位节点
- `$slots`：根据`options._renderChildren`解析非作用域插槽，组件内的子节点会被按照slot名称分类
- `$scopedSlots`：初始化作用插槽为空对象，在执行`vm._render`时会进行具体的处理
+ 增加`$createElement`,`_c`方法，分别在内部组件创建的render函数和用户定义的render函数中使用
+ 定义响应式的`$listeners`,`$attrs`等属性，分别从`$vnode.attrs`和`options._parentListeners`中获取

```html
<layout>
  <h1 v-slot:header="param">{{title}}</h1>
  <p>{{msg}}</p>
  <p slot="footer">{{footer}}</p>
  <p>{{msg}}</p>
</layout>
```
```javascript 
const template = `
<div class="container">
  <header>
    <slot name="header">默认header</slot>
  </header>
  <main>
    <slot>默认main</slot>
  </main>
  <footer>
    <slot name="footer">默认footer</slot>
  </footer>
</div>
`
Vue.component('Layout', {
  template
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

+ 会获取当前`inject`的key，并从祖先元素的`_provided`属性中寻找对应的`provide`
+ 如果找不到，会使用`inject`的`default`值作为provide
+ 最终会使用`defineReactive`以找到的`provide`为值将`inject`属性定义在vm实例上
+ inject是由祖先提供的，所以在子组件不应该直接修改，因为其修改在祖先元素重新渲染后会被覆盖
  
### （六）initState
> 文件位置：[src/core/instance/state.js](./src/core/instance/lifecycle.js)

+ 添加`vm._watchers`属性，用于存放所有的观察者
+ 依次处理`props`、`methods`、`data`、`computed`、`watch`，这里是Vue响应式的核心

**（1）initProps**

处理`$options.props`，转为响应式的数据：
+ 增加`_prop`s用于存储`props`的属性，增加`_propKeys`用于存储所有`props`的key，方便后续遍历使用
+ 遍历`$options.props`，将其key存储到`_propKeys`中，使用`defineReactive`在`_props`上定义对应的key的响应式数据，props是不允许直接修改的
+ 定义`_props[key]`时，会从`propsData`中获取数据并校验，如果合法则会从中取值并赋值。这个过程中还会做默认值的设置以及数据的观测
+ 将`vm[key]`代理至`vm._props[key]`
  
**（2） initMethods**

处理$options.methods：
+ 检测是否存在同名的`prop`以及方法名是否为保留名称（`_`和`$`开头）
+ 将`method`添加到`vm`上并绑定上下文为`vm`

**（3） initData**

处理`$options.data`，转为响应式的data：
+ 获取`data`的值（可能为函数，需要执行函数获取），获取后data为一个普通对象
+ 检测是否存在同名的`prop`和`method`属性
+ 调用`observe`方法，对data进行观测
  - 如果没有`__ob__`属性，会添加`ob = new Observe(data)`，实例化时会在`data`上增加`__ob__`属性引用ob
  - 此过程会递归遍历所有`data`的属性转为响应式的数据
  - 如果作为根数据观测，则会执行`ob.vmCount++`，用于`Vue.del`和`Vue.set`的相关逻辑的条件判断
  - 最后返回`ob`
  
**（4） initComputed**

处理计算属性`$options.computed`：
+ 增加`vm.__computedWatchers`对象属性，用于存放所有**计算属性的watcher**
+ 遍历`$options.computed`创建惰性求值（`{lazy: true}`）的`watcher`并存至`vm.__computedWatchers`
+ 在`vm`上添加对应的`computed`属性
  - 解析得到`setter`和`getter`，定义描述对象，getter会根据是否缓存定义不同，如果无需缓存则将定义的回调的上下文绑定到vm既可；如果有缓存则会根据值是否改变从`watcher`中计算得到值，在这里会进行渲染watcher的依赖收集。
  - 并在使用`Object.defineProperty`在vm上添加对应的`computed`属性
  - 如果没有`setter`，则会设置默认的`setter`，默认`setter`在改变`computed`的值会给出不可直接修改的提醒
+ 检测是否有同名的`data`和`prop`属性

```javascript
const computedWatcherOptions = { lazy: true }
const watchers = vm.__computedWatchers
const useDef = computed[key]
const getter = typeof userDef === 'function' ? userDef : userDef.get
watchers[key] = new Watcher(
  vm,
  getter || noop,
  noop,
  computedWatcherOptions // 计算属性的watcher是懒加载的
)
```

**（5） initWatch**

初始化`$options.watch`：
+ 遍历`watch`，根据配置执行`createWatcher`函数，如果是数组则会遍历执行`createWatcher`，最终按顺序执行`watcher`
+ `createWatcher`会执行`vm.$watch`
+ `$watch`最终会调用`new Watcher(...)`创建用户`watcher`，如果是立即执行的则会立即执行回调
+ 创建后会返回一个取消检测的方法`unwatchFn`，用于取消监测

### （七）initProvide
> 文件位置：[src/core/instance/inject.js](./src/core/instance/lifecycle.js)
处理`$options.provide`：
+ 会根据`provide`为函数获取`provide`值
+ 将获取的值放到`vm._provided`属性上

## 三、组件挂载

### （一）挂载方法

挂载`Vue`组件时，可以手动调用`vm.$mount(el)`，也可以通过`new Vue({el: '#app'})`的方式挂载。传入`el`选项实际上也是调用了`vm.$mount(el)`。在具有compiler的版本中，`$mount`函数会解析模板生成`render`函数，然后在调用`mountComponent`函数进行挂载。没有compiler的版本则直接调用`mountComponent`函数。

**（1）模板编译**

> 文件位置：[src/platform/web/entry-runtime-with-compiler.js](./src/platform/web/entry-runtime-with-compiler.js)

如果没有`render`函数，则会根据以下步骤生成`render`函数：

+ 如果有`template`配置：
  + 如果`template`是DOM节点或者是`#`开头的字符串（认为是DOM的id），则获取该节点的`innerHTML`作为待编译的模板
  + 如果以上条件不成立，则提示错误终止挂载
+ 如果没有`template`但是有`el`，则将`el`的`outerHTML`作为待编译的模板
+ 经过以上处理后`template`可能是遗传html或者空字符串，如果不是空字符串则做如下处理：
  + 调用`compileToFunctions`函数对模板进行编译得到`render`和`staticRenderFns`函数
  + 将得到的两个函数添加到`options`上

模板编译生成`render`和`staticRenderFns`函数后就进入挂载阶段。

`template`选项之所以使用`innerHTML`，`el`选项使用`outerHTML`的原因是：`template`被认为是存放模板的元素，它本身可能不是一个可渲染的元素，如模板的`x-template`语法（`<script type="x-template" id="template"></script>`）。另外，传入的`template`后通常需要手动挂载到指定的`el`上。而`el`本身在挂载时会被作为挂载元素，是一个可渲染的元素。


**（2）`mountComponent`函数**
> 文件位置：[src/core/instance/lifecycle.js](./src/core/instance/lifecycle.js)
调用`mountComponent(vm, el)`函数：
+ 将`el`赋值给`vm.$el`，此时`vm.$el`为原始的DOM节点
+ 如果没有找到`render函数`，则将`render`设置为创建空节点函数，如果传了`template`或者`el`，则给出使用**runtime-only**的编译版本的提示
+ 执行beforeMount钩子`callHook(vm, 'beforeMount')`
+ 定义了`updateComponent`函数用于更新组件，内部执行`vm._update(vm._render(), hydrating)`，即先生成虚拟DOM，再更新成真实的DOM
+ 实例化渲染`Watcher`: `new Watcher(vm, updateComponent, noop, {before () {...}}, true)`
  - watcher的before钩子里会判断组件是否被挂载过，如果挂在过则执行`beforeUpdate`钩子
  - watcher在初始化和数据变化时会执行回调函数
+ 将组件标记为已挂在（`vm._isMounted=true`），并执行`mounted`钩子

### （二） `prototype._render`方法

> 文件位置：[src/core/instance/render.js](./src/core/instance/render.js)

`_render`方法用于将组件实例渲染成一个`VNode`

+ 规范化作用域插槽，根据`vm.$slots`、`vm.$scopedSlots`和`data.scopedSlots`规范化插槽，得到的结果重新复制给`vm.$scopedSlots`。其中，在`initRender`的时候`$slots`已经按名称了做了归类，`$scopedSlots`则为空对象，经过`_render`处理，`$slots`和$`scopedSlots`均包含了所有的插槽（作用插槽和普通插槽）,其中`$scopedSlots`是使用函数的形式的存储，同时具有`$hasNormal`、`$stable`、`$key`，`_normalize`等属性
+ 将`vm.$options._parentNode`赋值给`vm.$vnode`，这样提供了一个让render函数访问占位节点的上下文环境
+ 将`currentRenderingInstance`设置为当前实例并尝试调用`render函数`生成`vnode`，接收的参数为`vm.$createElement`函数，执行失败时会设置为上一次的`vnode`结果
+ 渲染函数执行完将`currentRenderingInstance`设置为`null`
+ 只保留一个根`vnode`节点，如果有多个根节点则将`vnode`重置为空节点
+ 将`_parentNode`保存到`vnode.parent`，绑定父子关系，等价于`vnode.parent = vm.$vnode`
+ 返回最终的`vnode`
  
`_render`方法执行后中添加了`vm.$vnode`、后续`_update`时添加的`vm._vnode`，两者与`vm.$options._parentVnode`有如下关系。

```javascript
vm.$options._parentNode === vm.$vnode // 组件占位符节点
vm.$vnode === vm._vnode.parent
```
其中`vm._vnode`就是render函数的执行结果

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

### （三）`vm._update`方法

> 文件位置：[src/core/instance/lifecycle.js](./src/core/instance/lifecycle.js)

`_update`方法用于将新的虚拟节点`vnode`更新到页面中，通过调用`__patch__`方法对比新旧节点，生成Diff DOM然后更新页面的真实DOM，并将真实DOM存放到`vm.$el`中。不像`vm._render`方法，`_update`在嵌套组件patch的过程中是一个深度遍历的过程，所以设置激活实例的时候需要维护一个实例栈。

+ 获取实例的老的`_vnode`和`$el`
+ 设置激活的实例为当前组件实例
+ 将`vm._vnode`设置为新的`vnode`
+ 调用`vm.__patch__`方法进行新老节点的对比，将patch的结果保存到`vm.$el`。如果组件是初次渲染，会将`vm.$el`作为`__patch__`方法的老节点参数传入，因此会有一次DOM替换的过程。
+ 将激活的实例恢复到上一个激活的实例
+ 删除旧的DOM节点对组件实例的引用，新的DOM节点添加组件实例的引用(即`__vue__`属性，一些插件使用)
+ 如果当前组件是父组件的根元素（即父组件是高阶组件），则同步更新父组件的`$el`属性


### （四）`vm.__patch__`方法与Diff算法

> 文件位置: [src/platform/web/runtime/index.js](./src/platforms/web/runtime/index.js)

`__patch__`方法是**Diff算法**的入口，它通过给定的`oldVnode`和`newVnode`，比较新老两个节点得到需要更新的DOM，以打补丁的方式将DOM更新。期间会调用`patchVnode`函数，该函数是**Diff算法**的核心。

`__patch__`方法是由`createPatchFunction`创建的，`createPatchFunction`是**Vue**在内部定义了一个与平台无关的用于创建指定平台的`patch`函数的工厂函数。该函数接收一个包含指定平台操作模块（`modules`）和节点操作方法（`nodeOps`）的对象，生成一个`patch`函数。其中模块包括了基础模块和平台特定的模块，每一个模块都包含了`vnode`节点的钩子函数，在patch的过程中，在适当的时机被调用。而`nodeOps`则是用来管理节点的方法集合，如在浏览器环境下DOM节点的增删查改操作。

**（1）模块**

在浏览器环境下，基础模块和平台模块的列表如下：

+ 基础模块：
  + ref模块：用来处理vnode的ref属性，在patch过程中，更新`vm.$refs`
  + directive模块：用来处理指令，对指令的名称、修饰符等进行规范化，在patch过程中，对指令进行更新
+ 平台模块：
  + attrs模块：从`vnode.data.attrs`提取属性，对属性进行设置、更新、删除等操作，如果实例的构造函数具有`inheritAttrs: false`属性则不做处理
  + class模块: 处理`class`属性，规范化动态的`class`并与静态的`class`进行合并，如果有`transition-class`则合并，将最终得到的`class`字符串设置到DOM元素上
  + domProps模块：处理原生的DOM属性，如`value`,`innerHTML`等，还处理了相关属性在各种浏览器的兼容问题
  + style模块：处理`style`属性， 在`style`更新时，规范化动态的`style`，并与静态的`style`、父组件（嵌套组件）的`style`合并，根据最新的`style`结果删除旧的样式并设置新的样式
  + transition模块：用于处理元素进入退出过渡效果。根据配置的样式、钩子，在合适的时机添加、删除样式，在合适的时机调用钩子函数

  **（2）`__patch__`方法**

  > 以下`vnode`是新的节点，`oldVnode`是老的节点

  + 如果`vnode`空，则递归执行`oldVnode`上的销毁钩子函数
  + 否则，如果`oldVnode`为空，则标记为初次patch，使用`vnode`创建新元素插入父元素。这种情况是子组件的初次渲染，期间会调用`createComponent`方法，实例化组件并执行子组件的相关钩子
  + 否则，就是新老节点都存在的情况：
    +  如果`oldVnode`不是真实DOM（非根节点挂载）且新老节点不同，则调用`patchVNode`函数对新老节点进行diff操作并更新DOM
    + 否则，如果`oldVnode`是真实DOM，则将`oldVnode`设置为空的`vnode`并设置其`elm`属性为该真实DOM
    + 获取老节点对应的真实的DOM的父节点
    + 使用`vnode`创建一个DOM元素插入到获取到的父DOM的后面（初始挂载时，此时页面会存在两个真实的DOM）
    + 删除老节点对应的真实DOM，执行销毁钩子函数
  + patch完毕后会执行所有的`insert`钩子函数
  + 返回最终创建的真实DOM

  在以上的过程中，内部会有一个`insertedVnodeQueue`贯穿整个流程存储要被插入的所有`vnode`节点，直到patch工作完成，意味着DOM元素被插入了，则遍历所有的`vnode`节点，执行所有`vnode`的`insert`钩子函数。


  **（3）`patchVnode`函数**

`patchVnode`函数是**Diff算法**的核心，它用来比较两个`vnode`节点，并更新DOM元素。

+ 如果新老节点是同一个节点，则不做任何处理，终止比较。`_render`方法在尝试调用`render`函数失败时会返回上一次的`vnode`或者`render`函数返回空节点的时这两种情况都会使新老节点是同一个节点。
+ 将`vnode.elm`设置为`oldVnode.elm`的引用
+ 如果新老节点都是静态节点且`key`相同，并且新节点是克隆或者`v-once`节点，则将新节点的`componentInstance`设置为旧节点的`componentInstance`，复用静态节点树，并终止比较。
+ 执行`prepatch`钩子，分别传入`oldVnode`和`vnode`
+ 执行所有模块以及`vnode`的`update`钩子
+ 如果`vnode`不是文本节点：
  + 如果`vnode`和`oldVnode`都有子元素，则更新子元素：
    + 初始化两个头尾指针分别指向新老子元素列表
    + 遍历新老节点列表，各自的头尾指针分别向中间靠拢，不断的比较新老节点，直到其中一个遍历结束，边Diff边为DOM做补，打补丁的过程会做出几种假设：
    +  新的头节点与老的头节点相同，则对这两个节点递归调用`patchVnode`进行patch，新老节点头尾指针向中间靠拢
    + 新的尾节点与老的尾节点相同，则对这两个节点递归调用`patchVnode`进行patch，新老节点头尾指针向中间靠拢
    + 新的头节点与老的尾节点相同，则将旧尾节点插入到旧头节点的前面，老的尾指针向左移，新的头指针向右移
    +  新的尾节点与老的头节点相同，则将旧头节点插入到旧尾节点的前面，老的头指针右移，新的尾指针左移
    + 若以上假设均不成立，则通过`key`来查找：如果新的头节点设置了`key`，则从老节点列表中找到具有相同的`key`的节点在列表中的索引；否则，遍历老节点剩下的未比较的节点，找到与新头节点相同的节点的索引。 如果找到了这个索引，则获取其对应的`vnode`，与新头节点比较是否为相同节点，如果是则递归调用`patchVnode`，并将老节点对应的节点位置设置为`undefined`，后续循环就会跳过该节点的比较；
    + 除去这些情况，就把新的头节点当作新节点对待了，创建新的节点并插入DOM中，处理完这些新的头指针需要向右移一位
    + 循环结束后，新的节点列表或者旧的节点列表可能还有没有比对的vnode节点，对其作剩下的处理：如果老的节点有剩余，则删除去这些节点；如果新的节点有剩余，则获取应该要插入的位置，将剩下的节点创建后并插入到对用的位置
  + 否则，如果只有`vnode`有子元素，则检测是否有重复的`key`，假如`oldVnode`是文本节点则清空文本。之后创建所有子元素插入到`vnode.elm`中
  + 否则，如果只有`oldVnode`有子元素，则删除所有子元素
  + 否则，如果`oldVnode.text`不为空，则设置`vnode.elm`的`textContent`为空
+ 否则，如果`oldVnode.text`与`vnode.text`不相同，则设置`vnode.elm.textContent`为`vnode.text`
+ 比较完毕，执行`vnode`的`postpatch`钩子，传入`oldVnode`和`vnode`
