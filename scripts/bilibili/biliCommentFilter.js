/* global globalThis */

// ==UserScript==
// @name         Bilibili 评论API拦截过滤
// @version      2026.10.14.23
// @description  Hook API response，过滤评论后再返回浏览器渲染
// @author       inci
// @license      MIT
// @namespace    https://github.com/in-ci/Tampermonkey
// @updateURL    https://raw.githubusercontent.com/in-ci/Tampermonkey/main/scripts/bilibili/biliCommentFilter.js
// @downloadURL  https://raw.githubusercontent.com/in-ci/Tampermonkey/main/scripts/bilibili/biliCommentFilter.js
// @require      https://raw.githubusercontent.com/in-ci/Tampermonkey/main/scripts/bilibili/biliKeyword.js
// @require      https://raw.githubusercontent.com/in-ci/Tampermonkey/main/scripts/_common/common-logs.js
// @match        *://*.bilibili.com/*
// @exclude      *://member.bilibili.com/studio/bs-editor/*
// @exclude      *://t.bilibili.com/h5/dynamic/specification
// @exclude      *://bbq.bilibili.com/*
// @exclude      *://message.bilibili.com/pages/nav/header_sync
// @exclude      *://s1.hdslb.com/bfs/seed/jinkela/short/cols/iframe.html
// @exclude      *://open-live.bilibili.com/*
// @exclude      *://*.bilibili.com/v/popular/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-start
// @sandbox      raw
// @grant        unsafeWindow
// @grant        GM_registerMenuCommand
// @icon         https://www.bilibili.com/favicon.ico
// ==/UserScript==

