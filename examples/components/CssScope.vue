<template>
    <div class="parent">
        我是父元素
        <Child>
            <div>我是子组件插槽</div>
        </Child>
        <Functional />
    </div>
</template>
<script>
import Child from './Child.vue'
import Functional from './Functional.vue';
export default {
    components: {
        Child,
        Functional
    }
}

</script>
<!-- 两个style只会生成一个scopeId -->
<style scoped>
div {
    font-weight: bold;
}
</style>
<style scoped>
div {
    color: red;
    font-size: 30px;
}
</style>