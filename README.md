
打包入口：src/platform/web/entry-runtime-with-compiler.js

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
### （1）实例化阶段
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
 
### （2）挂载阶段

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

### （3）更新阶段

1. 触发`setter`，通知依赖更新更新
2. 将watchers添加到异步更新队列中，等待执行更新
3. 在`nextTick`中刷新队列，执行更新回调
4. 执行`watcher`的`before`钩子，从而执行`beforeUpdate`钩子
5. 执行`watcher.run()`，对`watcher`重新求值。对于渲染`watcher`，即重新执行`_render`和`_update`方法，从而重新生成虚拟DOM和真实DOM，并执行`patch`方法，对新老节点进行比对，生成差异，并更新DOM
6. 执行`keep-alive`组件包裹的`activated`钩子
7. 执行`updated`钩子
                  
## 一、Vue定义
### （1） prototype

**1. 执行各个初始化方法，在原型上添加各类属性和方法**
> 文件位置：[./src/core/instance/index.js](./src/core/instance/index.js)

+ initMixin(Vue) ：往原型新增_init方法，用于整个Vue实例的实例化
+ stateMixin(Vue) ：往原型增加 $data,$props属性，其中$data会代理至vm._data，$props会代理至vm._props；新增$watch,$delete,$set方法，$watch执行后返回一个取消watch的方法
+ eventsMixin(Vue) ：往原型增加$on,$once,$off,$emit等与事件相关的方法。使用$on绑定的事件会存储在_events中，如果事件名是`hook:`开头，则会将`vm._hasHookEvent`标记为true，用于优化。其中$once只是对$on和$off的一个包装函数
+ lifecycleMixin(Vue) ：往原型增加_update,$forceUpdate,$destroy三个方法，其中_update方法会调用—__patch__方法对新老DOM进行对比，最终生成真实DOM。$forceUpdate本质则是调用渲染Watcher的update方法，进行了一次强行的渲染
+ renderMixin(Vue) ：往原型添加$nextTick,_render以及各类与渲染相关的辅助方法（如_s,_t,_o等），_render方法用于生成虚拟节点(VNode)

**2. 添加与rumtime相关的属性和方法**
>[./src/platforms/web/runtime/index.js](./src/platforms/web/runtime/index.js)

+ 浏览器环境下会往原型添加__patch__方法，用于DOM Diff
+ 增加web环境下的$mount方法，该方法可运行于服务端和客户端，客户端会对此方法进行重写，主要是增加compiler

**3. 重写with compiler下的$mount方法**

> 文件位置：[./src/platforms/web/entry-runtime-with-compiler.js](./src/platforms/web/entry-runtime-with-compiler.js)

+ 缓存原有的$mount
+ 增加compiler模块，会根据传入的template或者el生成render函数
+ 如果传入了template，若template是个节点或者以"#"开头的字符串，则会获取该节点，并以节点的innerHTML作为template，生成render函数
+ 如果不传template但是传了el，则会以el的outerHTML作为template，并生成render函数
+ 生成render函数后最终会调用缓存的$mount

### （2）全局和平台相关的静态属性和方法

**1. 调用initGlobalAPI(Vue)，在Vue构造函数上增加全局的各种静态属性和方法。**
> [./src/core/globala-api/index.js](./src/core/globala-api/index.js)

+ delete,set,nextTick,observable等静态方法
+ util静态属性（含warn,extend,mergeOptions,defineReactive等工具方法）
+ options静态属性，含{directives,options,components,_base: Vue}，_base属性会被Vue.component方法引用
+ 在options.components中增加内置组件keep-alive
+ initUse(Vue)：新增use方法，用于插件安装
+ initMixin(Vue)：新增mixin方法
+ initExtend(Vue)：新增extend方法
+ initAssetRegisters(Vue)：新增component,directive,filter方法
+ version属性，标记Vue的版本

**2. 增加平台相关（runtime）的静态方法和属性**
>[./src/platforms/web/runtime/index.js](./src/platforms/web/runtime/index.js)

+ Vue.config.mustUseProp：检测原生dom属性的方法，如selected等
+ Vue.config.isReservedTag：判断是否为保留标签的方法（原生的html和svg相关的标签）
+ Vue.config.isReservedAttr：判断是否为保留属性的方法（style，class）
+ Vue.config.getTagNamespace：获取命名空间的方法（svg和mathML相关标签，分别返回svg和math)
+ Vue.config.isUnknownElement：判断是否为无效的html标签，非浏览器下永远返回true
+ 增加v-model、v-show指令和transition、transition-group组件
  
**3.增加compiler相关的静态方法**

> 文件位置：[./src/platforms/web/entry-runtime-with-compiler.js](./src/platforms/web/entry-runtime-with-compiler.js)
+ 增加Vue.compile，用于将template转化为render函数

1. 重写

#### Vue.use(plugin)

+ 内部会维护一个已安装的列表installedPlugins，避免重复安装
+ 安装函数会优先取plugin.install，否则如果plugin为函数则直接取plugin
+ 会将Vue作为一个参数传递给安装函数，这有利于维持Vue版本一致，也有利于避免多次引入Vue

