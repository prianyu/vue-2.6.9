import Vue from '../src/platforms/web/entry-runtime'
import App from './App.vue'

// core/instance/proxy/initProxy拦截器测试用例
const Child = {
    data() {
       return {
         msg: 'child',
         $foo: "foo",
         _foo: "_foo",
       }
    },
    render(h){
        console.log("test" in this) // 使用in操作符会触发has拦截器警告
        console.log("_test" in this) // _开头不会触发_has拦截器警告
        console.log("$foo" in this) // 只能使用this.$data.$foo访问
        console.log("_foo" in this) // 只能使用this._data._foo访问
        // 访问this.test不会触发属性未定义的警告
       return h('div', {},  this.msg + this.test + this.$foo + this._foo)  // child undefined undefined undefined
    } 
}

const vm = new Vue({
    // render: h => h(App) // options.render._withStripped为true，走get拦截器
    render: h => h(Child) // options.render._withStripped不为true走has拦截器警告
}).$mount('#app')