const DefaultApiKey = "oz2erssx768cHfzDMOO1PsyIz2EaJsyDppqrwmHckoHsrGBOJ2tPkA==";
const ExamineUrlDomain = "https://www.vionika.com/services/examine/domain";
const SpinBrowseDomain = "spinbrowse.com";
const LocalhostDomain = "localhost";
const ProhibitedCategories = [1011, 1062, 10002, 10007, 1031, 1058];

const GoogleSearchRegex = /^(https?:\/\/)?(w{3}.)?(images.)?google./i;
const BingSearchRegex = /^(https?:\/\/)?(w{3}.)?([^?=]+.)?bing./i;
const YahooSearchRegex = /^(https?:\/\/)?(w{3}.)?([^?=]+.)?yahoo./i;
const DuckDuckGoSearchRegex = /^(https?:\/\/)?(w{3}.)?([^?=]+.)?duckduckgo./i;
const YoutubeRegex = /^(https?:\/\/)?(w{3}.)?([^?=]+.)?youtube?(.+.)com/i;

const CachedCategoriesLocalStorageKey = "cachedCategories";

var cachedCategories;

chrome.webNavigation.onBeforeNavigate.addListener(
    function(details) {
        if(details.frameId !== 0){
            console.log("frameID in below iframe level" + details.frameId)
            return;
        }

        let urlString = details.url;
        console.log ("urlString: " + urlString)

        let tabId = details.tabId;
        console.log("tabId: " + tabId)

        if (tabId >= 0 && urlString !== undefined) {
            let safeSearchUrl = applySafeSearch(urlString);
            console.log("tabId and urlString is valid")

            if (safeSearchUrl != urlString) {
                chrome.tabs.update(tabId, {url: safeSearchUrl});
                console.log("the url wasn't safe so we'll redirect you to a safer url ;) ")
                return null;
            }


            let url = new URL(urlString);
            console.log("newer url: " + url)

            let domainName = url.hostname;
            console.log("domain name: " + domainName)

            // Remove www from the hostname
            if (domainName.indexOf('www.') === 0) {
                domainName = domainName.replace('www.','');
                console.log("'www' removed from domain name!")
            }

            if (domainName.length > 0 && (domainName.indexOf(SpinBrowseDomain) == -1) && !domainName.startsWith(LocalhostDomain)) {
                let requestDomains = [];
                requestDomains.push(domainName);
                console.log("domain name contained in request Domains array: " + requestDomains)

                // Check params for urls
                let urlParams = url.searchParams;
                console.log("searching for parameters... url parameters: " + urlParams)
                
                for (let paramKey of urlParams.keys()) {
                    console.log("looking into the keys of the parameter object...urlParams: " + urlParams.keys())
                    let paramValue = urlParams.get(paramKey);
                    console.log("parameter value: " + paramValue)
                    if (isValidURL(paramValue)) {
                        console.log("isValidURL func running...")
                        requestDomains.push(paramValue);
                        console.log("pushing parameter value into the request domains array: " + requestDomains)
                    }
                }

                for (let requestDomain of requestDomains) {
                    let cachedDomainCategories = getDomainCategories(requestDomain);
                    console.log("cachedDomainCategories: "+cachedDomainCategories)
                    
                    if (cachedDomainCategories !== undefined) {
                        console.log("cachedDomainCatergories well defined!");
                        for (var category of cachedDomainCategories) {
                            if (ProhibitedCategories.includes(category)) {
                                console.log("cachedDomainCategory includes prohibited stuff; blocking tab")
                                blockTab(tabId, url, requestDomain, category);
                                break;
                            }
                        }
                    } else {
                        console.log("cachedDomainCategories undefined!");

                        let xhr = new XMLHttpRequest();
                        xhr.open('POST', ExamineUrlDomain, true);
                        xhr.setRequestHeader('Content-type', 'application/json');
                        xhr.setRequestHeader('Accept', 'application/json');

                        xhr.onload = function () {
                            let result = JSON.parse(xhr.response);
                            let categories = result["categories"];

                            saveDomainCategories(requestDomain, categories);

                            for (let category of categories) {
                                if (ProhibitedCategories.includes(category)) {
                                    blockTab(tabId, url, requestDomain, category);
                                    break;
                                }
                            }
                        };

                        xhr.send(JSON.stringify({domainName: requestDomain, key: DefaultApiKey, v: "1"}));
                    }
                }
            }
        }

        return {cancel: false};
    },
    { urls: ["<all_urls>"], types: ['main_frame'] },
    ["blocking"]
);

