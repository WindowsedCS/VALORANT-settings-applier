"use strict";

const axios = require('axios').default;
const axiosCookieJarSupport = require('axios-cookiejar-support').default;
const querystring = require('querystring');
const tough = require('tough-cookie');
const fs = require("fs");
const path = require("path");
const url = require('url');
const https = require("https");
axiosCookieJarSupport(axios);
const { Agent } = require("https");
const ciphers = [
    'TLS_CHACHA20_POLY1305_SHA256',
    'TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256',
    'TLS_AES_128_GCM_SHA256',
    'TLS_AES_256_GCM_SHA384',
];
const regions = require("./regions");

const httpAgent = new Agent({ ciphers: ciphers.join(':'), honorCipherOrder: true, minVersion: 'TLSv1.2' })

class API {

    constructor(region = regions.AsiaPacific, client_version = "release-04.11-9-720764") {
        this.region = region;
        this.username = null;
        this.user_id = null;
        this.access_token = null;
        this.id_token = null;
        this.entitlements_token = null;
        this.multifactor = false;
        this.cookieJar = null;
        this.client_version = client_version.replace("=shipping", "");
        this.cookies = null;
        this.user_agent = null;
        this.ssid = null;
        this.client_platform = {
            "platformType": "PC",
            "platformOS": "Windows",
            "platformOSVersion": "10.0.22000.1.256.64bit",
            "platformChipset": "AMD Ryzen 7 5800X 8-Core Processor"
        };
    }

    getPlayerDataServiceUrl(region) {
        return `https://pd.${region}.a.pvp.net`;
    }

    getPartyServiceUrl(region) {
        return `https://glz-${region}-1.${region}.a.pvp.net`;
    }

    getSharedDataServiceUrl(region) {
        return `https://shared.${region}.a.pvp.net`;
    }

    getPlayerDataPregameURL(region) {
        return `https://glz-${region}-1.${region}.a.pvp.net/pregame`
    }

    getCoreGameDataServiceURL(region) {
        return `https://glz-${region}-1.${region}.a.pvp.net/core-game`
    }

    generateRequestHeaders(extraHeaders = {}) {
        // generate default headers
        const defaultHeaders = {
            'Authorization': `Bearer ${this.access_token}`,
            'X-Riot-Entitlements-JWT': this.entitlements_token,
            'X-Riot-ClientVersion': this.client_version.replace("=shipping", ""),
            'X-Riot-ClientPlatform': Buffer.from(JSON.stringify(this.client_platform)).toString('base64'),
        };
        // merge in extra headers
        return {
            ...defaultHeaders,
            ...extraHeaders,
        }
    }

    reAuthorize(cookies) {
        this.ssid = cookies.ssid;
        return axios.post('https://auth.riotgames.com/api/v1/authorization', {
            'client_id': 'riot-client',
            'nonce': '69420',
            'redirect_uri': 'http://localhost/redirect',
            'response_type': 'token id_token',
            "scope": "account openid link ban lol_region"
        }, {
            headers: {
                'Cookie': `ssid=${cookies.ssid}`,
                'User-Agent': this.user_agent
            },
            jar: this.cookieJar,
            withCredentials: true,
            httpsAgent: httpAgent,
        }).then((response) => {
            if (response.data.errorCode) {
                throw new Error(response.data.errorCode);
            } else if (response.data.error) {
                throw new Error(response.data.error);
            }
            // parse uri
            var parsedUrl = url.parse(response.data.response.parameters.uri);
            // strip # from hash
            var hash = parsedUrl.hash.replace('#', '');
            // parse query string from hash
            var parts = querystring.parse(hash);
            this.id_token = parts.id_token;
            // return access token
            return parts.access_token;
        }).then((access_token) => {
            return axios.post('https://entitlements.auth.riotgames.com/api/token/v1', {}, {
                jar: this.cookieJar,
                withCredentials: true,
                headers: {
                    'Authorization': `Bearer ${access_token}`,
                },
                httpsAgent: httpAgent,
            }).then((response) => {
                this.access_token = access_token;
                this.entitlements_token = response.data.entitlements_token;
            })
        }).then(() => {
            return axios.post('https://auth.riotgames.com/userinfo', {}, {
                jar: this.cookieJar,
                withCredentials: true,
                headers: {
                    'Authorization': `Bearer ${this.access_token}`,
                },
            }).then((response) => {
                this.username = response.data.username;
                this.user_id = response.data.sub;
            })
        });
    }

