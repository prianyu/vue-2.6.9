<template>
    <Child />
</template>
<script>
import Child from './Child.vue'

export default {
    components: { Child },
    mounted() {
        console.log(this)
    }
}
</script>