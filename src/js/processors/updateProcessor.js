const fetch = require('node-fetch');
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {globals} = require('../globals.js');
const Progress = require('node-fetch-progress');
const settings = require('./settingsProcessor.js');



let queueLoop = null;

module.exports = {
    checkForUpdates: function(callback)
    {
        if (globals.updateInProgress == true)
            return;

        globals.updateInProgress = true;

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
                    break;
                }
            }

            if (gameVersion > global.version_buffer)
            {
                global.mainWindow.webContents.send('setPlayButtonState', false);
                global.mainWindow.webContents.send('setPlayButtonText', 'Update');
                global.userSettings.needUpdate = true;
            }
            else
            {
                global.mainWindow.webContents.send('setPlayButtonState', true);
                global.mainWindow.webContents.send('setPlayButtonText', 'Play');
                global.userSettings.needUpdate = false;
            }

            if (callback)
                callback();
        })
        .catch(function(error)
        {
            log.error(error);
        })
        .then(function()
        {
            globals.updateInProgress = false;
        });
    },

    initialize: function()
    {
        downloadOngoing  = false;

        global.version_buffer = global.userSettings.clientVersion;

        global.updateLoopId = setInterval(function()
        {
            module.exports.checkForUpdates();
        }, 60000);

        if (global.userSettings.gameDownloaded == true)
        {
            this.checkForUpdates(function()
            {
                globals.initialized = true;
            });
        }
        else
        {
            this.checkForUpdates(function()
            {
                global.mainWindow.webContents.send('setPlayButtonState', false);
                global.mainWindow.webContents.send('setPlayButtonText', 'Download');
            });
        }
    },

    downloadFile: async function(url, path) {
        global.ongoingDownloads.push({url: url, path: path});
        const res = await fetch(url);
        const progress = new Progress(res, { throttle: 100 })
        progress.on('progress', (p) => {
            downloadProgresses[url] = p;
        });

        const fileStream = fs.createWriteStream(path);
        await new Promise((resolve, reject) => {
            res.body.pipe(fileStream);
            res.body.on("error", reject);
            fileStream.on("finish", resolve);
        });
    },

    async checkMD5AndUpdate(localPath, jsonUrl) {
        // Fetch the JSON file from the given URL using Axios
        const response = await axios.get(jsonUrl);
        const filesData = response.data;


        globals.updateInProgress = true;
        let filesCompleted = 1;
        // Iterate over the entries in the JSON file
        for (const entry of filesData) {

            // get key of json array value
            const filePath = Object.keys(entry)[0];
            const fileUrl = `http://cdn-1.gamefreedom.org/${global.userSettings.gameName}/${filePath}`;

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

                //download the file
                global.queuedDownloads.push({url: fileUrl, path: relativePath});
                filesCompleted++;
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

                // all files have been validated hide progress bar
                if (filesCompleted == filesData.length)
                {
                    global.mainWindow.webContents.send('setProgressBarOverallPercent', 0);
                    global.mainWindow.webContents.send('setProgressTextOverall', '');

                    global.mainWindow.webContents.send('hideProgressBarOverall', true);
                }
            });
        }
    }
}

