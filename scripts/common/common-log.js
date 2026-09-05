// ==UserScript==
// @name         Common Log
// @namespace    inci.common
// @version      1.0.0
// @description  Common logging library for Tampermonkey
// @author       inci
// @license      MIT
// ==/UserScript==

(() => {
  "use strict";

  /*
   * ============================================================
   * 调试级别
   * ============================================================
   *
   * 数值越小，日志越详细。
   *
   * OFF   : 关闭全部日志
   * TRACE : 最详细
   * DEBUG : 调试信息
   * INFO  : 一般信息
   * WARN  : 警告
   * ERROR : 错误
   *
   * 例如：
   *
   * currentLevel = INFO
   *
   * TRACE -> 不输出
   * DEBUG -> 不输出
   * INFO  -> 输出
   * WARN  -> 输出
   * ERROR -> 输出
   */

  const DebugLevel = Object.freeze({
    OFF: 0,
    TRACE: 1,
    DEBUG: 2,
    INFO: 3,
    WARN: 4,
    ERROR: 5,
  });

  /*
   * ============================================================
   * 级别名称
   * ============================================================
   *
   * 不使用 Object.keys(...).find(...)
   *
   * 因为级别名称是固定的，直接建立映射即可。
   */

  const LEVEL_NAMES = Object.freeze([
    "OFF",
    "TRACE",
    "DEBUG",
    "INFO",
    "WARN",
    "ERROR",
  ]);

  /*
   * ============================================================
   * 默认调试级别
   * ============================================================
   *
   * 公共库本身只提供默认值。
   *
   * 每个具体脚本创建 logger 时可以覆盖：
   *
   * createLogger("zhihuProblemFilter", DebugLevel.TRACE)
   */

  const DEFAULT_LEVEL = DebugLevel.INFO;

  /*
   * ============================================================
   * 创建 Logger
   * ============================================================
   *
   * @param {string} namespace
   * @param {number} currentLevel
   *
   * @returns {{
   *   trace: Function,
   *   debug: Function,
   *   info: Function,
   *   warn: Function,
   *   error: Function
   * }}
   */

  function createLogger(namespace, currentLevel = DEFAULT_LEVEL) {
    /*
     * ----------------------------------------------------------
     * 只在创建 logger 时计算一次
     * ----------------------------------------------------------
     */

    const level = Number.isInteger(currentLevel) ? currentLevel : DEFAULT_LEVEL;

    /*
     * 防止非法级别。
     */

    const safeLevel =
      level < DebugLevel.OFF
        ? DebugLevel.OFF
        : level > DebugLevel.ERROR
          ? DebugLevel.ERROR
          : level;

    /*
     * [zhihuProblemFilter]
     */
    const prefix = `[${namespace}]`;

    /*
     * 如果关闭日志：
     *
     * 所有函数直接使用空函数。
     *
     * 后面的：
     *
     * trace(...)
     * debug(...)
     *
     * 不需要再次判断 CURRENT_LEVEL。
     */

    if (safeLevel === DebugLevel.OFF) {
      const noop = () => {};

      return Object.freeze({
        trace: noop,
        debug: noop,
        info: noop,
        warn: noop,
        error: noop,
      });
    }

    /*
     * ----------------------------------------------------------
     * 创建单个日志函数
     * ----------------------------------------------------------
     */

    function createLog(levelValue, color) {
      /*
       * [namespace][LEVEL]
       *
       * 这个字符串只创建一次。
       */
      const levelName = LEVEL_NAMES[levelValue];

      const title = `%c${prefix}[${levelName}]`;

      const style = `color:${color};font-weight:bold`;

      /*
       * 返回真正的日志函数。
       */

      return (...args) => {
        /*
         * 阈值判断：
         *
         * CURRENT_LEVEL <= messageLevel
         *
         * 例如：
         *
         * current = INFO(3)
         *
         * INFO  3 <= 3 -> 输出
         * WARN  4 <= 4 -> 输出
         * ERROR 5 <= 5 -> 输出
         *
         * TRACE 1 <= 3 -> false
         * DEBUG 2 <= 3 -> false
         */

        if (safeLevel > levelValue) {
          return;
        }

        console.log(title, style, ...args);
      };
    }

    /*
     * ----------------------------------------------------------
     * 创建各级日志函数
     * ----------------------------------------------------------
     */

    const trace = createLog(DebugLevel.TRACE, "#888");
    const debug = createLog(DebugLevel.DEBUG, "#00a1d6");
    const info = createLog(DebugLevel.INFO, "#2ecc71");
    const warn = createLog(DebugLevel.WARN, "orange");
    const error = createLog(DebugLevel.ERROR, "#e74c3c");

    /*
     * ----------------------------------------------------------
     * 返回 Logger
     * ----------------------------------------------------------
     */
    return Object.freeze({
      trace,
      debug,
      info,
      warn,
      error,
    });
  }

  /*
   * ============================================================
   * 暴露公共 API
   * ============================================================
   *
   * 不直接污染：
   *
   * globalThis.createLogger
   *
   * 而是统一放到：
   *
   * globalThis.__CommonLib
   */
  const CommonLib = globalThis.__CommonLib ?? (globalThis.__CommonLib = {});

  /*
   * 防止重复覆盖。
   */
  CommonLib.DebugLevel ??= DebugLevel;
  CommonLib.createLogger ??= createLogger;
})();
