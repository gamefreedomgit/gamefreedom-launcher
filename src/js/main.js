const { app, BrowserWindow, ipcRenderer, ipcMain, dialog, session, url, globalShortcut } = require('electron');
const { autoUpdater }                 = require('electron-updater');
const log                             = require('../js/processors/logProcessor');
const settings                        = require('../js/processors/settingsProcessor');
const path                            = require('path');
const {globals}                       = require('../js/globals.js');
const update                          = require('./processors/updateProcessor');
const files                           = require('./utils/fileManager.js');
const child                           = require('child_process').execFile;
const fs                              = require('fs-extra');
const app_data_path                   = require('appdata-path');
const { exec }                        = require('child_process');
const { execPath }                    = require('process');
const { dir }                         = require('console');
var Sudoer                            = require('electron-sudo').default;

const distanceInWordsToNow = require('date-fns/formatDistanceToNow')
const addSeconds = require('date-fns/addSeconds')
const bytes = require('bytes')

const env         = process.env.NODE_ENV || 'development';
const get_runtime = new Date();

// If development environment
if (env === 'development') {
    try {
        require('electron-reloader')(module, {
            debug: true,
            watchRenderer: false,
        });
    } catch (_) { console.log('Error'); }
}

// Handle creating / removing shortcuts on windows when (un)installing
if (require('electron-squirrel-startup')) // eslint-disable-line global-require
  app.quit();

// Disables hardware acceleration for current app
app.disableHardwareAcceleration();

function selectedFolder()
{
  return global.userSettings.gameLocation;
}

function selectedGame()
{
  return global.userSettings.gameName;
}

function initiate()
{
  global.launcherUpdateFound = false;
  global.downloadOngoing     = false;

  global.userData         = app.getPath('userData');
  global.uploading        = false;}

function create_main_window()
{
  global.mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 1280,
    minHeight: 720,
    maxWidth: 3820, // 1600
    maxHeight: 2160, // 900
    icon: app.getAppPath() + '/assets/images/icon.png',
    backgroundColor: "#202225",
    movable: true,
    resizable: true,
    maximizable: true,
    fullscreenable: false,
    frame: false,
    hasShadow: true,
    roundedCorners: false,
    show: false,
    webPreferences:
    {
      nodeIntegration: true,
      contextIsolation: false,
      //enableRemoteModule: true,
      //preload: app.getAppPath() + '/src/preload.js',
      webviewTag: true
    }
  });

  global.mainWindow.loadFile(app.getAppPath() + '/src/index.html');

  /**
   * While loading the page, the ready-to-show event will be emitted when the renderer process has rendered the page for the first time if the window has not been shown yet.
   * Showing the window after this event will have no visual flash.
   * This event is usually emitted after the did-finish-load event, but for pages with many remote resources, it may be emitted before the did-finish-load event.
   */
  global.mainWindow.once('ready-to-show', function()
  {
    initiate();

    setTimeout(function()
    {
      // Remove 'x-frame-options' header to allow embedding external pages into an 'iframe'
      global.mainWindow.webContents.session.webRequest.onHeadersReceived(
        { urls: ['*://*/*'] },
        function(details, callback)
        {
          Object.keys(details.responseHeaders).filter(x => x.toLowerCase() === 'x-frame-options')
                .map(x => delete details.responseHeaders[x])

          callback({
            cancel: false,
            responseHeaders: details.responseHeaders,
          });
      });

      global.mainWindow.show();

      let currentURL = global.mainWindow.webContents.getURL();
      console.log(currentURL);

      settings.load(global.userData);

    }, 5000);
  });

  global.mainWindow.webContents.on("did-fail-load", function()
  {
    //? Show error here
    console.error('mainWindow error.');
  });
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', function()
{
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0)
  {
    create_main_window();
  }
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', function()
{
  if (process.platform !== 'darwin')
    app.quit();
});

app.on('browser-window-focus', function () {
    globalShortcut.register("CommandOrControl+R", () => {
        console.log("CommandOrControl+R is pressed: Shortcut Disabled");
    });
    globalShortcut.register("F5", () => {
        console.log("F5 is pressed: Shortcut Disabled");
    });
});

app.on('browser-window-blur', function () {
    globalShortcut.unregister('CommandOrControl+R');
    globalShortcut.unregister('F5');
});

