/* global globalThis */

// ==UserScript==
// @name         X(Twitter) API拦截过滤
// @version      1.0.5
// @description  Hook API response，过滤问题后再返回浏览器渲染
// @author       inci
// @license      MIT
// @namespace    https://github.com/in-ci/Tampermonkey
// @updateURL    https://raw.githubusercontent.com/in-ci/Tampermonkey/main/scripts/x_twitter/xProblemFilter.js
// @downloadURL  https://raw.githubusercontent.com/in-ci/Tampermonkey/main/scripts/x_twitter/xProblemFilter.js
// @require      https://raw.githubusercontent.com/in-ci/Tampermonkey/main/scripts/x_twitter/xKeyword.js
// @require      https://raw.githubusercontent.com/in-ci/Tampermonkey/main/scripts/_common/common-logs.js
// @match        *://*.x.com/*
// @grant        none
// @run-at       document-start
// @icon         https://abs.twimg.com/responsive-web/client-web/icon-ios.77d25eb62d3da71ba.png
// ==/UserScript==

(() => {
  "use strict";

  // 脚本名称
  const JS_NAMESPACE = "X(Twitter)ProblemFilter";

  // 过滤关键字 xKeyword.js导出
  const { postCommentUidExact, postCommentNameRegex, postCommentText } =
    globalThis.__X_TwitterLib;

  /**
   * log  common-logs.js导出
   *
   * DebugLevel             log使用
   *
   * OFF   : 关闭全部日志
   * TRACE : 最详细         log.trace()
   * DEBUG : 调试信息       log.debug()
   * INFO  : 一般信息       log.info()
   * WARN  : 警告           log.warn()
   * ERROR : 错误           log.error()
   */
  const { DebugLevel, createLogger } = globalThis.__CommonLib;
  const log = createLogger(JS_NAMESPACE, DebugLevel.INFO);

  /*************************************************
   * TARGET URL
   *************************************************/
  const FilterTag = Object.freeze({
    P: "P", // posts 帖子
    A: "A",
  });

  // https://x.com/i/api/graphql/FyR-GrebyjdkRoW1z6uCgQ/TweetDetail?variables
  const TARGET_PATTERNS_POSTS_PREFIX = "/i/api/graphql/";
  const TARGET_PATTERNS_POSTS = [
    /\/i\/api\/graphql\/[^/?]+\/TweetDetail(?:\?|$)/, // Twitter 帖子
  ];

  // 将多个数组统一管理，带标签
  const PATTERN_GROUPS = [
    {
      tag: FilterTag.P,
      patterns: TARGET_PATTERNS_POSTS,
      prefix: TARGET_PATTERNS_POSTS_PREFIX,
    },
  ];

  function matchTarget(url) {
    if (typeof url !== "string") return { matched: false, tag: null };

    for (const group of PATTERN_GROUPS) {
      // 先做字符串前缀检查（O(1)），排除绝大多数无关请求
      if (!url.includes(group.prefix)) {
        continue;
      }

      if (group.patterns.some((re) => re.test(url))) {
        return { matched: true, tag: group.tag };
      }
    }
    return { matched: false, tag: null };
  }

  /**
   * return
   */
  function retResult(status = false, reason = "") {
    return { status, reason };
  }

  // 共享空匹配器，避免重复创建
  const NEVER_MATCH = { test: () => false };

  // 创建关键词匹配器 , 支持: 普通关键词 ， 正则(格式： "/xxxxxxx/")
  function createKeywordReg(list) {
    if (!Array.isArray(list) || list.length === 0) return NEVER_MATCH;

    const regexList = [];

    for (const item of list) {
      if (!item) continue;

      const rule = String(item).trim();
      if (!rule) continue;

      // 判断正则格式  /xxx/
      const match = rule.match(/^\/(.+)\/$/);

      if (match) {
        try {
          regexList.push(new RegExp(match[1]));
        } catch (_) {
          log.warn(`无效正则: ${rule}`);
        }
      } else {
        // 普通字符串 → 转义后构造正则
        regexList.push(new RegExp(rule.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      }
    }

    // 过滤后没有有效规则
    if (regexList.length === 0) return NEVER_MATCH;

    /*
     * 返回一个具有 test 方法的匹配器
     * 保持和 RegExp.test() 使用方式一致
     */
    return {
      test(text) {
        if (!text) return false;

        return regexList.some((reg) => {
          // 防止未来误使用 g 标记 , 导致 lastIndex 影响结果
          reg.lastIndex = 0;
          return reg.test(text);
        });
      },
    };
  }

  // 创建匹配规则映射
  const banRules = {
    posts: {
      // 帖子回复评论发布者UID 精确匹配
      post_CommentAuthorUidExact: new Set(postCommentUidExact),

      // 帖子回复评论发布者 正则匹配
      post_CommentAuthorNameRegex: createKeywordReg(postCommentNameRegex),

      // 帖子回复评论
      post_CommentContent: createKeywordReg(postCommentText),
    },
  };

  // 匹配规则辅助函数
  function matchKeywordRegex(text, reg) {
    return !!text && reg.test(text);
  }

  function matchKeywordExact(text, reg) {
    return !!text && reg.has(String(text));
  }

  function isBanUser(user, reg) {
    if (!user || !reg) {
      return retResult();
    }

    // UID
    const bUid = user.screen_name || "";

    // 精确匹配UID
    if (matchKeywordExact(bUid, reg.post_CommentAuthorUidExact)) {
      return retResult(true, `UID精确匹配(${bUid})`);
    }

    // 用户名
    const bName = user.name || "";
    // 模糊匹配用户名
    if (matchKeywordRegex(bName, reg.post_CommentAuthorNameRegex)) {
      return retResult(true, `用户名规则匹配(${bName})`);
    }

    return retResult();
  }

  /*************************************************
   * 业务过滤逻辑处理函数
   *************************************************/
  function filterJsonResponse(json, tag, url) {
    log.trace(
      "[filterJsonResponse]",
      "json =",
      json,
      "tag =",
      tag,
      "url =",
      url,
    );

    let changed = false;

    const f_instructions =
      json?.data?.threaded_conversation_with_injections_v2?.instructions;

    // 无数据时直接返回原引用（安全，未修改）
    if (!Array.isArray(f_instructions)) return { changed: false, json };

    // 1. 动态查找 TimelineAddEntries 指令（无需硬编码 [1]，兼顾安全与简洁）
    const targetInstruction = f_instructions.find(
      (t_instructions) =>
        t_instructions?.type === "TimelineAddEntries" &&
        Array.isArray(t_instructions?.entries),
    );

    if (!targetInstruction) {
      return { changed: false, json };
    }

    const entries = targetInstruction.entries;
    const initialLength = entries.length;

    // 2. 直接对 entries 进行过滤
    const filteredEntries = entries.filter((f_entries) => {
      if (!f_entries) return false;

      if (
        f_entries.entryId &&
        /^conversationthread-\d+$/.test(f_entries.entryId)
      ) {
        const f_items = f_entries?.content?.items;
        if (!f_items) return false;

        const itemsLength = f_items.length;

        const filteredItems = f_items.filter((f_item) => {
          if (!f_item) return false;

          if (
            f_item.entryId &&
            /^conversationthread-\d+?-tweet-\d+$/.test(f_item.entryId)
          ) {
            //  获取用户名称
            const f_author =
              f_item?.item?.itemContent?.tweet_results?.result?.core
                ?.user_results?.result?.core;

            const f_result = isBanUser(f_author, banRules.posts);
            if (f_result.status) {
              log.info(
                `[BLOCK Comment Author] ${f_author?.name}, ${f_result.reason}`,
              );
              changed = true;
              return false;
            }

            // log.debug("[filterJsonResponse f_author]", f_author);

            // 获取评论的内容
            const ftext =
              f_item?.item?.itemContent?.tweet_results?.result?.legacy
                ?.full_text;

            if (matchKeywordRegex(ftext, banRules.posts.post_CommentContent)) {
              log.info(`[BLOCK Comment Text] ${ftext}`);
              changed = true;
              return false;
            }
            // log.debug("[filterJsonResponse ftext]", ftext);
          }

          return true; // 保留评论
        });

        if (filteredItems.length !== itemsLength) {
          // !== 0 有评论或者回复被删除，但是没有被全部删除
          changed = true;

          // === 0 该条目的所以评论和回复都被删除
          if (filteredItems.length === 0) {
            // 删除整条 entries
            return false;
          }

          f_entries.content.items = filteredItems;
        }
      }

      return true;
    });

    // 3. 检查是否有评论被删减
    if (filteredEntries.length !== initialLength) {
      targetInstruction.entries = filteredEntries; // 原地替换
      changed = true;
    }

    return { changed, json };
  }

  /*************************************************
   * 1. Hook XMLHttpRequest (X.com GraphQL 主要使用的网络库)
   *************************************************/
  function installXhrInterceptor() {
    if (XMLHttpRequest.prototype.__X_PROBLEM_FILTER_HOOKED__) {
      return;
    }
    XMLHttpRequest.prototype.__X_PROBLEM_FILTER_HOOKED__ = true;

    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;

    // 获取原型链上原始的 responseText / response 描述符
    const rawTextGetter = Object.getOwnPropertyDescriptor(
      XMLHttpRequest.prototype,
      "responseText",
    )?.get;
    const rawResponseGetter = Object.getOwnPropertyDescriptor(
      XMLHttpRequest.prototype,
      "response",
    )?.get;

    XMLHttpRequest.prototype.open = function (method, url, ...args) {
      this._url = typeof url === "string" ? url : url ? url.href : "";
      return origOpen.apply(this, [method, url, ...args]);
    };

    XMLHttpRequest.prototype.send = function (body) {
      const url = this._url;

      if (url && !this._hasFilterListener) {
        const { matched, tag } = matchTarget(url);

        if (matched) {
          log.debug("[XHR 匹配到目标URL]", url);
          this._hasFilterListener = true;
          this._filterTag = tag;

          // 按需过滤并缓存结果的内部函数
          const getFilteredResponse = () => {
            // 只有请求成功完成时才进行拦截处理
            if (this.readyState !== 4 || this.status !== 200) {
              return {
                text: rawTextGetter ? rawTextGetter.call(this) : "",
                response: rawResponseGetter
                  ? rawResponseGetter.call(this)
                  : null,
              };
            }

            // 已处理过直接返回缓存，避免重复计算
            if (this._isFilteredDone) {
              return {
                text: this._modifiedResponseText,
                response: this._modifiedResponse,
              };
            }

            this._isFilteredDone = true;

            const responseType = this.responseType;
            let rawData = null;

            try {
              if (responseType === "" || responseType === "text") {
                const rawText = rawTextGetter ? rawTextGetter.call(this) : "";
                if (rawText) rawData = JSON.parse(rawText);
              } else if (responseType === "json") {
                rawData = rawResponseGetter
                  ? rawResponseGetter.call(this)
                  : null;
              }

              if (rawData) {
                const { changed, json: newJson } = filterJsonResponse(
                  rawData,
                  this._filterTag,
                  url,
                );

                if (changed) {
                  log.debug("[XHR FILTERED RESPONSE]", url);
                  this._modifiedResponseText = JSON.stringify(newJson);
                  this._modifiedResponse =
                    responseType === "json"
                      ? newJson
                      : this._modifiedResponseText;
                } else {
                  this._modifiedResponseText = rawTextGetter
                    ? rawTextGetter.call(this)
                    : "";
                  this._modifiedResponse = rawResponseGetter
                    ? rawResponseGetter.call(this)
                    : rawData;
                }
              }
            } catch (e) {
              log.error("[XHR FILTER FAILED]", url, e);
              this._modifiedResponseText = rawTextGetter
                ? rawTextGetter.call(this)
                : "";
              this._modifiedResponse = rawResponseGetter
                ? rawResponseGetter.call(this)
                : null;
            }

            return {
              text: this._modifiedResponseText,
              response: this._modifiedResponse,
            };
          };

          // 重写 responseText 和 response getter（在被调用的第一时间同步拦截并过滤）
          try {
            Object.defineProperty(this, "responseText", {
              get() {
                return getFilteredResponse().text;
              },
              configurable: true,
              enumerable: true,
            });

            Object.defineProperty(this, "response", {
              get() {
                return getFilteredResponse().response;
              },
              configurable: true,
              enumerable: true,
            });
          } catch (err) {
            log.warn("[XHR DEFINE PROPERTY FAILED]", url, err);
          }
        }
      }

      return origSend.apply(this, arguments);
    };

    log.debug("[INSTALL OK]", "XHR interceptor installed");
  }

  /*************************************************
   * 初始化
   *************************************************/
  log.trace("[START] ", JS_NAMESPACE, " 脚本启动");

  installXhrInterceptor();
})();