    authorize(username, password) {
        this.cookieJar = new tough.CookieJar();
        this.multifactor = false;
        let ms = new Date();
        ms.setDate(ms.getDate() + 30);
        return axios.post('https://auth.riotgames.com/api/v1/authorization', {
            'client_id': 'riot-client',
            'nonce': '69420',
            'redirect_uri': 'http://localhost/redirect',
            'response_type': 'token id_token',
            "scope": "account openid link ban lol_region"
        }, {
            headers: {
                'User-Agent': this.user_agent
            },
            jar: this.cookieJar,
            withCredentials: true,
            httpsAgent: httpAgent,
        }).then((res) => {
            return axios.put('https://auth.riotgames.com/api/v1/authorization', {
                'type': 'auth',
                'username': username,
                'password': password,
                "remember": true
            }, {
                headers: {
                    'User-Agent': this.user_agent
                },
                jar: this.cookieJar,
                httpsAgent: httpAgent,
                withCredentials: true,
            }).then((response) => {
                let cooked = {};
                response.headers["set-cookie"].forEach((cookie) => {
                    let split = cookie.split("=");
                    cooked[split[0]] = split.slice(1).join("=");
                });
                this.cookies = cooked;

                if (response.data.type === "multifactor") {
                    this.multifactor = true;
                    return;
                }
                // if (response.data?.error === "auth_failure") {
                //     throw new Error("auth_failure: username or password is incorrect.");
                // } else
                 if (response.data.errorCode) {
                    throw new Error(response.data.errorCode);
                } else if (response.data.error) {
                    throw new Error(response.data.error);
                }

                // parse uri
                var parsedUrl = url.parse(response.data.response.parameters.uri);
                // strip # from hash
                var hash = parsedUrl.hash.replace('#', '');
                // parse query string from hash
                var parts = querystring.parse(hash);
                this.id_token = parts.id_token;
                // return access token
                return parts.access_token
            });
        }).then((access_token) => {

            // console.log(this.cookies)
            if (this.multifactor === true) return;
            return axios.post('https://entitlements.auth.riotgames.com/api/token/v1', {}, {
                jar: this.cookieJar,
                withCredentials: true,
                headers: {
                    'Authorization': `Bearer ${access_token}`,
                },
                httpsAgent: httpAgent,
            }).then((response) => {
                this.access_token = access_token;
                this.entitlements_token = response.data.entitlements_token;
            });
        }).then(() => {
            if (this.multifactor === true) return;
            return axios.post('https://auth.riotgames.com/userinfo', {}, {
                jar: this.cookieJar,
                withCredentials: true,
                headers: {
                    'Authorization': `Bearer ${this.access_token}`,
                },
            }).then((response) => {
                this.username = response.data.username;
                this.user_id = response.data.sub;
                this.mfa_ms = ms.getTime();
            })
        })
    }

