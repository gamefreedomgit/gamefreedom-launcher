const fs          = require('fs');
const globals     = require( '../globals.js' ).globals;
const update      = require('./updateProcessor.js');
const log         = require('./logProcessor.js');
const ipcRenderer = require('electron').ipcRenderer;

const default_settings = {
    gameName: "maelstrom",
    gameLocation: "",
    httpUpdate: true,
    clientVersion: 0,
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

        global.userSettings = default_settings;
        global.mainWindow.webContents.send('setGameLocation', default_settings.gameLocation);
        global.mainWindow.webContents.send('showFirstTimeSetup');
    });
}

module.exports = {
    load: async function(fileLocation)
    {
        const location = await fileLocation + "/" + "whitemane.conf";

        fs.readFile(location, function(error, settings)
        {
            if (error)
            {
                write_default(location);
                return;
            }

            if (settings.byteLength == 0 || settings == undefined)
            {
                write_default(location);
                return;
            }

            global.userSettings = JSON.parse(settings);
            global.userSettings.save = module.exports.save;

            if (global.userSettings.httpUpdate == undefined) // old config
            {
                write_default(location);
                return;
            }

            global.mainWindow.webContents.send('setGameLocation', global.userSettings.gameLocation);
            update.initialize();
        })
    },

    save: async function( fileLocation, callback )
    {
        const location = await fileLocation + "/" + "whitemane.conf";

        fs.writeFile(location, JSON.stringify(global.userSettings), function(error)
        {
            if (error)
            {
                log.error(error);
                return
            }

            if (callback)
                 callback();
        })
    }
}
