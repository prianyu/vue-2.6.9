import Vue from '../src/platforms/web/entry-runtime'
import App from './App.vue'


const vm = new Vue({
    // props: {
    //     age: String,
    // },
    // propsData: {
    //     age: 18
    // },
    // data: {
    //     name: "foo",
    //     lastName: "bar"
    // },
    // computed: {
    //     fullName: function () {
    //         return this.name + ' ' + this.lastName
    //     }
    // },
    // watch: {
    //     fullName: function (val) {
    //         console.log(val)
    //     }
    // },
    render: h => h(App)
}).$mount('#app')

console.log(vm)
