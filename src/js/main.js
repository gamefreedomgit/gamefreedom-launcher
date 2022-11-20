const { app, BrowserWindow, ipcRenderer, ipcMain, dialog, session, url } = require('electron');
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

const STATE_LOADING    = 0;
const STATE_CONNECTING = 1;
const STATE_UPDATING   = 2;

// STATE_LOADING
const STATE_MODE_LOADING           = 0;
const STATE_MODE_LOADING_OK        = 1;
const STATE_MODE_LOADING_FAILED    = 2;

// STATE_CONNECTING
const STATE_MODE_CONNECTING        = 0;
const STATE_MODE_CONNECTING_OK     = 1;
const STATE_MODE_CONNECTING_FAILED = 2;

// STATE_UPDATING
const STATE_MODE_UPDATING          = 0;
const STATE_MODE_UPDATING_OK       = 1;
const STATE_MODE_UPDATING_FAILED   = 2;

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

function selectedGame()
{
  var string = '';
  switch(userSettings.previousExpansion)
  {
      case "Whitemane":
        string = "\\whitemane";
        break;
        
      default:
        string = '';
        break;
  }

  return string;
}

function selectedFolder()
{
  return userSettings.gameLocation;
}

function setState(value, mode)
{
  //?console.log('Updated state value to ' + value);
  global.state = value;

  switch (value)
  {
    case STATE_LOADING:
      //global.loadingWindow.webContents.send('setStateButtonText', 'Initiating');
      break;
    case STATE_CONNECTING:
      global.loadingWindow.webContents.send('setStateButtonText', 'Connecting');
      break;
    case STATE_UPDATING:
      global.loadingWindow.webContents.send('setStateButtonText', 'Updating');
      break;
    default:
      console.error('Unhandled state ', value);
      break;
  }

  setStateMode(mode);
}

function getState()
{
  return global.state;
}

function setStateMode(value)
{
  //?console.log('Updated state mode value to ' + value);
  global.stateMode = value;


  switch (value)
  {
    case STATE_MODE_LOADING:
    {
      //global.loadingWindow.webContents.send('setStateModeButtonText', 'Setting things up...');
      break;
    }
    case STATE_MODE_LOADING_OK:
    {
      global.loadingWindow.webContents.send('setStateModeButtonText', 'Successfully initiated data.');
      break;
    }
    case STATE_MODE_LOADING_FAILED:
    {
      global.loadingWindow.webContents.send('setStateModeButtonText', 'Failed to initiate.');
      break;
    }
    case STATE_MODE_CONNECTING:
    {
      global.loadingWindow.webContents.send('setStateModeButtonText', 'Trying to establish the connection...');
      break;
    }
    case STATE_MODE_CONNECTING_OK:
    {
      global.loadingWindow.webContents.send('setStateModeButtonText', 'Successfully established the connection.');
      break;
    }
    case STATE_MODE_CONNECTING_FAILED:
    {
      global.loadingWindow.webContents.send('setStateModeButtonText', 'Failed to establish the connection.');
      break;
    }
    default:
      console.error('Unhandled state mode ', value);
      break;
  }
}

function getStateMode()
{
  return global.stateMode;
}

function initiate()
{
  global.launcherUpdateFound = false;
  global.downloadOngoing     = false;

  create_loading_window();
}

function create_loading_window()
{
  setState(STATE_LOADING, STATE_MODE_LOADING);

  global.loadingWindow = new BrowserWindow({ 
    width: 500,
    height: 330,
    icon: app.getAppPath() + '/assets/images/icon.png',
    backgroundColor: "#202225",
    movable: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    frame: false,
    hasShadow: true,
    roundedCorners: false,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      //preload: app.getAppPath() + '/src/preload.js',
      webviewTag: true
    }
  });

  global.loadingWindow.loadFile(app.getAppPath() + '/src/loading.html');

  global.loadingWindow.once('ready-to-show', function()
  {
    global.loadingWindow.show();

    setTimeout(function()
    {
      setStateMode(STATE_MODE_LOADING_OK);

      // TODO: Move this to STATE_UPDATING
      //autoUpdater.checkForUpdatesAndNotify();

      global.userData         = app.getPath('userData');
      global.uploading        = false;
      global.movingInProgress = false;
  
      settings.load(global.userData);
      // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

      create_main_window();
    }, 2000);
  });

  global.loadingWindow.webContents.on("did-fail-load", function()
  {
    //? Show error here
    setStateMode(STATE_MODE_LOADING_FAILED);
  });
}

