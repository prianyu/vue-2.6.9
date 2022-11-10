/* @flow */

// 处理作用域插槽，主要做了以下几个事：
// 1. 标记$stable属性，用于标记是否有动态的插槽名称
// 2. 遍历所有插槽内容，标记没有作用域的v-slot的方向代理属性proxy
// 3. 如果slot是数组会递归处理
// 4. 最终会将fns转为对象形式， 如{header: fn, footer: fn}
export function resolveScopedSlots (
  fns: ScopedSlotsData, // see flow/vnode
  res?: Object,
  // the following are added in 2.6
  hasDynamicKeys?: boolean,
  contentHashKey?: number
): { [key: string]: Function, $stable: boolean } {
  res = res || { $stable: !hasDynamicKeys } // 标记$stable，没有动态插槽名的即为$stable
  for (let i = 0; i < fns.length; i++) { // 遍历所有作用域插槽
    const slot = fns[i]
    if (Array.isArray(slot)) { // 嵌套插槽，递归处理
      resolveScopedSlots(slot, res, hasDynamicKeys)
    } else if (slot) {
      // marker for reverse proxying v-slot without scope on this.$slots
      // 添加this.$slots上没有作用域的反向代理标记 
      // 在生成render函数的时候，在处理data的过程中会调用genScopedSlots处理作用域插槽，彼时会对没有作用域的v-slot指令增加proxy属性
      // 如<div v-slot:header></div> 其解析后的作用域插槽为{key: "header", fn: f()<Function>, proxy: true}
      // <div v-slot:header="param"></div> 其解析后的作用域插槽为{key: "header", fn: f(param)<Function>}
      if (slot.proxy) { // 将其处理函数的proxy标记为true
        slot.fn.proxy = true
      }
      // 得到类似res.header = fn<Function>
      res[slot.key] = slot.fn
    }
  }
  if (contentHashKey) {
    (res: any).$key = contentHashKey
  }
  return res
}
