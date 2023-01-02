const fs = require("fs");
const readline = require('readline');
const VALORANT = require("./valorant.js");
const zlib = require("zlib");
let data = {};
let playerName = null;

//From https://stackoverflow.com/questions/9781218/how-to-change-node-jss-console-font-color
class Color {
    Reset = "\x1b[0m"
    Bright = "\x1b[1m"
    Dim = "\x1b[2m"
    Underscore = "\x1b[4m"
    Blink = "\x1b[5m"
    Reverse = "\x1b[7m"
    Hidden = "\x1b[8m"

    FgBlack = "\x1b[30m"
    FgRed = "\x1b[31m"
    FgGreen = "\x1b[32m"
    FgYellow = "\x1b[33m"
    FgBlue = "\x1b[34m"
    FgMagenta = "\x1b[35m"
    FgCyan = "\x1b[36m"
    FgWhite = "\x1b[37m"
    FgGray = "\x1b[90m"

    BgBlack = "\x1b[40m"
    BgRed = "\x1b[41m"
    BgGreen = "\x1b[42m"
    BgYellow = "\x1b[43m"
    BgBlue = "\x1b[44m"
    BgMagenta = "\x1b[45m"
    BgCyan = "\x1b[46m"
    BgWhite = "\x1b[47m"
    BgGray = "\x1b[100m"
}

const color = new Color();

async function main() {
    await createData();
    await reloadData();
    if (!fs.existsSync("./cookies")) fs.mkdirSync("./cookies");
    if (data.hasOwnProperty("account") && data.hasOwnProperty("cookies")) {
        if (data["account"].hasOwnProperty("username") && data["account"].hasOwnProperty("password")) {
            if ((data["account"]["username"] == null || data["account"]["password"] == null) && data["cookies"] == null) {
                await askForCredentials();
            }
        }
        // mainProcess
        const valorant = new VALORANT.API();
        await valorant.getClientVersion();
        if (data["cookies"] == null) {
            await valorant.authorize(data["account"]["username"], data["account"]["password"]).then(async (error) => {
                data["cookies"] = valorant.cookies;
                if (valorant.multifactor == true) {
                    const code = await askQuestion("Please enter your multifactor authencation code (check your email): ");
                    await valorant.mfa(code);
                    data["cookies"] = valorant.cookies;
                }
                fs.writeFileSync(`./cookies/${valorant.username}.json`, JSON.stringify(valorant.cookies, null, "\t"));
                fs.writeFileSync("./data.json", JSON.stringify(data, null, "\t"));
            }).catch(async (error) => {
                console.log(error.message);
            });
        } else {
            await valorant.reAuthorize(data["cookies"]).catch(async (error) => {
                console.log(error.message);
            });
        }
        const playerData = (await valorant.getPlayers([valorant.user_id])).data;
        playerName = `${playerData[0]["GameName"]}#${playerData[0]["TagLine"]}`;
        askForSelection(valorant);
    } else {
        createData(true);
        main();
    }
}

async function askForSelection(valorant = new VALORANT.API()) {
    console.clear();
    const option = await askQuestion(`Logged in as ${color.FgCyan}${playerName}\n${color.FgYellow}Change VALORANT account: ${color.FgGreen}1\n${color.FgYellow}Backup current settings in the account: ${color.FgGreen}2\n${color.FgYellow}Apply specify profile to current account: ${color.FgGreen}3\n${color.Reset}Please select: `);
    switch (option) {
        case "1":
            data["cookies"] = null;
            data["account"]["username"] = null;
            data["account"]["password"] = null;
            await askForCredentials();

            if (fs.existsSync(`./cookies/${data["account"]["username"]}.json`)) {
                let cookie = fs.readFileSync(`./cookies/${data["account"]["username"]}.json`, "utf8");
                cookie = JSON.parse(cookie);
                data["cookies"] = cookie;
                fs.writeFileSync("./data.json", JSON.stringify(data, null, "\t"));
                await valorant.reAuthorize(data["cookies"]).catch(async (error) => {
                    console.log(error.message);
                });
            } else {
                await valorant.authorize(data["account"]["username"], data["account"]["password"]).then(async (error) => {
                    data["cookies"] = valorant.cookies;
                    if (valorant.multifactor == true) {
                        const code = await askQuestion("Please enter your multifactor authencation code (check your email): ");
                        await valorant.mfa(code);
                        data["cookies"] = valorant.cookies;
                    }
                    fs.writeFileSync(`./cookies/${valorant.username}.json`, JSON.stringify(valorant.cookies, null, "\t"));
                    fs.writeFileSync("./data.json", JSON.stringify(data, null, "\t"));
                }).catch(async (error) => {
                    console.log(error.message);
                });
            }
            const playerData = (await valorant.getPlayers([valorant.user_id])).data;
            playerName = `${playerData[0]["GameName"]}#${playerData[0]["TagLine"]}`;
            break;
        case "2":
            await valorant.getPlayerSettings().then(async (response) => {
                let settings = zlib.inflateRawSync(new Buffer.from(response.data.data, 'base64'), {windowBits: 15}).toString();
                settings = JSON.parse(settings);
                if (!fs.existsSync("./profiles")) {
                    fs.mkdirSync("./profiles");
                }
                await nameSettings(settings);
            })
            break;
        case "3":
            let profileList = [];
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

async function applySettings(profileList = [], valorant = new VALORANT.API()) {
    const profileName = await askQuestion(`${color.FgYellow}Following profiles are available to apply\n${color.FgGreen}${profileList.join("\n")}\n${color.Reset}Please select: `);
    if (fs.existsSync(`./profiles/${profileName}.json`)) {
        let profileData = fs.readFileSync(`./profiles/${profileName}.json`, "utf8");
        profileData = zlib.deflateRawSync(profileData, {windowBits: 15}).toString('base64');
        await valorant.savePreference({type: "Ares.PlayerSettings", data: profileData});
    } else {
        console.log(`${color.Red}The profile does not exist!${color.Reset}`);
        await applySettings(profileList);
    }
}

async function nameSettings(settings) {
    const name = await askQuestion(`${color.FgYellow}Please name this settings profile: ${color.Reset}`);
    if (fs.existsSync(`./profiles/${name}.json`)) {
        const replace = await askQuestion(`${color.FgRed}Profile ${name} exists, are you sure you want to replace it? (y/n): ${color.Reset}`);
        if (replace.toLowerCase() == "y" || replace.toLowerCase() == "yes") {
            fs.writeFileSync(`./profiles/${name}.json`, JSON.stringify(settings, null, "\t"));
        } else {
            await nameSettings(settings);
        }
    } else {
        fs.writeFileSync(`./profiles/${name}.json`, JSON.stringify(settings, null, "\t"));
    }
}

async function askForCredentials() {
    const username = await askQuestion("Please enter your VALORANT username: ");
    const password = await askQuestion("Please enter your VALORANT password: ");
    data["account"]["username"] = username;
    data["account"]["password"] = password;
    fs.writeFileSync("./data.json", JSON.stringify(data, null, "\t"));
}

// From https://stackoverflow.com/questions/18193953/waiting-for-user-to-enter-input-in-node-js
function askQuestion(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans);
    }))
}

async function createData(force = false) {
    const defaultData = {
        account: {
            username: null,
            password: null
        },
        cookies: null,
    }
    if (!fs.existsSync("./data.json") || force == true) {
        fs.writeFileSync("./data.json", JSON.stringify(defaultData, null, "\t"));
    }
}

async function reloadData() {
    let dataUnparsed = fs.readFileSync("./data.json", "utf8");
    data = JSON.parse(dataUnparsed);
}

main();