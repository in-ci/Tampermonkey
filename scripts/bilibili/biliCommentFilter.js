// ==UserScript==
// @name         Bilibili 评论API拦截过滤
// @version      2026.09.28.7.33
// @description  Hook API response，过滤评论后再返回浏览器渲染
// @author       inci
// @license      MIT
// @namespace    https://github.com/in-ci/Tampermonkey
// @updateURL    https://raw.githubusercontent.com/in-ci/Tampermonkey/main/scripts/bilibili/biliCommentFilter.js
// @downloadURL  https://raw.githubusercontent.com/in-ci/Tampermonkey/main/scripts/bilibili/biliCommentFilter.js
// @require      https://raw.githubusercontent.com/in-ci/Tampermonkey/main/scripts/bilibili/biliKeyword.js
// @require      https://raw.githubusercontent.com/in-ci/Tampermonkey/main/scripts/_common/common-logs.js
// @match        *://*.bilibili.com/*
// @exclude      *://api.bilibili.com/*
// @exclude      *://api.*.bilibili.com/*
// @exclude      *://*.bilibili.com/api/*
// @exclude      *://member.bilibili.com/studio/bs-editor/*
// @exclude      *://t.bilibili.com/h5/dynamic/specification
// @exclude      *://bbq.bilibili.com/*
// @exclude      *://message.bilibili.com/pages/nav/header_sync
// @exclude      *://s1.hdslb.com/bfs/seed/jinkela/short/cols/iframe.html
// @exclude      *://open-live.bilibili.com/*
// @exclude      *://*.bilibili.com/v/popular/*
// @grant        none
// @icon         https://www.bilibili.com/favicon.ico
// ==/UserScript==