function create_main_window()
{
  setState(STATE_CONNECTING, STATE_MODE_CONNECTING);

  global.mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 1280,
    minHeight: 720,
    maxWidth: 1280, // 1600
    maxHeight: 720, // 900
    icon: app.getAppPath() + '/assets/images/icon.png',
    backgroundColor: "#202225",
    movable: true,
    resizable: false,
    maximizable: false,
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
    setTimeout(function()
    {
      setStateMode(STATE_MODE_CONNECTING_OK);

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

      global.loadingWindow.hide();
      global.mainWindow.show();

      let currentURL = global.mainWindow.webContents.getURL();
      console.log(currentURL);

    }, 1000);
  });

  global.mainWindow.webContents.on("did-fail-load", function()
  {
    //? Show error here
    setStateMode(STATE_MODE_CONNECTING_FAILED);
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
      initiate();
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', function()
{
  if (process.platform !== 'darwin')
    app.quit();
});

ipcMain.on('expacSelected', function(event, expac)
{
  global.userSettings.previousExpansion = expac;
  settings.save(app.getPath('userData'));
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

ipcMain.on('clearCache', function(event)
{
  const cacheLocation1 = selectedFolder() + selectedGame() + '/Cache';
  const cacheLocation2 = selectedFolder() + selectedGame() + '/Data/Cache';

  fs.access(cacheLocation1, function(error)
  {
    if (!error)
    {
      fs.rmdir(cacheLocation1, { recursive: true }, function(error)
      {
        if (error)
        {
          console.log('Failed clearing cache in: ' + cacheLocation1);
          console.log(error);
        }
        else
        {
          console.log('Clearing cache in: ' + cacheLocation1);
        }
      });
    }
    else
    {
      console.log('Failed clearing cache in: ' + cacheLocation1);
      console.log(error);
    }
  });

  fs.access(cacheLocation2, function(error)
  {
    if (!error)
    {
      fs.rmdir(cacheLocation2, { recursive: true }, function(error)
      {
        if (error)
        {
          console.log('Failed clearing cache in: ' + cacheLocation2);
          console.log(error);
        }
        else
        {
          console.log('Clearing cache in: ' + cacheLocation2);
        }
      });
    }
    else
    {
      console.log('Failed clearing cache in: ' + cacheLocation2);
      console.log(error);
    }
  });
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

ipcMain.on('saveUserSettings', function(event, inSettings)
{
  global.userSettings = inSettings;
  settings.save(app.getPath('userData'));
});

ipcMain.on('launchGame', function(event)
{
  try
  {
    //! DEBUG ONLY
    userSettings.previousExpansion = 'Whitemane';
    //!

    let patchName = 'wow-update-base-39695.MPQ';
    let rootPath  = selectedFolder() + selectedGame();
    let exePath   = rootPath + '\\Whitemane.exe';
    let patchPath =  rootPath + '\\Data\\' + patchName;

    console.log(rootPath);
    console.log(patchPath);
    console.log(userSettings.previousExpansion);

    switch (userSettings.previousExpansion)
    {
      case 'Whitemane':
      {
        //! Make sure we check if deus client patch exist at all before running the client
        if (fs.existsSync(patchPath) == false && fs.existsSync(patchPath + '.disabled') == false)
        {
          throw new Error('Unable to start client because of missing components. Please try to update your client.');
        }

        //! Enable wow-update-base-39695.mpq patch in case selected server is Whitemane realm
        if (fs.existsSync(patchPath + '.disabled') == true)
        {
          fs.rename(patchPath + '.disabled', patchPath, function(error)
          {
            if (error)
                throw new Error(error);
          });
        }

        break;
      }
      default:
      {
        //! Disable wow-update-base-39695.mpq patch in case selected server wasn't Whitemane realm
        if (fs.existsSync(patchPath) == true)
        {
          fs.rename(patchPath, patchPath + '.disabled', function(error)
          {
            if (error)
                throw new Error(error);
          });
        }

        break;
      }
    }

    //! CHECK FOR THE LATEST PATCH FOR THAT SPECIFIC SERVER/REALM

    global.mainWindow.webContents.send('setPlayButtonState', true);

    switch (process.platform)
    {
      case "win32":
      {
        exec(`set __COMPAT_LAYER=WIN7RTM && "${ exePath }"`, function(error, data)
        {
          if (error)
            throw new Error(error);

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
    log.error(error);
  }
});

autoUpdater.on('update-available', function()
{
  mainWindow.webContents.send('update_available');
  global.launcherUpdateFound = true;
});

autoUpdater.on('update-downloaded', function()
{
  mainWindow.webContents.send('update_downloaded');
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
  let dir = await dialog.showOpenDialog(mainWindow, {
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
    try
    {
      global.mainWindow.webContents.send('setPlayButtonState', true);
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
          }

          global.movingInProgress = false;
          return log.error(err)
        } 

        global.mainWindow.webContents.send('setGameLocation', dir.filePaths[0]);
        global.userSettings.gameLocation = dir.filePaths[0];
        settings.save(app.getPath('userData'));
        global.mainWindow.webContents.send('setPlayButtonState', false);
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
      log.error(err);
      global.movingInProgress = false;
    }
  }
});

ipcMain.on('firstSelectDirectory', async function(event)
{
  let dir = await dialog.showOpenDialog(mainWindow, {
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