    mfa(code) {
        let ms = new Date();
        ms.setDate(ms.getDate() + 30);
        return axios.put('https://auth.riotgames.com/api/v1/authorization', {
            'code': code,
            'rememberDevice': true,
            'type': 'multifactor',
        }, {
            jar: this.cookieJar,
            headers: {
                'User-Agent': this.user_agent
            },
            withCredentials: true,
            httpsAgent: httpAgent,
        }).then((response) => {
            let cooked = {};
            response.headers["set-cookie"].forEach((cookie) => {
                let split = cookie.split("=");
                cooked[split[0]] = split.slice(1).join("=");
            });
            this.cookies = cooked;
            // check for error
            if (response.data.errorCode) {
                throw new Error(response.data.errorCode);
            } else if (response.data.error) {
                throw new Error(response.data.error);

            }
            // parse uri
            var parsedUrl = url.parse(response.data.response.parameters.uri);

            // strip # from hash
            var hash = parsedUrl.hash.replace('#', '');

            // parse query string from hash
            var parts = querystring.parse(hash);

            this.id_token = parts.id_token;

            // return access token
            this.access_token = parts.access_token;
        }).then(() => {
            return axios.post('https://entitlements.auth.riotgames.com/api/token/v1', {}, {
                jar: this.cookieJar,
                withCredentials: true,
                headers: {
                    'Authorization': `Bearer ${this.access_token}`,
                },
            }).then((response) => {
                this.entitlements_token = response.data.entitlements_token;
            });
        }).then(() => {
            return axios.post('https://auth.riotgames.com/userinfo', {}, {
                jar: this.cookieJar,
                withCredentials: true,
                httpsAgent: httpAgent,
                headers: {
                    'Authorization': `Bearer ${this.access_token}`,
                },
            }).then((response) => {
                this.user_id = response.data.sub;
                this.mfa_ms = ms.getTime();
                this.username = response.data.username;
            });
        });
    }

    getConfig(region = this.region) {
        return axios.get(this.getSharedDataServiceUrl(region) + '/v1/config/' + region);
    }

    getRegion() {
        let cookieJar = new tough.CookieJar();
        return axios.post('https://auth.riotgames.com/api/v1/authorization', {
            'client_id': 'play-valorant-web-prod',
            'nonce': '1',
            'redirect_uri': 'https://playvalorant.com/opt_in',
            'response_type': 'token id_token',
            "scope": "account openid"
        }, {
            headers: {
                'User-Agent': this.user_agent
            },
            jar: cookieJar,
            httpsAgent: httpAgent,
        }).then((res) => {
            return axios.put('https://riot-geo.pas.si.riotgames.com/pas/v1/product/valorant', {
                "id_token": this.id_token,
            }, {
                headers: {
                    'Authorization': `Bearer ${this.access_token}`
                },
                jar: cookieJar,
                httpsAgent: httpAgent,
            });
        })
    }

    async getPurchaseHistory() {
        if (this.ssid == null) {
            return axios.get('https://login.playersupport.riotgames.com/login?brand_id=360004106774&locale_id=1&return_to=https://support-valorant.riotgames.com/hc/en-us/articles/360045132434-Checking-Your-Purchase-History-', {
                jar: this.cookieJar,
                withCredentials: true,
                httpsAgent: httpAgent,
            }).catch(async (response) => {
                return axios.get('https://sspd.playersupport.riotgames.com/valorant_purchase_history', {
                    jar: this.cookieJar,
                    withCredentials: true,
                    httpsAgent: httpAgent,
                })
            })
        } else {
            return axios.get('https://login.playersupport.riotgames.com/login?brand_id=360004106774&locale_id=1&return_to=https://support-valorant.riotgames.com/hc/en-us/articles/360045132434-Checking-Your-Purchase-History-', {
                jar: this.cookieJar,
                withCredentials: true,
                httpsAgent: httpAgent,
                headers: {
                    cookie: `ssid=${this.ssid};`
                },
            }).catch(async (response) => {
                return axios.get('https://sspd.playersupport.riotgames.com/valorant_purchase_history', {
                    jar: this.cookieJar,
                    withCredentials: true,
                    httpsAgent: httpAgent,
                    headers: {
                        cookie: `ssid=${this.ssid};`
                    },
                })
            })
        }
    }

    getContent() {
        return axios.get(this.getSharedDataServiceUrl(this.region) + '/content-service/v3/content', {
            headers: this.generateRequestHeaders(),
            httpsAgent: httpAgent,
        });
    }

    getEntitlements(playerId) {
        return axios.get(this.getPlayerDataServiceUrl(this.region) + `/store/v1/entitlements/${playerId}`, {
            headers: this.generateRequestHeaders(),
            httpsAgent: httpAgent,
        });
    }

