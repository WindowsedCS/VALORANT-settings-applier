const fs = require("fs")
let data = {};
let Language = {};
const VALORANT = require("./valorant.js");
const zlib = require("zlib");
const languageFile = require("./language.json")
let playerName = null;
const { ConfigManager } = require("./utils/ConfigManager.js")
const color = require("./utils/ColorManager");
process.title = "Valorant Settings Applier"
async function main() {
    await createData();
    await reloadData().then(() => {
        ConfigManager.reloadData(data, Language)
    });
    let username, password
    if (!fs.existsSync("./cookies")) fs.mkdirSync("./cookies");
    if (data.hasOwnProperty("account") && data.hasOwnProperty("cookies")) {
        if (data["account"].hasOwnProperty("username") && data["account"].hasOwnProperty("password")) {
            if ((data["account"]["username"] == null || data["account"]["password"] == null) && data["cookies"] == null) {
                await ConfigManager.Setup()
            }
        }
        username = ConfigManager.getUsername()
        password = ConfigManager.getPassword()

        // mainProcess
        const valorant = new VALORANT.API();
        await valorant.getClientVersion();
        if (data["cookies"] == null) {
            await valorant.authorize(username, password).then(async () => {
                data["cookies"] = valorant.cookies;
                if (valorant.multifactor == true) {
                    await ConfigManager.askForMfa()
                    const code = ConfigManager.getMfa();
                    await valorant.mfa(code);
                    data["cookies"] = valorant.cookies;
                }
                if (valorant.user_id) {
                    data["account"]["username"] = username;
                    data["account"]["password"] = password;
                    fs.writeFileSync(`./cookies/${valorant.username}.json`, JSON.stringify(valorant.cookies, null, "\t"));
                    fs.writeFileSync("./data.json", JSON.stringify(data, null, "\t"));
                }
            }).catch((err) => {
                console.log(err);
                process.stdout.write(Language["WRONG_USERNAMEORPASSWORD"])
                process.stdin.resume();
            });
        } else if (data["cookies"]) {
            await valorant.reAuthorize(data["cookies"]).catch(async (error) => {
                console.log(error.message);
                data["cookies"] = null
                fs.writeFileSync("./data.json", JSON.stringify(data, null, "\t"));
            });
        }
        if (valorant.user_id) {
            const playerData = (await valorant.getPlayers([valorant.user_id])).data;
            playerName = `${playerData[0]["GameName"]}#${playerData[0]["TagLine"]}`;
            askForSelection(valorant);
        }
    } else {
        createData(true);
        main();
    }
}
async function applySettings(profileList = [], valorant = new VALORANT.API()) {
    await ConfigManager.askForProfile(profileList);
    const profileName = ConfigManager.getProfile();
    if (fs.existsSync(`./profiles/${profileName}.json`)) {
        let profileData = fs.readFileSync(`./profiles/${profileName}.json`, "utf8");
        profileData = zlib.deflateRawSync(profileData, { windowBits: 15 }).toString('base64');
        await valorant.savePreference({ type: "Ares.PlayerSettings", data: profileData });
    } else {
        console.log(`${color.Red}${Language["profileNotExist"]}${color.Reset}`);
        await applySettings(profileList);
    }
}

async function nameSettings(settings) {
    await ConfigManager.askForNameProfile();
    const name = ConfigManager.getName();
    if (fs.existsSync(`./profiles/${name}.json`)) {
        await ConfigManager.askForReplace(name);
        const replace = ConfigManager.getReplace();
        if (replace == true) {
            fs.writeFileSync(`./profiles/${name}.json`, JSON.stringify(settings, null, "\t"));
        } else {
            await nameSettings(settings);
        }
    } else {
        fs.writeFileSync(`./profiles/${name}.json`, JSON.stringify(settings, null, "\t"));
    }
}

