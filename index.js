const Name = {
  template: '<div> My name is <slot name="footer"></slot>Im <slot></slot> years old. </div>',
  name: 'name'
}
const Custom = {
  name: "custom",
  data: function() {
    return {
      age: 20
    }
  },
  // template: `<name>
  //               <template v-slot:footer>
  //                 Yu
  //                 <slot name="header"></slot>
  //               </template>
  //               {{age}}
  //            </name>`,
  template: '<div> {{age}}<slot></slot></div>',
  components: {
    Name: Name
  }
}
const age = 18
const person = Object.defineProperty({}, 'age', {
  enumerable: true, //可枚举
  configurable: true, // 可删除
  get: function() {
    console.log(1)
    return age
  },
  // set: function(val) {
  //   alert('set')
  //   age = val
  // }
})


const app = new Vue({
  // template:  `<div></div><1`, // “Mal-formatted tag",
  // template:  `<div>纯文字`,
  data() {
    return {
      person,
      aa: "12",
      name: "name",
      age: 18,
      arr: [1,2,3],
      watcher: new Date()
    }
  },
  components: {
    Custom,
    Name
  },
  watch: {
    watcher: function() {
      //this.watcher = new Date()// 陷入了死循环
    }
  },
  filters: {
    filter: function() {

    },
    test() {

    }
  }
  
})
app.$mount("#app")
setTimeout(function() {
  app.arr.push(4,5,6)
  app.watcher = new Date()
}, 1000)
console.log(app)