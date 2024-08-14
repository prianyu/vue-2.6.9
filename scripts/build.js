const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const rollup = require('rollup')
const terser = require('terser')

// ----------------生产环境打包-----------------

// 创建dist目录
if (!fs.existsSync('dist')) {
  fs.mkdirSync('dist')
}

let builds = require('./config').getAllBuilds() // 获取所有的构建配置

// filter builds via command line arg
// 根据命令行参数构建目标
// 如npm run build -- web-runtime-cjs,web-server-renderer
if (process.argv[2]) { // 获取第二个参数
  const filters = process.argv[2].split(',') // 获取命令行参数并使用,分割符分割
  builds = builds.filter(b => {// 从构建配置中过滤出符合要求的构建配置
    // 如果名称和输出名称符合指定的名称
    return filters.some(f => b.output.file.indexOf(f) > -1 || b._name.indexOf(f) > -1)
  })
} else { // 没有指定参数则过滤调weex相关的构建配置
  // filter out weex builds by default
  builds = builds.filter(b => {
    return b.output.file.indexOf('weex') === -1
  })
}

build(builds) // 开始构建

// 逐个构建目标
function build (builds) {
  let built = 0
  const total = builds.length
  const next = () => {
    buildEntry(builds[built]).then(() => {
      built++
      if (built < total) {
        next()
      }
    }).catch(logError)
  }

  next()
}

// 负责构建单个目标
function buildEntry (config) {
  const output = config.output // 输出配置
  const { file, banner } = output // 获取输出的文件名和banner信息
  const isProd = /(min|prod)\.js$/.test(file) // 是否是生产环境
  return rollup.rollup(config) // 使用rollup构建
    .then(bundle => bundle.generate(output)) // 获取输出文件
    .then(({ output: [{ code }] }) => { // 获取生成的代码
      if (isProd) { // 生产环境压缩代码
        const minified = (banner ? banner + '\n' : '') + terser.minify(code, {
          toplevel: true, // 启用顶级函数提升
          output: { 
            ascii_only: true // 输出文件仅包含ASCII字符
          },
          compress: {
            pure_funcs: ['makeMap'] // 删除没有副作用的函数
          }
        }).code
        return write(file, minified, true) // 启用gzip压缩并写入文件
      } else { // 非生产环境直接写入文件
        return write(file, code)
      }
    })
}

// 写入文件函数，如果指定了压缩则使用zlib进行压缩并输出压缩后大小
function write (dest, code, zip) {
  return new Promise((resolve, reject) => {
    function report (extra) {
      console.log(blue(path.relative(process.cwd(), dest)) + ' ' + getSize(code) + (extra || ''))
      resolve()
    }

    fs.writeFile(dest, code, err => {
      if (err) return reject(err)
      if (zip) {
        zlib.gzip(code, (err, zipped) => {
          if (err) return reject(err)
          report(' (gzipped: ' + getSize(zipped) + ')')
        })
      } else {
        report()
      }
    })
  })
}

// 获取文件的大小
function getSize (code) {
  return (code.length / 1024).toFixed(2) + 'kb'
}

// 输出错误信息
function logError (e) {
  console.log(e)
}

// 将字符串格式化为蓝色字符并输出
function blue (str) {
  return '\x1b[1m\x1b[34m' + str + '\x1b[39m\x1b[22m'
}
