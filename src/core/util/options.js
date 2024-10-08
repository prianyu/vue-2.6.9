/* @flow */

import config from "../config";
import { warn } from "./debug";
import { set } from "../observer/index";
import { unicodeRegExp } from "./lang";
import { nativeWatch, hasSymbol } from "./env";

import { ASSET_TYPES, LIFECYCLE_HOOKS } from "shared/constants";

import {
  extend,
  hasOwn,
  camelize,
  toRawType,
  capitalize,
  isBuiltInTag,
  isPlainObject
} from "shared/util";

/**
 * Option overwriting strategies are functions that handle
 * how to merge a parent option value and a child option
 * value into the final value.
 * 选项合并策略
 */
const strats = config.optionMergeStrategies; // 获取自定义的选项合并策略

/**
 * Options with restrictions
 * 有限制的选项合并
 * 对于el和propsData的选项合并采用默认的选项合并
 * 且el和propData只能在在new Vue的方式下传入，
 * 如果是在export default{}单文件组件中是不能传入这两个参数的
 */
// ---------------------------el和propsData合并策略---------------
if (process.env.NODE_ENV !== "production") {
  strats.el = strats.propsData = function (parent, child, vm, key) {
    // 子组件是不允许在选线各种传入el和propsData的
    // vm来自于mergeField函数，间接来自于mergeOptions函数
    // mergeOptions函数在组件实例化时被调用（vm._init），也可以在Vue.extend中被调用
    // 当使用Vue.extend调用时，vm为undefined，而子组件的实现时通过实例化子类类完成的
    // 子类又是由Vue.extend创建的，所以可以通过vm来判断当前调用是_init调用还是Vue.extend调用
    if (!vm) {
      warn(
        `option "${key}" can only be used during instance ` +
        "creation with the `new` keyword."
      );
    }
    return defaultStrat(parent, child);
  };
}

// ---------------data的选项合并策略

/**
 * Helper that recursively merges two data objects together.
 * 递归合并data选项，将from对象中的属性合并到to中
 * to中不存在的属性会采用set来设置属性
 */
function mergeData(to: Object, from: ?Object): Object {
  if (!from) return to;
  let key, toVal, fromVal;

  // 对象所有的自身属性（含不可枚举和symbol）：只返回可枚举属性
  const keys = hasSymbol ? Reflect.ownKeys(from) : Object.keys(from);

  for (let i = 0; i < keys.length; i++) {
    key = keys[i];
    // in case the object is already observed...
    // 有__ob__属性的data已经被观察过了，说明也已经做过了合并
    if (key === "__ob__") continue;
    toVal = to[key];
    fromVal = from[key];
    if (!hasOwn(to, key)) {
      // 原本没有key属性，则使用set来设置一个新属性
      set(to, key, fromVal);
    } else if (
      toVal !== fromVal &&
      isPlainObject(toVal) &&
      isPlainObject(fromVal)
    ) {
      // 递归合并
      mergeData(toVal, fromVal);
    }
  }
  return to;
}

/**
 * Data 的选项合并策略，返回一个合并函数
 */
export function mergeDataOrFn(
  parentVal: any,
  childVal: any,
  vm?: Component
): ?Function {
  if (!vm) {
    // 自组加的data合并
    // in a Vue.extend merge, both should be functions
    // 在Vue.extend中合并选项时，parentVal和childVal都应该是函数
    // const Parent = Vue.extend({})
    // const Child = Parent.extend({})
    if (!childVal) {
      // 子类没有data选项
      return parentVal;
    }
    if (!parentVal) {
      // 父类没有data选项
      return childVal;
    }
    // 走到这里，说明parentVal和childVal都不为空，则需要合并
    // when parentVal & childVal are both present,
    // we need to return a function that returns the
    // merged result of both functions... no need to
    // check if parentVal is a function here because
    // it has to be a function to pass previous merges.
    // 返回一个合并函数，接收当前实例为执行上下文和参数
    return function mergedDataFn() {
      return mergeData(
        typeof childVal === "function" ? childVal.call(this, this) : childVal,
        typeof parentVal === "function" ? parentVal.call(this, this) : parentVal
      );
    };
  } else {
    // 传递了vm，说明是来自实例的选项合并
    return function mergedInstanceDataFn() {
      // instance merge
      // 实例中的data都可以是函数，也可以是对象
      const instanceData =
        typeof childVal === "function" ? childVal.call(vm, vm) : childVal;
      const defaultData =
        typeof parentVal === "function" ? parentVal.call(vm, vm) : parentVal;
      if (instanceData) {
        // 实例中传了data，则将默认的defaultData 合并到instanceData
        // 只有instanceData上不存在的属性，才合并
        return mergeData(instanceData, defaultData);
      } else {
        // 不合并
        return defaultData;
      }
    };
  }
}