(() => {
  "use strict";

  // 脚本名称
  const JS_NAMESPACE = "biliCommentFilter";

  // 过滤关键字 xKeyword.js导出
  const {
    commentRegex,
    nameRegex,
    signRegex,
    nameExact,
    uidExact,
    belowLevel,
  } = globalThis.__BilibiliLib;

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

  /**
   * return
   */
  function retResult(status = false, reason = "") {
    return { status, reason };
  }

  /**
   * 创建关键词匹配器 , 支持:
   * 普通关键词: "交流群"
   * 正则: "/交流群\d+/"
   */
  function createKeywordReg(list) {
    if (!Array.isArray(list) || list.length === 0) {
      return {
        test() {
          return false;
        },
      };
    }

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
        } catch (e) {
          log.warn("无效正则:", rule);
        }
      } else {
        // 普通字符串
        // 转义正则字符
        regexList.push(new RegExp(rule.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      }
    }

    // 过滤后没有有效规则
    if (regexList.length === 0) {
      return {
        test() {
          return false;
        },
      };
    }

    /*
     * 返回一个具有 test 方法的匹配器
     * 保持和 RegExp.test() 使用方式一致
     */
    return {
      test(text) {
        if (!text) {
          return false;
        }

        return regexList.some((reg) => {
          /*
           * 防止未来误使用 g 标记
           * 导致 lastIndex 影响结果
           */
          reg.lastIndex = 0;
          return reg.test(text);
        });
      },
    };
  }

  // 创建匹配规则映射
  const banRules = {
    comments: {
      comment: createKeywordReg(commentRegex),
    },

    user: {
      // 用户名 模糊匹配
      nameRegex: createKeywordReg(nameRegex),
      // 用户名 精确匹配
      nameExact: new Set(nameExact),
      // uid 精确匹配
      uidExact: new Set(uidExact),
      // 用户简介 模糊匹配
      signRegex: createKeywordReg(signRegex),
    },
  };

  // 匹配规则辅助函数
  function matchRegex(text, reg) {
    return !!text && reg.test(text);
  }

  function matchExact(value, set) {
    return !!value && set.has(String(value));
  }

  // 判断用户是否需要屏蔽
  function filterUser(member) {
    if (!member) {
      return retResult();
    }

    // 屏蔽低于 banBelowLevel等级 的用户
    const level = member.level_info.current_level || 6;
    if (level < belowLevel) {
      return retResult(true, `用户等级匹配(${level})`);
    }

    // 屏蔽用户
    const name = member.uname || "";

    // 模糊匹配用户名
    if (matchRegex(name, banRules.user.nameRegex)) {
      return retResult(true, `用户名规则匹配(${name})`);
    }

    // 精确匹配用户名
    if (matchExact(name, banRules.user.nameExact)) {
      return retResult(true, `用户名精确匹配(${name})`);
    }

    // 精确匹配UID
    const uid = member.mid || "";
    if (matchExact(uid, banRules.user.uidExact)) {
      return retResult(true, `UID精确匹配(${uid})`);
    }

    const sign = member.sign || "";
    if (matchRegex(sign, banRules.user.signRegex)) {
      return retResult(true, `用户简介规则匹配(${sign})`);
    }

    return retResult();
  }

  /*************************************************
   *  评论数据过滤核心逻辑
   *************************************************/
  function filterReplyData(json, source = "") {
    try {
      const replies = json?.data?.replies;
      if (!Array.isArray(replies)) return json;

      const before = replies.length;

      json.data.replies = replies.filter((r) => {
        if (!r) return false;

        // 主评论过滤
        const r_result = filterUser(r.member);
        if (r_result.status) {
          log.debug(
            `${r}\r\n[BLOCK MAIN USER] ${r.member?.uname}, ${r_result.reason}`,
          );
          return false;
        }

        if (matchRegex(r.content?.message, banRules.comments.comment)) {
          log.debug(`${r}\r\n[BLOCK MAIN TEXT] ${r.content?.message}`);
          return false;
        }

        // 楼中楼过滤
        if (Array.isArray(r.replies)) {
          r.replies = r.replies.filter((rr) => {
            const rr_result = filterUser(rr.member);
            if (rr_result.status) {
              log.debug(
                `${rr}\r\n[BLOCK SUB USER] ${rr.member?.uname}, ${rr_result.reason}`,
              );
              return false;
            }

            if (matchRegex(rr.content?.message, banRules.comments.comment)) {
              log.debug(`${rr}\r\n[BLOCK SUB TEXT] ${rr.content?.message}`);
              return false;
            }

            return true;
          });
        }

        return true;
      });

      log.debug(
        `[FILTER DONE] ${source}`,
        `before=${before}, after=${json.data.replies.length}`,
      );

      return json;
    } catch (e) {
      log.warn("[FILTER ERROR]", e);
      return json;
    }
  }

  /*************************************************
   *  fetch hook（核心）
   *************************************************/
  const rawFetch = window.fetch;

  window.fetch = async function (...args) {
    const url = args[0]?.url || args[0];
    const res = await rawFetch(...args);

    try {
      if (
        typeof url === "string" &&
        (url.includes("/x/v2/reply") || url.includes("/x/v2/reply/wbi/main"))
      ) {
        log.debug("[FETCH HIT]", url);

        const clone = res.clone();
        const json = await clone.json();

        const filtered = filterReplyData(json, "fetch");

        return new Response(JSON.stringify(filtered), {
          status: res.status,
          statusText: res.statusText,
          headers: res.headers,
        });
      }
    } catch (e) {
      log.warn("[FETCH HOOK ERROR]", e);
    }

    return res;
  };

  /*************************************************
   *  XHR hook（兼容旧请求）
   *************************************************/
  const open = XMLHttpRequest.prototype.open;
  const send = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this._url = url;
    return open.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    this.addEventListener("readystatechange", function () {
      if (this.readyState !== 4) return;

      try {
        if (this._url?.includes("/x/v2/reply")) {
          log.debug("[XHR HIT]", this._url);

          const json = JSON.parse(this.responseText);

          const filtered = filterReplyData(json, "xhr");

          Object.defineProperty(this, "responseText", {
            value: JSON.stringify(filtered),
          });
        }
      } catch (e) {
        log.warn("[XHR HOOK ERROR]", e);
      }
    });

    return send.apply(this, arguments);
  };

  /*************************************************
   *  启动提示
   *************************************************/
  log.trace("initialized");
})();