(() => {
  "use strict";

  // 脚本名称
  const JS_NAMESPACE = "biliCommentFilter";
  // 存储 JSON 数据的键名
  const STORAGE_KEY_DATA = "bili_config_data";
  // 存储最后更新时间的键名
  const STORAGE_KEY_UPDATE_TIME = "bili_config_last_update";
  // 存储远程配置URL的键名
  const STORAGE_KEY_CONFIG_URL = "bili_config_url";

  // 需要拦截的评论 API 路径
  const REPLY_API_PATHS = ["x/v2/reply/wbi/main", "/x/v2/reply/reply"];

  function getRequireKV() {
    // 过滤关键字 biliKeyword.js导出

    const source = globalThis.__BilibiliLib ?? {};
    // 直接从对象自身获取 keys，无需额外全局变量
    return Object.fromEntries(
      Object.keys(source).map((key) => [key, source[key]]),
    );
  }

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

  // 没有保存的 URL 时默认为空，不设置默认远程地址
  let configUrl = String(GM_getValue(STORAGE_KEY_CONFIG_URL, "") || "").trim();
  let rawConfig = {}; // 从 URL 拿到的原始 JSON
  let banRules = null; // 编译后的规则（含 RegExp / Set）
  let banUserLevel = 0;

  GM_registerMenuCommand("远程配置URL", () => {
    const savedUrl = String(GM_getValue(STORAGE_KEY_CONFIG_URL, "") || "");

    const input = prompt(
      "请输入远程配置的URL：\n留空并点击确定可清除 URL。",
      savedUrl,
    );

    if (input === null) return;

    const url = input.trim();

    // 清除 URL：使用空配置，不请求远程参数
    if (!url) {
      configUrl = "";

      GM_setValue(STORAGE_KEY_CONFIG_URL, "");

      rawConfig = {};
      banRules = buildBanRules({});

      log.info("[配置 URL] 已清除，当前使用空规则");
      return;
    }

    // 验证 URL
    let parsedUrl;

    try {
      parsedUrl = new URL(url);
    } catch {
      alert("URL 格式无效。");
      return;
    }

    if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
      alert("仅支持 HTTP/HTTPS URL。");
      return;
    }

    configUrl = url;

    GM_setValue(STORAGE_KEY_CONFIG_URL, configUrl);

    log.info("[配置 URL] 已保存:", configUrl);

    // 立即获取远程配置
    fetchAndSaveConfig();
  });

  GM_registerMenuCommand("刷新本地配置", () => {
    // 立即获取远程配置
    fetchAndSaveConfig();
  });

  /** 用当前 rawConfig 重新编译规则 */
  function buildBanRules(config = rawConfig) {
    let data =
      config && typeof config === "object" && !Array.isArray(config)
        ? config
        : {};

    if (Object.keys(data).length === 0) {
      data = getRequireKV();
    }

    const {
      commentRegex = [],
      nameRegex = [],
      nameExact = [],
      uidExact = [],
      signRegex = [],
      belowLevel = 0,
    } = data;

    banUserLevel = Number.isFinite(Number(belowLevel)) ? Number(belowLevel) : 0;

    return {
      comments: {
        comment: createKeywordReg(commentRegex),
      },
      user: {
        nameRegex: createKeywordReg(nameRegex),
        nameExact: new Set(Array.isArray(nameExact) ? nameExact : []),
        uidExact: new Set(Array.isArray(uidExact) ? uidExact : []),
        signRegex: createKeywordReg(signRegex),
      },
    };
  }

  /** 拉取并应用新配置 */
  function fetchAndSaveConfig() {
    if (!configUrl) {
      log.debug("[配置更新] 未设置远程参数 URL，跳过请求");
      return;
    }

    GM_xmlhttpRequest({
      method: "GET",
      url: configUrl,
      responseType: "json",
      onload(r) {
        if (r.status >= 200 && r.status < 300) {
          rawConfig = r.response || {};
          banRules = buildBanRules(rawConfig);

          GM_setValue(STORAGE_KEY_DATA, rawConfig);
          GM_setValue(STORAGE_KEY_UPDATE_TIME, Date.now());

          log.info("[配置] 已更新并重新编译规则");

          window.dispatchEvent(
            new CustomEvent("configReady", { detail: banRules }),
          );
        } else {
          log.error(`[配置更新] 请求失败，HTTP状态码: ${r.status}`);
        }
      },
      onerror: function (error) {
        log.error("[配置更新] 网络请求异常:", error);
      },
    });
  }

  /**
   * 初始化与定时器逻辑
   */
  function getMsToNextHour() {
    const now = new Date();
    const nextHour = new Date(now);
    // 设置到下一个小时的 0分0秒0毫秒
    nextHour.setHours(now.getHours() + 1, 0, 0, 0);
    return nextHour.getTime() - now.getTime();
  }

  function initScheduler() {
    const lastUpdateTime = GM_getValue(STORAGE_KEY_UPDATE_TIME, 0);
    const now = Date.now();
    const ONE_HOUR = 60 * 60 * 1000;

    // 容错机制：如果距离上次更新已经超过 1 小时（比如用户刚打开电脑/浏览器），立即更新一次
    if (now - lastUpdateTime >= ONE_HOUR) {
      log.info("[配置更新] 距离上次更新已超 1 小时，立即执行更新。");
      fetchAndSaveConfig();
    }

    // 计算到下一个整点的时间差
    const delay = getMsToNextHour();
    log.info(
      `[配置更新] 距离下一个整点还有 ${Math.round(delay / 60000)} 分钟。`,
    );

    // 使用 setTimeout 对齐到下一个整点
    setTimeout(() => {
      fetchAndSaveConfig(); // 到达整点，执行更新

      // 之后每隔 1 小时（3600000 毫秒）循环执行
      setInterval(() => {
        fetchAndSaveConfig();
      }, ONE_HOUR);
    }, delay);
  }

  // 启动时优先读本地缓存
  const cached = GM_getValue(STORAGE_KEY_DATA, null);
  if (cached) {
    // 本地有缓存,  加载本地配置
    rawConfig = cached;
    banRules = buildBanRules(rawConfig);
  } else {
    // 本地无缓存, 使用空配置
    rawConfig = {};
    banRules = buildBanRules({});

    // 设置有 远程URL
    if (configUrl) {
      fetchAndSaveConfig();
    } else {
      log.info("[配置] 未设置远程参数 URL，使用空规则");
    }
  }

  // 启动调度器
  initScheduler();

  /**
   * return
   */
  function retResult(status = false, reason = "") {
    return { status, reason };
  }

  // 创建关键词匹配器 , 支持: 普通关键词 ， 正则(格式： "/xxxxxxx/flags")
  function createKeywordReg(list) {
    // 共享空匹配器，避免重复创建
    const NEVER_MATCH = { test: () => false };

    if (!Array.isArray(list) || list.length === 0) return NEVER_MATCH;

    const regexList = [];

    for (const item of list) {
      if (!item) continue;

      const rule = String(item).trim();

      if (!rule) continue;

      // 判断正则格式  /xxx/
      // const match = rule.match(/^\/(.+)\/$/);

      // 支持 /pattern/flags 格式，flags 可选
      const match = rule.match(/^\/(.+)\/([gimsuy]*)$/);

      if (match) {
        try {
          regexList.push(new RegExp(match[1], match[2]));
        } catch (_) {
          log.warn("无效正则:", rule);
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
    if (level < banUserLevel) {
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
  function filterReplyData(json) {
    try {
      const replies = json?.data?.replies;
      if (!Array.isArray(replies)) return json;

      json.data.replies = replies.filter((r) => {
        if (!r) return false;

        // 主评论过滤
        const r_result = filterUser(r.member);
        if (r_result.status) {
          log.info(`${r.member?.uname} : ${r_result.reason}`);
          return false;
        }

        if (matchRegex(r.content?.message, banRules.comments.comment)) {
          log.info(`${r.member?.uname} : ${r.content?.message}`);
          return false;
        }

        // 楼中楼过滤
        if (Array.isArray(r.replies)) {
          r.replies = r.replies.filter((rr) => {
            const rr_result = filterUser(rr.member);
            if (rr_result.status) {
              log.info(`[楼中楼] ${rr.member?.uname} : ${rr_result.reason}`);
              return false;
            }

            if (matchRegex(rr.content?.message, banRules.comments.comment)) {
              log.info(`[楼中楼] ${rr.member?.uname} : ${rr.content?.message}`);
              return false;
            }

            return true;
          });
        }

        return true;
      });

      return json;
    } catch (e) {
      log.error("[FILTER ERROR]", e);
      return json;
    }
  }

  /**
   * Fetch Hook
   */
  const pageWindow = unsafeWindow;
  const rawFetch = pageWindow.fetch;

  pageWindow.fetch = async function (...args) {
    const input = args[0];

    const url = typeof input === "string" ? input : input?.url || "";

    // 临时记录所有 Fetch，用于确定请求是否经过此 Hook。
    log.trace("[FETCH ENTER]", url);

    // 调用原始 Fetch，保持页面原有请求行为。
    const res = await Reflect.apply(rawFetch, this, args);

    if (
      typeof url !== "string" ||
      !REPLY_API_PATHS.some((path) => url.includes(path))
    ) {
      return res;
    }

    log.debug("[FETCH MATCH]", url);

    try {
      if (res.status === 0 || [204, 205, 304].includes(res.status)) {
        return res;
      }

      const json = await res.clone().json();

      const filtered = filterReplyData(json);

      const headers = new pageWindow.Headers(res.headers);

      // 响应体已重新生成，删除原响应体对应的长度和编码信息。
      headers.delete("content-length");
      headers.delete("content-encoding");

      return new pageWindow.Response(JSON.stringify(filtered), {
        status: res.status,
        statusText: res.statusText,
        headers,
      });
    } catch (e) {
      log.error("[FETCH HOOK ERROR]", e);
      return res;
    }
  };

  log.debug("[FETCH HOOK INSTALLED]", pageWindow.fetch !== rawFetch);
})();
