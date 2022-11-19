const fs = require('fs');
const globals = require( '../globals.js' ).globals;
const p2p = require('./p2pProcessor.js');
const log = require('./logProcessor.js');
const ipcRenderer = require('electron').ipcRenderer;

const default_settings = {
    previousExpansion: "Whitemane",
    gameLocation: "",
    gameDownloaded: false,
    needUpdate: false,
    cataUserVersion: 0,
    wotlkUserVersion: 0
}

function write_default(location)
{
    fs.writeFile(location, JSON.stringify(default_settings), function(error)
    {
        if (error)
        {
            log.error("Couldn't save default config:");
            log.error(error);
            return;
        }
        else
        {
            global.userSettings = default_settings;
            global.mainWindow.webContents.send('setExpacSelectText', global.userSettings.previousExpansion);
            global.mainWindow.webContents.send('setUserSettings', global.userSettings);
            global.mainWindow.webContents.send('showFirstTimeSetup');
        }
    });
}

module.exports = {
    load: async function(fileLocation)
    {
        const location = await fileLocation + "/" + "launcherSettings.conf";

        fs.readFile(location, function(error, settings)
        {
            if (error)
            {
                write_default(location);
            }
            else
            {
                if (settings.byteLength == 0 || settings == undefined)
                {
                    write_default(location);
                    return;
                } 

                if (!globals.initialized)
                {
                    global.userSettings = JSON.parse(settings);
                    global.mainWindow.webContents.send('setExpacSelectText', global.userSettings.previousExpansion);
                    global.mainWindow.webContents.send('setUserSettings', global.userSettings);
                    p2p.initialize();

                    if (global.userSettings.gameLocation == "" || global.userSettings.gameLocation == undefined)
                    {
                      global.mainWindow.webContents.send('showFirstTimeSetup');
                    }
                }
            }
        })
    },

    save: async function( fileLocation, callback )
    {
        const location = await fileLocation + "/" + "launcherSettings.conf";

        fs.writeFile(location, JSON.stringify(global.userSettings), function(error)
        {
            if (error)
                log.error(error);
            else
            {
                if (callback)
                    callback();
            }
        })
    }
}   