chrome.webRequest.onBeforeSendHeaders.addListener(
    function(details) {
        if (YoutubeRegex.test(details.url)) {
            console.log(details.url);
            details.requestHeaders.push({name:"YouTube-Restrict",value:"Strict"});
        }
        return { requestHeaders: details.requestHeaders };
    },
    {urls: ['<all_urls>']},
    [ 'blocking', 'requestHeaders']
);

function blockTab(tabId, url, domainName, category) {
    let blockUrl = "https://www.spinbrowse.com/blocked/?url=" + url
        + "&domain=" + domainName
        + "&category=" + category
        + "&managed=false&os=web";

    chrome.tabs.update(tabId, {url: blockUrl}, _=>{
        let e = chrome.runtime.lastError;
        if(e !== undefined){
            console.log(tabId, _, e);
        }
    });
}

function applySafeSearch(url) {
    if (GoogleSearchRegex.test(url)) { // Google
        if (!url.includes("safe=strict") && !url.includes("/maps/") && !url.includes("/gmail") && !url.includes("/amp/") && !url.includes("/recaptcha/") && !url.endsWith("#")) {
            if (url.includes("?") || url.includes("#")) {
                console.log("google search detected!")
                return url + "&safe=strict";
            } else {
                console.log("google search detected!")
                return url + "?safe=strict";
            }
        }
    } else if (BingSearchRegex.test(url)) { // Bing
        if (!url.includes("adlt=strict") && !url.includes(".js") && !url.includes("/secure/")) {
            if (url.includes("?")) {
                return url + "&adlt=strict";
            } else {
                return url + "?adlt=strict";
            }
        }
    } else if (YahooSearchRegex.test(url)) { // Yahoo
        if (!url.includes("vm=r") && !url.includes("frame.html?")) {
            if (url.includes("?")) {
                return url + "&vm=r";
            } else {
                return url + "?vm=r";
            }
        }
    } else if (DuckDuckGoSearchRegex.test(url)) { // DuckDuckGo
        if (!url.includes("kp=1")) {
            if (url.includes("?")) {
                return url + "&kp=1";
            } else {
                return url + "?kp=1";
            }
        }
    }

    return url;
}

function getDomainCategories(domain) {
    if (cachedCategories === undefined) {
        console.log("cachedCategories undefined")
        chrome.storage.local.get([CachedCategoriesLocalStorageKey], function(result) {
            var items = result[CachedCategoriesLocalStorageKey];
            console.log("items: " + items)
            if (items === undefined) {
                cachedCategories = {};
                console.log("cachedCategories emptied")
            }
            else {
                cachedCategories = items;
                console.log("cachedCategories: " + cachedCategories)
            }
        });
    } else {
        console.log("cachedCategories already defined!; cachedCategories: " + cachedCategories[domain])
        return cachedCategories[domain];
    }
}

function saveDomainCategories(domain, categories) {
    if (cachedCategories !== undefined) {
        cachedCategories[domain] = categories;

        chrome.storage.local.set({CachedCategoriesLocalStorageKey: cachedCategories}, function() {});
    }
}

function isValidURL(string) {
    let res = string.match(/(http(s)?:\/\/.)?(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/g);
    if (res == null)
        return false;
    else
        return true;
};