global.queuedDownloads = [];
global.ongoingDownloads = [];
global.downloadProgresses = [];
global.validatingFiles = [];
global.updateLoop = null;

function startUpdateLoop()
{
    let downloadInterval = 0;
    if (global.updateLoop == null || global.updateLoop._destroyed == true)
    {
        global.updateLoop = setInterval(() => {
            downloadInterval++;

            for (let downloadNumber = 0; downloadNumber < global.queuedDownloads.length; downloadNumber++) {
                const download = global.queuedDownloads[downloadNumber];

                if (download != null) {
                    global.ongoingDownloads.push(global.queuedDownloads.shift());
                    update.downloadFile(download.url, download.path);
                }
            }

            if (downloadInterval < 10)
                return;

            // calculate overall progress
            let overallDone = 0;
            let overallTotal = 0;
            let overallProgress = 0;
            let overallRate = 0;
            let overallEta = 0;

            for (const url in global.downloadProgresses) {
                if (global.downloadProgresses[url] != null) {
                    overallDone += global.downloadProgresses[url].done;
                    overallTotal += global.downloadProgresses[url].total;
                    overallProgress += global.downloadProgresses[url].progress;
                    overallRate += global.downloadProgresses[url].rate;
                    overallEta += global.downloadProgresses[url].eta;
                };
            };

            // average everything out
            let downloadProgressesLength = global.downloadProgresses.length + 1;

            overallTotal = overallTotal / downloadProgressesLength;
            overallDone = overallDone / downloadProgressesLength;
            overallProgress = overallProgress / downloadProgressesLength;
            overallRate = overallRate / downloadProgressesLength;
            overallEta = overallEta / downloadProgressesLength;

            if (global.ongoingDownloads.length != 0 || global.queuedDownloads.length != 0)
            {
                // update progress bars
                global.mainWindow.webContents.send('hideProgressBarCurrent', false);
                global.mainWindow.webContents.send('setProgressBarCurrentPercent', overallProgress);

                const etaDate = addSeconds(new Date(), overallEta);

                global.mainWindow.webContents.send('setProgressTextCurrent', `${bytes(overallDone)} / ${bytes(overallTotal)} (${bytes(overallRate, 'MB')}/s) ETA: ${distanceInWordsToNow(etaDate)}`);
            }

            if (global.ongoingDownloads.length == 0 && global.queuedDownloads.length == 0 && global.validatingFiles.length == 0)
            {
                // all downloads are done hide progress bars
                global.mainWindow.webContents.send('setProgressBarCurrentPercent', 0);
                global.mainWindow.webContents.send('setProgressTextCurrent', '');
                global.mainWindow.webContents.send('hideProgressBarCurrent', true);

                global.mainWindow.webContents.send('setProgressBarOverallPercent', 0);
                global.mainWindow.webContents.send('setProgressTextOverall', '');
                global.mainWindow.webContents.send('hideProgressBarOverall', true);

                global.mainWindow.webContents.send('setPlayButtonState', false);
                global.mainWindow.webContents.send('setPlayButtonText', 'Play');

                global.mainWindow.webContents.send('setVerifyButtonState', false);
                global.mainWindow.webContents.send('setVerifyButtonText', '<i class="fa fa-bolt" aria-hidden="true"></i> Run');

                global.userSettings.clientVersion     = globals.serverVersion;
                global.userSettings.gameDownloaded    = true;
                global.userSettings.needUpdate        = false;
                global.userSettings.updateInProgress  = false;
                global.userSettings.downloadOngoing   = false;

                globals.updateInProgress = false;

                settings.save(app.getPath('userData'));

                clearInterval(global.updateLoop);
            }
        }, 1000);
    }
}

ipcMain.on('beginDownload', async function(event)
{
    global.updateInProgress        = true;
    global.userSettings.needUpdate = true;
    global.downloadOngoing         = true;
    global.update_buffer           = true;

    update.checkMD5AndUpdate(selectedFolder(), globals.cataDownload).then(() => {
        settings.save(app.getPath('userData'));
    });

    startUpdateLoop();
});

ipcMain.on('beginVerify', async function(event)
{
  global.updateInProgress        = true;
  global.userSettings.needUpdate = true;
  global.downloadOngoing         = true;
  global.update_buffer           = true;
  //track progress


  update.checkMD5AndUpdate(selectedFolder(), globals.cataDownload).then(() => {
    settings.save(app.getPath('userData'));
  });

  startUpdateLoop();
});

