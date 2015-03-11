import { Service } from 'fxos-mvc/dist/mvc';

var singletonGuard = {};
var instance;

export default class AppsService extends Service {
  constructor(guard) {
    if (guard !== singletonGuard) {
      console.error('Cannot create singleton class');
      return;
    }

    super();

    this._getApps();

    var mgmt = navigator.mozApps.mgmt;
    mgmt.addEventListener('install', (app) => this._handleInstall(app));
    mgmt.addEventListener('uninstall', (app) => this._handleUninstall(app));
  }

  static get instance() {
    if (!instance) {
      instance = new this(singletonGuard);
    }
    return instance;
  }

  getInstalledApps() {
    var excludedApps = ['Marketplace', 'In-app Payment Tester', 'Membuster',
      'Share Receiver', 'Template', 'Test Agent', 'Test receiver#1',
      'Test Receiver#2', 'Test receiver (inline)', 'Test Shared CSS',
      'UI tests - Privileged App', 'Sheet app 1', 'Sheet app 2', 'Sheet app 3',
      'NFC API tests'];

    return this._getAppsSubset(app => {
      return app.manifest.role !== 'system' &&
             app.manifest.role !== 'addon' &&
             app.manifest.role !== 'theme' &&
             app.manifest.type !== 'certified' &&
             excludedApps.indexOf(app.manifest.name) === -1;
    });
  }

  getInstalledAddons() {
    return this._getAppsSubset(app => {
      return app.manifest.role === 'addon';
    });
  }

  getInstalledThemes() {
    var excludedThemes =
      ['Default Theme', 'Test theme 1', 'Test theme 2', 'Broken theme 3'];

    return this._getAppsSubset(app =>
      app.manifest.role === 'theme' &&
      excludedThemes.indexOf(app.manifest.name) === -1);
  }

  getInstalledAppsAndAddons() {
    return this._getAppsSubset(() => true);
  }

  installAppBlob(appData) {
    return new Promise((resolve, reject) => {
      var sdcard = navigator.getDeviceStorage('sdcard');
      if (!sdcard) {
        console.error('No SD card!');
        reject({name: 'No SD card!'});
        return;
      }

      var fileName = 'temp-app.zip';
      var delReq = sdcard.delete(fileName);
      delReq.onsuccess = delReq.onerror = () => {
        var req = sdcard.addNamed(
          new Blob([appData], {type: 'application/openwebapp+zip'}),
          fileName);

        req.onsuccess = () => {
          var getReq = sdcard.get(fileName);

          getReq.onsuccess = () => {
            var file = getReq.result;
            navigator.mozApps.mgmt.import(file).then((app) => {
              resolve(app);
            }, (e) => {
              console.error('error installing app', e);
              reject(e);
            });
          };

          getReq.onerror = () => {
            console.error('error getting file', getReq.error.name);
            reject(getReq.error);
          };
        };

        req.onerror = (e) => {
          console.error('error saving blob', e);
          reject(e);
        };
      };
    });
  }

  getInstalledApp(filters) {
    return new Promise((resolve, reject) => {
      this.getInstalledAppsAndAddons().then(apps => {
        for (var i in apps) {
          var app = apps[i];
          for (var filter in filters) {
            if (app[filter] === filters[filter] ||
                app.manifest[filter] === filters[filter]) {
              resolve(app);
              return;
            }
          }
        }
        console.error('No app found by filters', JSON.stringify(filters));
        reject();
        return;
      }, reject);
    });
  }

  markInstalledAppsInProximityApps(peers) {
    return new Promise((resolve, reject) => {
      this.getInstalledAppsAndAddons().then(installedApps => {
        for (var peerIndex in peers) {
          var peer = peers[peerIndex];

          ['apps', 'addons', 'themes'].forEach(appType => {
            if (!peer[appType]) {
              return;
            }

            for (var i = peer[appType].length - 1; i >= 0; i--) {
              var app = peer[appType][i];
              var matchingApp = installedApps.find((installedApp) => {
                return installedApp.manifest.name === app.manifest.name;
              });

              if (matchingApp) {
                peer[appType][i].installed = true;
              }
            }
          });
        }
        resolve(peers);
      });
    });
  }

  // Helper method to flatten an app manifest down to only the fields necessary
  // for networking.
  pretty(apps) {
    var prettyApps = [];
    apps.forEach((app) => {
      prettyApps.push({
        type: app.type,
        manifest: {
          name: app.manifest.name,
          description: app.manifest.description,
          developer: {
            name: (app.manifest.developer && app.manifest.developer.name) || ''
          }
        },
        manifestURL: app.manifestURL,
        icon: app.icon
      });
    });
    return prettyApps;
  }

  // Adds the address and name fields into each app element.
  flatten(addresses, attr) {
    var apps = [];
    for (var address in addresses) {
      var peerApps = addresses[address][attr];
      var peerName = addresses[address].name;
      for (var i = 0; i < peerApps.length; i++) {
        var app = peerApps[i];
        app.address = address;
        app.peerName = peerName;
        apps.push(app);
      }
    }
    return apps;
  }

  _getAppsSubset(subsetCallback) {
    return new Promise((resolve, reject) => {
      this._initialized.then(() =>
        resolve(this._installedApps.filter(app => subsetCallback(app))));
    });
  }

  _getApps() {
    this._initialized = new Promise((oresolve, reject) => {
      this._installedApps = [];

      var iconPromises = [];

      var req = navigator.mozApps.mgmt.getAll();
      req.onsuccess = () => {
        var result = req.result;

        for (var index in result) {
          var app = result[index];
          iconPromises.push(new Promise((resolve, reject) =>
            this._getApp(app, resolve)
          ));
        }

        Promise.all(iconPromises).then(() => {
          oresolve();
          this._dispatchEvent('updated');
        });
      };

      req.onerror = (e) => {
        console.error('error fetching installed apps: ', e);
        reject(e);
      };
    });
  }

  _getApp(app, resolve) {
    // XXX/drs: This is higher than we need, but some apps scale have
    // icons as low as 16px, which look really bad. I'd rather we
    // scale them down than up.
    navigator.mozApps.mgmt.getIcon(app, '128').then(icon => {
      var fr = new FileReader();
      fr.addEventListener('loadend', () => {
        app.icon = fr.result;
        this._installedApps.push(app);
        if (resolve) { resolve(); }
      });
      fr.readAsDataURL(icon);
    }, () => {
      app.icon = 'icons/default.png';
      this._installedApps.push(app);
      if (resolve) { resolve(); }
    });
  }

  _handleInstall(e) {
    var app = e.application;
    if (app.downloading) {
      var downloaded = () => {
        app.removeEventListener('downloadsuccess', downloaded);
        (new Promise((resolve, reject) => {
          this._getApp(app, resolve);
        })).then(() => {
          this._dispatchEvent('updated');
        });
      };
      app.addEventListener('downloadsuccess', downloaded);
    }
  }

  _handleUninstall(e) {
    var app = e.application;
    this._installedApps = this._installedApps.filter((installedApp) =>
      app.manifestURL !== installedApp.manifestURL);
    this._dispatchEvent('updated');
  }
}
