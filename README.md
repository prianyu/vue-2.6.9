
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
## 一、Vue定义
### 1. prototype

+ initMixin(Vue) // 原型新增_init方法
+ stateMixin(Vue) // $data,$props,$watch,$delete,$set
+ eventsMixin(Vue) // $on,$once,$off,$emit
+ lifecycleMixin(Vue) // _update,$forceUpdate,$destroy
+ renderMixin(Vue) // $nextTick,_render,各类辅助方法（如_s,_t,_o等）

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
+ 根据当前实例是否有_isComonent属性做不一样的选项规范化和选项合并，组件实例合并后的options会有_parentNode、_parentListeners、propDatas等属性
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

### 1. 选项合并

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