ipcMain.on('launchGame', async function(event)
{
  try
  {
    let rootPath  = selectedFolder();
    let exePath   = rootPath + '\/Whitemane.exe';

    console.log(rootPath);

    // Remove cache on client launch
    let first_cache    = rootPath + "\/Cache";
    let second_cache   = rootPath + "\/Data\/Cache";

    try
    {
        fs.rmSync(first_cache,  { recursive: true });
        fs.rmSync(second_cache, { recursive: true });
    }
    catch (error)
    {
      log.error(error);
    }

    //! CHECK FOR THE LATEST PATCH FOR THAT SPECIFIC SERVER/REALM
    global.mainWindow.webContents.send('setPlayButtonState', true);
    global.mainWindow.webContents.send('setPlayButtonText', 'Running');
    global.mainWindow.webContents.send('setVerifyButtonState', true);
    global.mainWindow.webContents.send('setVerifyButtonText', '<i class="fa fa-warning" aria-hidden="true"></i> Game is running');

    let filesToCheck = [
        'Whitemane.exe',
        'Data\\wow-update-base-39665.MPQ'
    ];


    let passedIntegrity = true;
    // Check each file md5 hash to see if it's the correct version
    for (let i = 0; i < filesToCheck.length; i++)
    {
        // Check if the file exists
        if(!fs.existsSync(rootPath + '\/' + filesToCheck[i]))
        {
            passedIntegrity = false;
            break;
        }

        const md5Passed = await update.checkMD5(rootPath + '\\' + filesToCheck[i], globals.cataDownload);

        if (!md5Passed)
        {
            passedIntegrity = false;
            break;
        }
    }

    if (!passedIntegrity)
    {
        global.updateInProgress        = true;
        global.userSettings.needUpdate = true;
        global.downloadOngoing         = true;
        global.update_buffer           = true;

        global.mainWindow.webContents.send('hideProgressBarOverall', false);
        global.mainWindow.webContents.send('hideProgressBarCurrent', false);
        global.mainWindow.webContents.send('setPlayButtonText', 'Verifying');

        update.checkMD5AndUpdate(selectedFolder(), globals.cataDownload).then(() => {
            settings.save(app.getPath('userData'));
        });

        startUpdateLoop();
        return;
    }

    // check config.wtf in ./WTF/Config.wtf for locale. Ensure it's enUS

    let configWTF = rootPath + '\/WTF\/Config.wtf';
    if(fs.existsSync(configWTF))
    {
        let configWTFData = fs.readFileSync(configWTF, 'utf8');

        // find 'SET locale "enUS"'

        let localeRegex = /SET locale "(.*)"/;
        let localeMatch = configWTFData.match(localeRegex);

        // find "set realmlist"
        let realmlistRegex = /SET realmlist "(.*)"/;

        let realmlistMatch = configWTFData.match(realmlistRegex);

        // find "set patchlist"
        let patchlistRegex = /SET patchlist "(.*)"/;
        let patchlistMatch = configWTFData.match(patchlistRegex);
        let configChanged = false;

        if (localeMatch)
        {
            // set to enUS
            if (localeMatch[1] !== 'enUS')
            {
                configWTFData = configWTFData.replace(localeRegex, 'SET locale "enUS"');
                configChanged = true;
            }
        }

        if (realmlistMatch)
        {
            if (realmlistMatch[1] !== 'logon.gamefreedom.org:3725')
            {
                configWTFData = configWTFData.replace(realmlistRegex, 'SET realmlist "logon.gamefreedom.org:3725"');
                configChanged = true;
            }
        }

        if (patchlistMatch)
        {
            if (patchlistMatch[1] !== '127.0.0.1')
            {
                configWTFData = configWTFData.replace(patchlistRegex, 'SET patchlist "127.0.0.1"');
                configChanged = true;
            }
        }

        if (configChanged)
            fs.writeFileSync(configWTF, configWTFData);
    }

    switch (process.platform)
    {
      case "win32":
      {
        exec(`set __COMPAT_LAYER=WIN7RTM && "${ exePath }"`, function(error, data)
        {
          if (error)
            throw new Error(error);

          global.mainWindow.webContents.send('setPlayButtonState', false);
          global.mainWindow.webContents.send('setPlayButtonText', 'Play');
          global.mainWindow.webContents.send('setVerifyButtonState', false);
          global.mainWindow.webContents.send('setVerifyButtonText', '<i class="fa fa-bolt" aria-hidden="true"></i> Run');
        });

        break;
      }
      case "linux":
      {
        exec(`WINEPREFIX="/home/$(whoami)/.config/GameFreedom/" WINEARCH=win64 wine "${ exePath }"`, function(error, data)
        {
          if (error)
            throw new Error(error);

            global.mainWindow.webContents.send('setPlayButtonState', false);
            global.mainWindow.webContents.send('setPlayButtonText', 'Play');
            global.mainWindow.webContents.send('setVerifyButtonState', false);
            global.mainWindow.webContents.send('setVerifyButtonText', '<i class="fa fa-bolt" aria-hidden="true"></i> Run');
        });

        break;
      }
      default:
      {
        exec(execPath, function(error, data)
        {
          if (error)
            throw new Error(error);

        });

        break;
      }
    }
  }
  catch(error)
  {
    global.mainWindow.webContents.send('setPlayButtonState', true);
    global.mainWindow.webContents.send('setVerifyButtonState', true);
    log.error(error);
  }
});

