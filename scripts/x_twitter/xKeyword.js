/* global globalThis */

// ==UserScript==
// @name         x(twitter)过滤的关键词
// @version      1.0.0
// @namespace    https://github.com/in-ci/Tampermonkey
// @description  x(twitter)过滤的关键词
// @author       inci
// @license      MIT
// ==/UserScript==

(() => {
  "use strict";

  /******************************* 过滤内容匹配 ***************************************/

  // 模糊匹配支持正则，正则格式： /xxxxxx/
  // 精确匹配不支持正则

  // 帖子回复评论发布者UID 精确匹配
  let postCommentUidExact = [];

  // 帖子回复评论发布者用户名 正则匹配
  // prettier-ignore
  let postCommentNameRegex = [
    "/[男女]?炮友?/","配对","同城","主页","无偿约","开云"
  ];

  // 帖子回复评论
  // prettier-ignore
  let postCommentText = [
    "/@[Gg][Ee][Tt][Xx][Bb][Oo][TtXx]/","/@.*?保存视频/","/[没比][她我它他](骚|sao)/","福不黑","真顶不住"
  ];

  /*
   * ============================================================
   * 暴露 API
   * ============================================================
   */
  const X_TwitterLib =
    globalThis.__X_TwitterLib ?? (globalThis.__X_TwitterLib = {});

  /*
   * 防止重复覆盖。
   */
  X_TwitterLib.postCommentUidExact ??= postCommentUidExact;
  X_TwitterLib.postCommentNameRegex ??= postCommentNameRegex;
  X_TwitterLib.postCommentText ??= postCommentText;
})();
