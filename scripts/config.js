const path = require('path')
const buble = require('rollup-plugin-buble') // 语法转换插件（ES6+转ES5）
const alias = require('rollup-plugin-alias') // 路径别名插件
const cjs = require('rollup-plugin-commonjs') // CommonJS转换插件，转为ES6模块，使其可以与rollup使用
const replace = require('rollup-plugin-replace') // 构建过程中替换代码中的变量，通常用于环境变量和条件编译
const node = require('rollup-plugin-node-resolve') // 解析node风格的模块依赖
const flow = require('rollup-plugin-flow-no-whitespace') // 移除flow类型注释
const version = process.env.VERSION || require('../package.json').version
const weexVersion = process.env.WEEX_VERSION || require('../packages/weex-vue-framework/package.json').version
const featureFlags = require('./feature-flags')

// 注释
const banner =
  '/*!\n' +
  ` * Vue.js v${version}\n` +
  ` * (c) 2014-${new Date().getFullYear()} Evan You\n` +
  ' * Released under the MIT License.\n' +
  ' */'
// 定义一个插件对象，用于Weex工厂函数的生成
const weexFactoryPlugin = {
  intro () { // 生成工厂函数的开头部分
    return 'module.exports = function weexFactory (exports, document) {'
  },
  outro () { // 生成工厂函数的结尾部分
    return '}'
  }
}

const aliases = require('./alias') // 路径别名配置

// 解析模块的路径，如果有别名，则返回别名对应的路径，否则从上级路径中查找
const resolve = p => {
  const base = p.split('/')[0]
  if (aliases[base]) {
    return path.resolve(aliases[base], p.slice(base.length + 1))
  } else {
    return path.resolve(__dirname, '../', p)
  }
}

