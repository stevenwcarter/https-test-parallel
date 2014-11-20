var async = require('async');
var fs = require('fs');
var https = require('https');
var config = require('./config');

var opt = require('node-getopt').create([
  ['k', 'keep-alive',  'Enable keep-alive' ],
  ['z', 'compression', 'Enable compression'],
  ['v', 'verbose', 'Show each line'],
  ['c', 'threads=ARG', 'Number of threads'],
  ['n', 'requests=ARG', 'Number of requests per thread'],
  ['h', 'help',        'Display this help' ]
])
.bindHelp()
.parseSystem();

var options = opt.options;

// console.log(options);


var compression = (options.compression || options.z);
var keepalive = (options['keep-alive'] || options.k);
var verbose = (options.verbose || options.v);

if (typeof compression === 'undefined') {
  compression = false;
}
if (typeof keepalive === 'undefined') {
  keepalive = false;
}
if (typeof verbose === 'undefined') {
  verbose = false;
}
var threads = 10;
if (typeof options.c !== 'undefined') {
  try {
    threads = options.c;
  } catch (e) {}
}
if (typeof options.threads !== 'undefined') {
  try {
    threads = options.threads;
  } catch (e) {}
}

var requests = 20;
if (typeof options.n !== 'undefined') {
  try {
    requests = options.n;
  } catch (e) {}
}

if (typeof options.requests !== 'undefined') {
  try {
    requests = options.requests;
  } catch (e) {}
}

console.log("Keep-Alive  : "+keepalive);
console.log("Compression : "+compression);
console.log("Verbose     : "+verbose);
console.log("Threads     : "+threads);
console.log("# per thread: "+requests);

var keepaliveAgent = new https.Agent({
  keepAlive: keepalive,
  maxSockets: threads,
});

var completed = 0;
var stats = {};
var host = config.host;
var port = config.port;
var path = config.path;
var payload = fs.readFileSync('getItems.xml');
 
var calls = [];
var clients = threads;
var callsPerClient = requests;
var thinkTime = 0;
var totalRequests = callsPerClient * clients;
 
var testStartTime = (new Date()).getTime();
 
for ( var i = 0; i < totalRequests; i++ ) {
  calls.push(runCall);
}

async.parallelLimit(calls, clients, function(err) {
  process.stdout.write('\n\n\n');
  var testEndTime = (new Date()).getTime();
  var totalTime = (testEndTime - testStartTime) / 1000;
  var requestsPerSecond = Math.round(totalRequests / totalTime);
  console.log('completed ' + totalRequests + ' in ' + totalTime + 's, requests/sec=' + requestsPerSecond);
  reportStats();
});

function asterisks(hrtime) {
  var seconds = Math.floor(hrtime[0]);
  var res = seconds+" ";
  for (var i = 0; i < seconds; i++) {
    res += "*";
  }
  return res;
}

function trackStat(seconds,status) {
  if (seconds > -1) {
    if (typeof stats[seconds+","+status] !== 'undefined') {
      stats[seconds+","+status]++;
    } else {
      stats[seconds+","+status] = 1;
    }
  }
}

function reportStats() {
  console.log(" ");
  Object.keys(stats)
    .sort(function (a, b) {
      var a_parts = a.split(',');
      var b_parts = b.split(',');
      var a_int = parseInt(a_parts[0]);
      var b_int = parseInt(b_parts[0]);
      if (a_int === b_int) return 0;
      return (a_int < b_int) ? -1 : 1;
    })
    .forEach(function (key, i) {
      var parts = key.split(',');
      console.log("Number of requests taking "+parts[0]+" seconds with status code "+parts[1]+": "+stats[key]+" ("+(Math.floor(stats[key]/(threads*requests)*10000)/100)+"%)");
    });
}

function runCall(callback) {
  var startTime = (new Date()).getTime();

  var start = process.hrtime();
  var https_options = {
    host: host,
    port: port,
    path: path,
    method: 'POST',
    agent: keepaliveAgent,
    headers: {
      'Content-Type': 'text/xml;charset=UTF-8',
      'User-Agent': 'Connors NodeJS Perf Tester',
      'X-KO-ACCESS-BASIC-AUTH': config.authHeader
    }
  };
  if (compression) {
    https_options.headers['Accept-Encoding'] = 'gzip, deflate';
  }

  var handle_post = function (res) {
    res.setEncoding('utf8');
    var resdata = "";
    res.on('data', function (chunk) {
      resdata += chunk;
    });
    res.on('end', function () {
      var diff = process.hrtime(start);
      trackStat(diff[0], res.statusCode);
      completed++;
      if (verbose) {
        console.log("Time=" + diff[0]+"."+(Math.floor(diff[1]/1000000)) + "s\tErr=false\tResponse Code=" + res.statusCode + "\tResponse Len=" + resdata.length+" "+asterisks(diff));
      } else {
        process.stdout.write('\rCompleted: ('+completed+'/'+(threads*requests)+')');
        // process.stdout.write('*');
      }
      callback();
    });
    res.on('error', function (e) {
      var diff = process.hrtime(start);
      trackStat(diff[0],res.statusCode);
      console.log("Time=" + diff[0]+"."+(Math.floor(diff[1]/1000000)) + "s\tErr=true\tResponse Code=ERROR\tResponse Len=ERROR\tres error");
      callback();
    });
  };

  var post_req = https.request(https_options, handle_post);

  post_req.on('error', function (e) {
    var diff = process.hrtime(start);
    console.log("Time=" + diff + "ms\tErr=true\tResponse Code=ERROR\tResponse Len=ERROR\tpost_req error");
    callback();
  });
  post_req.write(payload);
  post_req.end();
}
