// ==UserScript==
// @name         bilibili评论屏蔽
// @version      1.0.0
// @description  try to take over the world!
// @author       You
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==
// @grant        none
// @match *://*.bilibili.com/video/*
// @match *://*.bilibili.com/opus/*
// @match *://space.bilibili.com/*/dynamic

// @grant GM_xmlhttpRequest
// ==/UserScript==

/**
代码来源于： bili_rebuild    version 2.0.0.2
downloadURL https://update.greasyfork.org/scripts/446147/bili_rebuild.user.js
updateURL https://update.greasyfork.org/scripts/446147/bili_rebuild.meta.js

基于以上获取的代码进行修改
*/

/*******************************下方内容可以修改***************************************/

// 模糊匹配  评论字符串
let banCommentKeyMap = [

];

// 屏蔽 指定 用户名 的评论（精准匹配）
let banUserNameMap = [

];

// 屏蔽 指定  用户名  的评论（模糊匹配）
let banUserNameFuzzyMap = [

];

// 屏蔽 指定 uid 的评论（精准匹配）
let banUserUidMap = [

];

// 屏蔽 banBelowLevel 级 以下的评论
const banBelowLevel = 3


/*******************************下方内容不要修改***************************************/

function judgeIfBannedComment(raw) {
    for(var key of banCommentKeyMap) {
        if (raw.includes(key)) return true;
    }
    return false;
}

function judgeIfBannedUserName(key)
{
    // array includes() 精准匹配
    return banUserNameMap.includes(key);
}

// 模糊匹配 指定用户名
function judgeIfBannedUserNameFuzzy(raw)
{
    for(var key of banUserNameFuzzyMap) {
        if (raw.includes(key)) return true;
    }
    return false;
}

function judgeIfBannedUserUid(key)
{
    // array includes() 精准匹配
    return banUserUidMap.includes(key);
}

function extractUserInfo(html) {
    const temp = document.createElement('div');
    temp.innerHTML = html;

    const link = temp.querySelector('a');
    if (!link) return null;

    return {
        uid: link.href.split('/').pop(),
        name: link.textContent
    };
}



//  匹配 用户名 、uid、用户等级 的函数
function userInfoMatch(html){

    const info = extractUserInfo(html);
    // console.log('UID:', info.uid, 'Name:', info.name);

    // 匹配用户名 （模糊匹配）
    if(judgeIfBannedUserNameFuzzy(info.name))
    {
       //  console.log('true: UID:', info.uid, 'Name:', info.name);
        return true;
    }

    // 匹配 用户名 与 用户 uid (精确匹配)
    if(judgeIfBannedUserName(info.name) || judgeIfBannedUserUid(info.uid))
    {
       //  console.log('true: UID:', info.uid, 'Name:', info.name);
        // 匹配到了 屏蔽用户，屏蔽当前评论
        return true;
    }

     // console.log('false: UID:', info.uid, 'Name:', info.name);
    return false;
}


function userLevelMatch(html){

    // .split('/').pop().
    let ulevel = html.split('_').pop().split('.')[0];
    // 判断是否为数字
    const ulevelNum = Number(ulevel);
    if (!isNaN(ulevelNum) && ulevel.trim() !== "") {
        // 是数字，则是用户等级
        // console.log("userlevel\n" + ulevelNum)
        // 当前用户等级 小于 屏蔽的等级 ，则 屏蔽当前评论
        if(ulevelNum < banBelowLevel)
        {
            //  console.log('true: level' + ulevel)
            return true;
        }
    }

     // console.log('false: level' + ulevel)
    return false;
}

// -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