// 各种不同构建目标的配置，含入口文件、输出格式、环境变量等
const builds = {
  // Runtime only (CommonJS). Used by bundlers e.g. Webpack & Browserify
  //---------CommonJS运行时---------
  // 开发环境运行时，适合给打包工具使用
  'web-runtime-cjs-dev': {
    entry: resolve('web/entry-runtime.js'),
    dest: resolve('dist/vue.runtime.common.dev.js'),
    format: 'cjs',
    env: 'development',
    banner
  },
  // 生产环境运行时
  'web-runtime-cjs-prod': {
    entry: resolve('web/entry-runtime.js'),
    dest: resolve('dist/vue.runtime.common.prod.js'),
    format: 'cjs',
    env: 'production',
    banner
  },
  //-------------CommonJS运行时+编译器------------
  // Runtime+compiler CommonJS build (CommonJS)
  'web-full-cjs-dev': {
    entry: resolve('web/entry-runtime-with-compiler.js'),
    dest: resolve('dist/vue.common.dev.js'),
    format: 'cjs',
    env: 'development',
    alias: { he: './entity-decoder' }, // import he from 'he'会被替换成'./entity-decoder'
    banner
  },
  'web-full-cjs-prod': {
    entry: resolve('web/entry-runtime-with-compiler.js'),
    dest: resolve('dist/vue.common.prod.js'),
    format: 'cjs',
    env: 'production',
    alias: { he: './entity-decoder' },
    banner
  },
  // ----------------ES Modules 运行时------------
  // Runtime only ES modules build (for bundlers)
  'web-runtime-esm': {
    entry: resolve('web/entry-runtime.js'),
    dest: resolve('dist/vue.runtime.esm.js'),
    format: 'es',
    banner
  },
  //---------- ES Modules 运行时+编译器------------
  // Runtime+compiler ES modules build (for bundlers)
  'web-full-esm': {
    entry: resolve('web/entry-runtime-with-compiler.js'),
    dest: resolve('dist/vue.esm.js'),
    format: 'es',
    alias: { he: './entity-decoder' },
    banner
  },
  // Runtime+compiler ES modules build (for direct import in browser)
  //------开发环境+编译器+浏览器环境--------
  // 通过 <script type="module"> 标签直接在浏览器中引入
  'web-full-esm-browser-dev': {
    entry: resolve('web/entry-runtime-with-compiler.js'),
    dest: resolve('dist/vue.esm.browser.js'),
    format: 'es',
    transpile: false,
    env: 'development',
    alias: { he: './entity-decoder' },
    banner
  },
  // Runtime+compiler ES modules build (for direct import in browser)
   //------生产环境+编译器+浏览器环境--------
  // 通过 <script type="module"> 标签直接在浏览器中引入
  'web-full-esm-browser-prod': {
    entry: resolve('web/entry-runtime-with-compiler.js'),
    dest: resolve('dist/vue.esm.browser.min.js'),
    format: 'es',
    transpile: false,
    env: 'production',
    alias: { he: './entity-decoder' },
    banner
  },
  //---------UMD+运行时+开发环境------------
  // 通过 <script> 标签直接在浏览器中引入
  // runtime-only build (Browser)
  'web-runtime-dev': {
    entry: resolve('web/entry-runtime.js'),
    dest: resolve('dist/vue.runtime.js'),
    format: 'umd',
    env: 'development',
    banner
  },
    //---------UMD+运行时+生产环境------------
  // 通过 <script> 标签直接在浏览器中引入
  // runtime-only production build (Browser)
  'web-runtime-prod': {
    entry: resolve('web/entry-runtime.js'),
    dest: resolve('dist/vue.runtime.min.js'),
    format: 'umd',
    env: 'production',
    banner
  },
  // -------------UMD+运行时+编译器+开发环境----------
  // Runtime+compiler development build (Browser)
  'web-full-dev': {
    entry: resolve('web/entry-runtime-with-compiler.js'),
    dest: resolve('dist/vue.js'),
    format: 'umd',
    env: 'development',
    alias: { he: './entity-decoder' },
    banner
  },
  // -------------UMD+运行时+编译器+生产环境----------
  // Runtime+compiler production build  (Browser)
  'web-full-prod': {
    entry: resolve('web/entry-runtime-with-compiler.js'),
    dest: resolve('dist/vue.min.js'),
    format: 'umd',
    env: 'production',
    alias: { he: './entity-decoder' },
    banner
  },
  // --------------CommonJS + 编译器--------------
  // 用于Nodejs环境下Vue模板编译
  // Web compiler (CommonJS).
  'web-compiler': {
    entry: resolve('web/entry-compiler.js'),
    dest: resolve('packages/vue-template-compiler/build.js'),
    format: 'cjs',
    external: Object.keys(require('../packages/vue-template-compiler/package.json').dependencies) // 由外部提供依赖
  },
  // -------- UMD + 编译器 + 浏览器环境-----------
  // 用于浏览器环境下Vue模板编译
  // Web compiler (UMD for in-browser use).
  'web-compiler-browser': {
    entry: resolve('web/entry-compiler.js'),
    dest: resolve('packages/vue-template-compiler/browser.js'),
    format: 'umd',
    env: 'development',
    moduleName: 'VueTemplateCompiler',
    plugins: [node(), cjs()]
  },
  ///---------------服务端渲染-----------------
  // 服务端渲染+开发环境
  // Web server renderer (CommonJS).
  'web-server-renderer-dev': {
    entry: resolve('web/entry-server-renderer.js'),
    dest: resolve('packages/vue-server-renderer/build.dev.js'),
    format: 'cjs',
    env: 'development',
    external: Object.keys(require('../packages/vue-server-renderer/package.json').dependencies)
  },
  // 服务端渲染+生产环境
  'web-server-renderer-prod': {
    entry: resolve('web/entry-server-renderer.js'),
    dest: resolve('packages/vue-server-renderer/build.prod.js'),
    format: 'cjs',
    env: 'production',
    external: Object.keys(require('../packages/vue-server-renderer/package.json').dependencies)
  },
  // UMD + 服务端渲染 + 浏览器环境
  // 用于浏览器环或Node境下使用UMD模块进行基本的服务端渲染
  'web-server-renderer-basic': {
    entry: resolve('web/entry-server-basic-renderer.js'),
    dest: resolve('packages/vue-server-renderer/basic.js'),
    format: 'umd',
    env: 'development',
    moduleName: 'renderVueComponentToString',
    plugins: [node(), cjs()]
  },
  // webpack服务端渲染的服务器端插件
  'web-server-renderer-webpack-server-plugin': {
    entry: resolve('server/webpack-plugin/server.js'),
    dest: resolve('packages/vue-server-renderer/server-plugin.js'),
    format: 'cjs',
    external: Object.keys(require('../packages/vue-server-renderer/package.json').dependencies)
  },
  // webpack服务端渲染的客户端插件
  'web-server-renderer-webpack-client-plugin': {
    entry: resolve('server/webpack-plugin/client.js'),
    dest: resolve('packages/vue-server-renderer/client-plugin.js'),
    format: 'cjs',
    external: Object.keys(require('../packages/vue-server-renderer/package.json').dependencies)
  },
  //-------------Weex-------------------------
  // Weex runtime factory
  // Weex平台运行时工厂模块，帮助创建运行时实例
  'weex-factory': {
    weex: true,
    entry: resolve('weex/entry-runtime-factory.js'),
    dest: resolve('packages/weex-vue-framework/factory.js'),
    format: 'cjs',
    plugins: [weexFactoryPlugin]
  },
  // Weex runtime framework (CommonJS).
  // Weex平台运行时框架模块，i提供核心功能
  'weex-framework': {
    weex: true,
    entry: resolve('weex/entry-framework.js'),
    dest: resolve('packages/weex-vue-framework/index.js'),
    format: 'cjs'
  },
  // Weex compiler (CommonJS). Used by Weex's Webpack loader.
  // Weex平台模板编译模块，用于配合Weex的Webpack Loader
  'weex-compiler': {
    weex: true,
    entry: resolve('weex/entry-compiler.js'),
    dest: resolve('packages/weex-template-compiler/build.js'),
    format: 'cjs',
    external: Object.keys(require('../packages/weex-template-compiler/package.json').dependencies)
  }
}

