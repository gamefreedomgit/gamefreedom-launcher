const { app, BrowserWindow, ipcMain, dialog, globalShortcut } = require('electron');
const { autoUpdater }                 = require('electron-updater');
const log                             = require('../js/processors/logProcessor');
const settings                        = require('../js/processors/settingsProcessor');
const path                            = require('path');
const {globals}                       = require('../js/globals.js');
const update                          = require('./processors/updateProcessor');
const child                           = require('child_process').execFile;
const fs                              = require('fs-extra');
const { exec }                        = require('child_process');
const { execPath }                    = require('process');

const distanceInWordsToNow            = require('date-fns/formatDistanceToNow')
const addSeconds                      = require('date-fns/addSeconds')
const bytes                           = require('bytes')

const env         = process.env.NODE_ENV || 'development';

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

function SelectedFolder()
{
  return global.userSettings.gameLocation == undefined ? '' : path.normalize(global.userSettings.gameLocation);
}

function IsSelectedGameValidated()
{
  return global.userSettings.gameValidated == undefined ? false : global.userSettings.gameValidated;
}

function initiate()
{
  global.userData             = app.getPath('userData');
  globals.initialized         = true;
}

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

app.on('browser-window-focus', function ()
{
    globalShortcut.register("CommandOrControl+R", () => {
        console.log("CommandOrControl+R is pressed: Shortcut Disabled");
    });
    globalShortcut.register("F5", () => {
        console.log("F5 is pressed: Shortcut Disabled");
    });
});

app.on('browser-window-blur', function ()
{
    globalShortcut.unregister('CommandOrControl+R');
    globalShortcut.unregister('F5');
});

global.queuedDownloads    = [];
global.ongoingDownloads   = [];
global.downloadProgresses = [];
global.updateLoop         = null;

function startUpdateLoop()
{
    if (global.updateLoop != null)
    {
        clearInterval(global.updateLoop);
        global.updateLoop = null;

        if (global.ongoingDownloads != 0)
            global.ongoingDownloads.length = 0;
    }

    global.updateLoop = setInterval(() =>
    {
        if (!IsSelectedGameValidated())
           return;

        global.queuedDownloads.forEach(download =>
        {
            update.downloadFile(download.url, download.path);
        });

        // Calculate overall progress.
        let overallDone     = 0;
        let overallTotal    = 0;
        let overallRate     = 0;
        let overallEta      = 0;

        global.ongoingDownloads.forEach(download =>
        {
            if (global.downloadProgresses[download] != null)
            {
                overallDone     += global.downloadProgresses[download].done;
                overallTotal    += global.downloadProgresses[download].total;
                overallRate     += global.downloadProgresses[download].rate;
                overallEta      += global.downloadProgresses[download].eta;
            };
        });

        let overallProgress = (overallTotal > 0 && overallDone > 0) ? Math.ceil(overallDone / (overallTotal / 100)) : 0;

        if (global.ongoingDownloads.length != 0)
        {
            const etaDate   = addSeconds(new Date(), overallEta);
            global.mainWindow.webContents.send('SetDataProgressBar', (overallProgress > 100) ? 100 : overallProgress, `${bytes(overallDone)} / ${bytes(overallTotal)} (${bytes(overallRate, 'MB')}/s) ETA: ${distanceInWordsToNow(etaDate)}`, false);
        }

        if (overallProgress >= 100)
        {
            global.ongoingDownloads.length = 0;

            clearInterval(global.updateLoop);
            global.updateLoop = null;

            globals.updateInProgress = false;

            global.mainWindow.webContents.send('SetDataProgressBar', 0, '', true);

            global.mainWindow.webContents.send('SetPlayButtonState', false);
            global.mainWindow.webContents.send('SetPlayButtonText', 'Play');

            global.mainWindow.webContents.send('SetValidateButtonState', false);
            global.mainWindow.webContents.send('SetValidateButtonText', '<i class="fa fa-bolt" aria-hidden="true"></i> Run');
        }
    }, 1000);
}

ipcMain.on('BeginDownloadOrValidate', async function(event)
{
    console.log("Event: BeginDownloadOrValidate");

    update.checkMD5AndUpdate(SelectedFolder(), globals.cataDownload).then(() =>
    {
        startUpdateLoop();
    });
});

