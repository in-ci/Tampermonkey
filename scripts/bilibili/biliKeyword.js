/* global globalThis */

// ==UserScript==
// @name         bilibili过滤的关键词
// @version      2026.9.28.8
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

  // 屏蔽指定 关键字 的评论（模糊匹配）
  // prettier-ignore
  let commentRegex = [
    "交流群","问了吗","邀请码","大佬帮我","托管日常","打起来","的楼","/^@.*/","/^\d+$/","/^再见了.*/",
    "/^[(（].*[)）]$/"
  ];

  // 屏蔽指定 用户名 的评论（模糊匹配）
  // prettier-ignore
  let nameRegex = [
    "bili_", "/[Tt][0o]/", "流量", "大王"
  ];

  // 依据用户简介关键字屏蔽（模糊匹配）
  // prettier-ignore
  let signRegex = [];

  // 屏蔽指定 用户名 的评论（精准匹配）
  // prettier-ignore
  let nameExact = [];

  // 屏蔽指定 uid 的评论（精准匹配）
  // prettier-ignore
  let uidExact = [];

  // 屏蔽 belowLevel 级 以下的评论 ， 例如：3 ，则屏蔽 0、1、2 级下的评论
  const belowLevel = 3;

  /*
   * ============================================================
   * 暴露 API
   * ============================================================
   */
  const BilibiliLib =
    globalThis.__BilibiliLib ?? (globalThis.__BilibiliLib = {});

  /*
   * 防止重复覆盖。
   */
  BilibiliLib.commentRegex ??= commentRegex;
  BilibiliLib.nameRegex ??= nameRegex;
  BilibiliLib.signRegex ??= signRegex;
  BilibiliLib.nameExact ??= nameExact;
  BilibiliLib.uidExact ??= uidExact;
  BilibiliLib.belowLevel ??= belowLevel;
})();
