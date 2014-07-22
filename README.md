# static caching gzipping file server middleware for connect

When you create the middleware, it will immediately scan the requested
directory, gzip all the files, and save the cache into memory, where it
will forever remain. When a request hits the middleware it never touches
the file system.

Are you looking for the middleware that used to ship with express and connect?
That project is called [serve-static](https://github.com/expressjs/serve-static)

## Supported HTTP Headers

 * `ETag`
 * `If-None-Match`
 * `If-Modified-Since`
 * `Accept-Encoding`
 * `Content-Encoding`

## Usage

```js
var createStatic = require('connect-static');

// These are all defaults. If you leave any options out, this is what they
// will be.
var options = {
  dir: "public",
  aliases: [
    ['/', '/index.html'],
  ],
  ignoreFile: function(fullPath) {
    var basename = path.basename(fullPath);
    return /^\./.test(basename) || /~$/.test(basename);
  },
};
createStatic(options, function(err, middleware) {
  if (err) throw err;
  app.use('/', middleware);
});
```
