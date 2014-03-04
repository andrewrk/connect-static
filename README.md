# static caching gzipping file server middleware for connect

When you create the middleware, it will immediately scan the requested
directory, gzip all the files, and save the cache into memory, where it
will forever remain. When a request hits the middleware it will never touch
the file system.

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
    var basename = path.basename(file);
    return /^\./.test(basename) || /~$/.test(basename);
  },
};
createStatic(options, function(err, middleware) {
  app.use('/', middleware);
});
```
