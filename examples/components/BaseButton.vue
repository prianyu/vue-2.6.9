<template>
    <div class="base-button" ref="baseButton" v-if="show">{{ message }}</div>
    <!-- <a class="base-button" ref="baseButton" v-else>静态内容</a> -->
</template>
<script>
export default {
    data() {
       return {
         message: "Hello",
         show: true
       }
    },
    beforeCreate() {
        console.log("BaseButton beforeCreate")
    },
    created() {
        // setTimeout(() => {
        //     this.message = "World"
        // }, 3000)

        setTimeout(() => {
            this.show = false
        }, 4000)
        console.log("BaseButton Created")
    },
    beforeUpdate() {
        console.log("BaseButton beforeUpdate")
    },
    updated() {
        console.log("BaseButton Update")
    },
    beforeMount() {
        console.log("BaseButton beforeMount")
    },
    mounted() {
        console.log("BaseButton Mounted")
        console.log(this.$refs)
    },
    beforeDestroy() {
        console.log("BaseButton beforeDestroy")
    },
    destroyed() {
        console.log("BaseButton destroyed")
    },
}

</script>
<style scoped>
.base-button {
    color: red;
}

</style>