/* @flow */

import { inBrowser } from "core/util/env";
import { makeMap } from "shared/util";

// svg和math标签的命名空间
export const namespaceMap = {
  svg: "http://www.w3.org/2000/svg",
  math: "http://www.w3.org/1998/Math/MathML"
};

// 判断是否为html相关白哦前
export const isHTMLTag = makeMap(
  "html,body,base,head,link,meta,style,title," +
    "address,article,aside,footer,header,h1,h2,h3,h4,h5,h6,hgroup,nav,section," +
    "div,dd,dl,dt,figcaption,figure,picture,hr,img,li,main,ol,p,pre,ul," +
    "a,b,abbr,bdi,bdo,br,cite,code,data,dfn,em,i,kbd,mark,q,rp,rt,rtc,ruby," +
    "s,samp,small,span,strong,sub,sup,time,u,var,wbr,area,audio,map,track,video," +
    "embed,object,param,source,canvas,script,noscript,del,ins," +
    "caption,col,colgroup,table,thead,tbody,td,th,tr," +
    "button,datalist,fieldset,form,input,label,legend,meter,optgroup,option," +
    "output,progress,select,textarea," +
    "details,dialog,menu,menuitem,summary," +
    "content,element,shadow,template,blockquote,iframe,tfoot"
);

// this map is intentionally selective, only covering SVG elements that may
// contain child elements.
// 判断是否为svg相关标签
export const isSVG = makeMap(
  "svg,animate,circle,clippath,cursor,defs,desc,ellipse,filter,font-face," +
    "foreignObject,g,glyph,image,line,marker,mask,missing-glyph,path,pattern," +
    "polygon,polyline,rect,switch,symbol,text,textpath,tspan,use,view",
  true
);

// 判断是否为pre标签
export const isPreTag = (tag: ?string): boolean => tag === "pre";

// 检测是否为保留标签，有html和svg相关的标签
export const isReservedTag = (tag: string): ?boolean => {
  return isHTMLTag(tag) || isSVG(tag);
};

// 获取命名空间，支持svg和math相关标签，分别返回svg和math
export function getTagNamespace(tag: string): ?string {
  if (isSVG(tag)) {
    return "svg";
  }
  // basic support for MathML
  // note it doesn't support other MathML elements being component roots
  if (tag === "math") {
    return "math";
  }
}

// 获取是否为无效的html标签
// 1. 非浏览器环境下永远返回true，表示所有元素都是未知的
// 2. html和svg标签直接返回false
// 3. 其它的标签会尝试创建元素然后判断是否为未知元素，同时会将结果缓存，避免重复判断
const unknownElementCache = Object.create(null); // 缓存，避免重复判断用的
export function isUnknownElement(tag: string): boolean {
  /* istanbul ignore if */
  if (!inBrowser) {
    return true;
  }
  if (isReservedTag(tag)) {
    return false;
  }
  tag = tag.toLowerCase();
  /* istanbul ignore if */
  if (unknownElementCache[tag] != null) {
    return unknownElementCache[tag];
  }
  // 一般来讲创建元素的元素如果不是有效元素的，其toString()后结果为[object HTMLUnknownElement]
  // 但是如果元素是含有“-”的，无论元素是否有效，其toString()后结果为[object HTMLElement]
  // 这是因为包含'-'的标签的被认为是自定义元素，因此针对自定义元素需要额外的判断逻辑
  // 对于自定义元素，如果元素的名称不符合规范，那么元素的构造函数就是HTMLUnknownElement，如"A-a"
  // 对于合法的自定义元素，如果元素已经注册了，那么创建的元素就会有自己的构造函数（不是window.HTMLElement）
  //如果元素没有注册，那么其构造函数就是window.HTMLElement
  const el = document.createElement(tag);
  if (tag.indexOf("-") > -1) {
    // http://stackoverflow.com/a/28210364/1070244
    return (unknownElementCache[tag] =
      el.constructor === window.HTMLUnknownElement || // 自定义标签不合法
      el.constructor === window.HTMLElement); // 自定义标签没有注册
  } else {
    return (unknownElementCache[tag] = /HTMLUnknownElement/.test(
      el.toString()
    )); // [object HTMLUnknownElement]
  }
}

// 检测是否为合法的input标签的类型
export const isTextInputType = makeMap(
  "text,number,password,search,email,tel,url"
);
