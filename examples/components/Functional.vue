<template functional>
    <div class="functional">
        函数式组件
    </div>
</template>
<script>
export default {
    functional: true
}
</script>
<style scoped>
/* 如果没有设置scope，则会应用祖先元素的scope id，否则只用当前组件的scope id */
.functional {
    color: green;
}

</style>