// 根据构建目标的名称生成对应的rollup配置
function genConfig (name) {
  const opts = builds[name] // 获取配置
  const config = {
    input: opts.entry, // 输入文件
    external: opts.external, // 外部依赖
    plugins: [ // 插件列表
      flow(), // flow
      alias(Object.assign({}, aliases, opts.alias)) // 路径别名
    ].concat(opts.plugins || []),
    output: { // 输出配置
      file: opts.dest, // 输出文件
      format: opts.format, // 输出格式
      banner: opts.banner, // 顶部注释
      name: opts.moduleName || 'Vue' // 模块名称
    },
    onwarn: (msg, warn) => { // 警告处理，不是循环引用则警告
      if (!/Circular/.test(msg)) { 
        warn(msg)
      }
    }
  }

  // built-in vars
  // 设置内置变量
  const vars = {
    __WEEX__: !!opts.weex,
    __WEEX_VERSION__: weexVersion,
    __VERSION__: version
  }
  // feature flags 特性支持标记
  Object.keys(featureFlags).forEach(key => {
    vars[`process.env.${key}`] = featureFlags[key]
  })
  // build-specific env 环境变量
  if (opts.env) {
    vars['process.env.NODE_ENV'] = JSON.stringify(opts.env)
  }
  config.plugins.push(replace(vars)) // 替换代码中的变量

  // 是否需要进行代码转译，默认是true
  if (opts.transpile !== false) {
    config.plugins.push(buble()) // 转为ES5
  }

  // 添加配置名称
  Object.defineProperty(config, '_name', {
    enumerable: false,
    value: name
  })

  return config
}

// 如果指定了构建目标，则生成对应的rollup配置
// 否则导出用于获取单个配置和所有配置的方法
if (process.env.TARGET) {
  module.exports = genConfig(process.env.TARGET)
} else {
  exports.getBuild = genConfig
  exports.getAllBuilds = () => Object.keys(builds).map(genConfig)
}
