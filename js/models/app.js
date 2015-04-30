define(["exports", "fxos-mvc/dist/mvc"], function (exports, _fxosMvcDistMvc) {
  "use strict";

  var _extends = function (child, parent) {
    child.prototype = Object.create(parent.prototype, {
      constructor: {
        value: child,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
    child.__proto__ = parent;
  };

  var Model = _fxosMvcDistMvc.Model;
  var App = (function (Model) {
    var App = function App() {
      Model.apply(this, arguments);
    };

    _extends(App, Model);

    App.getApp = function (apps, filters) {
      return apps.find(function (app) {
        for (var filter in filters) {
          if (app[filter] === filters[filter] || app.manifest[filter] === filters[filter]) {
            return true;
          }
        }
        return false;
      });
    };

    App.markInstalledApps = function (installedApps, apps) {
      return apps.map(function (app) {
        if (App.getApp(installedApps, { manifestURL: app.manifestURL })) {
          app.installed = true;
        }
        return app;
      });
    };

    App.markSharedApps = function (sharedApps, apps) {
      return apps.map(function (app) {
        if (App.getApp(sharedApps, { manifestURL: app.manifestURL })) {
          app.shared = true;
        }
        return app;
      });
    };

    App.filterDefaults = function (apps) {
      var excludedApps = ["Marketplace", "In-app Payment Tester", "Membuster", "Share Receiver", "Template", "Test Agent", "Test receiver#1", "Test Receiver#2", "Test receiver (inline)", "Test Shared CSS", "UI tests - Privileged App", "Sheet app 1", "Sheet app 2", "Sheet app 3", "NFC API tests"];

      var excludedThemes = ["Default Theme", "Test theme 1", "Test theme 2", "Broken theme 3"];

      return apps.filter(function (app) {
        return app.manifest.role !== "system" && app.manifest.type !== "certified" && excludedApps.indexOf(app.manifest.name) === -1 && excludedThemes.indexOf(app.manifest.name) === -1;
      });
    };

    App.filterApps = function (apps) {
      return apps.filter(function (app) {
        return app.manifest.role !== "addon" && app.manifest.role !== "theme";
      });
    };

    App.filterAddons = function (apps) {
      return apps.filter(function (app) {
        return app.manifest.role === "addon";
      });
    };

    App.filterThemes = function (apps) {
      return apps.filter(function (app) {
        return app.manifest.role === "theme";
      });
    };

    return App;
  })(Model);

  exports["default"] = App;
});