(function() {
    'use strict';
    window.onload=function(){

        var startMark = false

        setInterval(function(){
            // 判断是否可以开始执行核心程序
            if (startMark){
                runCore();
            } else {
                // 判断节点是否渲染完毕
                startMark = document.querySelector("bili-comments") != null
            }
        },200)
    }



    function runCore (){
        // 获取整楼评论
        var reviews = document.querySelector("bili-comments").shadowRoot.querySelectorAll("#feed > bili-comment-thread-renderer");
        for(var review of reviews){
            // 判断该元素是否为null（可能元素还没渲染出来）

            // 检查楼主评论是否过滤过，过滤则不再计算
            if (review.getAttribute('filtered') == null){

                // 状态设置成已经过滤判断过
                review.setAttribute('filtered',true)

                // 获取楼主评论
                var comment = review.shadowRoot.querySelector('#comment')

                // -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
                // 获取楼主用户名 与 用户 uid
                var reviewUserInfoHTML = comment.shadowRoot.querySelector("#header > bili-comment-user-info").shadowRoot.querySelector("#user-name").innerHTML;

                /*
                const userInfo = extractUserInfo(reviewUserInfoHTML);
                // console.log('UID:', userInfo.uid, 'Name:', userInfo.name);

                // 匹配用户名 （模糊匹配）
                if(judgeIfBannedUserNameFuzzy(userInfo.name))
                {
                    review.style.display = "none";
                    continue;
                }

                // 匹配 用户名 与 用户 uid (精确匹配)
                if(judgeIfBannedUserName(userInfo.name) || judgeIfBannedUserUid(userInfo.uid))
                {
                    // 匹配到了 屏蔽用户，屏蔽当前评论
                    review.style.display = "none";
                    continue;
                }
                */

                // 匹配 用户名 && uid
                if(userInfoMatch(reviewUserInfoHTML))
                {
                    review.style.display = "none";
                    continue;
                }

                // -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
                // 获取用户等级
                var userLevelHTML = comment.shadowRoot.querySelector("#header > bili-comment-user-info").shadowRoot.querySelector("#user-level").innerHTML;

                /*
                let ulevel = userLevelHTML.split('/').pop().split('_').pop().split('.')[0];
                // 判断是否为数字
                const ulevelNum = Number(ulevel);
                if (!isNaN(ulevelNum) && ulevel.trim() !== "") {
                    // 是数字，则是用户等级
                    // console.log("userlevel\n" + ulevelNum)
                    // 当前用户等级 小于 屏蔽的等级 ，则 屏蔽当前评论
                    if(ulevelNum < banBelowLevel)
                    {
                        review.style.display = "none";
                        continue;
                    }
                }
 */

                // 匹配 用户等级
                if(userLevelMatch(userLevelHTML))
                {
                    review.style.display = "none";
                    continue;
                }

                // -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
                // 获取楼主评论内容
                var commentText = comment.shadowRoot.querySelector("#content > bili-rich-text").shadowRoot.querySelector("#contents").innerHTML;
                // 过滤判断
                if(judgeIfBannedComment(commentText)) {
                    review.style.display = "none";
                    continue;
                }
            }

            // ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

            // 获取回复评论集   楼中楼
            var replies = review.shadowRoot.querySelector("#replies > bili-comment-replies-renderer").shadowRoot.querySelectorAll("#expander-contents > bili-comment-reply-renderer:not([filtered])")
            for(var reply of replies) {

                // 检查评论是否过滤过，过滤则不再计算
                if (reply.getAttribute('filtered') == null){

                    // 状态设置成已经过滤判断过
                    reply.setAttribute('filtered',true)

                    // console.log(reply)
                    // -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
                    // 获取楼主用户名 与 用户 uid
                    let replyUserInfoHTML = reply.shadowRoot.querySelector("#main > bili-comment-user-info").shadowRoot.querySelector("#user-name").innerHTML;
                    // 匹配 用户名 && uid
                    if(userInfoMatch(replyUserInfoHTML))
                    {
                        reply.style.display = "none";
                        continue;
                    }

                    // -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
                    // 获取用户等级
                    let replyUserLevelHTML = reply.shadowRoot.querySelector("#main > bili-comment-user-info").shadowRoot.querySelector("#user-level").innerHTML;
                    // 匹配 用户等级
                    if(userLevelMatch(replyUserLevelHTML))
                    {
                        reply.style.display = "none";
                        continue;
                    }

                    // -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
                    // 获取回复评论内容
                    var replyCommentText = reply.shadowRoot.querySelector("#main > bili-rich-text").shadowRoot.querySelector("#contents").innerHTML;
                    // 评论过滤判断
                    if(judgeIfBannedComment(replyCommentText)) {
                        reply.style.display = "none";
                        continue;
                    }
                }
            }
        }
    }

})();
