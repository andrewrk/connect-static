var zlib = require('zlib');
var fs = require('fs');
var stream = require('stream');
var util = require('util');
var path = require('path');
var Pend = require('pend');
var findit = require('findit');
var mime = require('mime');
var url = require('url');
var BufferList = require('bl');
var crypto = require('crypto');

module.exports = createGzipStaticMiddleware;

function createGzipStaticMiddleware(options, cb) {
  options = options || {};
  var dir = options.dir || "public";
  var ignoreFile = options.ignoreFile || defaultIgnoreFile;
  var aliases = options.aliases || [['/', '/index.html']];

  var cache = {};
  var pend = new Pend();
  var walker = findit(dir);
  walker.on('error', function(err) {
    walker.stop();
    cb(err);
  });
  walker.on('file', function(file, stat) {
    if (ignoreFile(file)) return;
    var relName = '/' + path.relative(dir, file);
    var bl = new BufferList();
    var inStream = fs.createReadStream(file);
    inStream.on('error', function(err) {
      if (err.code === 'EISDIR') {
        delete cache[relName];
        return;
      } else {
        throw err;
      }
    });
    var cacheObj;
    cache[relName] = cacheObj = {
      bl: bl,
      mime: mime.lookup(relName),
      mtime: stat.mtime,
      hash: null,
    };
    pend.go(function(cb) {
      inStream.pipe(zlib.createGzip()).pipe(bl);
      bl.once('finish', cb);
    });
    pend.go(function(cb) {
      var hashBl = new BufferList();
      inStream.pipe(crypto.createHash('sha1')).pipe(hashBl);
      hashBl.once('finish', function() {
        cacheObj.hash = hashBl.toString('base64');
        cb();
      });
    });
  });
  walker.on('end', function() {
    pend.wait(function(err) {
      if (err) return cb(err);
      aliases.forEach(function(alias) {
        cache[alias[0]] = cache[alias[1]];
      });
      cb(null, middleware);
    });
    function middleware(req, resp, next) {
      var parsedUrl = url.parse(req.url);
      var c = cache[parsedUrl.pathname];
      if (!c) return next();
      if (req.headers['if-none-match'] === c.hash) {
        resp.statusCode = 304;
        resp.end();
        return;
      }
      var ifModifiedSince = new Date(req.headers['if-modified-since']);
      if (!isNaN(ifModifiedSince) && c.mtime <= ifModifiedSince) {
        resp.statusCode = 304;
        resp.end();
        return;
      }

      var bl = c.bl;
      resp.setHeader('Content-Type', c.mime);
      resp.setHeader('ETag', c.hash);
      if (req.headers['accept-encoding'] == null) {
        bl.duplicate().pipe(zlib.createGunzip()).pipe(resp);
      } else {
        resp.setHeader('Content-Encoding', 'gzip');
        bl.duplicate().pipe(resp);
      }
    }
  });
}

function defaultIgnoreFile(file) {
  var basename = path.basename(file);
  return /^\./.test(basename) || /~$/.test(basename);
}
