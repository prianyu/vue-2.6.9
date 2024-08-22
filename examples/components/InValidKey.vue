<!--  -----------------core/instance/proxy/initProxy拦截器测试用例---------- -->

<!-- 使用单文件模板，被vue-loader转换后 options.render._withStripped 为true -->
 <!-- 使用的是Proxy的get拦截器 -->
<template>
    <div>
        {{ name }} {{ test }} {{ $foo }} {{ _foo }}
    </div>
</template>

<script>
export default {
    data() {
        return {
            name: 'Mike',
            $foo: "$foo",
            _foo: "_foo",
        }
    },
    created() {
        console.log("this.$foo:", this.$foo)
        console.log("this._foo:", this._foo)
        console.log("this.$data.$foo:", this.$data.$foo)
        console.log("this._data._foo:", this._data._foo)
    }
}

// 手写render，options.render._withStripped不为true，使用的是Proxy的has拦截器
export const CustomRender = {
    data() {
       return {
         msg: 'child',
         $foo: "foo",
         _foo: "_foo",
       }
    },
    render(h){
        // console.log("test" in this) // 使用in操作符会触发has拦截器警告
        console.log("_test" in this) // _开头且不在data上不会触发_has拦截器警告
        console.log("$foo" in this) // $开头不会被代理，只能使用this.$data.$foo访问
        console.log("_foo" in this) // _开头不会被代理，且再在data上，触发警告，只能使用this._data._foo访问
        // 访问this.test不会触发属性未定义的警告，因为没有get拦截器
        // 如果要触发警告，需要手动将render的_withStripped设置为true
       return h('div', {class: "aa"},  this.msg + this.test + this.$foo + this._foo)  // child undefined undefined undefined
    }
}
</script>