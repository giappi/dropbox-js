(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD
        define(factory);
    } else if (typeof exports === 'object') {
        // Node, CommonJS-like
        module.exports = factory();
    } else {
        // Browser globals (root is window)
        root.dropbox = factory();
    }
}(this, function () {

  function isFunction(x, type){ return ({}).toString.call(x) == '[object Function]'; }
  function isString(x, type){ return ({}).toString.call(x) == '[object String]'; }
  function isObject(x, type){ return ({}).toString.call(x) == '[object Object]'; }
  function paramsFromUrlHash(){
    return window.location.hash.replace(/^#/,'').split('&').reduce(function(o,entry){ if(entry=='') return o; entry=entry.split('='); o[decodeURIComponent(entry[0])] = decodeURIComponent(entry[1]); return o;},{});
  }


  var api = 'https://api.dropboxapi.com/2/',
      content = 'https://content.dropboxapi.com/2/';
      tokenStore = function(key, val){ return ( arguments.length > 1 ) ? (localStorage[key] = val) : localStorage[key]; };

  var endpointMapping = {
    'auth/token/revoke': { contentType: null },
    'files/upload': { baseUri: content, format: 'content-upload' },
    'files/get_thumbnail': { baseUri: content, format: 'content-download' },
    'files/download' : { baseUri: content, format: 'content-download' },
    'files/get_preview': {baseUri: content, format: 'content-download' },
    'files/upload_session/append': {baseUri: content, format: 'content-upload'},
    'files/upload_session/append_v2': {baseUri: content, format: 'content-upload'},
    'files/upload_session/finish': {baseUri: content, format: 'content-upload'},
    'files/upload_session/start': {baseUri: content, format: 'content-upload'},
    'files/get_shared_link_file': {baseUri: content, format: 'content-download'}
  }
  var contentTypeMapping = {
    'rpc' : 'application/json',
    'content-upload' : 'application/octet-stream'
  }

  var dropbox = function(endpoint, apiArgs){
    var args = [].slice.call(arguments);

    var config = endpointMapping[endpoint] || {};
    config.baseUri = config.baseUri || api;
    config.format = config.format || 'rpc';
    config.contentType = config.contentType || (config.contentType === null) ? null : contentTypeMapping[config.format];

    var lastArg = args[args.length - 1];
    var handlers = (args.length > 2 && (isObject(lastArg) || isFunction(lastArg))) ? lastArg : {};
    if(isFunction(handlers)) handlers = { onComplete: handlers };


    var r = new XMLHttpRequest();

    r.open('POST', config.baseUri+endpoint, true);
    r.setRequestHeader('Authorization', 'Bearer '+ tokenStore('__dbat') );

    if(config.format == 'content-download') r.responseType = 'blob';
    if(apiArgs && apiArgs.responseType){
      r.responseType = apiArgs.responseType;
      delete apiArgs.responseType;
    }

    if(config.contentType) r.setRequestHeader('Content-Type', config.contentType);
    if(apiArgs && (config.format == 'content-upload' || config.format == 'content-download'))
      r.setRequestHeader('Dropbox-API-Arg', JSON.stringify(apiArgs));

    if(handlers.onDownloadProgress) r.addEventListener("progress", handlers.onDownloadProgress);
    if(handlers.onUploadProgress && r.upload) r.upload.addEventListener("progress", handlers.onUploadProgress);

    r.onreadystatechange = function () {
      if (r.readyState != 4 || r.status != 200) return;
      var apiResponse = JSON.parse( r.getResponseHeader('dropbox-api-result') || r.responseText );
      if(endpoint=='auth/token/revoke') tokenStore('__dbat', '');
      handlers.onComplete && handlers.onComplete( apiResponse, r.response, r);
    };

    var requestPayload = (args.length > 2 && config.format == 'content-upload') ? args[2] : undefined;
    requestPayload = requestPayload || ( (apiArgs && config.format == 'rpc') ? JSON.stringify(apiArgs) : null );
    if(requestPayload){
      r.send(requestPayload);
    } else {
      r.send();
    }
  }


  dropbox.setTokenStore = function(store){ tokenStore = store; },
  dropbox.authenticate = function(apiArgs, handlers){
    handlers = handlers || {};
    if(isFunction(handlers)) handlers = { onComplete: handlers };
    apiArgs = apiArgs || {};
    if(isString(apiArgs)) apiArgs = { client_id: apiArgs };
    apiArgs.redirect_uri = apiArgs.redirect_uri || window.location.href;

    // if we already have an access token, return immediately
    if( tokenStore('__dbat') ) return handlers.onComplete();

    var params = paramsFromUrlHash(),
        csrfToken = tokenStore('__dbcsrf');

    if(params.state && csrfToken && params.state == csrfToken){
      // we are returning from authentication redirect
      if(params.access_token){
        // the authentcation was successful
        tokenStore('__dbat', params.access_token);
        tokenStore('__dbcsrf', '');
        window.location.replace( window.location.href.replace(/#.*/,'') );
      } else {
        // the authentication was not successful
        handlers.onError && handlers.onError(params);
      }
    } else {
      // initiate authentication
      var csrfToken = ""+Math.floor(Math.random()*100000);
      tokenStore('__dbcsrf', csrfToken);

      window.location = "https://www.dropbox.com/1/oauth2/authorize?response_type=token&"
                        + "client_id="+ encodeURIComponent(apiArgs.client_id) +"&"
                        + "redirect_uri="+ encodeURIComponent(apiArgs.redirect_uri) + "&"
                        + "state="+ encodeURIComponent(csrfToken);
    }
  }

  return dropbox;
}));
