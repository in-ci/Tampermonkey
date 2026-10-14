/* global globalThis */

// ==UserScript==
// @name         bilibili过滤的关键词
// @version      2026.10.14.23
// @namespace    https://github.com/in-ci/Tampermonkey
// @description  bilibili过滤的关键词
// @author       inci
// @license      MIT
// ==/UserScript==

(() => {
  "use strict";

  /******************************* 过滤内容匹配 ***************************************/

  // 模糊匹配支持正则，正则格式： /xxxxxx/
  // 精确匹配不支持正则
  // ⭐ 将所有配置集中声明，新增/删除字段只需改这一处
  const defaultConfig = {
    // 屏蔽指定 关键字 的评论（模糊匹配）
    // prettier-ignore
    commentRegex : [
      "交流群","问了吗","邀请码","大佬帮我","托管日常","打起来","/[盖的]楼/","/^@.*/","/^\d+$/","/^再见了.*/",
      "/^[(（].*[)）]$/","/(生日|周年)快乐/","/(?<!\d)\d{8,10}(?!\d)/g"
    ],

    // 屏蔽指定 用户名 的评论（模糊匹配）
    // prettier-ignore
    nameRegex : [
      "bili_", "/[Tt][0Oo]/", "流量", "大王"
    ],

    // 依据用户简介关键字屏蔽（模糊匹配）
    // prettier-ignore
    signRegex : [],

    // 屏蔽指定 用户名 的评论（精准匹配）
    // prettier-ignore
    nameExact : [],

    // 屏蔽指定 uid 的评论（精准匹配）
    // prettier-ignore
    uidExact : [],

    // 屏蔽 belowLevel 级 以下的评论 ， 例如：3 ，则屏蔽 0、1、2 级下的评论
    belowLevel: 3,
  };
  /*
   * ============================================================
   * 暴露 API
   * ============================================================
   */
  const BilibiliLib =
    globalThis.__BilibiliLib ?? (globalThis.__BilibiliLib = {});

  // 设置字段
  for (const [key, value] of Object.entries(defaultConfig)) {
    BilibiliLib[key] ??= value;
  }
})();