#### Vue.mixin(mixin)

将mixin选项与Vue.options进行合并，支持链式调用

#### Vue.extend(extendOptions)

用于创建Vue子类，得到Sub构造函数

+ 所有构造函数都会有一个cid标识，用于缓存，Vue构造函数为0，后续每继承一次cid的值会加1；这个cid会被用来作为构造器的缓存标识。同一个extendOptions是可以被用于创建不同的子类构造器的，每创建一个就会根据cid缓存至extendOptions._Ctor[cid]中
+ Sub的原型指向Vue的原型，构造函数指向Sub自身（原型继承）
+ 将extendOptions和父类的options合并得到新的options赋值给Sub.options
+ 添加super属性，指向Super
+ 如果Sub.options上有props和computed，在Sub的原型上代理props和getters，避免后续创建每个实例都调用defineProperty
+ 将父类的静态方法mixin、use、extend赋给Sub，用于实现多重继承
+ 将父类的静态属性directives、filters、components赋给Sub
+ 如果有name属性，则会开启递归自查，将Sub存放进Sub.components[name]。这个是实现递归组件的基本原理，因此递归组件需要有name属性
+ 记录父类的options（Sub.superOptions）、当前extendOptions记录到Sub.extendOptions。会将Sub.options给“密封起来”赋值给Sub.sealedOptions，这是因为后续Sub.options在做选项合并时可能会发生改变，用于比对判断是否发生了改变，重新计算Sub.extendOptions
+ 缓存Sub至extendOptions._Ctor[cid]中并返回Sub

#### Vue.component、Vue.direvtive、Vue.filter

1. 三个方法均接收参数(id, definition)
2. 如果不传definition，那么返回对应的资源，如Vue.directive("focus")会返回Vue.options.directives['focus']
3. 对于Vue.component，如果definition没有name属性，则将id作为name属性
4. 对于Vue.directive，definition最终都会转为{ bind: definition, update: definition }的格式
5. 执行结果是往对应的资源存储定义：Vue.options[type + 's'][id] = definition

### 3. 构建相关

+ 往Vue.config添加属性和方法：
  - Vue.config.mustUseProp = mustUseProp // 用于判断是否为原生dom属性，如selected、checked等
  - Vue.config.isReservedTag = isReservedTag // 判断是否为保留标签的方法（原生html和svg标签）
  - Vue.config.isReservedAttr = isReservedAttr // 判断是否为保留属性的方法（style，class）
  - Vue.config.getTagNamespace = getTagNamespace // 获取命名空间的方法（svg和mathML，分别返回svg和math)
  - Vue.config.isUnknownElement = isUnknownElement // 判断是否为无效的html标签，非浏览器下永远返回true

+ 往Vue.options添加属性方法：

  - 将v-model和v-show指令合并至Vue.options.directives
  - 将transition和transition-group组件合并至Vue.options.components

+ Vue.prototype新增__path__方法
+ Vue.prototype新增与平台无关的$mount方法

### 4. runtime-with-compiler构建相关

+ 重写Vue.prototye.$mount方法
  - 缓存原来的与平台无关的$mount方法
  - 不能挂在在body和html的处理
  - 如果没有传render函数，会将template编译成render函数
  - template可以由外部传入，也可以由外部传入的el对应的DOM节点的outerHTML
  - 外部传入的tempalte是DOM节点或者id，则为对应DOM的innerHTML，否则直接使用模板
  - 编译后的render函数和staticRenderFns会分别赋值给options.render和options.staticRenderFns
  - 最后会调用被缓存的与平台无关的$mount方法
+ 增加Vue.compile静态方法，方法为compileToFunctions的引用

## 二、Vue实例化

