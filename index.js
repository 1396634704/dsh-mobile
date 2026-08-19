// dsh-mobile host 面空实现：本插件为纯 client 面移动端适配（CSS + DOM），
// 无 host 服务。保留本文件是为了让 DSH 的 loader 行加载不报缺失。
const name = "dsh-mobile";
const inject = [];
/** 空入口：无 host 面行为。 */
function apply() {}
export { apply, inject, name };
