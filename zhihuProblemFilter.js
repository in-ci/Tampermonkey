// ==UserScript==
// @name         知乎问题API拦截过滤
// @namespace    zhihuProblemFilter
// @version      1.0.6
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
      let banQuestionTitleRegexMap = [
        "复制粘贴","泥石流","买电脑","网站推荐","宏大叙事","流量卡","凡人修仙","乒乓球","动物法","天涯","房价","春晚","汽车","伪史","值得关注","汉服","中医","学生党","相亲",
        "黑神话","华为","鸿蒙","国足","电竞","内存","斩杀线","正能量","小说推荐","预言","黄金","旅游","耽美","山姆","单机","高考","漫画","人口","以色列","伊朗","外挂","散户",
        "月销量","烂尾楼","韭菜",

        "/[Aa炒].?股/","/[牢大][Aa]/","/股[民票市价]/","/[牛熊]市/","/[Uu][Pp].?主/","/[Nn][Gg][Aa]/","/[Mm][Aa][Cc]/","/[Gg][Dd][Pp]/","/[男女][权拳性朋装]/","[男女]主[义文内外]",
        "/[结订求新离]婚/","/少年(团|组合)/","/如果(给你|只能|你要|你想|是你)/","/概率(多少|是|大)/","/的(小说|文)/","/[篮足排]球/","/马(督工|斯克|前卒)/","/民族(主义|问题|融合)/",
        "/[甜虐]文/","/如何(化解)/","/[基股]金/","/[涨跌]停/","/[开收]盘/","/[Kk均]线/"
    ];

  // ==================== 提问屏蔽配置 ====================
  // 屏蔽提问 问题提出的用户名 （正则匹配）
  let banQuestionUserNameRegexMap = [];

  // 屏蔽提问 问题提出的用户名 （精准匹配）
  let banQuestionUserNameExactMap = [];

  // 屏蔽提问 问题提出的用户UID （精准匹配）
  let banQuestionUserUidExactMap = ["ds-54-36", "71-40-19-83-89"];

  // 屏蔽提问 问题提出的用户简介 （正则匹配）
  let banQuestionUserBioRegexMap = [];

  // ==================== 回答屏蔽配置 ====================
  // 屏蔽回答 回答的用户名 （正则匹配）
  let banAnswerUserNameRegexMap = [];

  // 屏蔽回答 回答的用户名 （精准匹配）
  let banAnswerUserNameExactMap = [];

  // 屏蔽回答 回答的用户UID （精准匹配）
  let banAnswerUserUidExactMap = ["ds-54-36", "71-40-19-83-89"];

  // 屏蔽回答 回答的用户简介 （正则匹配）
  let banAnswerUserBioRegexMap = [];

  /*******************************下方内容不要修改***************************************/

  /**
   * ******************************************************************
   * CONFIG
   * ******************************************************************
   */
  const DebugLevel = Object.freeze({
    OFF: 0,
    TRACE: 1,
    DEBUG: 2,
    INFO: 3,
    WARN: 4,
    ERROR: 5,
  });

  // 当前调试级别
  const CURRENT_LEVEL = DebugLevel.INFO;

  // 等待其他脚本 Hook fetch 的时间。  50ms 检查一次。
  const FETCH_CHECK_INTERVAL = 50;

  // 最长等待时间。  0 = 一直等待
  const FETCH_CHECK_TIMEOUT = 10000;

  const JS_NAMESPACE = "zhihuProblemFilter";

  // 通用日志工厂
  const createLogger = (level, color) => {
    // 预计算级别名称，只执行一次
    const levelName = Object.keys(DebugLevel).find(
      (k) => DebugLevel[k] === level,
    );

    return (...args) => {
      // 阈值越小越详细，level 越大越严重
      if (CURRENT_LEVEL !== DebugLevel.OFF && CURRENT_LEVEL <= level) {
        console.log(
          `%c[${JS_NAMESPACE}][${levelName}]`,
          `color:${color};font-weight:bold`,
          ...args,
        );
      }
    };
  };
  // 各级别日志函数
  const trace = createLogger(DebugLevel.TRACE, "#888"); // 灰色
  const debug = createLogger(DebugLevel.DEBUG, "#00a1d6"); // 蓝色
  const info = createLogger(DebugLevel.INFO, "#2ecc71"); // 绿色
  const warn = createLogger(DebugLevel.WARN, "orange"); // 橙色
  const error = createLogger(DebugLevel.ERROR, "#e74c3c"); // 红色

  /*************************************************
   * TARGET URL
   *************************************************/
  const FilterTag = Object.freeze({
    Q: "Q",
    A: "A",
  });

  const TARGET_PATTERNS_Q_V3_PREFIX = "/api/v3/";
  const TARGET_PATTERNS_Q_V3 = [
    /\/api\/v3\/moments\/[^/?]+\/activities(?:\?|$)/, // 用户动态
    /\/api\/v3\/feed\/topstory\/recommend(?:\?|$)/, // 知乎首页
  ];

  // /api/v4/members/xxxxxxx/answers?
  const TARGET_PATTERNS_Q_V4_PREFIX = "/api/v4/";
  const TARGET_PATTERNS_Q_V4 = [
    /\/api\/v4\/members\/[^/?]+\/answers(?:\?|$)/, // 用户回答
  ];

  // 将多个数组统一管理，带标签
  const PATTERN_GROUPS = [
    {
      tag: FilterTag.Q,
      patterns: TARGET_PATTERNS_Q_V3,
      prefix: TARGET_PATTERNS_Q_V3_PREFIX,
    },
    // {
    //   tag: FilterTag.Q,
    //   patterns: TARGET_PATTERNS_Q_V4,
    //   prefix: TARGET_PATTERNS_Q_V4_PREFIX,
    // },
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

  /**
   * 创建关键词匹配器 , 支持:
   * 普通关键词: "交流群"
   * 正则: "/交流群\d+/"
   */

  // 共享空匹配器，避免重复创建
  const NEVER_MATCH = { test: () => false };

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
          warn(`[${JS_NAMESPACE}] 无效正则: ${rule}`);
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

    // fetch(Request)
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
   * filterQuestionData 返回 { changed: boolean, data: object }
   */

  function filterQuestionData(json, source = "") {
    trace("[filterQuestionData]", "source =", source, json);

    const sData = json?.data;
    // 无数据时直接返回原引用（安全，未修改）
    if (!Array.isArray(sData)) return { changed: false, result: json };

    let changed = false;
    const filteredData = sData.filter((jd) => {
      if (!jd) {
        changed = true;
        return false;
      }

      // 问题屏蔽
      const q_title = jd.target?.question?.title;
      if (matchKeywordRegex(q_title, banRules.question.title)) {
        info(`[BLOCK Question] ${q_title}`);
        changed = true;
        return false;
      }

      // 提问者屏蔽
      const q_author = jd.target?.question?.author;

      debug(`author name: ${q_author?.name} ,
        url_token: ${q_author?.url_token} , headline: ${q_author?.headline}`);

      const q_result = isBanUser(q_author, banRules.q_user);
      if (q_result.status) {
        info(
          `[BLOCK Question] ${q_title}, ${q_author?.name}, ${q_result.reason}`,
        );
        changed = true;
        return false;
      }

      // 回答者屏蔽
      const a_author = jd.target?.author;

      debug(`answer name: ${a_author?.name} ,
        url_token: ${a_author?.url_token} ,  headline: ${a_author?.headline}`);

      const a_result = isBanUser(a_author, banRules.a_user);
      if (a_result.status) {
        info(`[BLOCK Answer] ${q_title}, ${a_author?.name}, ${a_result.reason}`);
        changed = true;
        return false;
      }

      return true;
    });

    //  无变化时零拷贝返回
    if (!changed) {
      return { changed: false, result: json };
    }

    return { changed: true, result: { ...json, data: filteredData } };
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

      // 空 URL 快速拒绝，跳过 matchTarget 调用
      if (!url) return previousFetch.apply(this, args);

      // 匹配URL
      const { matched, tag } = matchTarget(url);

      // 非目标 URL
      if (!matched) return previousFetch.apply(this, args);

      trace("[TARGET]", url);

      // 先获取 response。
      let response;

      try {
        response = await previousFetch.apply(this, args);
      } catch (e) {
        warn("[FETCH ERROR]", url, e);
        throw e;
      }

      // JSON 处理失败时，必须仍然返回原始 response。
      try {
        // clone 不会消耗原 Response。
        const clone = response.clone();
        // 读取 JSON。
        const json = await clone.json();

        trace("[JSON OK]", url, json);

        let new_json = json;
        let changed = false;

        // 执行过滤。
        if (tag === FilterTag.Q) {
          const fqd = filterQuestionData(json, "fetch");
          changed = fqd.changed;
          new_json = fqd.result;
        }

        // 未修改 → 直接返回原始 response，跳过 clone/serialize
        if (!changed) {
          trace("[NO CHANGE]", url);
          return response;
        }

        trace("[FILTERED RESPONSE]", url);

        // 返回新的 Response。
        return new Response(JSON.stringify(new_json), {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      } catch (e) {
        // 不影响知乎正常请求。
        error("[FILTER FAILED]", url, e);
        return response;
      }
    };

    hookInstalled = true;

    trace("[INSTALL OK]", "fetch hook installed");

    return true;
  }

  /*************************************************
   * WAIT OTHER SCRIPT
   *************************************************/
  function waitForFetchHook() {
    const startTime = Date.now();
    let lastFetch = window.fetch;
    let delay = FETCH_CHECK_INTERVAL;

    trace("[WAIT]", "waiting for another fetch hook...");

    const check = () => {
      const currentFetch = window.fetch;

      if (currentFetch !== lastFetch) {
        trace("[WAIT DONE]", "window.fetch changed");
        installFetchHookSafe();
        return;
      }

      if (
        FETCH_CHECK_TIMEOUT > 0 &&
        Date.now() - startTime >= FETCH_CHECK_TIMEOUT
      ) {
        warn("[WAIT TIMEOUT]", "installing own fetch hook");
        installFetchHookSafe();
        return;
      }

      delay = Math.min(delay * 1.5, 500); // 指数退避，上限 500ms
      setTimeout(check, delay);
    };

    setTimeout(check, delay);
  }

  /*************************************************
   * INIT
   *************************************************/
  trace("zhihuProblemFilter started");

  waitForFetchHook();
})();
