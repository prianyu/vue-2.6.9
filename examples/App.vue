<template>
    <div id="container">
        <!---------- 非法data属性名测试---- -->
        <!-- <TemplateRender />
        <CustomRender /> -->
        <!-- Vue.extends静态的props被代理到原型 -->
        <StaticProps message="hello" />
    </div>
</template>
<script>

import TemplateRender, { CustomRender } from './components/InvalidKey.vue'
import StaticProps from './components/StaticProps.vue';
export default {
    components: {
        TemplateRender, CustomRender,
        StaticProps
    },
}
</script>