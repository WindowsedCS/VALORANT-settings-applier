const inquirer = require("inquirer");
class ConfigManager {

    constructor() {

        this.username = null;
        this.password = null;
        this.chioces = null;
        this.data = {};
        this.Language = {};
        this.Languags = {};
        this.profile = null;
        this.profileName = null;
        this.replace = null;
        this.mfaCode = null;
    }
    static reloadData(data, Language) {
        this.data = data;
        this.Language = Language;
    }

    static async Setup() {
        await this.askForUsername();
        await this.askForPassword();
    }

    static async askForUsername() {

        let u = null;

        do {

            const aUsername = await inquirer.prompt({
                name: "username",
                type: "input",
                message: this.Language["askForUsername"],
                default() {
                    return null;
                },
            });

            u = aUsername.username;


        } while (u == null);

        this.setUsername(u);

    }
    static async askForPassword() {

        let p = null;

        do {

            const aPassword = await inquirer.prompt({
                name: "password",
                type: "password",
                message: this.Language["askForPassword"],
                mask: "*",
                default() {
                    return null;
                },
            });

            p = aPassword.password;


        } while (p == null);

        this.setPassword(p);

    }
    static async askForMfa() {
        inquirer.registerPrompt('maxlength-input', MaxLengthInputPrompt)
        let u = null;

        do {

            const aMFA = await inquirer.prompt({
                name: "mfa",
                type: "input",
                message: this.Language["askForMfaCode"],
                default() {
                    return null;
                },
            });

            u = aMFA.mfa;


        } while (u == null);

        this.setMFA(u);
    }
    static async askForSelection(playername, username) {
        let s = null;

        do {
            const aSelection = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'selection',
                    message: this.Language["select"],
                    choices: [
                        {
                            name: this.Language["loggedInAs"],
                            disabled: `${playername} (${username})`
                        },
                        {
                            name: this.Language["changeAccount"],
                            value: 1
                        },
                        {
                            name: this.Language["saveSettings"],
                            value: 2
                        },
                        {
                            name: this.Language["applySettings"],
                            value: 3
                        },
                    ],
                    default() {
                        return null;
                    },
                },
            ])
            s = aSelection.selection
        } while (s == null);
        this.setOptions(s);
    }

    static async askForLanguage() {
        let s = null;

        do {
            const alanguage = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'language',
                    message: `Language/語言`,
                    choices: [
                        {
                            name: `English`,
                            value: 1
                        },
                        {
                            name: `繁體中文`,
                            value: 2
                        },
                        {
                            name: `简体中文`,
                            value: 3
                        },
                    ],
                    default() {
                        return null;
                    },
                },
            ])
            s = alanguage.language
        } while (s == null);
        this.setLanguage(s);
    }

    static async askForProfile(profileList = []) {
        let s = null;

        do {
            const aProfile = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'profile',
                    message: `${this.Language["profileAvailable"]}`,
                    choices: profileList,
                    default() {
                        return null;
                    },
                },
            ])
            s = aProfile.profile
        } while (s == null);
        this.setProfile(s);
    }

    static async askForNameProfile() {
        let s = null;

        do {
            const aName = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'name',
                    message: `${this.Language["profileAvailable"]}`,
                    default() {
                        return null;
                    },
                },
            ])
            s = aName.name
        } while (s == null);
        this.setName(s);
    }
    static async askForReplace(name) {
        let s = null;

        do {
            const aConfirm = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'confirm',
                    message: this.Language["replaceWarning"].replace("{{name}}", name),
                    default() {
                        return null;
                    },
                },
            ])
            s = aConfirm.confirm
        } while (s == null);
        this.setReplace(s);
    }
    // GETTERS
    static getUsername() {
        return this.username;
    }
    static getPassword() {
        return this.password;
    }
    static getProfile() {
        return this.profile;
    }
    static getName() {
        return this.profileName;
    }
    static getOptions() {
        return this.chioces;
    }
    static getLanguags() {
        return this.Languags;
    }
    static getReplace() {
        return this.replace;
    }
    static getMfa() {
        return this.mfaCode;
    }
    static setUsername(user) {
        this.username = user;
    }

    static setPassword(pass) {
        this.password = pass;
    }

    static setOptions(options) {
        this.chioces = options;
    }
    static setLanguage(options) {
        this.Languags = options;
    }
    static setProfile(options) {
        this.profile = options;
    }
    static setName(options) {
        this.profileName = options
    }
    static setReplace(options) {
        this.replace = options
    }
    static setMFA(options) {
        this.mfaCode = options
    }
}
module.exports = { ConfigManager }