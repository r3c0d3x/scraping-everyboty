'use strict';
var basicOptsStr = 'General options: ';
var outOptsStr = 'Output options: ';
var dwnldOptsStr = 'Download options: ';
var miscOptsStr = 'Miscellaneous options: ';
var info = 'Everyboty.net Scraper - Written by the Bibliotheca Anonoma\nRepository - https://github.com/bibanon/scraping-everyboty';
var argv = require('yargs')
    .options({
        'a': {
            alias: 'min',
            demand: true,
            describe: 'The post # to start at (including this)',
            type: 'number',
            group: basicOptsStr
        },
        'z': {
            alias: 'max',
            demand: true,
            describe: 'The post # to end at (including this)',
            type: 'number',
            group: basicOptsStr
        },
        'j': {
            alias: 'json',
            type: 'boolean',
            describe: 'Whether or not to include JSON output',
            default: true,
            group: outOptsStr
        },
        'h': {
            alias: 'html',
            type: 'boolean',
            describe: 'Whether or not to include HTML output',
            default: true,
            group: outOptsStr
        },
        'p': {
            alias: 'posts',
            type: 'boolean',
            describe: 'Whether or not to download posts',
            default: true,
            group: dwnldOptsStr
        },
        'i': {
            alias: 'imgs',
            type: 'boolean',
            describe: 'Whether or not to download images (requires posts)',
            default: true,
            group: dwnldOptsStr
        },
        'c': {
            alias: 'cmnts',
            type: 'boolean',
            describe: 'Whether or not to download comments',
            default: true,
            group: dwnldOptsStr
        },
        't': {
            alias: 'tags',
            type: 'boolean',
            describe: 'Whether or not to download tags',
            default: true,
            group: dwnldOptsStr
        },
        'r': {
            alias: 'recover',
            type: 'boolean',
            describe: 'Whether or not to try and recover deleted posts (only tags & images)',
            default: false,
            group: basicOptsStr
        },
        'g': {
            alias: 'makehtml',
            type: 'boolean',
            describe: 'If enabled, it will generate HTML from previously downloaded JSON',
            default: false,
            group: miscOptsStr
        },
        'd': {
            alias: 'downloadurls',
            type: 'boolean',
            describe: 'If enabled, it will download images from previously downloaded JSON',
            default: false,
            group: miscOptsStr
        }
    })
    .help()
    .showHelpOnFail(true)
    .epilogue(info)
    .argv;
var path = require('path');
var fs = require('fs-extra');
var rootPath = './everyboty';
var util = require('util');
var deletedPosts = [];
var fileExtensions = ['jpg', 'jpeg', 'png', 'gif'];
var queue = require('qv2');
var requestQueue = new queue();
var http = require('http');
var requestsPerSecond = 5;

function writeHtml(id, data, path) {
    var htmlOut = '';
    if (data.deleted) {
        htmlOut = util.format('<!DOCTYPE html><html><head><meta http-equiv="content-type" content="text/html; charset=UTF-8"><title>Post #%d - Everyboty.net Scraper</title><link rel="stylesheet" href="../style.css" ></head><body><h2>Post #%d</h2><h3 class="deleted">DELETED</h3>We attempted to recover the images from the post and included them in the directory.<br><div id="signature">Everyboty.net Scraper - Written for use by Bibliotheca Anonoma</div></body></html>', id, id);
    }
    else {
        htmlOut = util.format('<!DOCTYPE html><html><head><meta http-equiv="content-type" content="text/html; charset=UTF-8"><title>Post #%d - Everyboty.net Scraper</title><link rel="stylesheet" href="../style.css" ></head><body><h2>Post #%d</h2>', id, id);
        for (var i = 0; i < data.items.length; i++) {
            if (data.items[i].type == 'file') {
                if (argv.imgs)
                    htmlOut += util.format('<img class="content img" src="%d.%s"/>', data.items[i].img, data.items[i].ext);
            }
            else { // must be text
                htmlOut += util.format('<div class="content text">%s</div>', data.items[i].content);
            }
        }
              
        if (argv.cmnts) {
            htmlOut += '<div id="comments"><b>Comments: </b><br><br>';
      
            for (var i = 0; i < data.comments.length; i++) {
                htmlOut += util.format('<div class="comment"><div class="timestamp">%s</div><div class="content">%s</div></div>', new Date(data.comments[i].timestamp*1000).toGMTString(), data.comments[i].content);
            }
               
            htmlOut += '</div>';
        }
                
        if (argv.tags) {
            htmlOut += '<div class="tags"><b>Tags: </b><ul>';
                    
            for (var i = 0; i < data.tags.length; i++) {
                htmlOut += '<li>' + data.tags[i].tag + '</li>';
            }
                 
            htmlOut += '<ul></div>';
        } 
       
        htmlOut += util.format('<a href="%s">Permalink (on their site)</a><div id="signature">Everyboty.net Scraper - Written for use by Bibliotheca Anonoma</div></body></html>', data.permalink);
    }
    fs.writeFile(path + '/index.html', htmlOut, function(writeErr) {
        if (writeErr)
            return console.log(writeErr);
        console.log('HTML data for post #' + id + ' saved.');
    });
}
    
