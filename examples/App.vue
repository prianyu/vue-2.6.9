<template>
    <div id="container">
        <!---------- 非法data属性名测试---- -->
        <!-- <TemplateRender />
        <CustomRender /> -->
        <!-- Vue.extends静态的props被代理到原型 -->
        <!-- <StaticProps message="我是传入的值" /> -->
        <!-- 自定义setter和getter -->
        <!-- <CustomSetterGetter /> -->
        <!-- HOC -->
        <!-- <HOC /> -->
        <!-- CSS scoped -->
        <!-- <CssScope /> -->
        <!-- class合并 -->
        <!-- <MergeClass class="outer"/> -->
         {{ count }}
        
    </div>
</template>
<script>

import TemplateRender, { CustomRender } from './components/InvalidKey.vue'
import StaticProps from './components/StaticProps.vue';
import CustomSetterGetter from './components/CustomSetterGetter.vue';
import HOC from './components/HOC.vue';
import CssScope from './components/CssScope.vue';
import MergeClass from './components/MergeClass.vue';
export default {
    components: {
        TemplateRender, CustomRender,
        StaticProps,
        CustomSetterGetter,
        HOC,
        CssScope,
        MergeClass,
    },
    data() {
        return {
            count: 123
        }
    },
    created(){
        setTimeout(()=> {
            this.count++
        }, 0)
        
    }
}
</script>