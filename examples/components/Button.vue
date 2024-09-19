<template>
    <BaseButton class="button" v-if="show" ref="button"/>
</template>
<script>
import BaseButton from './BaseButton.vue';
export default {
    data() {
        return {
            show: true
        }
    },
    components: {
        BaseButton
    },
    beforeCreate() {
        console.log("Button beforeCreate")
    },
    created() {
        setTimeout(() => {
            // this.$destroy()
        }, 5000)
        console.log("Button Created")
    },
    beforeUpdate() {
        console.log("Button beforeUpdate")
    },
    updated() {
        console.log("Button Update")
    },
    beforeMount() {
        console.log("Button beforeMount")
    },
    mounted() {
        console.log("Button Mounted")
        console.log(this.$refs)
    },
    beforeDestroy() {
        console.log("Button beforeDestroy")
    },
    destroyed() {
        console.log("Button destroyed")
    },

}

</script>
<style scoped>
.button {
    font-size: 20px;
    color: purple;
}

</style>