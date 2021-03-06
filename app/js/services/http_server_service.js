import /* global HTTPServer */ 'fxos-web-server/dist/fxos-web-server';

import { Service } from 'fxos-mvc/dist/mvc';

import App from 'app/js/models/app';

import DeviceNameService from 'app/js/services/device_name_service';
import ShareService from 'app/js/services/share_service';
/*import P2pService from 'app/js/services/p2p_service';*/

class HttpServerService extends Service {
  constructor() {
    super();

    this._cache = {};

    window.addEventListener('beforeunload', this._deactivate.bind(this));

    DeviceNameService.addEventListener('devicenamechange', e => {
      this._deviceName = e.deviceName;
    }, true);

    this._activate();
  }

  clearPeerCache(peer) {
    delete this._cache[peer.address];
  }

  _serverPeer(evt) {
    var response = evt.response;
    var request = evt.request;

    var body = request.body;
    var data = JSON.parse(body);
    data.address = response.socket.host;
    if (this._cache[data.address] !== body) {
      this._cache[data.address] = body;
      // XXX/drs: We get "P2pService undefined" errors if we try using it
      // directly. I'm not sure why, but it's probably some kind of circular
      // reference issue. For now, this fixes it, but we should figure out why
      // we have to do this.
      window.p2pService.receivePeerInfo(data);
    }

    response.send('');
  }

  _getAppFromRequest(evt) {
    return new Promise((resolve, reject) => {
      var request = evt.request;

      var appId = decodeURIComponent(request.params.app || '');

      ShareService.getApps().then(apps => {
        var app = App.getApp(apps, {manifestURL: appId});
        if (app) {
          resolve(app);
        } else {
          reject();
        }
      }, reject);
    });
  }

  // The client is requesting a manifest for an app. This is used for displaying
  // a description and other info.
  _serverManifest(evt) {
    var response = evt.response;

    this._getAppFromRequest(evt).then(app => {
      response.headers['Content-Type'] =
        'application/x-web-app-manifest+json';
      var manifest = app.manifest;
      response.send(JSON.stringify(manifest));
    }, () => response.send(''));
  }

  _serverDownload(evt) {
    var response = evt.response;

    this._getAppFromRequest(evt).then(app => {
      app.export().then((blob) => {
        response.headers['Content-Type'] = blob.type;
        response.sendFile(blob);
      });
    }, () => response.send(''));
  }

  _serverDisconnect(evt) {
    var response = evt.response;

    var peer = {address: response.socket.host};
    window.p2pService.receivePeerDisconnect(peer);

    this.clearPeerCache(peer);

    response.send('');
  }

  _activate() {
    if (this.httpServer) {
      return;
    }

    this.httpServer = new HTTPServer(8080);
    this.httpServer.addEventListener('request', (evt) => {
      var request = evt.request;

      var path = request.path;
      var routes = {
        '/manifest.webapp': (evt) => this._serverManifest(evt),
        '/download': (evt) => this._serverDownload(evt),
        '/disconnect': (evt) => this._serverDisconnect(evt),
        '/peer': (evt) => this._serverPeer(evt),
        '/': (evt) => evt.response.send('')
      };
      var route = routes[path];
      if (route) {
        route(evt);
      }
    });
    this.httpServer.start();
  }

  _deactivate() {
    if (!this.httpServer) {
      return;
    }

    this.httpServer.stop();
    this.httpServer = null;
  }
}

export default new HttpServerService();