执行`this._init(options)`后
+ 打上_uid,_self,_isVue等属性
+ 选项合并
  - 据当options._isComonent属性判断是否为子组件（内部创建）
  - 子组件调用[initInternalComponent(vm, options)](#initinternalcomponent函数)做选项合并，合并后的options会有_parentNode、_parentListeners、propDatas等属性
  - 非子组件调用[mergeOptions(resolveConstructorOptions(vm.constructor),options || {},vm)](#mergeoptions函数)做合并
+ initLifecycle(vm)：初始化$parent和$children并绑定父子关系，初始化$refs,$root,_watcher,_inactive,_isMounted,_isDestroyed,_isBeingDestroyed,_directInactive等属性
+ initEvents(vm)：初始化_events,_hasHookEvent等属性，更新$options._parentListeners
+ initRender(vm)：初始化_vnode,$vnode,$slots,$scopedSlots,$createElement,_c以及响应式的$listeners,$attrs等属性
+ callHook(vm, 'beforeCreate')：执行beforeCreate钩子
+ initInjections(vm) // 在data和props前处理inject，会逐级遍历父元素获取对应inject并注入，inject是响应式的，但是不可被修改
+ initState(vm)：依次处理props、methods、data、computed、watch
  - 实例增加_watchers对象属性
  - 将传入的props赋值给_props属性，将props转为响应式的，并将vm上对应的属性代理至vm._props，props不可直接修改
  - 将methods传入的方法挂在vm上，并将this绑定在vm上
  - 将传入的data赋值给_data属性，并将vm上对应的属性代理至vm._data，调用observe函数，将data转为可观测对象
  - 初始化computed：实例新增计算属性观察者_computedWatchers，将computed转为可观测且具备缓存能力的响应式对象
  - 初始化watch：遍历watcher，规范化参数后调用vm.$watch
+ initProvide(vm) ：在data和props处理后处理provide，provide可以为函数可以为对象，默认provide是非响应式的（除非传入的provide本身是响应式）
+ callHook(vm, 'created')：执行created钩子
+ 如果传入了el，则调用$mount进行挂载，进入挂载阶段
  - 调用mountComponent函数

### （1） 选项合并与规范化

> 文件位置：[src/core/util/options.js](./src/core/util/options.js)

会根据实例上是否有options._isComponent属性选择不同的合并策略来进行合并。当_isComponent为true时代表的是子组件，会选择`initInternalComponent`进行选项合并，否则使用`mergeOptions`来合并。
> _isComponent是在渲染阶段解析到子组件时内部实例化组件添加的一个属性。由于选项合并是比较耗时的，所以对于内部的创建的组件，做了特别的合并处理，这样可以提高选项合并的性能
**1. mergeOptions函数**
参数: (parent,child,vm)

选项合并的工具函数，专门用于合并Vue实例选项，如props、inject、directives等。

+ props规范化
  - 名称统一转为驼峰命名
  - 数组类型的props统一转为：{[name]: {type: null}}
  ```javascript
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
+ inject规范化
  - 数组类型统一转为{[key]: {from: key}}
  - 对象类型统一转为{[key]: { from :key , ...val}}格式
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
+ directives规范化的格式
   - 对于函数形式（标记为def）的directive转为{bind: def, update: def}的格式
+ 合并child的extends和mixins到parent
+ 按照选项合并策略合并其他选项
  - data: 递归合并，以覆盖的方式进行合并，会采用set方法来设置新的值
  - props、methods、inject、computed：覆盖的方式，采用extend方法来扩展
  - provide：同data
  - watch：合并为数组
  - directives,components,filters：构造函数、实例、父选项进行三方合并
  - 生命周期钩子：合并成数组并去重

**2. initInternalComponent函数**
参数: (vm, options)

+ 将vm.$options的原型指向options
+ $options.parent和$options._parentVnode指向原型对应的属性，提高查找的速度
+ 同步其他属性
  ```javascript
  const vnodeComponentOptions = parentVnode.componentOptions
  opts.propsData = vnodeComponentOptions.propsData
  opts._parentListeners = vnodeComponentOptions.listeners
  opts._renderChildren = vnodeComponentOptions.children
  opts._componentTag = vnodeComponentOptions.tag
  ```
+ 合并render方法和staticRenderFn方法

### （2）initLifecycle

> 文件位置：[src/core/instance/lifecycle.js](./src/core/instance/lifecycle.js)

与生命周期相关的属性的初始化：
+ 增加$parent和$children属性，绑定父子关系，如果当前实例不是抽象的，则会将自身push至离自己最近的非抽象祖先组件的children中
+ 添加$root的属性指向根元素，如果本身就是根元素则指向自身
+ 增加$refs属性
+ 增加_watcher（存放渲染Watcher）、_inactive（组件是否处于keepAlive）、_directInactive、_isMounted（是否已挂载）、_isDestroyed（是否已销毁）、_isBeingDestroyed（标记组件是否出于正在销毁的阶段）等属性

### （3）initEvents
> 文件位置：[src/core/instance/events.js](./src/core/instance/lifecycle.js)

与事件相关的属性的初始化：
+ 增加_events,_hasHookEvent，分别用于存放事件和标记是否有`hook:`事件
+ 获取vm.$options._parentListeners，即父组件传递给子组件的事件，对子组件的事件进行更新，本质上是对vm.$options._parentListeners的新老事件（初始化时老事件为空）做了合并和封装，会对每一个事件创建一个调用者(invoker)，真实的回调则是放在了invoker.fns上，最后在vm上调用$on,$once,$off等绑定或者卸载事件。

> 创建的调用者在下次更新事件时，如果同一个事件已经创建过调用者了，则只更新新事件的引用；旧事件如果再更新时已经不存在了，则会卸载掉旧事件

### （4）initRender
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

### （4）initInjections
> 文件位置：[src/core/instance/inject.js](./src/core/instance/lifecycle.js)

初始化实例的inject：
+ 会获取当前inject的key，并从祖先元素中寻找对应的provide
+ 如果找不到，会使用inject的default值作为provide
+ 最终会是defineReactive将找到的provide定义在vm实例上
+ inject是由祖先提供的，所以在子组件不应该直接修改，因为其修改在祖先元素重新渲染后会被覆盖
  
### （6）initState
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

### （7）initProvide
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

### 1. prototype._render

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





