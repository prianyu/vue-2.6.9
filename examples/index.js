import Vue from '../src/platforms/web/entry-runtime'
import App from './App.vue'


const vm = new Vue({
    render: h => h(App)
}).$mount('#app')

console.log(vm)