// data合并最终会被处理成一个函数
// 之所以处理成一个函数，是因为props和inject在实例初始化的时候是先于data的
// 这样就可以在data中获取到props和inject
strats.data = function (
  parentVal: any,
  childVal: any,
  vm?: Component
): ?Function {
  if (!vm) {
    // 没有传入vm则为子组件构造函数的选项合并，data必须要为一个函数
    if (childVal && typeof childVal !== "function") {
      process.env.NODE_ENV !== "production" &&
        warn(
          'The "data" option should be a function ' +
          "that returns a per-instance value in component " +
          "definitions.",
          vm
        );

      return parentVal;
    }
    return mergeDataOrFn(parentVal, childVal);
  }

  return mergeDataOrFn(parentVal, childVal, vm);
};

// -------------生命周期钩子选项合并策略--------------------
/**
 * Hooks and props are merged as arrays.
 * 生命周期钩子：合并成数组并去重
 */
function mergeHook(
  parentVal: ?Array<Function>,
  childVal: ?Function | ?Array<Function>
): ?Array<Function> {
  const res = childVal
    ? parentVal
      ? parentVal.concat(childVal)
      : Array.isArray(childVal)
        ? childVal
        : [childVal]
    : parentVal;
  return res ? dedupeHooks(res) : res;
}

// hooks去重
function dedupeHooks(hooks) {
  const res = [];
  for (let i = 0; i < hooks.length; i++) {
    if (res.indexOf(hooks[i]) === -1) {
      res.push(hooks[i]);
    }
  }
  return res;
}

// 遍历所有的钩子，定义钩子的合并策略
LIFECYCLE_HOOKS.forEach(hook => {
  strats[hook] = mergeHook;
});

//--------------------资源（filters、directives、components）选项合并策略----------------------
/**
 * Assets
 *
 * When a vm is present (instance creation), we need to do
 * a three-way merge between constructor options, instance
 * options and parent options.
 */
// directives,components,filters：构造函数、实例、父选项进行三方合并
function mergeAssets(
  parentVal: ?Object,
  childVal: ?Object,
  vm?: Component,
  key: string
): Object {
  // 以parentVal为原型创建对象
  // 也就是parentVal上的资源会以原型的形式存在于组件实例的$options中
  // 比如vm.$options.components.__proto__ = {KeepAlive, Transition, TransitionGroup}
  const res = Object.create(parentVal || null);
  if (childVal) {
    // 将childVal扩展至res
    process.env.NODE_ENV !== "production" &&
      assertObjectType(key, childVal, vm);
    return extend(res, childVal);
  } else {
    return res;
  }
}

ASSET_TYPES.forEach(function (type) {
  strats[type + "s"] = mergeAssets;
});

//---------------watch选项合并---------------------

/**
 * Watchers.
 *
 * Watchers hashes should not overwrite one
 * another, so we merge them as arrays.
 * watch的选项合并策略为合并为一个数组
 */
strats.watch = function (
  parentVal: ?Object,
  childVal: ?Object,
  vm?: Component,
  key: string
): ?Object {
  // work around Firefox's Object.prototype.watch...
  // 火狐浏览器中Object.prototype拥有原生的watch方法，因此普通的对象也拥有watch属性
  // 当判断是原生的watch方法时将其重置为undefined
  if (parentVal === nativeWatch) parentVal = undefined;
  if (childVal === nativeWatch) childVal = undefined;
  /* istanbul ignore if */
  if (!childVal) return Object.create(parentVal || null);
  if (process.env.NODE_ENV !== "production") {
    assertObjectType(key, childVal, vm);
  }
  if (!parentVal) return childVal;
  const ret = {};
  extend(ret, parentVal); // 将parentVal混合到ret中
  for (const key in childVal) {
    let parent = ret[key];
    const child = childVal[key];
    // 有同名的watch则转为数组
    if (parent && !Array.isArray(parent)) {
      parent = [parent];
    }
    ret[key] = parent
      ? parent.concat(child) // 合并
      : Array.isArray(child)
        ? child
        : [child]; // 转数组
  }
  return ret;
};

//--------------props、methods、inject、computed、provide选项合并策略-----------------
/**
 * Other object hashes.
 * props、methods、inject、computed采用覆盖的方式合并
 */
strats.props = strats.methods = strats.inject = strats.computed = function (
  parentVal: ?Object,
  childVal: ?Object,
  vm?: Component,
  key: string
): ?Object {
  if (childVal && process.env.NODE_ENV !== "production") {
    assertObjectType(key, childVal, vm);
  }
  if (!parentVal) return childVal;
  const ret = Object.create(null);
  extend(ret, parentVal);
  if (childVal) extend(ret, childVal);
  return ret;
};
// provide采用和data一样的合并方式
strats.provide = mergeDataOrFn;