    getMatch(matchId) {
        return axios.get(this.getPlayerDataServiceUrl(this.region) + `/match-details/v1/matches/${matchId}`, {
            headers: this.generateRequestHeaders(),
            httpsAgent: httpAgent,
        });
    }

    getParty(partyId) {
        return axios.get(this.getPartyServiceUrl(this.region) + `/parties/v1/parties/${partyId}`, {
            headers: this.generateRequestHeaders(),
            httpsAgent: httpAgent,
        });
    }

    getClientVersion() {
        return axios.get("https://api.empressival.com/version").then((response) => {
            this.client_version = (response.data.data.riotClientVersion).replace("=shipping", "");
            this.user_agent = `RiotClient/${response.data.data.riotClientBuild} rso-auth (Windows;10;;Professional, x64)`;
        })
    }

    getMaintenances() {
        return axios.get(`https://valorant.secure.dyn.riotcdn.net/channels/public/x/status/${this.region}.json`)
    }
    getPartyByPlayer(playerId) {
        return axios.get(this.getPartyServiceUrl(this.region) + `/parties/v1/players/${playerId}`, {
            headers: this.generateRequestHeaders(),
            httpsAgent: httpAgent,
        });
    }

    getCompetitiveLeaderboard(seasonId, startIndex = 0, size = 510) {
        return axios.get(this.getPlayerDataServiceUrl(this.region) + `/mmr/v1/leaderboards/affinity/${this.region}/queue/competitive/season/${seasonId}?startIndex=${startIndex}&size=${size}`, {
            headers: this.generateRequestHeaders(),
            httpsAgent: httpAgent,
        });
    }

    getPlayerLoadout(playerId) {
        return axios.get(this.getPlayerDataServiceUrl(this.region) + `/personalization/v2/players/${playerId}/playerloadout`, {
            headers: this.generateRequestHeaders(),
            httpsAgent: httpAgent,
        });
    }
    getPlayerSkins(playerId) {
        return axios.get(this.getPlayerDataServiceUrl(this.region) + `/store/v1/entitlements/${playerId}/e7c63390-eda7-46e0-bb7a-a6abdacd2433`, {
            headers: this.generateRequestHeaders(),
            httpsAgent: httpAgent,
        });
    }

    getPlayerSettings() {
        return axios.get(`https://playerpreferences.riotgames.com/playerPref/v3/getPreference/Ares.PlayerSettings`, {
            headers: this.generateRequestHeaders(),
            httpsAgent: httpAgent,
        });
    }

    savePreference(body) {
        return axios.put(`https://playerpreferences.riotgames.com/playerPref/v3/savePreference`, body, {
            headers: this.generateRequestHeaders(),
            httpsAgent: httpAgent,
        });
    }

    getPlayerMMR(playerId) {
        return axios.get(this.getPlayerDataServiceUrl(this.region) + `/mmr/v1/players/${playerId}`, {
            headers: this.generateRequestHeaders(),
            httpsAgent: httpAgent,
        });
    }

    getPlayerMatchHistory(playerId, startIndex = 0, endIndex = 10) {
        return axios.get(this.getPlayerDataServiceUrl(this.region) + `/match-history/v1/history/${playerId}?startIndex=${startIndex}&endIndex=${endIndex}`, {
            headers: this.generateRequestHeaders(),
            httpsAgent: httpAgent,
        });
    }

    getPlayerCompetitiveHistory(playerId, startIndex = 0, endIndex = 10) {
        return axios.get(this.getPlayerDataServiceUrl(this.region) + `/mmr/v1/players/${playerId}/competitiveupdates?startIndex=${startIndex}&endIndex=${endIndex}`, {
            headers: this.generateRequestHeaders(),
            httpsAgent: httpAgent,
        });
    }

    getPlayerAccountXp(playerId) {
        return axios.get(this.getPlayerDataServiceUrl(this.region) + `/account-xp/v1/players/${playerId}`, {
            headers: this.generateRequestHeaders(),
            httpsAgent: httpAgent,
        });
    }

