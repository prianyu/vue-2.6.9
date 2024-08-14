const path = require('path')
// ---------路径别名配置

// 将给定的路径解析到上级目录的同名文件夹中
const resolve = p => path.resolve(__dirname, '../', p)

module.exports = {
  vue: resolve('src/platforms/web/entry-runtime-with-compiler'), // 运行时编译器
  compiler: resolve('src/compiler'), // 编译器
  core: resolve('src/core'), // 核心模块
  shared: resolve('src/shared'), // 共享模块
  web: resolve('src/platforms/web'), // web平台相关模块
  weex: resolve('src/platforms/weex'), // weex平台相关模块
  server: resolve('src/server'), // 服务端相关模块
  sfc: resolve('src/sfc') // 单文件解析模块
}