/**
 * Default strategy.
 * 默认的合并策略，采用替换的方式
 */
const defaultStrat = function (parentVal: any, childVal: any): any {
  return childVal === undefined ? parentVal : childVal;
};

/**
 * 检测组件名称的有效性
 * 1. 符合html5自定义标签名规范
 * 2. 不能是内置html标签和保留标签名称（如transition、component）
 */
function checkComponents(options: Object) {
  for (const key in options.components) {
    validateComponentName(key);
  }
}

export function validateComponentName(name: string) {
  if (
    !new RegExp(`^[a-zA-Z][\\-\\.0-9_${unicodeRegExp.source}]*$`).test(name)
  ) {
    warn(
      'Invalid component name: "' +
      name +
      '". Component names ' +
      "should conform to valid custom element name in html5 specification."
    );
  }
  if (isBuiltInTag(name) || config.isReservedTag(name)) {
    warn(
      "Do not use built-in or reserved HTML elements as component " +
      "id: " +
      name
    );
  }
}

/**
 * Ensure all props option syntax are normalized into the
 * Object-based format.
 */
// props规范化
// 会将[string, string]、{ key: "String"}， {key: { type: String } } 这种格式统一转为
// {key: {type: String}}的格式
function normalizeProps(options: Object, vm: ?Component) {
  const props = options.props;
  if (!props) return;
  const res = {};
  let i, val, name;
  if (Array.isArray(props)) {
    // 数组格式的props选项
    //['a', 'b']格式转为{ a: {type: null}, b: {type: null}}
    i = props.length;
    while (i--) {
      val = props[i];
      if (typeof val === "string") {
        name = camelize(val); // 属性名会转为驼峰命名
        res[name] = { type: null };
      } else if (process.env.NODE_ENV !== "production") {
        warn("props must be strings when using array syntax.");
      }
    }
  } else if (isPlainObject(props)) {
    // 对象格式的props选项
    // {a: {type: String}, b: String}转为{a: {type: String}, b: {type: String}}
    for (const key in props) {
      val = props[key];
      name = camelize(key); // 转驼峰
      // 给对象的会转为对象类型
      res[name] = isPlainObject(val) ? val : { type: val };
    }
  } else if (process.env.NODE_ENV !== "production") {
    warn(
      `Invalid value for option "props": expected an Array or an Object, ` +
      `but got ${toRawType(props)}.`,
      vm
    );
  }
  options.props = res;
}

/**
 * Normalize all injections into Object-based format
 */
// inject规范化
// 将所有的项转为{from, default}的格式
// ['age', 'name'] => {age: {from: 'age'}, name: {from: 'name'}}
// {age: 'age', name: {from: 'key', default: 'test'}} => { age: { from: 'age'}, name: { from: 'key', default: 'test'}
function normalizeInject(options: Object, vm: ?Component) {
  const inject = options.inject;
  if (!inject) return;
  const normalized = (options.inject = {});
  if (Array.isArray(inject)) {
    // ['age', 'name']转为{age: {from: 'age'}, name: {from: 'name'}}
    for (let i = 0; i < inject.length; i++) {
      normalized[inject[i]] = { from: inject[i] };
    }
  } else if (isPlainObject(inject)) {
    // {age: 'age', name: {from: 'myname', default: 'test'}, gender: {default: 'female'}}转为
    // {age: {from: 'age'}, name: {from: 'myname', default: 'test'}, gender: {from: 'gender', default: 'female'}}
    for (const key in inject) {
      const val = inject[key];
      normalized[key] = isPlainObject(val)
        ? extend({ from: key }, val)
        : { from: val };
    }
  } else if (process.env.NODE_ENV !== "production") {
    warn(
      `Invalid value for option "inject": expected an Array or an Object, ` +
      `but got ${toRawType(inject)}.`,
      vm
    );
  }
}

/**
 * Normalize raw function directives into object format.
 */
// directive规范化
//对于函数形式的directive转为{bind: fn, update: fn}的格式
function normalizeDirectives(options: Object) {
  const dirs = options.directives;
  if (dirs) {
    for (const key in dirs) {
      const def = dirs[key];
      if (typeof def === "function") {
        dirs[key] = { bind: def, update: def };
      }
    }
  }
}

// 判断给定的值是否为纯对象
function assertObjectType(name: string, value: any, vm: ?Component) {
  if (!isPlainObject(value)) {
    warn(
      `Invalid value for option "${name}": expected an Object, ` +
      `but got ${toRawType(value)}.`,
      vm
    );
  }
}

