const fetch       = require('node-fetch');
const axios       = require('axios');
const crypto      = require('crypto');
const fs          = require('fs');
const path        = require('path');
const globals     = require('../globals.js').globals;
const Progress    = require('node-fetch-progress');
const settings    = require('./settingsProcessor');
const autoUpdater = require('electron-updater').autoUpdater;
const log         = require('./logProcessor');

let queueLoop = null;

module.exports = {
    checkForUpdates: function(callback)
    {
        if (globals.updateInProgress == true || globals.validationInProgress == true)
            return;

        axios.get(globals.launcherInfo)
        .then(function(response)
        {
            // iterate response.data.repos for the selected game
            let gameVersion = 0;

            for (let i = 0; i < response.data.repos.length; i++)
            {
                if (response.data.repos[i].name == global.userSettings.gameName)
                {
                    gameVersion = response.data.repos[i].version;
                    globals.serverVersion = gameVersion;
                    break;
                }
            }

            if ((gameVersion != global.version_buffer) || (global.userSettings.gameValidated == false) || (global.userSettings.gameValidated == undefined))
            {
                globals.needUpdate = true;

                global.mainWindow.webContents.send('SetPlayButtonState', false);
                global.mainWindow.webContents.send('SetPlayButtonText', 'Update Available');

                global.mainWindow.webContents.send('SetValidateButtonState', false);
                global.mainWindow.webContents.send('SetValidateButtonText', '<i class="fa fa-info-circle" aria-hidden="true"></i> Update Required');
            }
            else
            {
                globals.needUpdate = false;

                // All downloads are done clear and hide progress bars.
                global.mainWindow.webContents.send('SetDataProgressBar_Overall', 0, '', true);
                global.mainWindow.webContents.send('SetDataProgressBar_Current', 0, '', true);

                global.mainWindow.webContents.send('SetPlayButtonState', false);
                global.mainWindow.webContents.send('SetPlayButtonText', 'Play');

                global.mainWindow.webContents.send('SetValidateButtonState', false);
                global.mainWindow.webContents.send('SetValidateButtonText', '<i class="fa fa-bolt" aria-hidden="true"></i> Run');
            }

            if (callback)
                callback();
        })
        .catch(function(error)
        {
            log.error(error);
        })
    },

    initialize: function()
    {
        global.version_buffer = global.userSettings.clientVersion;

        global.updateLoopId = setInterval(function()
        {
            module.exports.checkForUpdates();
        }, 10000);

        global.launcherUpdateLoop = setInterval(function()
        {
            if (globals.launcherUpdateFound == false && globals.updateInProgress == false)
            {
                autoUpdater.checkForUpdatesAndNotify().then((result) =>
                {
                    if (result != null)
                    {
                        if (compare.gt(result.version, global.appVersion))
                        {
                            globals.launcherUpdateFound = true;
                        }
                    }
                });
            }
        }, 10000);

        this.checkForUpdates();

        globals.initialized = true;
    },

    downloadFile: async function(url, path)
    {
        const res = await fetch(url);
        const progress = new Progress(res, { throttle: 100 })
        progress.on('progress', (p) => {
            global.downloadProgresses[url] = p;
        });

        const fileStream = fs.createWriteStream(path);
        await new Promise((resolve, reject) => {
            res.body.pipe(fileStream);
            res.body.on("error", reject);
            fileStream.on("finish", () => {
                global.ongoingDownloads.splice(global.ongoingDownloads.indexOf(url), 1);
                fileStream.close();
                resolve();
            });
        });
    },

    async checkGameFilesSize(localPath, jsonUrl)
    {
        // Fetch the JSON file from the given URL using Axios
        const response  = await axios.get(jsonUrl);
        const filesData = response.data;

        let filesCompleted = 0;
        // Iterate over the entries in the JSON file
        for (const entry of filesData) {

            // get key of json array value
            const filePath = Object.keys(entry)[0];

            // get value of json array value
            const expectedSize = entry[filePath]["size"];
            let relativePath = path.join(localPath, filePath);

            // Check if file exists and has correct size
            if (!fs.existsSync(relativePath) || fs.statSync(relativePath).size != expectedSize)
            {
                global.userSettings.gameValidated = false;
                return false;
            }

            filesCompleted++;

            if (filesCompleted == filesData.length)
                return true;
        }

        global.userSettings.gameValidated = false;
        return false;
    },

    async checkMD5AndUpdate(localPath, jsonUrl)
    {
        globals.validationInProgress = true;

        // Fetch the JSON file from the given URL using Axios
        const response  = await axios.get(jsonUrl);
        const filesData = response.data;

        let filesCompleted = 0;
        // Iterate over the entries in the JSON file
        for (const entry of filesData)
        {
            // get key of json array value
            const filePath = Object.keys(entry)[0];
            const fileUrl = `https://cdn-1.gamefreedom.org/${global.userSettings.gameName}/${filePath}`;

            // get value of json array value
            const expectedHash = entry[filePath]["checksum"];
            const expectedSize = entry[filePath]["size"];

            let relativePath = path.join(localPath, filePath);

            // Check if file exists if not just download it and continue
            if (!fs.existsSync(relativePath))
            {
                //ensure directory exists if not create it
                const dir = path.dirname(relativePath);
                if (!fs.existsSync(dir))
                {
                    fs.mkdirSync(dir, {
                        recursive: true
                    });
                }

                 // touch the file so it exists
                 fs.closeSync(fs.openSync(relativePath, 'w'));
            }

            const stats = fs.statSync(relativePath);
            let stream  = fs.createReadStream(relativePath);
            let hash    = crypto.createHash('md5');

            stream.on('data', _buff => { hash.update(_buff, 'utf8'); });
            stream.on('end', async function()
            {
                const actualHash = hash.digest('hex');

                // Compare the actual and expected sizes
                if (stats.size !== expectedSize)
                {
                    console.log(`File ${filePath} is outdated, expected size: ${expectedSize}, actual size: ${stats.size}`);

                    // Download the updated file from the given URL
                    global.queuedDownloads.push({url: fileUrl, path: relativePath});
                }
                // Compare the actual and expected hashes
                else if (actualHash !== expectedHash)
                {
                    console.log(`File ${filePath} is outdated, expected hash: ${expectedHash}, actual hash: ${actualHash}`);

                    // Download the updated file from the given URL
                    global.queuedDownloads.push({url: fileUrl, path: relativePath});
                }
                else
                {
                    console.log(`File ${filePath} is up-to-date`);
                };


                filesCompleted++;
                const percentCompleted = Math.floor(filesCompleted / filesData.length * 100);
                global.mainWindow.webContents.send('SetDataProgressBar_Overall', percentCompleted, `Validating ${relativePath} ${percentCompleted}% (${filesCompleted}/${filesData.length})`, false);

                if (filesCompleted == filesData.length)
                {
                    global.userSettings.gameValidated = true;
                    global.userSettings.clientVersion = globals.serverVersion;
                    global.version_buffer             = globals.serverVersion;
                    globals.validationInProgress      = false;
                }
            });
        }
    }
}

