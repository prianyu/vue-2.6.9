module.exports = {
  NEW_SLOT_SYNTAX: true, // 启用新插槽语法支持 v-slot
  VBIND_PROP_SHORTHAND: false // v-bind属性的简写语法
}

// 这些特性标志通常用于构建工具或框架中，以便：

// 控制新特性的逐步引入和启用，而不会立即影响所有用户。
// 提供向后兼容性，允许开发者根据需要选择是否启用新特性。
// 在开发环境和生产环境之间切换不同的功能集