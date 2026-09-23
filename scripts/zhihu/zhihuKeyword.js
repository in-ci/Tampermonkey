/* global globalThis */

// ==UserScript==
// @name         知乎过滤的关键词
// @version      1.0.0
// @namespace    https://github.com/in-ci/Tampermonkey
// @description  知乎过滤的关键词
// @author       inci
// @license      MIT
// ==/UserScript==

(() => {
  "use strict";

  /******************************* 过滤内容匹配 ***************************************/

  // 模糊匹配支持正则，正则格式： /xxxxxx/
  // 精确匹配不支持正则

  /**
   * 用户优先级: 用户UID > 用户名(正则) > 用户名(精确) > 用户简介
   *
   * 总优先级： 标题关键字 > 问题提出的用户优先级 > 回答的用户优先级
   */

  // ==================== 问题屏蔽配置 ====================
  // 屏蔽提问 标题关键字（正则匹配）
  // prettier-ignore
  let qTitleRegex = [
    "复制粘贴","泥石流","买电脑","网站推荐","宏大叙事","流量卡","凡人修仙","乒乓球","动物法","天涯","房价","春晚","汽车","伪史",
    "值得关注","汉服","中医","学生党","相亲","黑神话","华为","鸿蒙","国足","电竞","内存","斩杀线","正能量","小说推荐","预言",
    "黄金","旅游","耽美","山姆","单机","高考","漫画","人口","以色列","伊朗","外挂","散户","月销量","烂尾楼","韭菜","剪贴板",

    "/[Aa炒].?股/","/[牢大][Aa]/","/股[民票市价]/","/[牛熊]市/","/[Uu][Pp].?主/","/nga/i","/mac/i", "/gdp/i","/嫖[娼客]/",
    "/[男女][权拳性朋装]/","/[男女]主[义文内外小]/","/[结订求新离]婚/","/少年(团|组合)/","/[甜虐]文/","/[篮足排乓棒毛]球/",
    "/如果(给你|只能|你要|你想|是你)/","/概率(多少|是|大)/","/的(小说|文)/","/马(督工|斯克|前卒)/","/[开收]盘/","/[Kk均]线/",
    "/民族(主义|问题|融合)/","/如何(化解)/","/[基股]金/","/[涨跌]停/","/[IiEe][NnSs][TtFf][JjPp]/"
  ];

  // ==================== 提问屏蔽配置 ====================
  // 屏蔽提问 问题提出的用户名 （正则匹配）
  let qNameRegex = [];

  // 屏蔽提问 问题提出的用户名 （精准匹配）
  let qNameExact = [];

  // 屏蔽提问 问题提出的用户UID （精准匹配）
  // prettier-ignore
  let qUidExact = [
    "ds-54-36","zhao-zi-han-58-57","71-40-19-83-89","da-shen-shuo-82","17sui-shao-nu-59","yi-bo-zui-shuai","kiki-8-31-7",

    // 提问机器人
    "97-88-88-89"
  ];

  // 屏蔽提问 问题提出的用户简介 （正则匹配）
  let qBioRegex = [];

  // ==================== 回答屏蔽配置 ====================
  // 屏蔽回答 回答的用户名 （正则匹配）
  let aNameRegex = [];

  // 屏蔽回答 回答的用户名 （精准匹配）
  let aNameExact = [];

  // 屏蔽回答 回答的用户UID （精准匹配）
  // prettier-ignore
  let aUidExact = [
    "ds-54-36","zhao-zi-han-58-57","71-40-19-83-89","da-shen-shuo-82","17sui-shao-nu-59"
  ];

  // 屏蔽回答 回答的用户简介 （正则匹配）
  let aBioRegex = [];

  /*
   * ============================================================
   * 暴露 API
   * ============================================================
   */
  const ZhihuLib = globalThis.__ZhihuLib ?? (globalThis.__ZhihuLib = {});

  /*
   * 防止重复覆盖。
   */
  // 问题相关屏蔽规则
  ZhihuLib.qTitleRegex ??= qTitleRegex;
  ZhihuLib.qNameRegex ??= qNameRegex;
  ZhihuLib.qNameExact ??= qNameExact;
  ZhihuLib.qUidExact ??= qUidExact;
  ZhihuLib.qBioRegex ??= qBioRegex;

  // 回答相关屏蔽规则
  ZhihuLib.aNameRegex ??= aNameRegex;
  ZhihuLib.aNameExact ??= aNameExact;
  ZhihuLib.aUidExact ??= aUidExact;
  ZhihuLib.aBioRegex ??= aBioRegex;
})();
