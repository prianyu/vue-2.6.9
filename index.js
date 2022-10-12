
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

const app = new Vue({
  data() {
    return {
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