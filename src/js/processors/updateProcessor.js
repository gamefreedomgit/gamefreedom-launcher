const fetch       = require('node-fetch');
const axios       = require('axios');
const crypto      = require('crypto');
const fs          = require('fs');
const path        = require('path');
const globals     = require('../globals.js').globals;
const Progress    = require('node-fetch-progress');
const settings    = require('./settingsProcessor.js');
const autoUpdater = require('electron-updater').autoUpdater;
const log         = require('./logProcessor');

let queueLoop = null;

module.exports = {
    checkForUpdates: function(callback)
    {
        if (globals.updateInProgress == true)
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

            // if (gameVersion != global.version_buffer)
            // {
            //     globals.needUpdate = true;

            //     global.mainWindow.webContents.send('setPlayButtonState', false);
            //     global.mainWindow.webContents.send('setPlayButtonText', 'Update');

            //     global.mainWindow.webContents.send('setPlayButtonState', false);
            //     global.mainWindow.webContents.send('setVerifyButtonText', '<i class="fa fa-exclamation-triangle" aria-hidden="true"></i> Update required');
            // }
            // else
            {
                globals.needUpdate = false;

                global.mainWindow.webContents.send('setPlayButtonState', false);
                global.mainWindow.webContents.send('setPlayButtonText', 'Play');

                global.mainWindow.webContents.send('setVerifyButtonState', false);
                global.mainWindow.webContents.send('setVerifyButtonText', '<i class="fa fa-bolt" aria-hidden="true"></i> Run');
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
        }, 60000);

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
        }, 60000);

        this.checkForUpdates(function()
        {
            if (globals.needUpdate == true)
            {
                global.mainWindow.webContents.send('setPlayButtonState', false);
                global.mainWindow.webContents.send('setPlayButtonText', 'Update Available');
            }
        });

        globals.initialized = true;
    },

    downloadFile: async function(url, path) {
        const res = await fetch(url);
        const progress = new Progress(res, { throttle: 100 })
        progress.on('progress', (p) => {
            downloadProgresses[url] = p;
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

    async checkMD5(file, jsonURL)
    {
        const response = await axios.get(jsonURL);
        const filesData = response.data;

        for (const entry of filesData)
        {
            const filePath = Object.keys(entry)[0];
            const expectedHash = entry[filePath];

            let relativePath = path.join(global.userSettings.gameLocation, filePath);

            if (file == relativePath)
            {
                const fileContent = fs.readFileSync(file);

                const hash = crypto.createHash('md5');
                hash.update(fileContent);

                const md5 = hash.digest('hex');

                if (md5 != expectedHash)
                {
                    return false;
                }

                return true;
            }
        }

        return false;
    },

    async checkMD5AndUpdate(localPath, jsonUrl)
    {
        globals.updateInProgress = true;

        // Fetch the JSON file from the given URL using Axios
        const response = await axios.get(jsonUrl);
        const filesData = response.data;

        let filesCompleted = 1;
        // Iterate over the entries in the JSON file
        for (const entry of filesData) {
            global.validatingFiles.push(entry);

            // get key of json array value
            const filePath = Object.keys(entry)[0];
            const fileUrl = `https://cdn-1.gamefreedom.org/${global.userSettings.gameName}/${filePath}`;

            // get value of json array value
            const expectedHash = entry[filePath];

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

            let hash = crypto.createHash('md5'),
                stream = fs.createReadStream(relativePath);

            stream.on('data', _buff => { hash.update(_buff, 'utf8'); });
            stream.on('end', async function() {
                const actualHash = hash.digest('hex');

                // Compare the actual and expected hashes
                if (actualHash !== expectedHash) {
                    console.log(`File ${filePath} is outdated, expected hash: ${expectedHash}, actual hash: ${actualHash}`);

                    // Download the updated file from the given URL
                    global.queuedDownloads.push({url: fileUrl, path: relativePath});
                } else {
                    console.log(`File ${filePath} is up-to-date`);
                }

                // update progress bar
                const percentCompleted = Math.floor(filesCompleted / filesData.length * 100)
                global.mainWindow.webContents.send('setProgressBarOverallPercent', percentCompleted);

                // update progress bar text
                global.mainWindow.webContents.send('setProgressTextOverall', `Validating ${relativePath} ${percentCompleted}% (${filesCompleted}/${filesData.length})`);
                filesCompleted++;

                global.validatingFiles.splice(global.validatingFiles.indexOf(entry), 1);
            });
        }
    }
}

