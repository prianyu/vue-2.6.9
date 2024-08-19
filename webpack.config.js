const path = require("path")
const HtmlWebpackPlugin = require("html-webpack-plugin")
const { VueLoaderPlugin } = require("vue-loader")
const webpack = require("webpack")
// 将给定的路径解析到上级目录的同名文件夹中
const resolve = p => path.resolve(__dirname , p)

module.exports = {
    entry: "./examples/index.js",
    output: {
        path: path.resolve(__dirname, "./temp"),
        filename: "bundle.js"
    },
    mode: "development",
    devtool: "source-map",
    devServer: {
        hot: true
    },

    module: {
        rules: [
            {
                test: /\.js$/,
                loader: "babel-loader"
            },
            {
                test: /\.vue$/,
                loader: "vue-loader"
            }
        ]
    },

    plugins: [
        new HtmlWebpackPlugin({
          template: './examples/index.html'
        }),
        new VueLoaderPlugin(),
        new webpack.DefinePlugin({
            __WEEX__: false,
            __WEEX_VERSION__: JSON.stringify("2.6.7"),
            __VERSION__: JSON.stringify("2.6.7"),
            "process.env.NEW_SLOT_SYNTAX": true,
            "process.env.VBIND_PROP_SHORTHAND": false
        })
    ],
    resolve: {
        alias: {
            vue: resolve('src/platforms/web/entry-runtime-with-compiler'), // 运行时编译器
            compiler: resolve('src/compiler'), // 编译器
            core: resolve('src/core'), // 核心模块
            shared: resolve('src/shared'), // 共享模块
            web: resolve('src/platforms/web'), // web平台相关模块
            weex: resolve('src/platforms/weex'), // weex平台相关模块
            server: resolve('src/server'), // 服务端相关模块
            sfc: resolve('src/sfc') // 单文件解析模块
        }
    }
}