
const Name = {
  template: `<div>
              My name is <slot name="footer"></slot>
              I'm <slot></slot> years old.
            </div>`,
  name: 'name'
}
const Custom = {
  name: "custom",
  data() {
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
  template: `<div>
              {{age}}
              <slot></slot>
            </div>`,
  components: {
    Name
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
  data() {
    return {
      person,
      aa: "12",
      name: "name",
      arr: [1,2,3]
    }
  },
  components: {
    Custom,
    Name
  }
  
})
app.$mount("#app")
setTimeout(() => {
  app.arr.push(4,5,6)
}, 1000)
console.log(app)