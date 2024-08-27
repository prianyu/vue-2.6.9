<template>
    <div>{{ message }}</div>
</template>

<script>
import Vue from '../../src/platforms/web/entry-runtime'
const extendOptions = {
    props: {
        message:{
            type: String,
            default: '我是默认的值'
        }
    },
    created() {
        console.log(this)
    },
}

const Sub = Vue.extend(extendOptions)

export default Sub
</script>