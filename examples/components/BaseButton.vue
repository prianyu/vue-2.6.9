<template>
    <div class="base-button">{{ message }}</div>
</template>
<script>
export default {
    data() {
       return {
         message: "Hello"
       }
    },
    created() {
        setTimeout(() => {
            this.message = "World"
        }, 5000)
    }
}

</script>
<style scoped>
.base-button {
    color: red;
}

</style>