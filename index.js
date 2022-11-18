
// -----------自带getter/setter的属性响应式测试用例
/*
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
      age
    }
  }
})
*/



// --------模板解析测试用例
/** 
const app = new Vue({
   // template:  `<div></div><1`, // “Mal-formatted tag",
  template:  `<div>纯文字`,
})
*/

// -------watcher死循环测试用例
/**
const app = new Vue({
  data() {
    return {
      watcher: new Date()
    }
  },
  watcher: function() {
    this.watcher = new Date()
  }
})
 */

//--------过滤器测试用例
/**
const app = new Vue({
  data() {
    return {
      name: "foo", 
      age: 15
    }  
  },
  filters: {
    filter: function(a) {
      return a.toUpperCase()
    }  
  }
})
 */

// 组件上直接使用v-slot测试用例
const Foo = {
  template:`
    <div>
      <h1>Foo</h1>
      <slot param="param"></slot>
      <slot name="footer"></slot>
      <slot name="test" aa="test"></slot>
    </div>`
}
const Bar = {
  template: `
    <div>
      <h1>Bar</h1>
      <slot test="param"></slot>
    </div>`
}
const Baz = {
  template: `<h1>Baz<slot></slot></h1>`
}

Vue.component("custom", {
  template: "<div>{{my}}</div>",
  data() {
    return {
      my: 'hash'
    }
  }
})
Vue.component('Layout', {
  template: `<div class="container">
                  <header>
                      <slot name="header">默认header</slot>
                  </header>
                  <main>
                      <slot>默认main</slot>
                  </main>
                  <footer>
                      <slot name="footer">默认footer</slot>
                  </footer>
              </div>`
})
Vue.component("input1", {
  template: "<input placeholder='a' v-focus.a.b  class='input' style='border: 1px solid red;'/>",
  created: function() {
    console.log("created")
  },
  activated: function() {
    console.log('activated')
  },
  directives: {
    focus: {
      inserted: function(el) {
        el.focus()
      }
    }
  },
})
Vue.component("input3", {
  template: "<input1  style='border: 1px solid purple'/>"
})
Vue.component("input2", {
  template: "<input placeholder='b'/>"
})

const app = new Vue({
  data() {
    return {
      // ok: true,
      title: "这里是标题",
      msg: "这里是内容",
      type: 'a'
      // footer: "这里是footer"      
    }
  },
  directives: {
    focus: {
      inserted: function(el) {
        el.focus()
      }
    }
  },
  computed: {
    com: {
      get: function() {
        // console.log("get")
        return this.title + this.msg
      },
      cache: false
    }
  },
  created: function(){
    setTimeout(() => {
      this.msg = "hello,world"
    }, 3000)
  },

  components: {
    Foo,
    Bar,
    Baz
  }  
})

app.$mount("#app")

console.log(app)