async function askForSelection(valorant = new VALORANT.API()) {
    console.clear();
    await ConfigManager.askForSelection(playerName, data["account"]["username"]);
    const options = ConfigManager.getOptions();

    switch (options.toString()) {
        case "1":
            console.log(`${color.FgYellow}${Language["changeAccount"]}`)
            data["cookies"] = null;
            data["account"]["username"] = null;
            data["account"]["password"] = null;
            await ConfigManager.Setup();

            username = ConfigManager.getUsername();
            password = ConfigManager.getPassword();

            if (fs.existsSync(`./cookies/${username}.json`)) {
                let cookie = fs.readFileSync(`./cookies/${username}.json`, "utf8");
                cookie = JSON.parse(cookie);
                await valorant.reAuthorize(cookie).then(async () => {
                    data["cookies"] = cookie;
                    data["account"]["username"] = username;
                    data["account"]["password"] = password;
                }).catch(async (error) => {
                    console.log(error.message);
                    data["cookies"] = null
                });
                fs.writeFileSync("./data.json", JSON.stringify(data, null, "\t"));
            } else {
                username = ConfigManager.getUsername();
                password = ConfigManager.getPassword();


                await valorant.authorize(username, password).then(async (error) => {
                    data["cookies"] = valorant.cookies;
                    if (valorant.multifactor == true) {
                        await ConfigManager.askForMfa()
                        const code = ConfigManager.getMfa();
                        await valorant.mfa(code);
                        data["cookies"] = valorant.cookies;
                    }
                    if (valorant.user_id) {
                        data["account"]["username"] = username;
                        data["account"]["password"] = password;
                        fs.writeFileSync(`./cookies/${valorant.username}.json`, JSON.stringify(valorant.cookies, null, "\t"));
                        fs.writeFileSync("./data.json", JSON.stringify(data, null, "\t"));
                    }
                }).catch((err) => {
                    process.stdout.write(Language["WRONG_USERNAMEORPASSWORD"])
                    process.stdin.resume();
                });
            }
            if (valorant.user_id) {
                const playerData = (await valorant.getPlayers([valorant.user_id])).data;
                playerName = `${playerData[0]["GameName"]}#${playerData[0]["TagLine"]}`;
            }
            break;
        case "2":
            console.log(`${color.FgYellow}${Language["saveSettings"]}`)
            await valorant.getPlayerSettings().then(async (response) => {
                let settings = zlib.inflateRawSync(new Buffer.from(response.data.data, 'base64'), { windowBits: 15 }).toString();
                settings = JSON.parse(settings);
                if (!fs.existsSync("./profiles")) {
                    fs.mkdirSync("./profiles");
                }
                await nameSettings(settings);
            })
            break;
        case "3":
            console.log(`${color.FgYellow}${Language["applySettings"]}`)
            let profileList = [];
            if (!fs.existsSync("./profiles")) {
                fs.mkdirSync("./profiles");
            }
            const profiles = fs.readdirSync("./profiles/");
            profiles.filter((profile) => profile.split(".").pop() === "json").forEach((profile) => {
                profileList.push(profile.replace(".json", ""));
            });
            await applySettings(profileList, valorant);
            break;
        default:
            break;
    }

    askForSelection(valorant);

}
async function askForLanguage() {
    const defaultData = {
        account: {
            username: null,
            password: null
        },
        cookies: null,
        language: "en-US",
    }
    await ConfigManager.askForLanguage(playerName)
    const language = ConfigManager.getLanguags()

    switch (language.toString()) {
        case "1":
            defaultData["language"] = "en-US"
            Language = languageFile["en-US"];
            fs.writeFileSync("./data.json", JSON.stringify(defaultData, null, "\t"));
            break;
        case "2":
            defaultData["language"] = "zh-TW"
            Language = languageFile["zh-TW"];
            fs.writeFileSync("./data.json", JSON.stringify(defaultData, null, "\t"));
            break;
        case "3":
            defaultData["language"] = "zh-CN"
            Language = languageFile["zh-CN"];
            fs.writeFileSync("./data.json", JSON.stringify(defaultData, null, "\t"));
            break;
        default:
            await askForLanguage();
            break;
    }
}
async function createData(force = false) {
    if (!fs.existsSync("./data.json") || force == true) {
        await askForLanguage();
    }
}
async function reloadData() {
    let dataUnparsed = fs.readFileSync("./data.json", "utf8");
    data = JSON.parse(dataUnparsed);
    Language = languageFile[data["language"]];
}
main()