/**
 * Merge two option objects into a new one.
 * Core utility used in both instantiation and inheritance.
 */
// 选项合并函数，该函数在组件实例化以及Vue.extend函数中被调用
// 当在Vue.extend中调用时，vm为undefined
// 1. 规范化props、inject、directives
// 2. 合并extends、mixins
// 3. 返回合并后的选项
// 在使用Vue.mixin时，vm是为undefined的
export function mergeOptions(
  parent: Object,
  child: Object,
  vm?: Component
): Object {
  // 组件名合法性检测
  if (process.env.NODE_ENV !== "production") {
    checkComponents(child);
  }

  // options是可以为一个函数的，比如构造函数，那么就取其options
  if (typeof child === "function") {
    child = child.options;
  }

  normalizeProps(child, vm); // props规范化，统一转为{key: { type: String, default?: 'defaultValue'}}的格式
  normalizeInject(child, vm); // inject规范化，统一转为{ key: { from: 'keyName', default?: 'defaultValue'}}
  normalizeDirectives(child); // directives规范化，函数类型的统一转为{ update: fn, bind: fn }

  // Apply extends and mixins on the child options,
  // but only if it is a raw options object that isn't
  // the result of another mergeOptions call.
  // Only merged options has the _base property.
  // 合并extends和mixins
  // 只对未合并过的options做处理，因为只有已经合并的options才有_base属性
  // 没有_base属性，说明child是一个原始的选项对象，而不是另一个mergeOptions处理后的结果
  // child._base是在initGlobalAPI的时候添加至options的，其值为Vue
  // 合并时是将extends和mixins合并至parent，合并后的parent已经是一个新的对象
  // 由于会递归调用mergeOptions，所以mixins和extends是支持嵌套的

  // 由于extends比mixin先处理，mixins又比组件实例的选项先处理，所以合并后的一些选项执行
  // 的优先级是extends > mixins > component，比如created钩子
  // 而对于一些使用覆盖合并策略的选项，则component会覆盖mixins，mixins会覆盖extends，如props、data、methods
  if (!child._base) {
    // 合并extends
    // extend用于声明扩展另一个组件 (可以是一个简单的选项对象或构造函数)，
    // 而无需使用 Vue.extend。这主要是为了便于扩展单文件组件
    if (child.extends) {
      parent = mergeOptions(parent, child.extends, vm);
    }
    // 合并mixins
    // mixins里每一项的格式都是跟options一致的，按照声明的顺序合并至parent
    // 相同的options选项会合并，最终parent会变成一个合并后的新的options，
    // 后续child也有对应的options选项时，则也可以覆盖掉parent对应的options选项
    if (child.mixins) {
      for (let i = 0, l = child.mixins.length; i < l; i++) {
        parent = mergeOptions(parent, child.mixins[i], vm);
      }
    }
  }

  // 根据不同选项的合并策略合并parent和child，返回新合并后的options
  const options = {};
  let key;
  for (key in parent) {
    mergeField(key);
  }
  for (key in child) {
    if (!hasOwn(parent, key)) {
      mergeField(key);
    }
  }
  function mergeField(key) {
    const strat = strats[key] || defaultStrat; // 获取合并策略
    options[key] = strat(parent[key], child[key], vm, key);
  }
  return options;
}

/**
 * Resolve an asset.
 * This function is used because child instances need access
 * to assets defined in its ancestor chain.
 * 从给定的目标对象中解析一个资源
 * 使用该函数是因为子实例需要访问到祖先链中定义的资源
 * 如从实例的vm.$options['directives']中获取资源
 */
export function resolveAsset(
  options: Object,
  type: string,
  id: string,
  warnMissing?: boolean
): any {
  /* istanbul ignore if */
  if (typeof id !== "string") {
    return;
  }
  const assets = options[type];
  // check local registration variations first
  // 优先从自身找到对应的资源
  if (hasOwn(assets, id)) return assets[id]; // 有该资源
  const camelizedId = camelize(id);
  if (hasOwn(assets, camelizedId)) return assets[camelizedId]; // id转为驼峰后有该资源
  const PascalCaseId = capitalize(camelizedId);
  if (hasOwn(assets, PascalCaseId)) return assets[PascalCaseId]; // id转为大驼峰后有该资源
  // fallback to prototype chain
  // 只有以上都找不到则从原型上查找上面的各个资源
  const res = assets[id] || assets[camelizedId] || assets[PascalCaseId];
  // 都找不到则报错了
  if (process.env.NODE_ENV !== "production" && warnMissing && !res) {
    warn("Failed to resolve " + type.slice(0, -1) + ": " + id, options);
  }
  return res;
}
