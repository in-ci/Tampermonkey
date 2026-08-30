// ==UserScript==
// @name         知乎问题API拦截过滤
// @namespace    zhihuProblemFilter
// @version      1.0.1
// @description  Hook API response，过滤问题后再返回浏览器渲染
// @author       inci
// @license      MIT
// @updateURL    https://raw.githubusercontent.com/in-ci/Tampermonkey/main/zhihuProblemFilter.js
// @downloadURL  https://raw.githubusercontent.com/in-ci/Tampermonkey/main/zhihuProblemFilter.js
// @match        *://*.zhihu.com/*
// @exclude      *://static.zhihu.com.com/*
// @grant        none
// @run-at       document-start
// @icon         https://static.zhihu.com/heifetz/favicon.ico
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
  let banQuestionTitleRegexMap = [];

  // ==================== 提问屏蔽配置 ====================
  // 屏蔽提问 问题提出的用户名 （正则匹配）
  let banQuestionUserNameRegexMap = [];

  // 屏蔽提问 问题提出的用户名 （精准匹配）
  let banQuestionUserNameExactMap = [];

  // 屏蔽提问 问题提出的用户UID （精准匹配）
  let banQuestionUserUidExactMap = ["ds-54-36"];

  // 屏蔽提问 问题提出的用户简介 （正则匹配）
  let banQuestionUserBioRegexMap = [];

  // ==================== 回答屏蔽配置 ====================
  // 屏蔽回答 回答的用户名 （正则匹配）
  let banAnswerUserNameRegexMap = [];

  // 屏蔽回答 回答的用户名 （精准匹配）
  let banAnswerUserNameExactMap = [];

  // 屏蔽回答 回答的用户UID （精准匹配）
  let banAnswerUserUidExactMap = ["ds-54-36"];

  // 屏蔽回答 回答的用户简介 （正则匹配）
  let banAnswerUserBioRegexMap = [];

  /*******************************下方内容不要修改***************************************/

  /**
   * ******************************************************************
   * CONFIG
   * ******************************************************************
   */

  // DEBUG 开关
  const DEBUG = true;

  // 等待其他脚本 Hook fetch 的时间。  50ms 检查一次。
  const FETCH_CHECK_INTERVAL = 50;

  // 最长等待时间。  0 = 一直等待
  const FETCH_CHECK_TIMEOUT = 10000;

  const JS_NAMESPACE = "zhihuProblemFilter";

  // DEBUG 打印
  const log = (...args) =>
    DEBUG &&
    console.log(
      "%c[" + JS_NAMESPACE + "]",
      "color:#00a1d6;font-weight:bold",
      ...args,
    );

  const warn = (...args) =>
    DEBUG &&
    console.warn(
      "%c[" + JS_NAMESPACE + "]",
      "color:orange;font-weight:bold",
      ...args,
    );

  /*************************************************
   * TARGET URL
   *************************************************/
  const FilterTag = Object.freeze({
    Q: "Q",
    A: "A",
  });

  const TARGET_PATTERNS_A = [
    /\/api\/v3\/moments\/[^/?]+\/activities(?:\?|$)/,
    /\/api\/v3\/feed\/topstory\/recommend(?:\?|$)/,
  ];

  // 将多个数组统一管理，带标签
  const PATTERN_GROUPS = [{ tag: FilterTag.Q, patterns: TARGET_PATTERNS_A }];

  function matchTarget(url) {
    if (typeof url !== "string") return { matched: false, tag: null };

    for (const group of PATTERN_GROUPS) {
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
          warn("[" + JS_NAMESPACE + "] 无效正则:", rule);
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

  const userCreateTemplate = (nr, ne, ue, sr) => ({
    // 用户名 正则匹配
    nameRegex: createKeywordReg(nr),
    // 用户名 精确匹配
    nameExact: new Set(ne),
    // uid 精确匹配
    uidExact: new Set(ue),
    // 用户简介 正则匹配
    signRegex: createKeywordReg(sr),
  });

  // 创建匹配规则映射
  const banRules = {
    question: {
      title: createKeywordReg(banQuestionTitleRegexMap),
    },

    q_user: userCreateTemplate(
      banQuestionUserNameRegexMap,
      banQuestionUserNameExactMap,
      banQuestionUserUidExactMap,
      banQuestionUserBioRegexMap,
    ),

    a_user: userCreateTemplate(
      banAnswerUserNameRegexMap,
      banAnswerUserNameExactMap,
      banAnswerUserUidExactMap,
      banAnswerUserBioRegexMap,
    ),
  };

  // 匹配规则辅助函数
  function matchKeywordRegex(text, reg) {
    return !!text && reg.test(text);
  }

  function matchKeywordExact(text, reg) {
    return !!text && reg.has(String(text));
  }

  // 判断用户是否需要屏蔽
  function isBanUser(user, reg) {
    if (!user || !reg) {
      return retResult();
    }

    // 精确匹配UID
    const bUid = user.url_token || "";

    if (matchKeywordExact(bUid, reg.uidExact)) {
      return retResult(true, `UID精确匹配(${bUid})`);
    }

    // 屏蔽用户
    const bName = user.name || "";

    // 模糊匹配用户名
    if (matchKeywordRegex(bName, reg.nameRegex)) {
      return retResult(true, `用户名规则匹配(${bName})`);
    }

    // 精确匹配用户名
    if (matchKeywordExact(bName, reg.nameExact)) {
      return retResult(true, `用户名精确匹配(${bName})`);
    }

    // 正则匹配用户简介
    const sign = user.headline || "";
    if (matchKeywordRegex(sign, reg.signRegex)) {
      return retResult(true, `用户简介规则匹配(${sign})`);
    }

    return retResult();
  }

  /*************************************************
   * GET FETCH URL
   *************************************************/

  function getFetchUrl(input) {
    if (typeof input === "string") {
      return input;
    }

    /*
     * fetch(Request)
     */
    if (input && typeof input.url === "string") {
      return input.url;
    }

    return "";
  }

  /*************************************************
   * FILTER
   *************************************************/

  /**
   * headline: 简介
   *
   */

  function filterReplyData(json, source = "") {
    // log("[FILTER]", "source =", source, json);

    try {
      const sData = json?.data;
      if (!Array.isArray(sData)) return json;

      json.data = sData.filter((jd) => {
        if (!jd) return false;

        // 问题屏蔽
        const q_title = jd.target.question.title;

        if (matchKeywordRegex(q_title, banRules.question.title)) {
          log(`[QuestionTitle] ${q_title}`);
          return false;
        }

        // 提问者屏蔽
        const q_author = jd.target.question.author;

        // log(`[filterReplyData] question author name: ${jd.target.question.author.name} ,
        //    url_token: ${jd.target.question.author.url_token} ,
        //    headline: ${jd.target.question.author.headline}`);

        const q_result = isBanUser(q_author, banRules.q_user);

        if (q_result.status) {
          log(
            `[BLOCK Question] ${q_title}, ${q_author.name}, ${q_result.reason}`,
          );
          return false;
        }

        // 回答者屏蔽
        const a_author = jd.target.author;

        // log(`[filterReplyData] question answer name: ${jd.target.author.name} ,
        //   url_token: ${jd.target.author.url_token} ,
        //    headline: ${jd.target.author.headline}`);

        const a_result = isBanUser(a_author, banRules.a_user);

        if (a_result.status) {
          log(
            `[BLOCK Answer] ${q_title}, ${a_author.name}, ${a_result.reason}`,
          );
          return false;
        }

        return true;
      });

      return json;
    } catch (e) {
      warn("[FILTER ERROR]", e);
      return json;
    }
  }

  /*************************************************
   * RESPONSE -> NEW RESPONSE
   *************************************************/

  function createFilteredResponse(response, filteredData) {
    // 复制 Response Headers
    const headers = new Headers(response.headers);

    headers.delete("content-length");
    headers.delete("content-encoding");
    headers.set("content-type", "application/json");

    const body = JSON.stringify(filteredData);

    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: headers,
    });
  }

  /*************************************************
   * FETCH HOOK
   *************************************************/
  let hookInstalled = false;

  function installFetchHookSafe() {
    if (hookInstalled) {
      return true;
    }

    const previousFetch = window.fetch;

    if (typeof previousFetch !== "function") {
      return false;
    }

    window.fetch = async function (...args) {
      const input = args[0];

      const url = getFetchUrl(input);

      // 匹配URL
      const { matched, tag } = matchTarget(url);

      // 非目标 URL
      if (!matched) {
        return previousFetch.apply(this, args);
      }

      // log("[TARGET]", url);

      // 先获取 response。
      let response;

      try {
        response = await previousFetch.apply(this, args);
      } catch (e) {
        error("[FETCH ERROR]", url, e);
        throw e;
      }

      /*
       * JSON 处理失败时，
       * 必须仍然返回原始 response。
       */
      try {
        // clone 不会消耗原 Response。
        const clone = response.clone();

        /*
         *
         */
        // 读取 JSON。
        const json = await clone.json();

        // log("[JSON OK]", url, json);

        /*
         *
         */

        let filtered = json;
        // 执行过滤。

        if (tag === FilterTag.Q) {
          filtered = filterReplyData(json, "fetch");
        }

        /*
         * 创建新的 Response。
         */
        const newResponse = createFilteredResponse(response, filtered);

        // log("[FILTERED RESPONSE]", url);

        return newResponse;
      } catch (e) {
        /*
         * 不影响知乎正常请求。
         */
        warn("[FILTER FAILED]", url, e);

        return response;
      }
    };

    hookInstalled = true;

    // log("[INSTALL OK]", "fetch hook installed");

    return true;
  }

  /*************************************************
   * WAIT OTHER SCRIPT
   *************************************************/

  function waitForFetchHook() {
    /*
     * 第一次记录。
     */
    const initialFetch = window.fetch;

    const startTime = Date.now();

    let lastFetch = initialFetch;

    // log("[WAIT]", "waiting for another fetch hook...");

    const timer = setInterval(() => {
      const currentFetch = window.fetch;

      /*
       * fetch 发生变化：
       *
       * 说明其他脚本已经重新赋值
       * window.fetch。
       */
      if (currentFetch !== initialFetch) {
        clearInterval(timer);

        // log("[WAIT DONE]", "window.fetch changed");

        installFetchHookSafe();

        return;
      }

      /*
       * 超时。
       *
       * 如果其他脚本没有 Hook fetch，
       * 我们也可以自己 Hook。
       */
      if (
        FETCH_CHECK_TIMEOUT > 0 &&
        Date.now() - startTime >= FETCH_CHECK_TIMEOUT
      ) {
        clearInterval(timer);

        warn("[WAIT TIMEOUT]", "installing own fetch hook");

        installFetchHookSafe();

        return;
      }

      // 防止某些脚本不断替换 fetch。
      if (currentFetch !== lastFetch) {
        lastFetch = currentFetch;
      }
    }, FETCH_CHECK_INTERVAL);
  }

  /*************************************************
   * INIT
   *************************************************/
  // log("zhihuProblemFilter started");

  waitForFetchHook();
})();
