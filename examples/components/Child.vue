<template>
    <div id="child">
        我是子元素
        <slot></slot>
    </div>

</template>
<script>
export default {
    
}
</script>
<style scoped>
/* 父元素的scopeId也会被添加到子元素 */
/* 会被父元素的样式覆盖 */
div {
    font-size: 20px;
}
</style>