    getPlayerWallet(playerId) {
        return axios.get(this.getPlayerDataServiceUrl(this.region) + `/store/v1/wallet/${playerId}`, {
            headers: this.generateRequestHeaders(),
            httpsAgent: httpAgent,
        });
    }

    getPlayerStoreFront(playerId) {
        return axios.get(this.getPlayerDataServiceUrl(this.region) + `/store/v2/storefront/${playerId}`, {
            headers: this.generateRequestHeaders(),
            httpsAgent: httpAgent,
        });
    }

    getPlayers(playerIds) {
        return axios.put(this.getPlayerDataServiceUrl(this.region) + '/name-service/v2/players', playerIds, {
            headers: this.generateRequestHeaders(),
            httpsAgent: httpAgent,
        });
    }

    getSession(playerId) {
        return axios.get(this.getPartyServiceUrl(this.region) + `/session/v1/sessions/${playerId}`, {
            headers: this.generateRequestHeaders(),
            httpsAgent: httpAgent,
        });
    }

    getContractDefinitions() {
        return axios.get(this.getPlayerDataServiceUrl(this.region) + '/contract-definitions/v2/definitions', {
            headers: this.generateRequestHeaders(),
            httpsAgent: httpAgent,
        });
    }

    getStoryContractDefinitions() {
        return axios.get(this.getPlayerDataServiceUrl(this.region) + '/contract-definitions/v2/definitions/story', {
            headers: this.generateRequestHeaders(),
            httpsAgent: httpAgent,
        });
    }

    getStoreOffers() {
        return axios.get(this.getPlayerDataServiceUrl(this.region) + `/store/v1/offers`, {
            headers: this.generateRequestHeaders(),
            httpsAgent: httpAgent,
        });
    }

    getContract(playerId) {
        return axios.get(this.getPlayerDataServiceUrl(this.region) + `/contracts/v1/contracts/${playerId}`, {
            headers: this.generateRequestHeaders(),
            httpsAgent: httpAgent,
        });
    }

    getItemUpgradesV2() {
        return axios.get(this.getPlayerDataServiceUrl(this.region) + `/contract-definitions/v2/item-upgrades`, {
            headers: this.generateRequestHeaders(),
            httpsAgent: httpAgent,
        });
    }

    getItemUpgradesV3() {
        return axios.get(this.getPlayerDataServiceUrl(this.region) + `/contract-definitions/v3/item-upgrades`, {
            headers: this.generateRequestHeaders(),
            httpsAgent: httpAgent,
        });
    }

    getWeeklies() {
        return axios.get(`https://valorant-api.com/v1/missions?language=zh-TW`, {})
    }

    getBattlepassPurchase(playerId) {
        return axios.get(this.getPlayerDataServiceUrl(this.region) + `/store/v1/entitlements/${playerId}/f85cb6f7-33e5-4dc8-b609-ec7212301948`, {
            headers: this.generateRequestHeaders(),
            httpsAgent: httpAgent,
        });
    }

    getPreplayer(playerId) {
        return axios.get(this.getPlayerDataPregameURL(this.region) + `/v1/players/${playerId}`, {
            headers: this.generateRequestHeaders(),
            httpsAgent: httpAgent,
        });
    }

    getPrematch(matchId) {
        return axios.get(this.getPlayerDataPregameURL(this.region) + `/v1/matches/${matchId}`, {
            headers: this.generateRequestHeaders(),
            httpsAgent: httpAgent,
        });
    }

    getCorePlayer(playerId) {
        return axios.get(this.getCoreGameDataServiceURL(this.region) + `/v1/players/${playerId}`, {
            headers: this.generateRequestHeaders(),
            httpsAgent: httpAgent,
        });
    }

    getCoreMatch(matchId) {
        return axios.get(this.getCoreGameDataServiceURL(this.region) + `/v1/matches/${matchId}`, {
            headers: this.generateRequestHeaders(),
            httpsAgent: httpAgent,
        });
    }
}

module.exports = API;
