const { app, BrowserWindow, ipcRenderer, ipcMain, dialog, session, url, globalShortcut } = require('electron');
const { autoUpdater }                 = require('electron-updater');
const log                             = require('../js/processors/logProcessor')
const settings                        = require('../js/processors/settingsProcessor')
const path                            = require('path');
const globals                         = require('../js/globals.js');
const p2p                             = require('./processors/p2pProcessor');
const files                           = require('./utils/fileManager.js');
const child                           = require('child_process').execFile;
const fs                              = require('fs-extra')
const app_data_path                   = require('appdata-path');
const { exec }                        = require('child_process');
const { execPath }                    = require('process');
const { dir }                         = require('console');
var Sudoer                            = require('electron-sudo').default;

const env         = process.env.NODE_ENV || 'development';
const get_runtime = new Date();


// If development environment

if (env === 'development') {
    try {
        require('electron-reloader')(module, {
            debug: true,
            watchRenderer: true
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
  global.uploading        = false;
  global.movingInProgress = false;
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

      global.mainWindow.maximize();
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

app.on('refresh', function()
{
    initiate();
    settings.load(global.userData);
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

ipcMain.on('beginDownload', function(event)
{
  p2p.download(global.userSettings.gameLocation);
  global.downloadOngoing = true;
});

ipcMain.on('beginVerify', function(event)
{
  p2p.download(global.userSettings.gameLocation);
  global.userSettings.needUpdate = true;
  global.downloadOngoing         = true;
  global.update_buffer           = true;
  global.version_buffer          = 0;
});

ipcMain.on('messageBox', function(event, text)
{
  var options = {
    type: 'error',
    title: 'Error!',
    message: text
  }

  dialog.showMessageBox(global.mainWindow, options);
})

ipcMain.on('error_moving_files', function(event, inSettings)
{
  const options = {
    type: 'error',
    buttons: ['Okay'],
    defaultId: 2,
    title: 'Question',
    message: 'Please wait you are moving game files currently.'
  };

  dialog.showMessageBox(null, options, (response) => {
    console.log(response);
  });
});

ipcMain.on('saveUserSettings', function(event, newSettings)
{
  global.userSettings = newSettings;
  settings.save(app.getPath('userData'));
});

ipcMain.on('launchGame', function(event)
{
  try
  {
    let rootPath  = selectedFolder() + '\\' + selectedGame();
    let exePath   = rootPath + '\\Whitemane.exe';

    console.log(rootPath);

    // Remove cache on client launch
    {
        let first_cache    = rootPath + "/Cache";
        let second_cache   = rootPath + "/Data/Cache";

        try
        {
            fs.rmSync(first_cache, { recursive: true });
            fs.rmSync(second_cache, { recursive: true });
        }
        catch (error)
        {
            log.error(error);
        }
    }

    //! CHECK FOR THE LATEST PATCH FOR THAT SPECIFIC SERVER/REALM

    global.mainWindow.webContents.send('setPlayButtonState', true);
    global.mainWindow.webContents.send('setPlayButtonText', 'Game is being loaded');
    global.mainWindow.webContents.send('setVerifyButtonState', true);
    global.mainWindow.webContents.send('setVerifyButtonText', '<i class="fa fa-warning" aria-hidden="true"></i> Game is running');

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
  if (global.p2pClient != undefined)
  {
    if (global.p2pClient.destroyed != true)
    {
      global.p2pClient.destroy();
    }
  }

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

  if (global.movingInProgress == true)
  {
    const error = {
      type: 'error',
      buttons: ['Okay'],
      defaultId: 2,
      title: 'Please wait',
      message: "There's already a move in progress."
    };

    dialog.showErrorBox(error);
    return;
  }

  if (dir && dir.filePaths.length > 0)
  {
    if (global.userSettings.gameLocation == dir.filePaths[0])
    {
        console.error('User tried to set game location to the same path, ignore it.');
        return;
    }

    if (global.userSettings.gameDownloaded == false)
    {
        global.mainWindow.webContents.send('setGameLocation', dir.filePaths[0]);
        global.userSettings.gameLocation = dir.filePaths[0];
        settings.save(app.getPath('userData'));
        global.mainWindow.webContents.send('setPlayButtonState', false);
        global.mainWindow.webContents.send('setVerifyButtonState', true);
        return;
    }

    try
    {
      global.mainWindow.webContents.send('setPlayButtonState', false);
      global.mainWindow.webContents.send('setVerifyButtonState', false);
      global.movingInProgress = true;

      let previousDirectory = global.userSettings.gameLocation;
      fs.copy(selectedFolder(), dir.filePaths[0], err =>
      {
        if (err)
        {
          if (err.code == 'ENOENT')
          {
            global.mainWindow.webContents.send('setGameLocation', dir.filePaths[0]);
            global.userSettings.gameLocation = dir.filePaths[0];
            settings.save(app.getPath('userData'));
            global.mainWindow.webContents.send('setPlayButtonState', false);
            global.mainWindow.webContents.send('setVerifyButtonState', false);
          }

          global.movingInProgress = false;
          return log.error(err)
        }

        global.mainWindow.webContents.send('setGameLocation', dir.filePaths[0]);
        global.userSettings.gameLocation = dir.filePaths[0];
        settings.save(app.getPath('userData'));
        global.mainWindow.webContents.send('setPlayButtonState', false);
        global.mainWindow.webContents.send('setVerifyButtonState', false);
        global.movingInProgress = false;
        fs.rmdir(previousDirectory, { recursive: true }, function(error)
        {
          if (error)
            log.error(error);
        });
      });
    }
    catch(err)
    {
      global.mainWindow.webContents.send('setPlayButtonState', true);
      global.mainWindow.webContents.send('setVerifyButtonState', true);
      log.error(err);
      global.movingInProgress = false;
    }
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
      p2p.initialize();
      global.userSettings.gameLocation = dir.filePaths[0];
      settings.save(app.getPath('userData'));
    }
    catch(err)
    {
      log.error(err);
    }
  }
});
