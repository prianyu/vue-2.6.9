
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
1. Vue实例化，会执行vm.init，会添加_uid,_isVue,_self,_renderProxy等属性，并执行以下流程
2. 选项合并，合并过程中会按照子组件合和非子组件做不同的合并策略
3. 执行initLifecycle(vm)，初始化一些与组件生命周期相关的属性和方法，如$parent,$children,$root,$_watcher,_inactive,_isMounted,_isDestroyed等
4. 执行initEvent(vm)，初始化一些与事件相关的属性，子组件会根据父组件绑定的属性进行初始化，如_event,_hasHookEvent，如果此时是子组件，且父组件上传递了事件（vm._parentListeners），则会更新子组件的绑定事件列表，对`vm._parentListeners进行包装
5. 执行initRender(vm)，初始化一些与渲染相关的属性和方法，如$vnode,_vnode,$slots,$scopeSlots,$attrs,$listeners,$createElement,_c
6. 执行beforeCreate生命周期，因为此时还没初始化数据，所以获取不到data，props等数据
7. 执行initInjections(vm)，对inject进行初始化，其取值来源于祖先元素的_provided属性，添加的inject不能在子组件直接修改
8. 执行initState(vm)，会分别执行initProps,initData,initMethods,initWatch,initComputed方法，分别对props、data、methods、watch、computed初始化，同时会添加_watchers属性，用于存储观察者。Vue响应式的核心原理就是在这一个阶段进行的
9. 执行initProvide(vm)，初始化provide，其处理的结果会存在实例的_provided上，这于子组件实例化inject时从_provided获取数据是相对应的
10. 执行created生命周期，到这一步，基本数据已经都初始化完毕了
11. 判断是否传了el，是的话则执行$mount(el)，进入挂载阶段；否则等待手动挂载，手动挂载后也会进入挂载阶段
 
### （2）挂载阶段

1. 判断是否有render函数，如果没有则进入8，否则进入2
2. 执行beforeMount生命周期
3. 定义渲染Watcher，渲染Watcher里会有before钩子，如果不是首次渲染会执行beforeUpdate钩子
4. 执行vm._render()生成虚拟DOM（VNode）
5. 执行vm._update()生成真实DOM
6. 如果是首次挂载，会执行mounted的生命周期
7. 挂载完毕，等待更新
8. 如果有template，取模板为template，否则根据是否有el取el.outerHTML作为模板
9. 将模板进行解析并生成render函数
10. 进入2

### （3）更新阶段
                  
## 一、Vue定义
### 1. prototype

+ initMixin(Vue) ：往原型新增_init方法，用于整个Vue实例的实例化
+ stateMixin(Vue) ：往原型增加 $data,$props属性，其中$data会代理至vm._data，$props会代理至vm._props；新增$watch,$delete,$set方法，$watch执行后返回一个取消watch的方法
+ eventsMixin(Vue) ：往原型增加$on,$once,$off,$emit等与事件相关的方法。使用$on绑定的事件会存储在_events中，如果事件名是`hook:`开头，则会将`vm._hasHookEvent`标记为true，用于优化。其中$once只是对$on和$off的一个包装函数
+ lifecycleMixin(Vue) ：往原型增加_update,$forceUpdate,$destroy三个方法，其中_update方法会调用—__patch__方法对新老DOM进行对比，最终生成真实。$forceUpdate本质则是调用渲染Watcher的update方法，进行了一次强行的渲染
+ renderMixin(Vue) ：往原型添加$nextTick,_render以及各类与渲染相关的辅助方法（如_s,_t,_o等），_render方法用于生成虚拟节点(VNode)

### 2. 各种静态属性和方法

调用initGlobalAPI(Vue)：

+ delete,set,nextTick,observable等静态方法
+ util静态属性（含warn,extend,mergeOptions,defineReactive等工具方法）
+ options静态属性，{directives,options,components,_base: Vue}，其中components含内置组件keep-alive
+ initUse(Vue)：新增use方法，用于插件安装
+ initMixin(Vue)：新增mixin方法
+ initExtend(Vue)：新增extend方法
+ initAssetRegisters(Vue)：新增component,directive,filter等方法
+ 其他一些与构建和版本相关的属性：如version、$ssrContext

#### Vue.use(plugin)

+ 内部会维护一个已安装的列表installedPlugins，避免重复安装
+ 安装函数会优先取plugin.install，否则如果plugin为函数则直接取plugin
+ 会将Vue作为一个参数传递给安装函数，这有利于维持Vue版本一致，也有利于避免多次引入Vue

#### Vue.mixin(options)

将options选项合并至Vue.options

#### Vue.extend(extendOptions)

用于创建Vue子类，得到Sub构造函数

+ 所有构造函数都会有一个cid标识，用于缓存，Vue构造函数为0，后续没继承一次cid的值会加1
+ Sub的原型指向Vue的原型，构造函数指向Sub自身（原型继承）
+ 将extendOptions和父类的options合并至Sub.options
+ 添加super属性，指向Super
+ 如果Sub.options上有props和computed，在Sub的原型上代理props和getters，避免创建每个实例都调用defineProperty
+ 将父类的静态方法mixin、use、extend赋给Sub，用于实现多重继承
+ 将父类的静态属性directives、filters、components赋给Sub
+ 如果有name属性，则会开启递归自查，将Sub存放进Sub.components[name]
+ 记录父类的options（Sub.superOptions）、当前extendOptions记录到Sub.extendOptions并拷贝至Sub.sealedOptions
+ 使用cid缓存当前子类构造器

####

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
+ [选项合并](#1-选项合并)
  - 据当options._isComonent属性判断是否为子组件（内部创建）
  - 子组件调用[initInternalComponent(vm, options)](#initinternalcomponent函数)做选项合并，合并后的options会有_parentNode、_parentListeners、propDatas等属性
  - 非子组件调用[mergeOptions(resolveConstructorOptions(vm.constructor),options || {},vm)](#mergeoptions函数)做合并
+ initLifecycle(vm)：初始化$parent和$children并绑定父子关系，初始化$refs,$root,_watcher,_inactive,_isMounted,_isDestroyed,_isBeingDestroyed,_directInactive等属性
+ initEvents(vm)：初始化_events,_hasHookEvent等属性，更新$options._parentListeners
+ initRender(vm)：初始化_vnode,$vnode,$slots,$scopeSlots,$createElement,_c以及响应式的$listeners,$attrs等属性
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
+ 如果传入了el，则调用$mount进行挂载
  - 调用mountComponent函数

### （1） 选项合并与规范化

会根据实例上是否有options._isComponent属性选择不同的合并策略来进行合并。当_isComponent为true时代表的是子组件，会选择`initInternalComponent`进行选项合并，否则使用`mergeOptions`来合并。
> _isComponent是在渲染阶段解析到子组件时内部实例化组件添加的一个属性。由于选项合并是比较耗时的，所以对于内部的创建的组件，做了特别的合并处理，这样可以提高选项合并的性能
#### （1-1）mergeOptions函数
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

#### initInternalComponent函数
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

## 三、组件挂载

调用`mountComponent(vm, el)`函数：
+ 将el赋值给vm.$el
+ 如果没有找到render函数，但是传了template或者el，给出使用runtime-only的编译版本的提示，同时会将render赋值为创建空节点函数
+ callHook(vm, 'beforeMount')：执行beforeMount钩子
+ 定义了updateComponent函数用于更新组件
  - 执行vm._update(vm._render(), hydrating)，即先生成虚拟DOM，再更新成真实的DOM
+ 实例化渲染Watcher，new Watcher(vm, updateComponent, noop, {before () {...}}, true /* isRenderWatcher */)
  - watcher的before钩子里会判断组件是否被挂载过，如果挂在过则执行beforeUpdate钩子
  - watcher在初始化和数据变化时会执行回调函数
+ 将组件标记为已挂在（vm._isMounted=true），并执行mounted钩子

### 1. prototype._render

作用：将实例渲染成一个虚拟的Vnode

+ 获取$options上的render和_parentVnode
+ 规范化插槽
+ vm.$vnode指向_parentVnode，这样提供了一个让render函数访问占位节点的上下文环境
+ 调用render函数生成虚拟DOM，接收的参数为vm.$createElement函数，将虚拟DOM结果赋值给vnode（渲染失败会返回vm._vnode）
+ vnode.parent = _parentNode，绑定父子关系
+ 返回最终的vnode
  
> _render过程中添加的vm.$vnode与_update过程中添加的vm._vnode是父子关系，vm._vnode.parent = vm.$vnode





