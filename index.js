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
  template: `<name>
                <template v-slot:footer>
                  Yu
                  <slot name="header"></slot>
                </template>
                {{age}}
             </name>`,
  components: {
    Name
  }
}

const app = new Vue({
  data() {
    return {
      aa: "12",
      name: "name"
    }
  },
  components: {
    Custom
  }
  
})
app.$mount("#app")
console.log(app)