autoUpdater.on('update-available', function()
{
  global.mainWindow.webContents.send('update_available');
  global.launcherUpdateFound = true;
});

autoUpdater.on('update-downloaded', function()
{
  global.mainWindow.webContents.send('update_downloaded');
});

ipcMain.on('restart_app', function()
{
  autoUpdater.quitAndInstall();
});

ipcMain.on('quit', function(event)
{
  settings.save(app.getPath('userData'));
  app.quit();
})

ipcMain.on('minimize', function(event)
{
  BrowserWindow.getFocusedWindow().minimize();
})

ipcMain.on('app_version', function(event)
{
  event.sender.send('app_version', { version: app.getVersion() });
  global.appVersion = app.getVersion();
});

ipcMain.on('selectDirectory', async function(event)
{
  let dir = await dialog.showOpenDialog(global.mainWindow, {
    properties: ['openDirectory']
  });

  if (global.updateInProgress == true)
  {
    const warn = {
        type: 'warning',
        title: 'Please wait',
        message: "There's already a download in progress."
    };

    dialog.showMessageBox(warn);
    return;
  }

  if (dir && dir.filePaths.length > 0)
  {
    if (dir.filePaths[0] == selectedFolder())
    {
        log.write('User tried to set game location to the same path, ignore it.');
        return;
    }

    try
    {
        global.mainWindow.webContents.send('setGameLocation', dir.filePaths[0]);
        global.mainWindow.webContents.send('setVerifyButtonState', false);
        global.mainWindow.webContents.send('setVerifyButtonText', '<i class="fa fa-bolt" aria-hidden="true"></i> Run');

        global.userSettings.gameLocation = dir.filePaths[0];
        settings.save(app.getPath('userData'));
    }
    catch(err)
    {
      log.error(err);
    }
  }
  else
  {
    const warn = {
        type: 'warning',
        title: 'Warning',
        message: "Something went wrong with choosing your new game path, please try again."
    };

    dialog.showMessageBox(warn);
  }
});

ipcMain.on('firstSelectDirectory', async function(event)
{
  let dir = await dialog.showOpenDialog(global.mainWindow, {
    properties: ['openDirectory']
  });

  if (dir && dir.filePaths.length > 0)
  {
    try
    {
      global.mainWindow.webContents.send('setGameLocation', dir.filePaths[0]);
      global.mainWindow.webContents.send('closeFirstTimeSetup');

      global.userSettings.gameLocation = dir.filePaths[0];
      settings.save(app.getPath('userData'));

      global.mainWindow.webContents.send('setPlayButtonState', false);
      global.mainWindow.webContents.send('setVerifyButtonState', false);
      global.mainWindow.webContents.send('setVerifyButtonText', '<i class="fa fa-bolt" aria-hidden="true"></i> Run');
    }
    catch(err)
    {
      log.error(err);
    }
  }
  else
  {
    const warn = {
        type: 'warning',
        title: 'Warning',
        message: "Something went wrong with choosing your game path, please try again."
    };

    dialog.showMessageBox(warn);
  }
});
