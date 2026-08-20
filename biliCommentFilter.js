// ==UserScript==
// @name         Bilibili 评论API拦截过滤
// @namespace    biliCommentFilter
// @version      1.0.1
// @description  Hook API response，过滤评论后再返回浏览器渲染
// @license      MIT
// @updateURL    https://raw.githubusercontent.com/in-ci/Tampermonkey/main/biliCommentFilter.js
// @downloadURL  https://raw.githubusercontent.com/in-ci/Tampermonkey/main/biliCommentFilter.js
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
    'use strict';

    // DEBUG 开关
    const DEBUG = false;

    /******************************* 过滤内容匹配 ***************************************/

    // 模糊匹配支持正则，正则格式： /xxxxxx/
    // 精确匹配不支持正则

    // 屏蔽指定 关键字 的评论（模糊匹配）
    let banCommentRegexMap = [
        '交流群', '问了吗', '邀请码', '大佬帮我', '托管日常', '打起来', '的楼', '/^@.*/'
    ];

    // 屏蔽指定 用户名 的评论（模糊匹配）
    let banUserNameRegexMap = [
        'bili_', 'T0', '流量', '大王'
    ];

    // 依据用户简介关键字屏蔽（模糊匹配）
    let banUserSignRegexMap = [

    ];

    // 屏蔽指定 用户名 的评论（精准匹配）
    let banUserNameExactMap = [

    ];

    // 屏蔽指定 uid 的评论（精准匹配）
    let banUserUidExactMap = [

    ];

    // 屏蔽 banBelowLevel 级 以下的评论 ， 例如：3 ，则屏蔽 0、1、2 级下的评论
    const banBelowLevel = 3

    /*******************************下方内容不要修改***************************************/

    /*
    *  DEBUG 打印
    */
    const log = (...args) => DEBUG && console.log('%c[BiliFilter]', 'color:#00a1d6;font-weight:bold', ...args);
    const warn = (...args) => DEBUG && console.warn('%c[BiliFilter]', 'color:orange;font-weight:bold', ...args);

    /**
    * 创建关键词匹配器 , 支持:
    * 普通关键词: "交流群"
    * 正则: "/交流群\d+/"
    */
    function createKeywordReg(list) {
        if (!Array.isArray(list) || list.length === 0) {
            return /$a/;
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
                }
                catch (e) {
                    warn('[BiliFilter] 无效正则:', rule);
                }
            }
            else {
                // 普通字符串
                // 转义正则字符
                regexList.push(new RegExp(rule.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
            }
        }

        // 过滤后没有有效规则
        if (regexList.length === 0) {
            return /$a/;
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

                return regexList.some(reg => {
                    /*
                     * 防止未来误使用 g 标记
                     * 导致 lastIndex 影响结果
                     */
                    reg.lastIndex = 0;
                    return reg.test(text);
                });
            }
        };
    }

    // 创建匹配规则映射
    const banRules = {
        comments: {
            comment: createKeywordReg(banCommentRegexMap),
        },

        user: {
            // 用户名 模糊匹配
            nameRegex: createKeywordReg(banUserNameRegexMap),
            // 用户名 精确匹配
            nameExact: new Set(banUserNameExactMap),
            // uid 精确匹配
            uidExact: new Set(banUserUidExactMap),
            // 用户简介 模糊匹配
            signRegex: createKeywordReg(banUserSignRegexMap)
        },
    };

    // 匹配规则辅助函数
    function matchRegex(text, reg) {
        return !!text && reg.test(text);
    }

    function matchExact(value, set) {
        return !!value && set.has(String(value));
    }

    // 具体内容匹配函数
    function isBanComment(text) {
        return matchRegex(text, banRules.comments.comment);
    }

    function isBanNameRegex(name) {
        return matchRegex(name, banRules.user.nameRegex);
    }

    function isBanNameExact(name) {
        return matchExact(name, banRules.user.nameExact);
    }

    function isBanUidExact(uid) {
        return matchExact(uid, banRules.user.uidExact);
    }

    function isBanSignRegex(sign) {
        return matchRegex(sign, banRules.user.signRegex);
    }

    // 判断用户是否需要屏蔽
    function isBanUser(member) {
        if (!member) return false;

        // 屏蔽低于 banBelowLevel等级 的用户
        const level = member.level_info.current_level || 6;
        if (level < banBelowLevel) return true;

        // 屏蔽用户
        const name = member.uname || '';

        // 模糊匹配用户名
        if (isBanNameRegex(name)) return true;

        // 精确匹配用户名
        if (isBanNameExact(name)) return true;

        // 精确匹配UID
        const uid = member.mid || '';
        if (isBanUidExact(uid)) return true;

        const sign = member.sign || '';
        if (isBanSignRegex(sign)) return true;

        return false;
    }

    /*************************************************
     *  评论数据过滤核心逻辑
     *************************************************/
    function filterReplyData(json, source = '') {
        try {
            const replies = json?.data?.replies;
            if (!Array.isArray(replies)) return json;

            const before = replies.length;

            json.data.replies = replies.filter(r => {
                if (!r) return false;

                // log(`[RAW JSON] [#1]`);
                // log(r);

                // 主评论过滤
                if (isBanUser(r.member)) {
                    log(r);
                    log('[BLOCK MAIN USER]', r.member?.uname);
                    return false;
                }

                if (isBanComment(r.content?.message)) {
                    log(r);
                    log('[BLOCK MAIN TEXT]', r.content?.message);
                    return false;
                }

                // 楼中楼过滤
                if (Array.isArray(r.replies)) {
                    r.replies = r.replies.filter(rr => {
                        if (isBanUser(rr.member)) return false;
                        if (isBanComment(rr.content?.message)) return false;
                        return true;
                    });
                }

                return true;
            });

            log(`[FILTER DONE] ${source}`, `before=${before}, after=${json.data.replies.length}`);

            return json;

        } catch (e) {
            warn('[FILTER ERROR]', e);
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
            if (typeof url === 'string' &&
                (
                    url.includes('/x/v2/reply') ||
                    url.includes('/x/v2/reply/wbi/main')
                )) {

                log('[FETCH HIT]', url);

                const clone = res.clone();
                const json = await clone.json();

                const filtered = filterReplyData(json, 'fetch');

                return new Response(JSON.stringify(filtered), {
                    status: res.status,
                    statusText: res.statusText,
                    headers: res.headers
                });
            }
        } catch (e) {
            warn('[FETCH HOOK ERROR]', e);
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

        this.addEventListener('readystatechange', function () {

            if (this.readyState !== 4) return;

            try {
                if (this._url?.includes('/x/v2/reply')) {

                    log('[XHR HIT]', this._url);

                    const json = JSON.parse(this.responseText);

                    const filtered = filterReplyData(json, 'xhr');

                    Object.defineProperty(this, 'responseText', {
                        value: JSON.stringify(filtered)
                    });
                }
            } catch (e) {
                warn('[XHR HOOK ERROR]', e);
            }
        });

        return send.apply(this, arguments);
    };

    /*************************************************
     *  启动提示
     *************************************************/
    // log('initialized');
})();