ipcMain.on('LaunchGame', async function(event)
{
    console.log("Event: LaunchGame");

    try
    {
      let rootPath  = SelectedFolder();
      let exePath   = rootPath + path.sep + 'Whitemane.exe';

      console.log(rootPath);

      // Remove cache on client launch
      let first_cache    = rootPath + path.sep + "Cache";
      let second_cache   = rootPath + path.sep + "Data" + path.sep + "Cache";

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
      global.mainWindow.webContents.send('SetPlayButtonState', true);
      global.mainWindow.webContents.send('SetPlayButtonText', 'Running');
      global.mainWindow.webContents.send('SetValidateButtonState', true);
      global.mainWindow.webContents.send('SetValidateButtonText', '<i class="fa fa-warning" aria-hidden="true"></i> Game is running');

      const md5Passed = await update.checkGameFilesSize(rootPath, globals.cataDownload);

      if (!md5Passed)
      {
          global.mainWindow.webContents.send('integrity_failed');
          return;
      }

      // Check config.wtf in ./WTF/Config.wtf for locale. Ensure it's enUS
      let configWTF = rootPath + path.sep + "WTF" + path.sep + "Config.wtf";
      if (fs.existsSync(configWTF))
      {
          let configWTFData = fs.readFileSync(configWTF, 'utf8');

          // Find 'SET locale "enUS"'

          let localeRegex = /SET locale "(.*)"/;
          let localeMatch = configWTFData.match(localeRegex);

          // Find "set realmlist"
          let realmlistRegex = /SET realmlist "(.*)"/;

          let realmlistMatch = configWTFData.match(realmlistRegex);

          // Find "set patchlist"
          let patchlistRegex = /SET patchlist "(.*)"/;
          let patchlistMatch = configWTFData.match(patchlistRegex);
          let configChanged = false;

          if (localeMatch)
          {
              // Set to enUS
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
            {
              global.mainWindow.webContents.send('integrity_failed');
            }
            else
            {
              global.mainWindow.webContents.send('SetPlayButtonState', false);
              global.mainWindow.webContents.send('SetPlayButtonText', 'Play');
            }

            global.mainWindow.webContents.send('SetValidateButtonState', false);
            global.mainWindow.webContents.send('SetValidateButtonText', '<i class="fa fa-bolt" aria-hidden="true"></i> Run');
          });

          break;
        }
        case "linux":
        {
          exec(`WINEPREFIX="/home/$(whoami)/.config/GameFreedom/" WINEARCH=win64 wine "${ exePath }"`, function(error, data)
          {
              if (error)
              {
                  global.mainWindow.webContents.send('integrity_failed');
              }
              else
              {
                global.mainWindow.webContents.send('SetPlayButtonState', false);
                global.mainWindow.webContents.send('SetPlayButtonText', 'Play');
              }

              global.mainWindow.webContents.send('SetValidateButtonState', false);
              global.mainWindow.webContents.send('SetValidateButtonText', '<i class="fa fa-bolt" aria-hidden="true"></i> Run');
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
      global.mainWindow.webContents.send('SetPlayButtonState', true);
      global.mainWindow.webContents.send('SetValidateButtonState', true);
      log.error(error);
    }
});

autoUpdater.on('update-available', function()
{
    console.log("Event: update-available");
    global.mainWindow.webContents.send('update_available');
    globals.launcherUpdateFound = true;
});

autoUpdater.on('update-downloaded', function()
{
    console.log("Event: update-downloaded");
    global.mainWindow.webContents.send('update_downloaded');
});

ipcMain.on('restart_app', function()
{
    console.log("Event: restart_app");
    autoUpdater.quitAndInstall();
});

ipcMain.on('quit', function(event)
{
    console.log("Event: quit");
    settings.save(app.getPath('userData'));
    app.quit();
})

ipcMain.on('minimize', function(event)
{
  console.log("Event: minimize");
  BrowserWindow.getFocusedWindow().minimize();
})

ipcMain.on('maximize', function(event)
{
  console.log("Event: maximize");

  if (BrowserWindow.getFocusedWindow().isMaximized())
      BrowserWindow.getFocusedWindow().restore();
  else
      BrowserWindow.getFocusedWindow().maximize();
})

ipcMain.on('app_version', function(event)
{
  event.sender.send('app_version', { version: app.getVersion() });
  global.appVersion = app.getVersion();
});

ipcMain.on('SelectDirectory', async function(event)
{
    console.log("Event: SelectDirectory");

    let dir = await dialog.showOpenDialog(global.mainWindow, {
        properties: ['openDirectory']
      });

      if (globals.updateInProgress == true)
      {
        const warn = {
            type: 'warning',
            title: 'Please wait',
            message: "There's already a download or validation in progress."
        };

        dialog.showMessageBox(warn);
        return;
      }

      if (dir && dir.filePaths.length > 0)
      {
        if (dir.filePaths[0] == SelectedFolder())
        {
            log.write('User tried to set game location to the same path, ignore it.');
            return;
        }

        try
        {
            global.mainWindow.webContents.send('SetGameLocation', path.normalize(dir.filePaths[0]));
            global.mainWindow.webContents.send('SetValidateButtonState', false);
            global.mainWindow.webContents.send('SetValidateButtonText', '<i class="fa fa-bolt" aria-hidden="true"></i> Run');

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

ipcMain.on('SelectDirectory_First', async function(event)
{
    console.log("Event: SelectDirectory_First");

    let dir = await dialog.showOpenDialog(global.mainWindow, {
        properties: ['openDirectory']
      });

      if (dir && dir.filePaths.length > 0)
      {
        try
        {
          global.mainWindow.webContents.send('SetGameLocation', path.normalize(dir.filePaths[0]));
          global.mainWindow.webContents.send('CloseFirstTimeSetup');

          global.userSettings.gameLocation = dir.filePaths[0];
          settings.save(app.getPath('userData'));

          global.mainWindow.webContents.send('SetPlayButtonState', false);
          global.mainWindow.webContents.send('SetPlayButtonText', 'Install');
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
