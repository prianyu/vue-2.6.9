<template>
    <div>
       name: {{ name }} |
       lastName：{{ lastName }}|
       age：{{ age }}|
       phone：{{ phone }} 
    </div>
</template>
<script>
const data = {
    age: 18,
    phone: "11111"
}
// 只有getter，更新值不会触发setter，即不触发更新
Object.defineProperty(data, "name", {
    enumerable: true,
    configurable: true,
    get() {
        console.log("只有get")
        return "Foo"
    }
})

// 只有setter，会触发setter，但是get获取的值为undefined
Object.defineProperty(data, "phone", {
    enumerable: true,
    configurable: true,
    set(value) {
        console.log("只有set", value)
    }
})


// 有setter和getter， 则会触发getter和setter，并且getter返回的值为setter设置的值
// 初始化时就会触发求值的副作用
let lastName = "Bar"
Object.defineProperty(data, "lastName", {
    enumerable: true,
    configurable: true,
    get() {
        console.log("有get和set")
        return lastName
    },
    set(value) {
        lastName = value
        console.log("有get和set")
    }
})

export default {
    data() {
        return data
    },
    created() {
        setTimeout(() => {
        //    this.age = 22
        //    this.name = "Baz"
           this.lastName = "Baz"
        //    this.phone = "11222"
        }, 3000)
    }
}

</script>