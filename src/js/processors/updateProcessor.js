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
            if (response.data.version > global.version_buffer)
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
                global.mainWindow.webContents.send('setPlayButtonState', false);
                global.mainWindow.webContents.send('setPlayButtonText', 'Play');
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
        // only download 5 files at a time
        if (global.ongoingDownloads.length <= 5) {
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

            // remove from ongoing downloads
            global.ongoingDownloads = global.ongoingDownloads.filter((item) => item.url !== url);

            // remove from downloadProgresses
            //delete downloadProgresses[url];
        } else {
            global.queuedDownloads.push({url: url, path: path});
        };
    },

    async checkMD5AndUpdate(localPath, jsonUrl) {
        // Fetch the JSON file from the given URL using Axios
        const response = await axios.get(jsonUrl);
        const filesData = response.data;

        let filesCompleted = 1;
        // Iterate over the entries in the JSON file
        for (const entry of filesData) {

            // get key of json array value
            const filePath = Object.keys(entry)[0];
            const fileUrl = `http://cdn-1.gamefreedom.org/deus-classless/${filePath}`;

            // get value of json array value
            const expectedHash = entry[filePath];

            let relativePath = path.join(localPath, filePath);

            // Check if file exists if not just download it and continue
            if (!fs.existsSync(relativePath))
            {
                //ensure directory exists if not create it
                const dir = path.dirname(relativePath);
                if (!fs.existsSync(dir))
                    fs.mkdirSync(dir);

                //download the file
                const file = await this.downloadFile(fileUrl, relativePath);
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
                    const fileResponse = await module.exports.downloadFile(fileUrl, relativePath);

                    console.log(`Updated file ${filePath}`);
                } else {
                    console.log(`File ${filePath} is up-to-date`);
                }

                // update progress bar
                const percentCompleted = Math.floor(filesCompleted / filesData.length * 100)
                global.mainWindow.webContents.send('setProgressBarOverallPercent', percentCompleted);

                // update progress bar text
                global.mainWindow.webContents.send('setProgressTextOverall', `Validating ${relativePath} ${percentCompleted}% (${filesCompleted}/${filesData.length})`);
                filesCompleted++;

                if (filesCompleted == filesData.length)
                {
                    global.mainWindow.webContents.send('setProgressBarOverallPercent', 0);
                    global.mainWindow.webContents.send('setProgressTextOverall', '');
                    global.mainWindow.webContents.send('hideProgressBarOverall', true);

                    global.mainWindow.webContents.send('hideProgressBarCurrent', true);

                    global.mainWindow.webContents.send('setPlayButtonState', false);
                    global.mainWindow.webContents.send('setPlayButtonText', 'Play');

                    global.userSettings.clientVersion     = globals.serverVersion;
                    global.userSettings.gameDownloaded    = true;
                    global.userSettings.needUpdate        = false;
                }
            });
        }
    }
}

