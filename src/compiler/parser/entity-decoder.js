/* @flow */

let decoder
// 将实体字符解码为html符号
export default {
  decode (html: string): string {
    decoder = decoder || document.createElement('div')
    decoder.innerHTML = html
    return decoder.textContent
  }
}
