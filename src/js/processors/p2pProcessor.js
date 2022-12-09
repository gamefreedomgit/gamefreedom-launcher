const globals           = require( '../globals.js' ).globals;
const log               = require('./logProcessor')
const axios             = require('axios');
const WebTorrent        = require('webtorrent');
const parseTorrent      = require('parse-torrent');
const moment            = require('moment')
const { autoUpdater }   = require('electron-updater');
var compare             = require('compare-semver');
const app_data_path     = require('appdata-path');
const reg_edit          = require('regedit');
const chmodr            = require('chmodr');

let downloadOngoing;
let progressInterval;

function prettyBytes(num)
{
    var exponent,
            unit,
            neg = num < 0,
            units = ['B', 'kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    if (neg)
        num = -num;

    if (num < 1)
        return (neg ? '-' : '') + num + ' B';

    exponent = Math.min(Math.floor(Math.log(num) / Math.log(1000)), units.length - 1);
    num            = Number((num / Math.pow(1000, exponent)).toFixed(2));
    unit         = units[exponent];

    return (neg ? '-' : '') + num + ' ' + unit;
}

function getProgress(download)
{
    if (!download)
        return;

    var progress =
    {
        percent:        0,
        downloaded:     0,
        remaining:      0,
        total:          0,
        downloadSpeed:  0
    }

    var percent = Math.round(download.progress * 100 * 100) / 100;

    progress.percent        = percent + '%';
    progress.downloaded     = prettyBytes(download.downloaded);
    progress.total          = prettyBytes(download.length);

    var remaining;

    if (download.done)
    {
        remaining = 'Done.';
    }
    else
    {
        remaining = moment.duration(download.timeRemaining / 1000, 'seconds').humanize();
        remaining = remaining[0].toUpperCase() + remaining.substring(1) + ' remaining.';
    }

    progress.remaining         = remaining;
    progress.downloadSpeed = prettyBytes(download.downloadSpeed) + '/s';

    return progress;
}

function download_finished(link)
{
    clearInterval(progressInterval);
    if (global.p2pClient != undefined && global.p2pClient.destroyed != true)
    {
        global.p2pClient.destroy();
    }

    global.mainWindow.webContents.send('hideProgressBar', true);
    global.mainWindow.webContents.send('setProgressText', "");
    global.mainWindow.webContents.send('setPlayButtonState', false);
    global.mainWindow.webContents.send('setPlayButtonText', 'Play');
    global.mainWindow.webContents.send('setVerifyButtonState', false);
    global.mainWindow.webContents.send('setVerifyButtonText', '<i class="fa fa-bolt" aria-hidden="true"></i> Run');

    global.userSettings.gameDownloaded    = true;
    global.userSettings.needUpdate        = false;
    global.update_buffer                  = false;
    global.version_buffer                 = globals.serverVersion;
    global.uploading                      = true;
    downloadOngoing                       = false;
    global.userSettings.clientVersion     = globals.serverVersion;
    global.userSettings.gameLocation      = link.path;
    global.userSettings.gameName          = link.name;

    require('./settingsProcessor.js').save(global.userData);

    let game_folder = global.userSettings.gameLocation + '/' + global.userSettings.gameName;

    chmodr(game_folder, 0o777, function(error)
    {
        if (error)
            console.log('Failed to execute chmod', error);
        else
            console.log('Success');
    });
}

global.update_buffer = false;

module.exports = {
    queryBuffer: async function(url)
    {
            try
            {
                const response = await axios.get(url);
                return response;
            }
            catch (error)
            {
                log.error(error);
            }
    },

    checkForUpdates: async function(callback)
    {
        if (global.launcherUpdateFound == false)
        {
            autoUpdater.checkForUpdatesAndNotify().then((result) =>
            {
                if (result != null)
                {
                    if (compare.gt(result.version, global.appVersion))
                    {
                        global.launcherUpdateFound = true;
                    }
                }
            });
        }

        if (callback)
        {
            this.checkForGameUpdate(callback);
        }
         else
        {
            this.checkForGameUpdate();
        }
    },

    initialize: function()
    {
        global.p2pClient = new WebTorrent();
        downloadOngoing  = false;

        global.version_buffer = global.userSettings.clientVersion;

        global.updateLoopId = setInterval(function()
        {
            module.exports.checkForUpdates();
        }, 60000);

        if (global.userSettings.gameDownloaded == true)
        {
            module.exports.checkForUpdates(function()
            {
                globals.initialized = true;
            });
        }
        else
        {
            module.exports.checkForUpdates(function()
            {
                global.mainWindow.webContents.send('setPlayButtonState', false);
                global.mainWindow.webContents.send('setPlayButtonText', 'Download');
            });
        }
    },

    download: async function()
    {
        if (global.userSettings.gameLocation == "" || global.userSettings.gameLocation == undefined)
            return;

        if (global.p2pClient != undefined)
        {
            if (global.p2pClient.destroyed != true)
            {
                global.p2pClient.destroy();
            }

            global.p2pClient = new WebTorrent();
        }

        try
        {
            // TODO: Replace this with a proper md5 checksum in future
            fs.unlinkSync(global.userSettings.gameLocation);
        }
        catch(error)
        {
            // TODO: Add some error handler here?
        }

        var torrent = global.userSettings.gameName;

        switch (global.userSettings.gameName)
        {
            case 'maelstrom':
                torrent = globals.cataDownload;
                break;
            case 'deus-classless':
                torrent = globals.deusDownload;
                break;
            default:
                torrent = globals.cataDownload;
                break;
        }

        global.p2pClient.add(torrent, { path: global.userSettings.gameLocation }, function(link)
        {
            downloadOngoing = true;

            link.on('error', function(error)
            {
                downloadOngoing = false;
                log.error(error);
            });

            link.on('download', (bytes) =>
            {
                global.version_buffer = globals.serverVersion;
                downloadOngoing       = true;
            });

            progressInterval = setInterval(function()
            {
                var progress = getProgress(link);
                var text = progress.remaining + " | " + progress.percent + " (" + progress.downloaded + " / " + progress.total + " )" + " - " + progress.downloadSpeed;

                global.mainWindow.webContents.send('setProgressText', text);
                global.mainWindow.webContents.send('setProgressBarPercent', Math.round(link.progress * 100 * 100) / 100);
            }, 1000);

            link.on('done', function()
            {
                download_finished(link);
            });
        });
    },

    checkForGameUpdate: async function(callback)
    {
        var torrent = global.userSettings.gameName;

        switch (global.userSettings.gameName)
        {
            case 'maelstrom':
                torrent = globals.cataDownload;
                break;
            case 'deus-classless':
                torrent = globals.deusDownload;
                break;
            default:
                torrent = globals.cataDownload;
                break;
        }

        var cata = await module.exports.queryBuffer(torrent);

        if (cata != undefined)
        {
            global.cataServerBuffer = cata.data;

            if (callback)
                callback();
        }

        var result = await module.exports.queryBuffer(globals.launcherInfo);

        try
        {
            if (global.userSettings.gameLocation == "" || global.userSettings.gameLocation == undefined)
                return;

            const ajax = result.data;

            ajax.repos.forEach(element =>
            {
                if (element.name == global.userSettings.gameName)
                    globals.serverVersion = element.version;
            });

            if ((global.version_buffer < globals.serverVersion) && downloadOngoing == true)
            {
                let count = 0;
                if (global.p2pClient != undefined)
                {
                    if (global.p2pClient.destroyed != true)
                    {
                        global.p2pClient.destroy();
                    }

                    global.p2pClient = new WebTorrent();
                }

                downloadOngoing = false
                global.userSettings.needUpdate = true;
                global.mainWindow.webContents.send('setPlayButtonText', 'Update Game');
                global.mainWindow.webContents.send('setPlayButtonState', false);
                global.mainWindow.webContents.send('hideProgressBar', true);
                global.mainWindow.webContents.send('setProgressText', "Gathering game data...");
                global.mainWindow.webContents.send('setProgressBarPercent', 0);
                global.version_buffer = globals.serverVersion;

                var torrent = global.userSettings.gameName;

                switch (global.userSettings.gameName)
                {
                    case 'maelstrom':
                        torrent = globals.cataDownload;
                        break;
                    case 'deus-classless':
                        torrent = globals.deusDownload;
                        break;
                    default:
                        torrent = globals.cataDownload;
                        break;
                }

                var cata = await module.exports.queryBuffer(torrent);
                if (cata.data != undefined)
                {
                    global.cataServerBuffer = cata.data;

                    if (callback)
                        callback();
                }
            }

            if (downloadOngoing == false)
            {
                if (global.version_buffer < result.data.repos[0].version && global.update_buffer == false)
                {
                    global.update_buffer = true;
                    global.userSettings.needUpdate = true;
                    global.mainWindow.webContents.send('setPlayButtonText', 'Update Game');
                    global.mainWindow.webContents.send('setPlayButtonState', false);
                    global.mainWindow.webContents.send('hideProgressBar', true);
                    global.mainWindow.webContents.send('setProgressText', "Gathering game data...");
                    global.mainWindow.webContents.send('setProgressBarPercent', 0);
                    global.version_buffer = globals.cataServerVersion;
                    return;
                }

                if (global.userSettings.gameDownloaded == true && global.userSettings.needUpdate == true && global.update_buffer == true)
                {
                    if (global.cataServerBuffer != undefined && global.p2pClient != undefined && global.p2pClient.destroyed != true)
                    {
                        global.p2pClient.torrents.forEach(torrent =>
                        {
                            if (torrent.path == global.userSettings.gameLocation)
                                global.p2pClient.remove(torrent);
                        });

                        //download = Buffer.from(global.cataServerBuffer, 'base64');
                        await this.download();
                    }
                }
                else
                {
                    global.mainWindow.webContents.send('setPlayButtonText', 'Play');
                    global.mainWindow.webContents.send('setPlayButtonState', false);

                    global.mainWindow.webContents.send('setVerifyButtonText', '<i class="fa fa-bolt" aria-hidden="true"></i> Run');
                    global.mainWindow.webContents.send('setVerifyButtonState', false);
                }
            }
        }
        catch(error)
        {
            log.error(error);
        }
    }
}
