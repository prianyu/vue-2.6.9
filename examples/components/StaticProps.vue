<template>
    <div>{{ message }}</div>
</template>

<script>
const extendOptions = {
    props: {
        message:{
            type: String,
            default: '我是默认的值'
        }
    }
}


export default {
    extends: extendOptions,
    props: ['message'],
    created() {
        console.log(this)
    }
}
</script>