if (argv.makehtml || argv.downloadurls) {
    var dirs = fs.readdirSync(rootPath).filter(function(file) {
            return fs.statSync(path.join(rootPath, file)).isDirectory();
        });
        
    function getPostData(id) {
        return JSON.parse(fs.readFileSync(rootPath + '/' + id + '/post.json', 'utf8'));
    }
        
    if (argv.makehtml) {
        fs.copySync('./style.css', rootPath + '/style.css');
        var dirs = fs.readdirSync(rootPath).filter(function(file) {
            return fs.statSync(path.join(rootPath, file)).isDirectory();
        });
    
        for (var i = 0; i < dirs.length; i++)
            writeHtml(Number(dirs[i]), getPostData(dirs[i]), rootPath + '/' + dirs[i]);
    }
    
    if (argv.downloadurls) {
        for (var i = 0; i < dirs.length; i++) {
            var data = getPostData(dirs[i]);
            for (var i2 = 0; i2 < data.items.length; i2++) {
                requestQueue.enqueue([{ uri: data.items[i2].url }, data.items[i2].img + '.' + data.items[i2].ext, dirs[i]]);
            }
        }
        try {
            fs.accessSync(rootPath + '/deleted.json', fs.F_OK);
            var recovered = JSON.parse(fs.readFileSync(rootPath + '/deleted.json', 'utf8'));
            for (var i = 0; i < recovered.length; i++) { // [fileName, deletedPostNum, url]
                requestQueue.enqueue([{ uri: recovered[i][2] }, recovered[i][0], recovered[i][1]])
            }
        } catch (e) { }
        var interval = setInterval(function() { // direct copypasta from the bottom of the script, this is really hacky
            var dq = requestQueue.dequeue(); 
            if (typeof dq !== 'undefined') {
                console.log('Downloading image ' + dq[1]);
                var file = fs.createWriteStream(rootPath + '/' + dq[2] + '/' + dq[1]);
                var req = http.get(dq[0].uri, function(res) {
                    res.pipe(file);
                    console.log('Downloaded image ' + dq[1]);
                });
                //request(dq[0]).pipe(fs.createWriteStream(rootPath + '/' + dq[2] + '/' + dq[1]));
            }
            else {  
                clearInterval(interval);
            }
        }, 1000/requestsPerSecond); 
    }
} else {

var request = require('request');
var extend = require('xtend');
var maxId = argv.max; // the max on the site: 100042, 19 is the first dead post
var minId = argv.min; // start at 1
    
if (minId < 1 || minId > 100042 || maxId < minId || maxId < 1 || maxId > 100042) {
    console.log('Invalid min or max post number!');
    process.exit(1);
}

/*else {    
    minId = Math.min(Math.max(1, argv.min), 100042);
    maxId = Math.min(Math.max(1, argv.max), 100042);
}*/
var baseUrl = 'http://everyboty.net';
var imgUrl = baseUrl + '/shared/post_media/images/full_sized/%d.%s';
var permUrl = baseUrl + '/?perm=%d';
var postUrl = baseUrl + '/ajax/index.php?script=get_post&post_id=%d';
var tagsUrl = baseUrl + '/ajax/index.php?script=get_post_tags&post_id=%d';
var commentsUrl = baseUrl + '/ajax/index.php?script=get_post_comments&post_id=%d';
var output = {};
var deletedData = [];
var apiRequestOpts = {
    gzip: true,
    headers: {
        'Referer': 'http://everyboty.net/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/49.0.2623.87 Safari/537.36',
        'X-Requested-With': 'XMLHttpRequest',
        'Accept': 'application/json, text/javascript, */*; q=0.01'
    }
};
var imgRequestOpts = {
    gzip: true,
    headers: {
        'Referer': 'http://everyboty.net/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/49.0.2623.87 Safari/537.36',
    }
};

console.log('\n' + info + '\n\nDownloading posts between %d and %d. If this isn\'t what you wanted, turn back now.\n', minId, maxId);

fs.ensureDirSync(rootPath);
if (argv.html)
    fs.copySync('./style.css', rootPath + '/style.css');

function checkPosts(id) {
    if (argv.posts)
        return output[id].__checkedPostApi;
    else
        return true;
}

function checkTags(id) {
    if (argv.tags)
        return output[id].__checkedTagApi;
    else
        return true;
}

function checkComments(id) {
    if (argv.cmnts)
        return output[id].__checkedCommentApi;
    else
        return true;
}

function saveIfReady(id) {
    if (checkPosts(id) && checkTags(id) && checkComments(id))
        savePost(id);
}

function isImagePost(id) {
    if (typeof output[id] !== 'undefined') {
        for (var i = 0; i < output[id].items.length; i++)
            if (output[id].items[i].type == 'text')
                return false;
    } else return false;
    if (output[id].deleted) return false;
        
    return true;
}

function findLowerBoundary(id) {
    var post;
    var outnum;
    
    for (var i = 1; i < id; i++)
        if (isImagePost(id - i)) {
            //console.log('lowerBoundary: %d, %d', id, id - i);
            outnum = id - i;
            post = output[id - i]; // lower post boundary
            if (typeof post !== 'undefined')
                break;
        }

    if (typeof post !== 'undefined')
        var lowestId = post.items[0].img || 999999999999; // the name is sorta a lie..
    else
        var lowestId = 999999999999;
    
    for (var i = 0; i < post.items.length; i++)
        if (post.items[i].img < lowestId)
            lowestId = post.items[i].img;
    
    return lowestId;
}

function findUpperBoundary(id) {
    var post;
    var outnum;
    
    for (var i = 1; i < 10061 - id; i++)
        if (isImagePost(id + i)) {
            //console.log('upperBoundary: %d, %d', id, id + i);
            outnum = id + i;
            post = output[id + i]; // upper post boundary
            //console.log(post);
            if (typeof post !== 'undefined')
                break;
        }
        
    if (typeof post !== 'undefined')
        var highestId = post.items[0].img || 0;
    else
        var highestId = 0;
    
    //console.log('id & status: ', outnum, typeof output[outnum]);
    
    for (var i = 0; i < post.items.length; i++)
        if (post.items[i].img > highestId)
            highestId = post.items[i].img;
        
    return highestId;
}

function savePost(id) {
    var path = rootPath + '/' + id;
    var data = output[id];
    delete data.__checkedPostApi;
    delete data.__checkedTagApi;
    delete data.__checkedCommentApi;
    fs.ensureDir(path, function (dirErr) {
        if (dirErr) {
            throw dirErr;
        }
        
        if (data.deleted) {
            deletedPosts.push(id);
            delete data.timestamp;
        }
        
        if (argv.html) {
            writeHtml(id, data, path);
        }
        
        if (argv.json) {
            fs.writeFile(path + '/post.json', JSON.stringify(data), function(writeErr) {
                if (writeErr)
                    return console.log(writeErr);
                console.log('JSON data for post #' + id + ' saved.');
            });
        }
    });
}

function recoverImages() {
    //console.log('test');
    var clone = deletedPosts.slice(0);
    //console.log(clone);
    //var savedImages = fs.createWriteStream(rootPath + '/saved.txt');
    for (var i = 0; i < clone.length; i++) { // for each deleted post
        var upperBound = findUpperBoundary(clone[i]);
        var lowerBound = findLowerBoundary(clone[i]);
        //console.log('%d, %d, %d', clone[i], lowerBound, upperBound);
        for (var i2 = lowerBound + 1; i2 < upperBound; i2++) { // for each image id between the range
            for (var i3 = 0; i3 < fileExtensions.length; i3++) { // for each possible file ext this image id could have
                let readyToDelete = i + 1 == clone.length && i2 + 1 == upperBound;
                let fileName = i2 + '.' + fileExtensions[i3];
                //console.log('i: %d, i2: %d, i3: %s', clone[i], i2, fileExtensions[i3]);
                console.log('Checking %s for post #%d.', fileName, clone[i]);
                let url = util.format(imgUrl, i2, fileExtensions[i3]); // let's abuse the magical powers of 'let'
                let reqOpts = extend(imgRequestOpts, { uri: url });
                let deletedPostNum = clone[i];
                var req = request(extend(reqOpts));
                req.on('response', function(res) {
                    if (res.statusCode == 200) {
                        if (argv.imgs)
                            requestQueue.enqueue([reqOpts, fileName, deletedPostNum]);
                        deletedData.push([fileName, deletedPostNum, url]);
                        if (readyToDelete)
                            deletedPosts.shift();
                    }
                });
            }
        }
    }
}

function getImage(opts, file, id) {
    requestQueue.enqueue([opts, file, id])
}

function postParser(err, res, body) {
    var post = JSON.parse(body);
    if (typeof post['ERROR'] !== 'undefined') {
        var id = parseInt(/&post_id=(\d+)/g.exec(res.request.path)[1]);
        output[id].__checkedPostApi = true;
        saveIfReady(id);
        console.log('DETECTED POST #' + id + ' AS BEING DELETED!');
        console.log('Parsed post info for post #' + id + '.');
        return;
    }
    post = post.post;
    var id = post.id;
    output[post.id].deleted = false;
    output[post.id].timestamp = post.date_created;
    output[post.id].permalink = util.format(permUrl, post.id);
        
    for (var i = 0; i < post.items.length; i++) {
        var item = post.items[i];
        if (typeof item.ext !== 'undefined') {
            var url = util.format(imgUrl, item.id, item.ext);
            output[post.id].items.push({ img: item.id, ext: item.ext, url: url, type: 'file' });
            if (argv.imgs)
                requestQueue.enqueue([extend(imgRequestOpts, { uri: url }), item.id + '.' + item.ext, id]);
        }
        else
            output[post.id].items.push({ content: item.text, type: 'text' });
    }
    console.log('Parsed post info for post #' + post.id + '.');
    output[id].__checkedPostApi = true;
    saveIfReady(id);
}

function tagsParser(err, res, body) {
    var id;
    var tags = JSON.parse(body).tags;
    if (tags.length == 0) {
        var id = parseInt(/&post_id=(\d+)/g.exec(res.request.path)[1]);
        output[id].__checkedTagApi = true;
        saveIfReady(id);
        console.log('Parsed tags for post #' + id + '.');
        return;
    }
    for (var i = 0; i < tags.length; i++) {
        var tag = tags[i];
        id = tag.post_id;
        output[tag.post_id].tags.push({ tag: tag.tag, timestamp: tag.date });
    }
    console.log('Parsed tags for post #' + id + '.');
    if (id !== undefined)
        output[id].__checkedTagApi = true;
    saveIfReady(id);
}

function commentsParser(err, res, body) {
    var comments = JSON.parse(body).comments;
    var id;
    if (comments.length == 0) {
        var id = parseInt(/&post_id=(\d+)/g.exec(res.request.path)[1]);
        output[id].__checkedCommentApi = true;
        saveIfReady(id);
        console.log('Parsed comments for post #' + id + '.');
        return;
    }
    for (var i = 0; i < comments.length; i++) {
        var comment = comments[i];
        id = comment.post_id;
        output[comment.post_id].comments.push({ content: comment.body, timestamp: comment.date });
    }
    console.log('Parsed comments for post #' + id + '.');
    if (id !== undefined)
        output[id].__checkedCommentApi = true;
    saveIfReady(id);
}

for (var i = minId; i < maxId+1; i++) {
    output[i] = { __checkedPostApi: false, __checkedCommentApi: false, __checkedTagApi: false, deleted: true, items: [], comments: [], tags: [], timestamp: -1 };
    if (argv.posts)
        requestQueue.enqueue([extend(apiRequestOpts, { uri: util.format(postUrl, i) }), postParser]);
    if (argv.tags)
        requestQueue.enqueue([extend(apiRequestOpts, { uri: util.format(tagsUrl, i) }), tagsParser]);
    if (argv.cmnts)
        requestQueue.enqueue([extend(apiRequestOpts, { uri: util.format(commentsUrl, i) }), commentsParser]);
    fs.ensureDir(rootPath + '/' + i, function (dirErr) {
        if (dirErr) {
            throw dirErr;
        }
    });
}
var blah = false;
var interval = setInterval(function() { // setup a function which will be called at a set interval
    var dq = requestQueue.dequeue(); // will be undefined if queue is empty
    if (typeof dq !== 'undefined') {// if not undefined, this is a legit request
        if (typeof dq[1] === 'function') // api call
            request(dq[0], dq[1]); 
        else {// img call
            console.log('Downloading image ' + dq[1]);
            var file = fs.createWriteStream(rootPath + '/' + dq[2] + '/' + dq[1]);
            var req = http.get(dq[0].uri, function(res) {
                res.pipe(file);
                console.log('Downloaded image ' + dq[1]);
            });
            //request(dq[0]).pipe(fs.createWriteStream(rootPath + '/' + dq[2] + '/' + dq[1]));
        }
    }
    else {  
        if (argv.recover) {
            if (!blah)
                recoverImages();
            blah = true;
            if (deletedPosts.length == 0) {
                clearInterval(interval);
                fs.writeFileSync(rootPath + '/deleted.json', JSON.stringify(deletedData), 'utf8');
            }
        } else {
            clearInterval(interval);
        }
    }
}, 1000/requestsPerSecond); 
}
