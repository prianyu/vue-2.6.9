
打包入口：src/platform/web/entry-runtime-with-compiler.js
## Vue定义
### （1）prototype

+ initMixin(Vue) // 原型新增_init方法
+ stateMixin(Vue) // $data,$props,$watch,$delete,$set
+ eventsMixin(Vue) // $on,$once,$off,$emit
+ lifecycleMixin(Vue) // _update,$forceUpdate,$destroy
+ renderMixin(Vue) // $nextTick,_render,各类辅助方法（如_s,_t,_o等）

### （2）各种静态属性和方法

调用initGlobalAPI(Vue)：

+ delete,set,nextTick,observable等静态方法
+ util静态属性（含warn,extend,mergeOptions,defineReactive等工具方法）
+ options静态属性，{directives,options,components,_base: Vue}，其中components含内置组件keep-alive
+ initUse(Vue)：新增use方法，用于插件安装
+ initMixin(Vue)：新增mixin方法
+ initExtend(Vue)：新增extend方法
+ initAssetRegisters(Vue)：新增component,directive,filter等方法
+ 其他一些与构建和版本相关的属性：如version、$ssrContext

### （3）构建相关

+ 往Vue.config添加属性和方法：
  - Vue.config.mustUseProp = mustUseProp // 原生dom属性，如selected等
  - Vue.config.isReservedTag = isReservedTag // 判断是否为保留标签的方法（原生html和svg标签）
  - Vue.config.isReservedAttr = isReservedAttr // 判断是否为保留属性的方法（style，class）
  - Vue.config.getTagNamespace = getTagNamespace // 获取命名空间的方法（svg和mathML，分别返回svg和math)
  - Vue.config.isUnknownElement = isUnknownElement // 判断是否为无效的html标签，非浏览器下永远返回true

+ 往Vue.options添加属性方法：

  - 将v-mode和v-show指令合并至Vue.options.directives
  - 将transition和transition-group组件合并至Vue.options.components

+ Vue.prototype新增__path__方法
+ Vue.prototype新增与平台无关的$mount方法

### （4）runtime-with-compiler构建相关

+ 重写Vue.prototye.$mount方法
  - 缓存原来的与平台无关的$mount方法
  - 不能挂在在body和html的处理
  - 如果没有传render函数，会将template编译成render函数
  - template可以由外部传入，也可以由外部传入的el对应的DOM节点的outerHTML
  - 外部传入的tempalte=是DOM节点或者id，则为对应DOM的innerHTML，否则直接使用模板
  - 编译后的render函数和staticRenderFns会分别赋值给options.render和options.staticRenderFns
  - 最后会调用被缓存的与平台无关的$mount方法
+ 增加Vue.compile静态方法